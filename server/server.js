process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const WebSocket = require('ws');
const mysql = require('mysql');
const punycode = require('idna-uts46-hx');
const request = require('request');
const fs = require('fs');
const { Expo } = require("expo-server-sdk");

const config = require("./config.json");

var wss;
var Janode;
var janus;

var sessions = [];
var users = [];
var channels = [];
var pms = [];
var slds = [];
var typing = {};

// Simple in-memory message flood protection.
// Per account:
// - max 4 messages in 10 seconds
// - 5th message triggers a 10 second pause
// - 3rd identical message within 30 seconds is blocked
var messageFlood = {};

var userColumns = "d.id, d.domain, d.type, d.tld, d.avatar, d.locked, d.deleted, d.created, d.bio, d.admin, a.namespace, a.expires_at, s.pubkey pubkey, s.id sid, s.push push";

const sql = mysql.createPool({
	host: config.sqlHost,
	user: config.sqlUser,
	password: config.sqlPass,
	database: config.sqlDatabase,
	charset : "utf8mb4"
});

function log(e) {
	//console.log(e);
}

async function db(query, values=[]) {
	let result = new Promise(resolve => {
		sql.query(query, values, (e, r, f) => {
			try {
				resolve(JSON.parse(JSON.stringify(r)));
			}
			catch {
				log(e);
			}
		});
	});
	return await result;
}

const makeID = (length) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function time() {
	return Math.floor(Date.now() / 1000);
}

const rtrim = (str, chr) => str.replace(new RegExp(!chr ? '\\s+$' : chr + '+$'), '');

async function get(url, proxy=false) {
	var options = {
		timeout: 1000
	};
	if (proxy) {
		options.proxy = "http://127.0.0.1:8080"
	}

	let output = new Promise(resolve => {
		request(url, options, (e, r, b) => {
			if (b) {
				resolve(b.trim());
			}
			resolve();
		});
	});

	return await output;
}

const getMethods = (obj) => {
  let properties = new Set()
  let currentObj = obj
  do {
    Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
  } while ((currentObj = Object.getPrototypeOf(currentObj)))
  return [...properties.keys()].filter(item => typeof obj[item] === 'function')
}

async function janusConnect() {
	janus = await Janode.connect({
		is_admin: true,
		address: {
			url: config.janusWs,
			apisecret: config.janusKey
		}
	});
	return;
}

async function janusRequest(request) {
	if (!janus || janus._transport._closed) {
		await janusConnect();
	}

	let response = await janus.sendRequest(request);
	return response;
}

async function makeVideoRoom(id, name) {
	return await janusRequest({
		janus: "message_plugin",
		plugin: "janus.plugin.videoroom",
		request: {
			request: "create",
			admin_key: config.janusKey,
			secret: config.janusKey,
			is_private: true,
			permanent: true,

			room: id,
			description: name,
			
			publishers: 10,
			audiolevel_event: true,
			audio_active_packets: 10,
			audio_level_average: 50,
			notify_joining: true,
			fir_freq: 10,
			bitrate: 4096000
		}
	});
}

async function init() {
	Janode = await import(`${config.path}/node_modules/janode/src/janode.js`).then(module => {
		return module.default;
	});

	await fetchUsers();
	await fetchChannels();

	await db("SELECT id, users FROM conversations").then(r => {
		pms = r;

		pms.forEach((c, k) => {
			db("SELECT time FROM messages WHERE conversation = ? ORDER BY ai DESC LIMIT 1", [c.id]).then(r => {
				if (r.length) {
					pms[k].activity = r[0].time;
				}
			});
		});
	});

	wss = new WebSocket.Server({ port: 4444 });
	wss.on('connection', (ws, req) => {
		try {
			ws.ip = req.headers['x-forwarded-for'].split(',')[0].trim();
		}
		catch {
			ws.ip = req.socket.remoteAddress;
		}

		log(`CONNECT ${ws.ip}`);

		ws.on('message', data => {
			let user = dataForUser(ws.domain);
			if (user) {
				log(`IN [${user.domain}]: ${data}`);
			}
			else {
				log(`IN [${ws.ip}]: ${data}`);
			}
			parse(ws, data);
		});

		ws.on('close', () => {
			if (!activeUsers().includes(ws.domain)) {
				removeUserFromVideoChatsIfNeeded(ws.domain);
				sendToAllClients("DISCONNECTED", ws.domain);
			}
			log(`DISCONNECT ${ws.ip}`);
		});

		ws.on('error', console.error)
	});

	setInterval(() => {
		typingUpdates();
	}, 1000);

	setInterval(async () => {
		await cleanupExpiredHandshakeUsers();
		fetchUsers();
		fetchChannels();
	}, 300000);

	log("READY");
}

async function cleanupExpiredHandshakeUsers() {
	let now = Math.floor(Date.now() / 1000);

	let expired = await db(
		`SELECT a.ai, a.domain_id
		 FROM accounts a
		 INNER JOIN domains d ON d.id = a.domain_id
		 WHERE a.namespace = 'handshakeuser'
		 AND a.disabled = 0
		 AND a.expires_at IS NOT NULL
		 AND a.expires_at <= ?
		 AND d.deleted = 0`,
		[now]
	);

	if (!expired || !expired.length) {
		return;
	}

	for (let account of expired) {
		await db(
			"UPDATE accounts SET disabled = 1 WHERE ai = ?",
			[account.ai]
		);

		await db(
			"UPDATE domains SET locked = 1, deleted = 1 WHERE id = ?",
			[account.domain_id]
		);
	}

	log(`Expired ${expired.length} handshakeuser account(s)`);
}

async function fetchUsers() {
	await db(`SELECT ${userColumns}
		FROM domains d
		LEFT JOIN accounts a ON a.domain_id = d.id
		LEFT JOIN sessions s ON s.id = d.session
		WHERE d.deleted = 0`).then(r => {
		let newUsers = [];
		let newSessions = [];

		r.forEach((u, k) => {
			newSessions.push({
				domain: u.id,
				session: u.sid,
				push: u.push
			});

			delete u.sid;
			delete u.push;
			newUsers.push(u);
		});

		users = newUsers;
		sessions = newSessions;
	});
}

async function fetchChannels() {
	await db("SELECT * FROM channels").then(r => {
		let newChannels = r;
		if (channels.length) {
			let currentChannels = channels;

			newChannels.forEach((nc, k) => {
				let exists = currentChannels.filter(cc => {
					return cc.id == nc.id;
				});

				if (!exists.length) {
					sendToAllClients("CHANNEL", nc);
				}
			});
		}
		
		let oldChannels = channels;
		channels = newChannels;

		channels.forEach((c, k) => {
			let old = oldChannels.filter(chan => {
				return c.id == chan.id; 
			})[0];
			if (oldChannels.length && old) {
				channels[k].video = old.video;
				channels[k].videoUsers = old.videoUsers;
				channels[k].videoWatchers = old.videoWatchers;
				channels[k].videoSpeakers = old.videoSpeakers;
			}
			else {
				channels[k].video = false;
				channels[k].videoUsers = {};
				channels[k].videoWatchers = [];
				channels[k].videoSpeakers = [];
			}

			db("SELECT time FROM messages WHERE conversation = ? ORDER BY ai DESC LIMIT 1", [c.id]).then(r => {
				if (r.length) {
					channels[k].activity = r[0].time;
				}
			});
		});

		slds = getStaked();
	});
}

function typingUpdates() {
	Object.keys(typing).forEach((k) => {
		let typer = typing[k];

		if ((Date.now() - typer.time) >= config.typingDelay) {
			delete typing[k];
		}
		else {
			let data = {
				from: k,
				to: typer.to
			}
			sendToUsers("TYPING", data, typer.to);
		}
	});
}

async function generateID(type) {
	var id,output;
	var database,param,length,prefix;

	switch (type) {
		case "session":
			database = "sessions";
			param = "id";
			length = 32;
			prefix = "V2-";
			break;

		case "domain":
			database = "domains";
			param = "id";
			length = 16;
			break;

		case "message":
			database = "messages";
			param = "id";
			length = 32;
			break;

		case "pm":
			database = "conversations";
			param = "id";
			length = 16;
			break;

		case "channel":
			database = "channels";
			param = "id";
			length = 8;
			break;

		default:
			return;
	}

	while (!output) {
		id = makeID(length);
		if (prefix) {
			id = `${prefix}${id}`;
		}

		await db(`SELECT * FROM ${database} WHERE ${param} = ?`, [id]).then(r => {
			if (!r.length) {
				output = id;
			}
		});
	}

	return output;
}

function parse(ws, data) {
	let message = data.toString();
	let parsed = message.match(/(?<command>[A-Z]+)(\s(?<body>.+))?/);

	try {
		handle(ws, parsed.groups);
	}
	catch (e) {
		log(e);
	}
}

function sendSuccess(ws, type, data={}) {
	let d = {
		type: type
	}
	let merged = {...d, ...data};

	sendMessage(ws, "SUCCESS", merged);
}

function sendError(ws, type, message, data={}) {
	let d = {
		type: type,
		message: message
	}
	let merged = {...d, ...data};

	sendMessage(ws, "ERROR", merged);
}

async function handle(ws, parsed) {
	var match;
	var success;

	var names;
	var domain;
	var response,r;

	let command = parsed.command;
	let body = parsed.body;

	var data;

	if (ws.invalid) {
		return;
	}

	try {
		body = JSON.parse(body);
	}
	catch {}

	switch (command) {
		case "ACTION":
			log(`KILL ${ws.ip}`);
			ws.close();
			break;

		case "PING":
		case "IDENTIFY":
		case "DOMAINS":
		case "DOMAIN":
		case "ADDDOMAIN":
		case "ADDSLD":
		case "DELETEDOMAIN":
		case "STAKED":
			break;

		default:
			if (!ws.domain) {
				return;
			}
			break;
	}

	switch (command) {
		case "PING":
			let version = await currentVersion();
			let active = activeUsers();
			data = {
				version: version,
				active: active
			}

			sendMessage(ws, `PONG ${JSON.stringify(data)}`);
			break;

		case "IDENTIFY":
			db("SELECT * FROM sessions WHERE id = ?", [body]).then(r => {
				if (!r.length) {
					sendMessage(ws, "INVALIDSESSION");
					return;
				}

				data = {};
				if (r[0].seen) {
					data.seen = r[0].seen;
				}

				ws.session = r[0].id;
				sendMessage(ws, `IDENTIFIED ${JSON.stringify(data)}`);
			});
			break;

		case "USERS":
			// Always refresh identities before sending them.
			// Accounts may have been created directly by the PHP API
			// since the last periodic in-memory refresh.
			await fetchUsers();
			sendMessage(ws, command, users);
			break;

		case "STAKED":
			sendMessage(ws, command, slds);
			break;

		case "DOMAINS":
			db("SELECT id, domain, type, tld, locked FROM domains WHERE session = ? AND deleted = 0", [ws.session]).then(r => {
				try {
					ws.domains = r;
					sendMessage(ws, command, r);
				}
				catch {}
			});
			break;

		case "DOMAIN":
			if (!ws.domains) {
				break;
			}

			match = ws.domains.filter(d => {
				return d.id == body;
			});

			if (match.length) {
				let oldDomain = ws.domain;
				removeUserFromVideoChatsIfNeeded(oldDomain);

				ws.domain = body;
				sendMessage(ws, command, body);

				if (oldDomain && !activeUsers().includes(oldDomain)) {
					sendToAllClients("DISCONNECTED", oldDomain);
				}
				
				sendToAllClients("CONNECTED", ws.domain);
			}
			else {
				sendError(ws, command, "The provided domain ID doesn't exist.");
			}
			break;

		case "ADDDOMAIN":
			if (body.alfTicket) {
				let ticket = String(body.alfTicket).toLowerCase().trim();

				if (!/^[a-f0-9]{64}$/.test(ticket)) {
					sendError(ws, command, "Invalid ALF ticket.");
					break;
				}

				let ticketFile = `${config.path}/../web/data/alf-tickets/${ticket}.json`;

				try {
					if (!fs.existsSync(ticketFile)) {
						sendError(ws, command, "ALF ticket not found or already used.");
						break;
					}

					let ticketData = JSON.parse(fs.readFileSync(ticketFile, "utf8"));

					// One-time use: remove immediately after reading.
					fs.unlinkSync(ticketFile);

					if (!ticketData ||
						!ticketData.tld ||
						!ticketData.expires ||
						Number(ticketData.expires) < time()) {
						sendError(ws, command, "ALF ticket expired.");
						break;
					}

					let name = String(ticketData.tld).toLowerCase().trim();

					if (!validALFName(name)) {
						sendError(ws, command, "Invalid ALF name.");
						break;
					}

					let id = await addDomain(ws, name, "handshake");
					if (id) {
						sendSuccess(ws, command, { id: id });
					}
					else {
						sendError(ws, command, "This TLD is already connected to this session.");
					}
				}
				catch (e) {
					sendError(ws, command, "ALF login failed.");
				}

				break;
			}

			if (config.localTestMode && body.localName) {
				let name = body.localName.toLowerCase();
				let id = await addDomain(ws, name, "handshake");
				if (id) {
					sendSuccess(ws, command, { id: id });
				}
				else {
					sendError(ws, command, "Something went wrong. Try again.");
				}
				break;
			}

			sendError(ws, command, "Use ALF to verify your HNS TLD.");
		break;


		case "ADDSLD":
			if (body.sld && body.tld) {
				if (!canCreateSLD(body.tld)) {
					sendError(ws, command, "The TLD provided isn't valid for creating an SLD.");
					break;
				}

				if (!validName(body.sld)) {
					sendError(ws, command, "The name provided isn't valid.");
					break;
				}

				if (!isAvailableSLD(body.tld, body.sld)) {
					sendError(ws, command, "The name provided isn't available.");
					break;
				}

				let id = await addDomain(ws, `${body.sld}.${body.tld}`, "handshake");
				if (id) {
					sendSuccess(ws, command, { id: id });
				}
				else {
					sendError(ws, command, "Something went wrong. Try again.");
				}
			}
			else {
				sendError(ws, command, "Something went wrong. Try again.");
			}
			break;

		case "DELETEDOMAIN":
			await db("UPDATE domains SET deleted = 1, LOCKED = 1 WHERE id = ? AND session = ?", [body.id, ws.session]);
			sendUser(body.id);
			sendSuccess(ws, command, { id: body.id });
			break;

		case "CHANNELS":
			data = [];

			for (let c of channels) {
				if (Number(c.hidden) === 1 && !isAdmin(c.id, ws)) {
					let me = dataForUser(ws.domain);
					let members = [];

					try {
						members = Array.isArray(c.members)
							? c.members
							: JSON.parse(c.members || "[]");
					}
					catch {}

					if (!Array.isArray(members)) {
						members = [];
					}

					let alreadyMember =
						me &&
						!me.locked &&
						!me.deleted &&
						members.includes(me.domain);

					if (!alreadyMember) {
						let admission = await admitGroupCandidate(
							c.id,
							me ? me.domain : ""
						);

						if (admission !== "added" && admission !== "member") {
							continue;
						}
					}
				}

				let channelData = {
					id: c.id,
					name: c.name,
					public: c.public,
					hidden: c.hidden,
					sort: c.sort,
					color: c.color,
					adminonly: c.adminonly,
					tldadmin: c.tldadmin,
					admins: c.admins,
					members: c.members,
					membertype: c.membertype,
					membersource: c.membersource,
					slds: c.slds,
					registry: c.registry,
					label: c.label,
					url: c.url,
					mutes: c.mutes,
					activity: c.activity,
					pinned: c.pinned,
					video: c.video,
					videoUsers: c.videoUsers,
					videoWatchers: c.videoWatchers,
					videoSpeakers: c.videoSpeakers
				};

				data.push(channelData);
			}

			sendMessage(ws, command, data);
			break;

		case "PMS":
			/*
			 * Ignore orphaned historic PMs.
			 * A broken PM must never block client startup.
			 */
			let validUserIDs = new Set(users.map(u => String(u.id)));

			let subset = pms.filter(a => {
				try {
					let pmUsers = Array.isArray(a.users)
						? a.users
						: JSON.parse(a.users);

					return (
						Array.isArray(pmUsers) &&
						pmUsers.includes(ws.domain) &&
						pmUsers.every(id => validUserIDs.has(String(id)))
					);
				}
				catch {
					return false;
				}
			});

			sendMessage(ws, command, subset);
			break;

		case "PM":
			domain = body.domain.replace(/[\s\/]+$/, '');
			let puny = punycode.toAscii(domain);

			if (puny) {
				let domainData = dataForDomain(puny);
				if (domainData) {
					let to = domainData.id;

					if (to == ws.domain) {
						sendError(ws, command, "You can't private message yourself.");
						return;
					}

					let getPM = await db("SELECT id, users FROM conversations WHERE JSON_CONTAINS(users, ?, '$') AND JSON_CONTAINS(users, ?, '$')", [`"${ws.domain}"`, `"${to}"`]).then(r => {
						if (r.length) {
							return r[0];
						}
						return false;
					});

					if (getPM) {
						sendError(ws, command, "You already have a PM open with this domain.", { id: getPM.id });
					}
					else {
						let id = await generateID("pm");
						let users = JSON.stringify([ws.domain, to]);

						let conversation = await db("INSERT INTO conversations (id, users) VALUES (?,?)", [id, users]).then(r => {
							if (r) {
								let data = {
									id: id,
									users: users
								};
								pms.push(data);
								return data;
							}
							return false;
						});

						if (conversation) {
							sendToUsers(command, conversation, id);
						}
						else {
							sendError(ws, command, "Something went wrong. Try again.");
						}
					}
				}
				else {
					sendError(ws, command, "The domain provided isn't available to message.");
				}
			}
			break;

		case "MESSAGES":
			if (isChannel(body.conversation)) {
				let ruleChannel = dataForChannel(body.conversation);
				let candidateUser = dataForUser(ws.domain);
				let channelChanged = false;

				if (ruleChannel && candidateUser) {
					let ownership = await claimGroupOwnershipIfMatching(
						body.conversation,
						candidateUser.domain
					);

					if (ownership === "claimed") {
						channelChanged = true;
					}

					if (
						ownership !== "owner" &&
						ownership !== "claimed" &&
						(
							String(ruleChannel.membertype || "").toLowerCase() === "rule" ||
							String(ruleChannel.registry || "").toLowerCase() === "namebase"
						)
					) {
						let admission = await admitGroupCandidate(
							body.conversation,
							candidateUser.domain
						);

						if (admission === "added") {
							channelChanged = true;
						}
					}

					if (channelChanged) {
						sendMessage(ws, "CHANNELS", channels.map(c => ({
							id: c.id,
							name: c.name,
							public: c.public,
							hidden: c.hidden,
							color: c.color,
							adminonly: c.adminonly,
							tldadmin: c.tldadmin,
							admins: c.admins,
							members: c.members,
							membertype: c.membertype,
							membersource: c.membersource,
							slds: c.slds,
							registry: c.registry,
							label: c.label,
							url: c.url,
							mutes: c.mutes,
							activity: c.activity,
							pinned: c.pinned,
							video: c.video,
							videoUsers: c.videoUsers,
							videoWatchers: c.videoWatchers,
							videoSpeakers: c.videoSpeakers
						})));
					}
				}
			}

			if (hasConversationReadAccess(body.conversation, ws.domain)) {
				if (body.before) {
					db("SELECT m.id, m.message, m.time, m.user, m.reactions, m.replying, p.message p_message, p.user p_user FROM messages m LEFT JOIN messages p ON p.id = m.replying WHERE m.conversation = ? AND m.ai < (SELECT ai FROM messages WHERE id = ?) ORDER BY m.ai DESC LIMIT 50", [body.conversation, body.before]).then(r => {
						sendMessages(ws, r, body);
					});
				}
				else if (body.at) {
					db("SELECT m.id, m.message, m.time, m.user, m.reactions, m.replying, p.message p_message, p.user p_user FROM messages m LEFT JOIN messages p ON p.id = m.replying WHERE m.conversation = ? AND m.ai >= (SELECT ai FROM messages WHERE id = ?) ORDER BY m.ai ASC LIMIT 50", [body.conversation, body.at]).then(r => {
						sendMessages(ws, r, body);
					});
				}
				else if (body.after) {
					db("SELECT id FROM messages WHERE conversation = ? ORDER BY ai DESC LIMIT 1", [body.conversation]).then(r => {
						if (r) {
							body.latestMessage = r[0].id;
						}
						db("SELECT m.id, m.message, m.time, m.user, m.reactions, m.replying, p.message p_message, p.user p_user FROM messages m LEFT JOIN messages p ON p.id = m.replying WHERE m.conversation = ? AND m.ai > (SELECT ai FROM messages WHERE id = ?) ORDER BY m.ai ASC LIMIT 50", [body.conversation, body.after]).then(r => {
							sendMessages(ws, r, body);
						});
					});
				}
				else {
					db("SELECT m.id, m.message, m.time, m.user, m.reactions, m.replying, p.message p_message, p.user p_user FROM messages m LEFT JOIN messages p ON p.id = m.replying WHERE m.conversation = ? ORDER BY m.ai DESC LIMIT 50", [body.conversation]).then(r => {
						sendMessages(ws, r, body);
					});
				}
			}
			else if (isChannel(body.conversation)) {
				let channelData = dataForChannel(body.conversation);
				let name = channelData.name;
				
				let data = {}

				if (channelData.registry) {
					var link;

					switch (channelData.registry) {
						case "namebase":
							link = `https://namebase.io/search?tld=${encodeURIComponent(name)}`;
							break;

						case "impervious":
							link = `https://impervious.domains/tld/${encodeURIComponent(name)}`;
							break;

						case "ens":
							link = `https://ens.domains`;
							break;
					}

					if (link) {
						data.link = link;
						data.resolution = "purchase";
					}
				}
				else if (canCreateSLD(name)) {
					data.resolution = "create";
				}
				
				sendError(ws, command, "You don't have permission to access these messages.", data);
			}
			else {
				sendError(ws, command, "You don't have permission to access these messages.");
			}
			break;

		case "MESSAGE":
		case "NOTICE":
			delete typing[ws.domain];

			let message = body.message.trim();

			// Absolute server-side safety limit.
			// Client plaintext limit is 16 KB; PM encryption may enlarge it.
			if (
				command == "MESSAGE" &&
				Buffer.byteLength(message, "utf8") > 64 * 1024
			) {
				sendError(
					ws,
					command,
					"Message is too large."
				);
				break;
			}

			if (command == "MESSAGE" && ws.domain && message.length) {
				let now = time();
				let state = messageFlood[ws.domain] || {
					times: [],
					blockedUntil: 0,
					lastMessage: "",
					lastMessageTimes: []
				};

				// Temporary pause after flooding.
				if (state.blockedUntil > now) {
					sendError(
						ws,
						command,
						`Too many messages. Try again in ${state.blockedUntil - now}s.`
					);
					messageFlood[ws.domain] = state;
					break;
				}

				// Keep only messages from the last 10 seconds.
				state.times = state.times.filter(t => now - t < 10);

				// Four messages are allowed. The fifth starts the pause.
				if (state.times.length >= 4) {
					state.blockedUntil = now + 10;
					messageFlood[ws.domain] = state;

					sendError(
						ws,
						command,
						"Too many messages. Please wait 10 seconds."
					);
					break;
				}

				let normalizedMessage = message.trim();

				// Block the third identical consecutive message within 30 seconds.
				if (state.lastMessage === normalizedMessage) {
					state.lastMessageTimes =
						state.lastMessageTimes.filter(t => now - t < 30);

					if (state.lastMessageTimes.length >= 2) {
						messageFlood[ws.domain] = state;

						sendError(
							ws,
							command,
							"Duplicate message blocked."
						);
						break;
					}

					state.lastMessageTimes.push(now);
				}
				else {
					state.lastMessage = normalizedMessage;
					state.lastMessageTimes = [now];
				}

				state.times.push(now);
				messageFlood[ws.domain] = state;
			}

			if (message.length) {
				let id = await generateID("message");
				let t = time();
				let user = ws.domain;
				let conversation = body.conversation;
				let replying = body.replying;
				let reply = Boolean(replying);

				/*
				 * Public ChatHNS /help.
				 *
				 * This is a deterministic ChatHNS system command.
				 *
				 * The user's /help message is stored normally.
				 * Afterward the server creates a normal reply whose
				 * sender is configured through systemAccount.
				 */
				let chatHNSHelp = false;

				if (command == "MESSAGE") {
					try {
						let parsedMessage = JSON.parse(message);

						if (
							parsedMessage &&
							parsedMessage.hnschat == 1 &&
							typeof parsedMessage.message == "string" &&
							parsedMessage.message.trim().toLowerCase() == "/help"
						) {
							chatHNSHelp = true;
						}
					}
					catch {}
				}

				/*
				 * Polls may only be created inside groups/channels
				 * and only by global admin, group owner or group staff.
				 */
				if (command == "MESSAGE") {
					let pollMessage = false;

					try {
						let parsedMessage = JSON.parse(message);
						pollMessage = Boolean(
							parsedMessage &&
							parsedMessage.poll &&
							parsedMessage.poll.question &&
							Array.isArray(parsedMessage.poll.options)
						);
					}
					catch {}

					if (pollMessage) {
						if (!isChannel(conversation)) {
							sendError(ws, command, "Polls are only available in groups.");
							break;
						}

						if (!isAdmin(conversation, ws)) {
							sendError(ws, command, "Only group admins can create polls.");
							break;
						}
					}
				}

				let msgExists = await messageExists(replying);
				if (replying && !msgExists) {
					delete body.replying;
					replying = null;
					reply = 0;
				}

				if (command == "MESSAGE" && isChannel(conversation)) {
					let muteChannel = dataForChannel(conversation);
					let muteUser = dataForUser(user);
					let mutes = {};

					try {
						mutes = JSON.parse(muteChannel.mutes || "{}");
					}
					catch {}

					let mutedUntil = muteUser
						? Number(mutes[muteUser.domain] || 0)
						: 0;

					if (mutedUntil === -1 || mutedUntil > time()) {
						sendError(
							ws,
							command,
							"You are muted in this group.",
							{
								mutedUntil: mutedUntil,
								conversation: conversation
							}
						);
						break;
					}

					// expired mute: clean it up automatically
					if (mutedUntil > 0 && mutedUntil <= time()) {
						delete mutes[muteUser.domain];
						muteChannel.mutes = JSON.stringify(mutes);

						db(
							"UPDATE channels SET mutes = ? WHERE id = ?",
							[muteChannel.mutes, conversation]
						);
					}
				}

				if (
					command == "MESSAGE" &&
					isChannel(conversation) &&
					dataForChannel(conversation).adminonly &&
					!isAdmin(conversation, ws)
				) {
					sendError(ws, command, "Only admins can post in this channel.");
					break;
				}

				if (hasConversationWriteAccess(conversation, user)) {
					if (command == "MESSAGE") {
						let c;
						if (isChannel(conversation)) {
							c = dataForChannel(conversation);
						}
						else {
							c = dataForPM(conversation);
						}
						c.activity = t;

						db("INSERT INTO messages (id, time, user, conversation, message, reply, replying) VALUES (?,?,?,?,?,?,?)", [id, t, user, conversation, message, reply, replying]);
						updateSeen(ws.session, conversation);
						sendToUsers(command, body, conversation, id, user, t);
						sendPushNotificationsIfNeeded(user, body);

						/*
						 * Public /help reply.
						 *
						 * systemAccount is used as the visible ChatHNS
						 * system identity.
						 *
						 * /help does not require the system account to be
						 * a member or staff of the conversation.
						 */
						if (chatHNSHelp) {
							let bot = dataForDomain(String(config.systemAccount || "").toLowerCase());

							if (bot) {
								let helpID = await generateID("message");
								let helpTime = time();

								let helpMessage = JSON.stringify({
									hnschat: 1,
									message:
`ChatHNS Commands

/help
Show commands

/me TEXT
Write an action

/shrug
¯\\_(ツ)_/¯

/slap USER
IRC slap

/fancy TEXT
Fancy message

/confetti TEXT
Confetti message

/dice
Roll a dice

@USER
Mention a user

#GROUP
Link a group`
								});

								await db(
									"INSERT INTO messages (id, time, user, conversation, message, reply, replying) VALUES (?,?,?,?,?,?,?)",
									[
										helpID,
										helpTime,
										bot.id,
										conversation,
										helpMessage,
										0,
										null
									]
								);

								sendToUsers(
									"MESSAGE",
									{
										conversation: conversation,
										message: helpMessage
									},
									conversation,
									helpID,
									bot.id,
									helpTime
								);
							}
							else {
								console.log(
									"Public /help: configured systemAccount not found"
								);
							}
						}
					}
					else {
						sendToUser(body.notice, command, body, conversation, id, user, t);
					}
				}
			}
			break;

		case "POLLVOTE":
			{
				let messageID = String(body.message || "");
				let conversation = String(body.conversation || "");
				let option = Number(body.option);

				if (
					!messageID ||
					!conversation ||
					!Number.isInteger(option) ||
					option < 0 ||
					!ws.session
				) {
					break;
				}

				if (!isChannel(conversation)) {
					break;
				}

				if (!hasConversationReadAccess(conversation, ws.domain)) {
					break;
				}

				let voter = dataForUser(ws.domain);

				/*
				 * Temporary ChatHNS / .handshakeuser accounts do not vote.
				 */
				if (
					!voter ||
					voter.locked ||
					voter.deleted ||
					voter.namespace === "handshakeuser" ||
					voter.tld === "handshakeuser"
				) {
					sendError(ws, command, "Guest accounts cannot vote.");
					break;
				}

				let rows = await db(
					"SELECT id, message, conversation FROM messages WHERE id = ? AND conversation = ? LIMIT 1",
					[messageID, conversation]
				);

				if (!rows || !rows.length) {
					break;
				}

				let poll;

				try {
					let parsedMessage = JSON.parse(rows[0].message);

					if (
						!parsedMessage ||
						!parsedMessage.poll ||
						!parsedMessage.poll.question ||
						!Array.isArray(parsedMessage.poll.options)
					) {
						break;
					}

					poll = parsedMessage.poll;
				}
				catch {
					break;
				}

				if (option >= poll.options.length) {
					break;
				}

				let existing = await db(
					"SELECT option_index FROM poll_votes WHERE message_id = ? AND session_id = ? LIMIT 1",
					[messageID, ws.session]
				);

				let selected = option;
				let now = time();

				/*
				 * Same option again = remove vote.
				 * Different option = move vote.
				 */
				if (
					existing &&
					existing.length &&
					Number(existing[0].option_index) === option
				) {
					await db(
						"DELETE FROM poll_votes WHERE message_id = ? AND session_id = ?",
						[messageID, ws.session]
					);

					selected = null;
				}
				else {
					await db(
						`INSERT INTO poll_votes
							(message_id, session_id, option_index, created, updated)
						 VALUES (?, ?, ?, ?, ?)
						 ON DUPLICATE KEY UPDATE
							option_index = VALUES(option_index),
							updated = VALUES(updated)`,
						[messageID, ws.session, option, now, now]
					);
				}

				let voteRows = await db(
					`SELECT option_index, COUNT(*) count
					 FROM poll_votes
					 WHERE message_id = ?
					 GROUP BY option_index`,
					[messageID]
				);

				let counts = poll.options.map(() => 0);

				(voteRows || []).forEach(row => {
					let index = Number(row.option_index);

					if (
						Number.isInteger(index) &&
						index >= 0 &&
						index < counts.length
					) {
						counts[index] = Number(row.count) || 0;
					}
				});

				/*
				 * Everyone gets the new totals.
				 */
				sendToUsers("POLLVOTE", {
					conversation: conversation,
					message: messageID,
					counts: counts
				}, conversation);

				/*
				 * Every open client belonging to the voting session
				 * additionally gets its own selected option.
				 */
				wss.clients.forEach(client => {
					if (client.session === ws.session) {
						sendMessage(client, "POLLVOTE", {
							conversation: conversation,
							message: messageID,
							counts: counts,
							selected: selected
						});
					}
				});

				updateSeen(ws.session, conversation);
			}
			break;

		case "REACT":
			let id = body.message;

			if (id.length) {
				let t = time();
				let user = ws.domain;
				let conversation = body.conversation;
				let reaction = body.reaction;

				if (hasConversationWriteAccess(conversation, user)) {
					db("SELECT reactions FROM messages WHERE id = ?", [id]).then(r => {
						let reactions = r[0]["reactions"];

						var json = JSON.parse(reactions);
						if (json[reaction]) {
							if (json[reaction].includes(user)) {
								json[reaction] = json[reaction].filter(u => {
									return u !== user
								});
							}
							else {
								json[reaction].push(user);
							}
						}
						else {
							json[reaction] = [user];
						}

						Object.keys(json).forEach((r, k) => {
							if (!json[r].length) {
								delete json[r];
							}
						});

						let object = {...json};
						let encoded = JSON.stringify(object);

						db("UPDATE messages SET reactions = ? WHERE id = ?", [encoded, id]);
						updateSeen(ws.session, conversation);
						sendToUsers(command, body, conversation, id, user, t);
					});
				}
			}
			break;

		case "CLEARCHAT":
			if (body.conversation) {
				let conversation = body.conversation;

				if (isAdmin(conversation, ws)) {
					db("DELETE FROM messages WHERE conversation = ?", [conversation]).then(() => {
						if (isChannel(conversation)) {
							db("UPDATE channels SET pinned = NULL WHERE id = ?", [conversation]);
							dataForChannel(conversation).pinned = null;
						}

						sendToUsers("CLEARCHAT", {
							conversation: conversation
						}, conversation);
					});
				}
			}
			break;

		case "DELETEMESSAGES":
			if (
				body.conversation &&
				Array.isArray(body.ids) &&
				body.ids.length
			) {
				let conversation = body.conversation;

				if (isAdmin(conversation, ws)) {
					let ids = body.ids.filter(id => id);

					if (ids.length) {
						let placeholders = ids.map(() => "?").join(",");

						db(
							`DELETE FROM messages
							 WHERE conversation = ?
							 AND id IN (${placeholders})`,
							[conversation, ...ids]
						).then(() => {
							sendToUsers("DELETEMESSAGES", {
								conversation: conversation,
								ids: ids
							}, conversation);
						});
					}
				}
			}
			break;

		case "DELETEMESSAGE":
			if (body.id) {
				db("SELECT * FROM messages WHERE id = ?", [body.id]).then(r => {
					let message = r[0];
					let conversation = message.conversation;

					if (isAdmin(conversation, ws)) {
						db("DELETE FROM messages WHERE id = ?", [body.id]);
						sendToUsers("DELETEMESSAGE", body, conversation);
					}
				});
			}
			break;

		case "PINMESSAGE":
			if (body.id) {
				db("SELECT * FROM messages WHERE id = ?", [body.id]).then(r => {
					let message = r[0];
					let conversation = message.conversation;

					if (isAdmin(conversation, ws)) {
						db("UPDATE channels SET pinned = ? WHERE id = ?", [body.id, conversation]);
						dataForChannel(conversation).pinned = body.id;
						sendToUsers("PINMESSAGE", body, conversation);
					}
				});
			}
			else if (body.conversation) {
				let conversation = body.conversation;
				if (isAdmin(conversation, ws)) {
					db("UPDATE channels SET pinned = ? WHERE id = ?", [null, conversation]);
					dataForChannel(conversation).pinned = null;
					sendToUsers("PINMESSAGE", body, conversation);
				}
			}
			break;

		case "MENTIONS":
			let mentions = [];
			db("SELECT seen FROM sessions WHERE id = ?", [ws.session]).then(s => {
				let oldest = 0;
				let seen = {};

				try {
					seen = JSON.parse(s[0].seen);
					let sorted = Object.entries(seen).sort((a, b) => {
						return a[1] - b[1];
					});
					oldest = sorted[0][1];
				}
				catch {}

				db("SELECT * FROM messages WHERE time > ? AND message LIKE ?", [oldest, `%@${ws.domain}%`]).then(r => {
					if (r) {
						r.forEach((m, k) => {
							if (isChannel(m.conversation) && hasConversationReadAccess(m.conversation, ws.domain)) {
								try {
									if (m.time > seen[m.conversation]) {
										mentions.push(m.conversation);
									}
								}
								catch {
									//console.log(m.conversation);
								};
							}
						});
					}
					sendMessage(ws, command, mentions);
				});
			});
			break;

		case "TYPING":
			typing[body.from] = { 
				to: body.to,
				time: Date.now()
			}
			break;

		case "GETADDRESS":
			user = dataForUser(body);
			tld = user.tld;
			domain = user.domain;

			var match;
			if (tld !== domain) {
				match = slds.filter(s => {
					return s.name == tld && s.hip2;
				});
			}

			let output = new Promise(resolve => {
				if (match && match.length) {
					db("SELECT * FROM domains WHERE id = ?", [user.id]).then(r => {
						if (r && r.length && r[0].address) {
							resolve(r[0].address);
							return;
						}
						resolve();
					});
				}
				else {
					get(`https://${domain}/.well-known/wallets/HNS`, true).then(r => {
						if (r) {
							if (r.substring(0, 2) == "hs") {
								resolve(r);
							}
						}
						resolve();
					});
				}
			});

			let address = await output;
			if (address) {
				sendSuccess(ws, command, { address: address });
			}
			else {
				sendError(ws, command, "This user isn't currently accepting payments.");
			}
			break;

		case "SAVERANDOMSTUFF":
			{
				let me = dataForUser(ws.domain);

				if (!me || !me.admin) {
					sendError(ws, command, "Only ChatHNS staff can edit Random Stuff.");
					break;
				}

				if (!Array.isArray(body.items)) {
					sendError(ws, command, "Invalid Random Stuff list.");
					break;
				}

				if (body.items.length < 1 || body.items.length > 100) {
					sendError(ws, command, "Random Stuff requires 1–100 texts.");
					break;
				}

				let items = [];

				for (let item of body.items) {
					if (typeof item !== "string") {
						sendError(ws, command, "Invalid Random Stuff text.");
						return;
					}

					item = item.trim();

					if (!item.length || item.length > 150) {
						sendError(ws, command, "Random Stuff texts must contain 1–150 characters.");
						return;
					}

					items.push(item);
				}

				try {
					const fs = require("fs");
					const path = require("path");

					let file = path.resolve(
						__dirname,
						"../web/etc/random-stuff.json"
					);

					let tmp = file + ".tmp";

					fs.writeFileSync(
						tmp,
						JSON.stringify(items, null, 2) + "\n",
						"utf8"
					);

					fs.renameSync(tmp, file);

					sendSuccess(ws, command, {
						count: items.length
					});
				}
				catch (e) {
					console.error("SAVERANDOMSTUFF:", e);
					sendError(ws, command, "Could not save Random Stuff.");
				}
			}
			break;

		case "CREATECHANNEL":
			{
				let me = dataForUser(ws.domain);

				// Only global ChatHNS staff/admins may create groups.
				if (!me || !me.admin) {
					sendError(ws, command, "Only ChatHNS staff can create groups.");
					break;
				}

				if (!body.name) {
					sendError(ws, command, "A group name is required.");
					break;
				}

				let requestedName = String(body.name).toLowerCase().trim();
				let name;

				try {
					name = punycode.toAscii(requestedName);
				}
				catch {
					sendError(ws, command, "Invalid TLD/group name.");
					break;
				}

				let id = await generateID("channel");

				// Optional additional group admin.
				// The creating ChatHNS staff account is NOT the owner.
				// Ownership belongs automatically to the matching verified TLD.
				let groupAdmin = body.user || null;

				if (groupAdmin && !dataForUser(groupAdmin)) {
					sendError(ws, command, "Group admin not found.");
					break;
				}

				if (!validName(name)) {
					sendError(ws, command, "A channel name can only contain letters, numbers, and hyphens, but can't start or end with a hyphen.");
					break;
				}

				if (dataForChannelByName(name)) {
					sendError(ws, command, "A channel with this name already exists.");
					break;
				}

				let admins = groupAdmin ? JSON.stringify([groupAdmin]) : "[]";
				let isPublic = body.public === false ? 0 : 1;
				let isHidden = body.hidden === true || Number(body.hidden) === 1 ? 1 : 0;
				// Group = members may post. Channel = admins only.
				let adminOnly = (body.mode === "channel" || body.adminonly === true || Number(body.adminonly) === 1) ? 1 : 0;

				let label = String(body.label || "").trim() || null;
				let url = String(body.url || "").trim() || null;

				let access = String(body.access || "members").toLowerCase();

				if (!["members", "rule", "internal", "namebase"].includes(access)) {
					sendError(ws, command, "Invalid group access type.");
					break;
				}

				let sldsEnabled = access === "internal" ? 1 : 0;
				let registry = access === "namebase" ? "namebase" : null;

				let memberType = access === "rule" ? "rule" : "manual";

				if (!["manual", "rule"].includes(memberType)) {
					sendError(ws, command, "Invalid membership type.");
					break;
				}

				let memberSource = null;
				let initialMembers = [];

				if (memberType === "manual" && Array.isArray(body.members)) {
					initialMembers = normalizeTLDList(body.members);

					if (initialMembers === null) {
						sendError(ws, command, "Invalid member TLD.");
						break;
					}
				}

				if (memberType === "rule") {
					memberSource = String(body.membersource || "").toLowerCase();

					if (!["10k", "1letter", "3letters", "1to3letters", "1number", "1emoji", "1symbol", "newnation", "handshakeuser"].includes(memberSource)) {
						sendError(ws, command, "Invalid membership rule.");
						break;
					}
				}

				let insert = await db(
					"INSERT INTO channels (id, name, public, adminonly, tldadmin, admins, members, fee, created, hidden, label, url, membertype, membersource, slds, registry) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
					[id, name, isPublic, adminOnly, 1, admins, JSON.stringify(initialMembers), 0, time(), isHidden, label, url, memberType, memberSource, sldsEnabled, registry]
				);

				if (!insert) {
					sendError(ws, command, "Something went wrong. Try again.");
					break;
				}

				await makeVideoRoom(id, name);
				await fetchChannels();

				let debugChannel = dataForChannel(body.channel);


				sendSuccess(ws, command, {
					id: id,
					name: name,
					admin: groupAdmin
				});
			}
			break;

		case "SETCHANNELMUTE":
			{
				let channel = dataForChannel(body.channel);
				let actor = dataForUser(ws.domain);

				if (!channel || !actor) {
					sendError(ws, command, "Group not found.");
					break;
				}

				if (!isAdmin(body.channel, ws)) {
					sendError(ws, command, "You cannot moderate this group.");
					break;
				}

				let target = dataForUser(body.user);

				if (!target || target.locked || target.deleted) {
					sendError(ws, command, "User not found.");
					break;
				}

				if (target.id === actor.id) {
					sendError(ws, command, "You cannot mute yourself.");
					break;
				}

				let globalAdmin = isGlobalAdminUser(actor);
				let owner = isGroupOwner(body.channel, ws);

				let admins = [];
				let members = [];

				try {
					admins = Array.isArray(channel.admins)
						? channel.admins
						: JSON.parse(channel.admins || "[]");
				}
				catch {}

				try {
					members = Array.isArray(channel.members)
						? channel.members
						: JSON.parse(channel.members || "[]");
				}
				catch {}

				let actorStaff = admins.includes(actor.domain);

				let targetGlobalAdmin = isGlobalAdminUser(target);
				let targetOwner =
					Number(channel.tldadmin) === 1 &&
					target.type === "handshake" &&
					sameTLD(target.domain, channel.name);
				let targetStaff = admins.includes(target.domain);
				let targetMember =
					target.type === "handshake" &&
					members.includes(target.domain);

				if (!globalAdmin) {
					if (!targetMember) {
						sendError(ws, command, "You can mute group members only.");
						break;
					}

					if (targetGlobalAdmin || targetOwner) {
						sendError(ws, command, "You cannot mute this role.");
						break;
					}

					if (actorStaff && !owner && targetStaff) {
						sendError(ws, command, "Staff cannot mute other staff.");
						break;
					}
				}

				let duration = Number(body.duration);
				let allowed = [0, 3600, 86400, 259200, 2592000, -1];

				if (!allowed.includes(duration)) {
					sendError(ws, command, "Invalid mute duration.");
					break;
				}

				let mutes = {};

				try {
					mutes = JSON.parse(channel.mutes || "{}");
				}
				catch {}

				let until = 0;

				if (duration === 0) {
					delete mutes[target.domain];
				}
				else if (duration === -1) {
					until = -1;
					mutes[target.domain] = -1;
				}
				else {
					until = time() + duration;
					mutes[target.domain] = until;
				}

				let mutesJson = JSON.stringify(mutes);

				await db(
					"UPDATE channels SET mutes = ? WHERE id = ?",
					[mutesJson, body.channel]
				);

				channel.mutes = mutesJson;

				sendToAllClients("CHANNELMUTE", {
					channel: body.channel,
					domain: target.domain,
					until: until
				});

				sendSuccess(ws, command, {
					channel: body.channel,
					domain: target.domain,
					until: until
				});
			}
			break;

		case "SETCHANNELSTAFF":
			{
				let channel = dataForChannel(body.channel);
				let target = dataForUser(body.user);

				if (!channel) {
					sendError(ws, command, "Group not found.");
					break;
				}

				if (!canManageGroupStaff(body.channel, ws)) {
					sendError(ws, command, "Only the group owner or global admin can appoint group staff.");
					break;
				}

				let chathnsStaff =
					target &&
					target.type === "account" &&
					target.namespace === "chathns";

				let handshakeStaff =
					target &&
					target.type === "handshake";

				if (
					!target ||
					target.locked ||
					target.deleted ||
					(!handshakeStaff && !chathnsStaff)
				) {
					sendError(ws, command, "Group staff must be a verified TLD or ChatHNS account.");
					break;
				}

				let members = [];
				let admins = [];

				try {
					members = Array.isArray(channel.members)
						? channel.members
						: JSON.parse(channel.members || "[]");
				}
				catch {}

				try {
					admins = Array.isArray(channel.admins)
						? channel.admins
						: JSON.parse(channel.admins || "[]");
				}
				catch {}

				members = members
					.map(v => String(v).toLowerCase().trim())
					.filter(Boolean);

				admins = admins
					.map(v => String(v).toLowerCase().trim())
					.filter(Boolean);

				let domain = String(target.domain).toLowerCase().trim();

				if (handshakeStaff && !members.includes(domain)) {
					sendError(ws, command, "HNS group staff must be a group member.");
					break;
				}

				if (sameTLD(domain, channel.name)) {
					sendError(ws, command, "The group owner is already the owner.");
					break;
				}

				if (body.staff === false || Number(body.staff) === 0) {
					admins = admins.filter(v => v !== domain);
				}
				else {
					if (!admins.includes(domain)) {
						admins.push(domain);
					}
				}

				admins = [...new Set(admins)];

				let adminsJson = JSON.stringify(admins);

				await db(
					"UPDATE channels SET admins = ? WHERE id = ?",
					[adminsJson, body.channel]
				);

				channel.admins = adminsJson;

				await fetchChannels();

				sendToAllClients("CHANNELSTAFF", {
					channel: body.channel,
					domain: domain,
					staff: admins.includes(domain)
				});

				sendSuccess(ws, command, {
					channel: body.channel,
					domain: domain,
					staff: admins.includes(domain)
				});
			}
			break;

		case "SETCHANNELSETTINGS":
			{
				let channel = dataForChannel(body.channel);
				if (!channel) {
					sendError(ws, command, "Group not found.");
					break;
				}

				if (!isAdmin(body.channel, ws)) {
					sendError(ws, command, "Only group admins can change this setting.");
					break;
				}

				let visibility = String(body.visibility || "").toLowerCase();
				let mode = String(body.mode || "").toLowerCase();

				if (!["public", "private", "hidden"].includes(visibility)) {
					sendError(ws, command, "Invalid visibility.");
					break;
				}

				if (!["group", "channel"].includes(mode)) {
					sendError(ws, command, "Invalid mode.");
					break;
				}

				let isPublic = visibility === "public" ? 1 : 0;
				let isHidden = visibility === "hidden" ? 1 : 0;
				let adminOnly = mode === "channel" ? 1 : 0;

				let label = String(body.label || "").trim() || null;
				let url = String(body.url || "").trim() || null;

				let listSort = Number(channel.sort) || 0;
				let groupColor = channel.color || null;

				if (Object.prototype.hasOwnProperty.call(body, "color")) {
					let requestedColor = String(body.color || "").trim();

					if (/^#[0-9a-fA-F]{6}$/.test(requestedColor)) {
						groupColor = requestedColor.toLowerCase();
					}
					else {
						groupColor = null;
					}
				}

				if (Object.prototype.hasOwnProperty.call(body, "sort")) {
					let actor = dataForUser(ws.domain);

					if (!isGlobalAdminUser(actor)) {
						sendError(ws, command, "Only global ChatHNS admins can change list position.");
						break;
					}

					let requestedSort = Number(body.sort);

					if (
						!Number.isInteger(requestedSort) ||
						requestedSort < 0 ||
						requestedSort > 99
					) {
						sendError(ws, command, "Invalid list position.");
						break;
					}

					listSort = requestedSort;
				}


				let memberType = String(channel.membertype || "manual").toLowerCase();
				let memberSource = channel.membersource || null;
				let membersJson = channel.members || "[]";

				let sldsEnabled = Number(channel.slds) === 1 ? 1 : 0;
				let registry = channel.registry || null;

				/*
				 * Membership configuration is deliberately protected.
				 * Normal Save never changes it.
				 * Client must explicitly send membershipUnlocked=true.
				 */
				if (body.membershipUnlocked === true) {
					if (!isGlobalAdminUser(dataForUser(ws.domain))) {
						sendError(ws, command, "Only a global admin can change group access.");
						break;
					}

					let requestedAccess = String(body.access || "members").toLowerCase();

					if (!["members", "rule", "internal", "namebase"].includes(requestedAccess)) {
						sendError(ws, command, "Invalid group access type.");
						break;
					}

					if (requestedAccess === "internal") {
						sldsEnabled = 1;
						registry = null;
					}
					else if (requestedAccess === "namebase") {
						sldsEnabled = 0;
						registry = "namebase";
					}
					else {
						sldsEnabled = 0;
						registry = null;
					}

					let requestedType =
						requestedAccess === "rule" ? "rule" : "manual";

					if (!["manual", "rule"].includes(requestedType)) {
						sendError(ws, command, "Invalid membership type.");
						break;
					}

					if (requestedType === "rule") {
						let requestedRule = String(body.membersource || "").toLowerCase();

						if (!["10k", "1letter", "3letters", "1to3letters", "1number", "1emoji", "1symbol", "newnation", "handshakeuser"].includes(requestedRule)) {
							sendError(ws, command, "Invalid membership rule.");
							break;
						}

						memberType = "rule";
						memberSource = requestedRule;
					}
					else {
						memberType = "manual";
						memberSource = null;

						if (requestedAccess === "members") {
							if (!Array.isArray(body.members)) {
								sendError(ws, command, "Members access requires a member list.");
								break;
							}

							let members = normalizeTLDList(body.members);

							if (members === null) {
								sendError(ws, command, "Invalid member TLD.");
								break;
							}

							membersJson = JSON.stringify(members);
						}
						else {
							/*
							 * Internal / Namebase SLD access does not use
							 * the manual TLD member list.
							 */
							membersJson = "[]";
						}
					}
				}

				/*
				 * Manual member maintenance does not require
				 * unlocking Membership Type.
				 */
				if (
					body.membershipUnlocked !== true &&
					memberType === "manual" &&
					Array.isArray(body.members)
				) {
					if (!canManageGroupStaff(body.channel, ws)) {
						sendError(ws, command, "Only the group owner or global admin can change members.");
						break;
					}

					let members = normalizeTLDList(body.members);

					if (members === null) {
						sendError(ws, command, "Invalid member TLD.");
						break;
					}

					membersJson = JSON.stringify(members);
				}

				if (Array.isArray(body.staff)) {
					if (!canManageGroupStaff(body.channel, ws)) {
						sendError(ws, command, "Only the group owner or global admin can appoint group staff.");
						break;
					}

					let memberDomains = [];
					try {
						memberDomains = JSON.parse(membersJson || "[]");
					}
					catch {}

					if (!Array.isArray(memberDomains)) {
						memberDomains = [];
					}

					let staffDomains = null;

					if (Array.isArray(body.staff)) {
						try {
							staffDomains = [...new Set(
								body.staff
									.map(value => punycode.toAscii(
										String(value).trim().toLowerCase()
									))
									.filter(Boolean)
							)];
						}
						catch {
							staffDomains = null;
						}
					}

					if (staffDomains === null) {
						sendError(ws, command, "Invalid staff account.");
						break;
					}

					let validStaff = staffDomains.filter(domain => {
						let u = dataForDomain(domain);

						if (!u || u.locked || u.deleted) {
							return false;
						}

						let handshakeStaff =
							u.type === "handshake" &&
							memberDomains.includes(u.domain);

						let chathnsStaff =
							u.type === "account" &&
							u.namespace === "chathns";

						return (
							(handshakeStaff || chathnsStaff) &&
							!sameTLD(u.domain, channel.name)
						);
					});

					if (validStaff.length !== staffDomains.length) {
						sendError(ws, command, "Group staff must be HNS members or ChatHNS accounts.");
						break;
					}

					let staffJson = JSON.stringify(validStaff);
					await db("UPDATE channels SET admins = ? WHERE id = ?", [staffJson, body.channel]);
					channel.admins = staffJson;
				}



				await db(
					"UPDATE channels SET public = ?, hidden = ?, sort = ?, color = ?, adminonly = ?, label = ?, url = ?, membertype = ?, membersource = ?, members = ?, slds = ?, registry = ? WHERE id = ?",
					[
						isPublic,
						isHidden,
						listSort,
						groupColor,
						adminOnly,
						label,
						url,
						memberType,
						memberSource,
						membersJson,
						sldsEnabled,
						registry,
						body.channel
					]
				);

				channel.public = isPublic;
				channel.hidden = isHidden;
				channel.sort = listSort;
				channel.color = groupColor;
				channel.adminonly = adminOnly;
				channel.label = label;
				channel.url = url;
				channel.membertype = memberType;
				channel.membersource = memberSource;
				channel.members = membersJson;
				channel.slds = sldsEnabled;
				channel.registry = registry;

				await fetchChannels();

				sendSuccess(ws, command, {
					channel: body.channel,
					public: isPublic,
					hidden: isHidden,
					adminonly: adminOnly
				});
			}
			break;

		case "DELETECHANNEL":
			{
				let channel = dataForChannel(body.channel);
				if (!channel) {
					sendError(ws, command, "Group not found.");
					break;
				}

				if (!canManageGroupStaff(body.channel, ws)) {
					sendError(ws, command, "Only the group owner or global admin can delete this group.");
					break;
				}

				await db("DELETE FROM messages WHERE conversation = ?", [body.channel]);
				await db("DELETE FROM channels WHERE id = ?", [body.channel]);

				channels = channels.filter(c => c.id !== body.channel);

				sendToAllClients("CHANNELDELETED", {
					channel: body.channel
				});

				sendSuccess(ws, command, {
					channel: body.channel
				});
			}
			break;

		case "SETCHANNELMODE":
			{
				let channel = dataForChannel(body.channel);
				if (!channel) {
					sendError(ws, command, "Group not found.");
					break;
				}

				if (!isAdmin(body.channel, ws)) {
					sendError(ws, command, "Only group admins can change this setting.");
					break;
				}

				let mode = String(body.mode || "").toLowerCase();
				if (mode !== "group" && mode !== "channel") {
					sendError(ws, command, "Mode must be group or channel.");
					break;
				}

				let adminOnly = mode === "channel" ? 1 : 0;
				await db("UPDATE channels SET adminonly = ? WHERE id = ?", [adminOnly, body.channel]);
				channel.adminonly = adminOnly;

				sendToAllClients("CHANNELMODE", { channel: body.channel, mode: mode, adminonly: adminOnly });
				sendSuccess(ws, command, { channel: body.channel, mode: mode, adminonly: adminOnly });
			}
			break;

		case "RECEIVEDPAYMENT":
			const regex = new RegExp("^(?:[a-z0-9]{64})$");
			if (!regex.test(body.tx)) {
				sendError(ws, command, "Something is wrong with that transaction.", { user: body.user });
				break;
			}

			let update = await db("UPDATE channels SET tx = ? WHERE id = ?", [body.tx, body.channel]);
			if (!update) {
				sendError(ws, command, "Something went wrong :/", { user: body.user });
				break;
			}

			sendSuccess(ws, command, { user: body.user });
			break;

		case "DELETEATTACHMENT":
			let exists = db("SELECT * FROM uploads WHERE id = ? AND session = ?", [body.id, ws.session]).then(r => {
				if (r.length) {
					let remove = db("DELETE FROM uploads WHERE id = ? AND session = ?", [body.id, ws.session]);
					if (remove) {
						try {
							fs.rmSync(`${config.path}/../web/uploads/${body.id}`);
						}
						catch {}
					}
				}
			});
			break;

		case "SAVEDSETTINGS":
			sendUser(ws.domain);
			break;

		case "SAVEPROFILE":
			if (body) {
				let update = await db("UPDATE domains SET bio = ? WHERE id = ?", [body.bio, ws.domain]);
				if (update) {
					sendUser(ws.domain);
				}
			}
			break;

		case "STARTVIDEO":
			if (isChannel(body.conversation) && !dataForChannel(body.conversation).video && isAdmin(body.conversation, ws)) {
				dataForChannel(body.conversation).video = true;
				dataForChannel(body.conversation).videoUsers[ws.domain] = { video: false, audio: false };
				dataForChannel(body.conversation).videoWatchers.push(ws.domain);
				body.users = dataForChannel(body.conversation).videoUsers;
				body.watchers = dataForChannel(body.conversation).videoWatchers;
				body.speakers = dataForChannel(body.conversation).videoSpeakers;
				sendToUsers(command, body, body.conversation);
			}
			break;

		case "INVITEVIDEO":
			if (isChannel(body.conversation) && dataForChannel(body.conversation).video && isAdmin(body.conversation, ws)) {
				if (!dataForChannel(body.conversation).videoSpeakers.includes(body.user)) {
					dataForChannel(body.conversation).videoSpeakers.push(body.user);
				}
				body.users = dataForChannel(body.conversation).videoUsers;
				body.watchers = dataForChannel(body.conversation).videoWatchers;
				body.speakers = dataForChannel(body.conversation).videoSpeakers;
				sendToUsers(command, body, body.conversation);
			}
			break;

		case "JOINVIDEO":
			if (isChannel(body.conversation) && dataForChannel(body.conversation).video && (isAdmin(body.conversation, ws) || dataForChannel(body.conversation).videoSpeakers.includes(ws.domain))) {
				if (!Object.keys(dataForChannel(body.conversation).videoUsers).includes(ws.domain)) {
					dataForChannel(body.conversation).videoUsers[ws.domain] = { video: false, audio: false };
				}
				if (!dataForChannel(body.conversation).videoWatchers.includes(ws.domain)) {
					dataForChannel(body.conversation).videoWatchers.push(ws.domain);
				}
				body.users = dataForChannel(body.conversation).videoUsers;
				body.watchers = dataForChannel(body.conversation).videoWatchers;
				body.speakers = dataForChannel(body.conversation).videoSpeakers;
				sendToUsers(command, body, body.conversation);
			}
			break;

		case "VIEWVIDEO":
			if (isChannel(body.conversation) && dataForChannel(body.conversation).video) {
				if (!dataForChannel(body.conversation).videoWatchers.includes(ws.domain)) {
					dataForChannel(body.conversation).videoWatchers.push(ws.domain);
					body.watchers = dataForChannel(body.conversation).videoWatchers;
					sendToUsers(command, body, body.conversation);
				}
			}
			break;

		case "LEAVEVIDEO":
			if (isChannel(body.conversation) && dataForChannel(body.conversation).video) {
				if (Object.keys(dataForChannel(body.conversation).videoUsers).includes(ws.domain)) {
					removeUserFromVideoUsers(dataForChannel(body.conversation), ws.domain);
				}
				else {
					removeUserFromVideoWatchers(dataForChannel(body.conversation), ws.domain);
				}
			}
			break;

		case "ENDVIDEO":
			if (isChannel(body.conversation) && dataForChannel(body.conversation).video && isAdmin(body.conversation, ws)) {
				dataForChannel(body.conversation).video = false;
				dataForChannel(body.conversation).videoUsers = {};
				dataForChannel(body.conversation).videoWatchers = [];
				dataForChannel(body.conversation).videoSpeakers = [];
				sendToUsers(command, body, body.conversation);
			}
			break;

		case "MUTEVIDEO":
			if (dataForChannel(body.conversation).videoUsers[ws.domain]) {
				let video = dataForChannel(body.conversation).videoUsers[ws.domain].video;
				dataForChannel(body.conversation).videoUsers[ws.domain].video = !video;
				body.user = ws.domain;
				sendToUsers(command, body, body.conversation);
			}
			break;

		case "MUTEAUDIO":
			if (dataForChannel(body.conversation).videoUsers[ws.domain]) {
				let audio = dataForChannel(body.conversation).videoUsers[ws.domain].audio;
				dataForChannel(body.conversation).videoUsers[ws.domain].audio = !audio;
				body.user = ws.domain;
				sendToUsers(command, body, body.conversation);
			}
			break;

		case "CHANGEDCONVERSATION":
			updateSeen(ws.session, body);
			break;
	}
}

function updateSeen(session, conversation) {
	if (conversationExists(conversation)) {
			db(`UPDATE sessions SET seen = JSON_MERGE_PATCH(seen, '{"${conversation}":${time()}}') WHERE id = ?`, [session]);
		}
}

function conversationExists(id) {
	if (dataForChannel(id) || dataForPM(id)) {
		return true;
	}
	return false;
}

async function messageExists(id) {
	let output = new Promise(resolve => {
		db("SELECT * FROM messages WHERE id = ?", [id]).then(r => {
			if (r[0]) {
				log("message exists");
				resolve(true);
			}
			log("message doesn't exist");
			resolve(false);
		});
	});
	return await output;
}

function removeUserFromVideoChatsIfNeeded(user) {
	channels.forEach((c, k) => {
		if (Object.keys(c.videoUsers).includes(user)) {
			removeUserFromVideoUsers(c, user);
		}
		if (c.videoWatchers.includes(user)) {
			removeUserFromVideoWatchers(c, user);
		}
	});
}

function removeUserFromVideoUsers(channel, user) {
	delete channel.videoUsers[user];

	if (!Object.keys(channel.videoUsers).length) {
		channel.video = false;
		channel.videoWatchers = [];
		channel.videoSpeakers = [];

		let body = {
			conversation: channel.id
		}
		sendToUsers("ENDVIDEO", body, channel.id);
	}
	else {
		let body = {
			conversation: channel.id,
			users: channel.videoUsers
		}
		sendToUsers("LEAVEVIDEO", body, channel.id);
	}
}

function removeUserFromVideoWatchers(channel, user) {
	channel.videoWatchers = channel.videoWatchers.filter(u => {
		return u !== user;
	});

	let body = {
		conversation: channel.id,
		watchers: channel.videoWatchers
	}
	sendToUsers("LEAVEVIDEO", body, channel.id);
}

function sameTLD(a, b) {
	try {
		return punycode.toAscii(String(a).toLowerCase()) ===
			punycode.toAscii(String(b).toLowerCase());
	}
	catch {
		return false;
	}
}

function isGlobalAdminUser(user) {
	return Boolean(user && (Number(user.admin) === 1 || config.admin.includes(user.id)));
}

function isGroupOwner(conversation, ws) {
	if (!isChannel(conversation)) return false;
	let channel = dataForChannel(conversation);
	let me = dataForUser(ws.domain);
	return Boolean(channel && me && !me.locked && !me.deleted &&
		Number(channel.tldadmin) === 1 &&
		me.type === "handshake" &&
		sameTLD(me.domain, channel.name));
}

function canManageGroupStaff(conversation, ws) {
	return isGlobalAdminUser(dataForUser(ws.domain)) || isGroupOwner(conversation, ws);
}

function isAdmin(conversation, ws) {
	if (isChannel(conversation)) {
		let channel = dataForChannel(conversation);
		let admins = [];
		try { admins = Array.isArray(channel.admins) ? channel.admins : JSON.parse(channel.admins || "[]"); }
		catch {}
		let me = dataForUser(ws.domain);

		if (!me || me.locked || me.deleted) {
			return false;
		}

		let tldOwner =
			Number(channel.tldadmin) === 1 &&
			me.type === "handshake" &&
			sameTLD(me.domain, channel.name);

		if (
			tldOwner ||
			me.admin ||
			config.admin.includes(me.id) ||
			admins.includes(me.domain) ||
			admins.includes(ws.domain)
		) {
			return true;
		}
	}
	return false;
}

function regex(pattern, string) {
	return [...string.matchAll(pattern)];
}

function otherUser(users, not) {
	return users.filter(u => {
		return u !== not;
	})[0];
}

async function sendPushNotificationsIfNeeded(user, body) {
	let notifications = [];

	let msg = body.message;
	let name,message;
	let active = activeUsers();
	
	try {
		message = JSON.parse(msg).message;
	}
	catch {
		message = msg;
	}

	if (typeof message != "string") {
		return;
	}

	if (message && message.length) {
		if (isChannel(body.conversation)) {
			name = dataForChannel(body.conversation).name;

			let mentions = new Promise(resolve => {
				let users = usersInMessage(message);
				users.forEach((u, k) => {
					if (hasConversationReadAccess(body.conversation, u.groups.id) && !active.includes(u.groups.id)) {
						let push = pushForUser(u.groups.id);
						if (push.length) {
							push.forEach((p, k) => {
								notifications[p] = {
									user: u.groups.id,
									title: `Mention in #${name}`,
									body: `@${user}: ${message}`
								};
							});
						}
					}
				});
				resolve();
			});
			
			let reply = new Promise(resolve => {
				if (body.replying) {
					db("SELECT user FROM messages WHERE id = ?", [body.replying]).then(r => {
						if (r[0]) {
							let sender = r[0].user;
							if (!active.includes(sender)) {
								let push = pushForUser(sender);
								if (push.length) {
									push.forEach((p, k) => {
										notifications[p] = {
											user: sender,
											title: `Reply in #${name}`,
											body: `@${user}: ${message}`
										};
									});
								}
							}
						}
						resolve();
					});
				}
				else {
					resolve();
				}
			});

			await mentions;
			await reply;
		}
		else {
			let pmData = dataForPM(body.conversation);
			let me = otherUser(JSON.parse(pmData.users), user);

			let pm = new Promise(resolve => {
				if (!active.includes(me)) {
					let push = pushForUser(me);
					if (push.length) {
						push.forEach((p, k) => {
							notifications[p] = {
								user: me,
								title: `Private Message from @${user}`,
								body: "Encrypted message"
							};
						});
					}
				}
				resolve();
			});
			await pm;
		}

		Object.keys(notifications).forEach((p, k) => {
			let n = notifications[p];
			sendPushNotification(p, n.user, body.conversation, n.title, n.body);
		});
	}
}

function sendPushNotification(token, domain, conversation, title, body) {
	title = replaceIds(title).replace("@", "").replace("\x00", "");
	body = replaceIds(body);

	let data = {
		title: title,
		body: body,
		data: {
			domain: domain,
			conversation: conversation
		}
	};
	sendNotification(token, data);
}

async function sendNotification(expoPushToken, data) {
    const expo = new Expo({ accessToken: config.expoKey });

    const chunks = expo.chunkPushNotifications([{ to: expoPushToken, ...data }]);
    const tickets = [];

    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error(error);
        }
    }

    let response = "";

    for (const ticket of tickets) {
        if (ticket.status === "error") {
            if (ticket.details && ticket.details.error === "DeviceNotRegistered") {
                response = "DeviceNotRegistered";
            }
        }

        if (ticket.status === "ok") {
            response = ticket.id;
        }
    }

    return response;
}

function usersInMessage(message) {
	let matches = regex(/\@(?<id>[a-zA-Z0-9]{16}(?:\b|$))/gm, message);
	return matches;
}

function channelsInMessage(message) {
	let matches = regex(/\@(?<id>[a-zA-Z0-9]{8}(?:\b|$))/gm, message);
	return matches;
}

function replaceIds(message, link=false) {
	let output = message;

	while (channelsInMessage(output).length) {
		let channels = channelsInMessage(output);
		let result = channels[0];

		let id = result.groups.id;
		let start = result.index;
		let end = (start + id.length + 1);
		
		let replace;
		let match = dataForChannel(id);
		if (match) {
			let channel = match.name;
			replace = `@\x00${toUnicode(channel)}`;
		}
		else {
			replace = `@\x00${id}`;
		}
		output = replaceRange(output, start, end, replace);
	}

	while (usersInMessage(output).length) {
		let users = usersInMessage(output);
		let result = users[0];

		let id = result.groups.id;
		let start = result.index;
		let end = (start + id.length + 1);

		let replace;
		let match = dataForUser(id);
		if (match) {
			let domain = match.domain;
			replace = `@\x00${toUnicode(domain)}/`;
		}
		else {
			replace = `@\x00${id}`;
		}
		output = replaceRange(output, start, end, replace);
	}
	return output;
}

function replaceRange(s, start, end, substitute) {
	let before = s.substr(0, start);
	let after = s.substr(end, (s.length -end));

	return before+substitute+after;
}

function getRndInteger(min, max) {
	return Math.floor(Math.random() * (max - min) ) + min;
}

function toUnicode(name) {
	let puny = punycode.toUnicode(name);
	let zwj = nameToUnicode(puny);
	return zwj;
}

function sendUser(id) {
	db(`SELECT ${userColumns}
		FROM domains d
		LEFT JOIN accounts a ON a.domain_id = d.id
		LEFT JOIN sessions s ON s.id = d.session
		WHERE d.id = ?`, [id]).then(r => {
		if (r.length) {
			users = users.filter(u => {
				return u.id !== id;
			});
			users.push(r[0]);
			sendToAllClients("USER", r[0]);
		}
	});
}

async function lockAndSendOthers(name, id) {
	let others = await db("SELECT * FROM domains WHERE domain = ? AND id != ? AND locked = 0", [name, id]);
	let update = await db("UPDATE domains SET locked = 1 WHERE domain = ? AND locked = 0 AND id != ?", [name, id]);

	if (update) {
		others.forEach((d, k) => {
			sendUser(d.id);
		});
	}

	return;
}

async function addDomain(ws, name, type) {
	let id = await generateID("domain");
	name = name.toLowerCase();

	let exists = await db("SELECT * FROM domains WHERE domain = ? AND session = ? AND deleted = 0 AND type = ?", [name, ws.session, type]);
	if (exists.length) {
		return false;
	}

	let insert = await db("INSERT INTO domains (id, domain, type, session, created) VALUES (?,?,?,?,?)", [id, name, type, ws.session, time()]);
	if (insert) {
		await lockAndSendOthers(name, id);
		sendUser(id);
		return id;
	}
	return false;
}

async function unlockDomain(id, name) {
	let unlock = await db("UPDATE domains SET locked = 0 WHERE id = ?", [id]);
	if (unlock) {
		await lockAndSendOthers(name, id);
		sendUser(id);
		
		return true;
	}
	return false;
}

function validName(name) {
	try {
		return name.match(/^(?:[A-Za-z0-9][A-Za-z0-9\-]{0,61}[A-Za-z0-9]|[A-Za-z0-9])$/g).length;
	}
	catch {}
	return false;
}

function validALFName(name) {
	try {
		name = String(name || "").trim().toLowerCase();

		let labels = name.split(".");

		if (labels.length < 1) {
			return false;
		}

		return labels.every(label => validName(label));
	}
	catch {}

	return false;
}

function normalizeTLDList(values) {
	if (!Array.isArray(values)) {
		return null;
	}

	let output = [];

	for (let value of values) {
		try {
			let normalized = punycode.toAscii(
				String(value).trim().toLowerCase()
			);

			if (!normalized || !validName(normalized)) {
				return null;
			}

			output.push(normalized);
		}
		catch {
			return null;
		}
	}

	return [...new Set(output)];
}

function isAvailableSLD(tld, sld) {
	return !users.filter(d => {
		return d.tld == tld && d.domain == `${sld}.${tld}`;
	}).length;
}

function tldForDomain(domain) {
	let split = domain.split(".");
	return split.pop();
}

function canCreateSLD(tld) {
	return slds.filter(t => { return t.name == tld; }).length;
}

function decodedRuleTLD(domain) {
	if (typeof domain !== "string") {
		return "";
	}

	let value = domain.trim().toLowerCase();

	try {
		if (value.startsWith("xn--")) {
			value = require("url").domainToUnicode(value);
		}
	}
	catch {}

	return value;
}

function matchesGroupRule(domain, rule) {
	let value = decodedRuleTLD(domain);
	rule = String(rule || "").toLowerCase();

	switch (rule) {
		case "10k":
			// 0-9999 written with 1-4 digits, including leading zeroes,
			// plus exactly 10000.
			return /^(?:[0-9]{1,4}|10000)$/.test(value);

		case "1number":
			return /^[0-9]$/.test(value);

		case "1letter":
			return /^\p{L}$/u.test(value);

		case "3letters":
			return /^\p{L}{3}$/u.test(value);

		case "1to3letters":
			// Exactly 1-3 Unicode letters from any alphabet/writing system.
			return /^\p{L}{1,3}$/u.test(value);

		case "newnation":
			// ID-card emoji followed by 1-999.
			return /^🪪(?:[1-9]|[1-9][0-9]|[1-9][0-9]{2})$/u.test(value);

		case "1emoji":
			// Exactly one Unicode extended pictographic character,
			// optionally with variation selector.
			return /^\p{Extended_Pictographic}\uFE0F?$/u.test(value);

		case "1symbol":
			// Exactly one Unicode symbol. Emoji are handled by 1emoji.
			return /^\p{S}$/u.test(value) &&
				!/\p{Extended_Pictographic}/u.test(value);

		default:
			return false;
	}
}

async function claimGroupOwnershipIfMatching(channelID, domain) {
	let channel = dataForChannel(channelID);

	if (!channel) {
		return false;
	}

	let user = dataForDomain(domain);

	if (
		!user ||
		user.locked ||
		user.deleted ||
		user.type !== "handshake" ||
		!sameTLD(user.domain, channel.name)
	) {
		return false;
	}

	if (Number(channel.tldadmin) !== 1) {
		await db(
			"UPDATE channels SET tldadmin = 1 WHERE id = ?",
			[channelID]
		);

		channel.tldadmin = 1;
		return "claimed";
	}

	return "owner";
}


async function admitGroupCandidate(channelID, domain) {
	let channel = dataForChannel(channelID);

	if (!channel) {
		return false;
	}

	let isRule =
		String(channel.membertype || "").toLowerCase() === "rule";

	let isNamebase =
		String(channel.registry || "").toLowerCase() === "namebase";

	if (!isRule && !isNamebase) {
		return false;
	}

	let rule = String(channel.membersource || "").toLowerCase();
	let user = dataForDomain(domain);

	if (
		!user ||
		user.locked ||
		user.deleted
	) {
		return false;
	}

	let ruleMatches = false;

	if (isNamebase) {
		let normalizedDomain = String(domain || "").toLowerCase();

		ruleMatches =
			user.type === "handshake" &&
			normalizedDomain.includes(".") &&
			tldForDomain(normalizedDomain) ===
				String(channel.name || "").toLowerCase();
	}
	else switch (rule) {
		case "handshakeuser":
			/*
			 * Temporary username/password guest accounts.
			 * Account validity itself is managed by the
			 * handshakeuser namespace / expiry system.
			 */
			ruleMatches =
				user.type === "account" &&
				user.namespace === "handshakeuser";
			break;

		default:
			/*
			 * Existing HNS name rules:
			 * 10k, 1to3letters, 1emoji, 1symbol, newnation, ...
			 */
			ruleMatches =
				user.type === "handshake" &&
				matchesGroupRule(domain, rule);
			break;
	}

	if (!ruleMatches) {
		return false;
	}

	let members = [];

	try {
		members = JSON.parse(channel.members || "[]");
	}
	catch {}

	if (!Array.isArray(members)) {
		members = [];
	}

	domain = String(domain).toLowerCase();

	if (members.includes(domain)) {
		return "member";
	}

	members.push(domain);

	channel.members = JSON.stringify(members);

	await db(
		"UPDATE channels SET members = ? WHERE id = ?",
		[channel.members, channelID]
	);

	return "added";
}

function hasConversationReadAccess(conversation, user) {
	var c;
	if (isChannel(conversation)) {
		c = dataForChannel(conversation);
	}
	else {
		c = dataForPM(conversation);
	}

	if (!c) {
		return false;
	}

	let data = dataForUser(user);
	if (!data || data.deleted) {
		return false;
	}

	/*
	 * Rule groups:
	 * a matching account may enter immediately.
	 * admitGroupCandidate() persists it in members.
	 */
	if (
		isChannel(conversation) &&
		String(c.membertype || "").toLowerCase() === "rule"
	) {
		let rule = String(c.membersource || "").toLowerCase();

		if (
			rule === "handshakeuser" &&
			data.type === "account" &&
			data.namespace === "handshakeuser" &&
			!data.locked
		) {
			return true;
		}
	}

	let users = usersForConversation(conversation);
	return users.filter(u => {
		return u && u.id == user;
	}).length;
}

function hasConversationWriteAccess(channel, user) {
	let data = dataForUser(user);
	if (!data || data.locked || data.deleted) {
		return false;
	}

	let c = isChannel(channel) ? dataForChannel(channel) : null;

	if (
		c &&
		String(c.membertype || "").toLowerCase() === "rule"
	) {
		let rule = String(c.membersource || "").toLowerCase();

		if (
			rule === "handshakeuser" &&
			data.type === "account" &&
			data.namespace === "handshakeuser"
		) {
			return true;
		}
	}

	let users = usersForConversation(channel);
	return users.filter(u => {
		return u && u.id == user;
	}).length;
}

function isChannel(id) {
	if (id.toString().length == 8) {
		if (dataForChannel(id)) {
			return true;
		}
	}
	return false;
}

function dataForChannel(id) {
	return channels.filter(a => {
		return a.id == id;
	})[0];
}

function dataForChannelByName(name) {
	return channels.filter(a => {
		return a.name == name;
	})[0];
}

function dataForPM(id) {
	return pms.filter(a => {
		return a.id == id;
	})[0];
}

function dataForUser(id) {
	return users.filter(a => {
		return a.id == id;
	})[0];
}

function pushForUser(id) {
	return JSON.parse(sessions.filter(a => {
		return a.domain == id;
	})[0].push);
}

function dataForDomain(domain) {
	return users.filter(a => {
		return a.domain == domain && !a.locked && !a.deleted;
	})[0];
}

function getStaked() {
	var output = [];

	channels.forEach(c => {
		if (c.slds) {
			let data = {
				name: c.name,
				hip2: c.hip2
			}
			output.push(data);
		}
	});

	let sorted = output.sort((a, b) => {
		return a.name.localeCompare(b.name);
	});

	return sorted;
}

function usersForConversation(id) {
	var output = [];

	if (isChannel(id)) {
		let channelInfo = dataForChannel(id);
		if (channelInfo.public) {
			output = users;
		}
		else {
			let members = [];
			let admins = [];

			try {
				members = JSON.parse(channelInfo.members || "[]");
			}
			catch {}

			try {
				admins = JSON.parse(channelInfo.admins || "[]");
			}
			catch {}

			output = users.filter(u => {
				if (!u || u.locked || u.deleted) {
					return false;
				}

				let tldOwner =
					Number(channelInfo.tldadmin) === 1 &&
					u.type === "handshake" &&
					sameTLD(u.domain, channelInfo.name);

				let member =
					members.includes(u.domain);

				return tldOwner ||
					u.admin ||
					config.admin.includes(u.id) ||
					admins.includes(u.domain) ||
					member;
			});
		}
	}
	else {
		let pmInfo = dataForPM(id);
		let pmUsers = JSON.parse(pmInfo.users);

		pmUsers.forEach(u => {
			output.push(dataForUser(u));
		});
	}

	return output;
}

function clientsForUsers(users) {
	var output = [];

	let clients = wss.clients;
	clients.forEach(c => {
		let client = users.filter(c2 => {
			return c2.id == c.domain;
		})[0];

		if (client) {
			output.push(c);
		}
	});

	return output;
}

function sendToUsers(type, body, conversation, id=null, user=null, time=null) {
	let conversationUsers = usersForConversation(conversation);
	let clients = clientsForUsers(conversationUsers);

	var message;
	clients.forEach(client => {
		switch (type) {
			case "MESSAGE":
				message = {
					conversation: conversation,
					id: id,
					message: body.message.toString(),
					time: time,
					user: user
				}

				if (body.replying) {
					message.replying = body.replying;
					db("SELECT * FROM messages WHERE id = ?", [body.replying]).then(r => {
						let replying = r[0];
						if (replying) {
							message.p_message = replying.message;
							message.p_user = replying.user;
						}
						else {
							delete message.replying;
						}
						sendMessage(client, type, message);
					});
				}
				else {
					sendMessage(client, type, message);
				}
				break;

			case "REACT":
				message = {
					conversation: conversation,
					message: id,
					user: user,
					reaction: body.reaction
				}
				sendMessage(client, type, message);
				break;

			case "TYPING":
				if (client.domain !== body.from) {
					sendMessage(client, type, body);
				}
				break;

			default:
				sendMessage(client, type, body);
				break;
		}
	});
}

function sendToUser(to, type, body, conversation, id=null, user=null, time=null) {
	let conversationUsers = [dataForUser(to)];
	let clients = clientsForUsers(conversationUsers);

	var message;
	clients.forEach(client => {
		switch (type) {
			case "NOTICE":
				message = {
					conversation: conversation,
					id: id,
					message: body.message,
					time: time,
					user: user
				}

				if (body.replying) {
					message.replying = body.replying;
					db("SELECT * FROM messages WHERE id = ?", [body.replying]).then(r => {
						let replying = r[0];
						message.p_message = replying.message;
						message.p_user = replying.user;
						sendMessage(client, type, message);
					});
				}
				else {
					sendMessage(client, type, message);
				}
				break;
		}
	});
}

function activeUsers() {
	let users = [];
	wss.clients.forEach(client => {
		if (client.domain) {
			if (!users.includes(client.domain)) {
				users.push(client.domain);
			}
		}
	});
	return users;
}

function sendToAllClients(type, message) {
	wss.clients.forEach(client => {
		if (client.domain) {
			let data = message;

			if (typeof data == "object") {
				data = JSON.stringify(data);
			}
			client.send(`${type} ${data}`);
		}
	});
}

function sendMessage(ws, type, message) {
	let data = `${type}`;
	if (message) {
		if (typeof message == "object") {
			data += ` ${JSON.stringify(message)}`;
		}
		else {
			data += ` ${message}`;
		}
	}

	let user = dataForUser(ws.domain);
	if (user) {
		log(`OUT [${user.domain}]: ${data}`);
	}
	else {
		log(`OUT [${ws.ip}]: ${data}`);
	}

	ws.send(data);
}

async function addPollVotesToMessages(messages, session) {
	if (!Array.isArray(messages) || !messages.length) {
		return messages;
	}

	let polls = {};

	messages.forEach(message => {
		try {
			let parsed = JSON.parse(message.message);

			if (
				parsed &&
				parsed.poll &&
				Array.isArray(parsed.poll.options)
			) {
				polls[message.id] = parsed.poll.options.length;
				message.pollVotes = parsed.poll.options.map(() => 0);
				message.pollSelected = null;
			}
		}
		catch {}
	});

	let ids = Object.keys(polls);

	if (!ids.length) {
		return messages;
	}

	let placeholders = ids.map(() => "?").join(",");

	let totals = await db(
		`SELECT message_id, option_index, COUNT(*) count
		 FROM poll_votes
		 WHERE message_id IN (${placeholders})
		 GROUP BY message_id, option_index`,
		ids
	);

	(totals || []).forEach(row => {
		let message = messages.find(m => m.id == row.message_id);
		let option = Number(row.option_index);

		if (
			message &&
			Array.isArray(message.pollVotes) &&
			Number.isInteger(option) &&
			option >= 0 &&
			option < message.pollVotes.length
		) {
			message.pollVotes[option] = Number(row.count) || 0;
		}
	});

	if (session) {
		let selected = await db(
			`SELECT message_id, option_index
			 FROM poll_votes
			 WHERE session_id = ?
			 AND message_id IN (${placeholders})`,
			[session, ...ids]
		);

		(selected || []).forEach(row => {
			let message = messages.find(m => m.id == row.message_id);

			if (message) {
				message.pollSelected = Number(row.option_index);
			}
		});
	}

	return messages;
}

async function sendMessages(ws, messages, body) {
	var output = {
		messages: []
	};

	messages = await addPollVotesToMessages(messages, ws.session);
	output.messages = messages;

	if (body) {
		if (body.before) {
			output.before = true;
		}
		else if (body.at) {
			output.at = body.at;
		}
		else if (body.after) {
			output.after = true;
			output.latestMessage = body.latestMessage;
		}
		
		if (!body.before && !body.after) {
			output.messages = output.messages.reverse();
		}

		let data = `MESSAGES ${JSON.stringify(output)}`;
		log(`OUT: ${data}`);
		ws.send(data);
	}
}

async function currentVersion() {
	let output = new Promise(resolve => {
		fs.readFile(`${config.path}/.git/refs/heads/master`, 'utf8', (err, data) => {
			if (err || !data) return resolve("local-test-1");
			resolve(data.trim());
		});
	})
	return await output;
}

function nameToUnicode(unicode) {
    const skinColors = ["🏻", "🏼", "🏽", "🏾", "🏿"];
    const tonedEmojis = [
        "❤",
        "💋",
        "😶",
        "😮",
        "😵",
        "👶",
        "🧒",
        "👦",
        "👧",
        "🧑",
        "👱",
        "👨",
        "🧔",
        "👨‍🦰",
        "👨‍🦱",
        "👨‍🦳",
        "👨‍🦲",
        "👩",
        "👩‍🦰",
        "🧑‍🦰",
        "👩‍🦱",
        "🧑‍🦱",
        "👩‍🦳",
        "🧑‍🦳",
        "👩‍🦲",
        "🧑‍🦲",
        "🧓",
        "👴",
        "👵",
        "🙍",
        "🙎",
        "🙅",
        "🙆",
        "💁",
        "🙋",
        "🧏",
        "🙇",
        "🤦",
        "🤷",
        "🧑‍🎓",
        "👨‍🎓",
        "👩‍🎓",
        "🧑‍🏫",
        "👨‍🏫",
        "👩‍🏫",
        "🧑‍🌾",
        "👨‍🌾",
        "👩‍🌾",
        "🧑‍🍳",
        "👨‍🍳",
        "👩‍🍳",
        "🧑‍🔧",
        "👨‍🔧",
        "👩‍🔧",
        "🧑‍🏭",
        "👨‍🏭",
        "👩‍🏭",
        "🧑‍💼",
        "👨‍💼",
        "👩‍💼",
        "🧑‍🔬",
        "👨‍🔬",
        "👩‍🔬",
        "🧑‍💻",
        "👨‍💻",
        "👩‍💻",
        "🧑‍🎤",
        "👨‍🎤",
        "👩‍🎤",
        "🧑‍🎨",
        "👨‍🎨",
        "👩‍🎨",
        "🧑‍✈",
        "👨‍✈",
        "👩‍✈",
        "🧑‍🚀",
        "👨‍🚀",
        "👩‍🚀",
        "🧑‍🚒",
        "👨‍🚒",
        "👩‍🚒",
        "👮",
        "🕵",
        "💂",
        "🥷",
        "👷",
        "🤴",
        "👸",
        "👳",
        "👲",
        "🧕",
        "🤵",
        "👰",
        "🤰",
        "🤱",
        "👩‍🍼",
        "👨‍🍼",
        "🧑‍🍼",
        "👼",
        "🎅",
        "🤶",
        "🧑‍🎄",
        "🦸",
        "🦹",
        "🧙",
        "🧚",
        "🧛",
        "🧜",
        "🧝",
        "🧞",
        "🧟",
        "💆",
        "💇",
        "🫅",
        "🫃",
        "🫄",
        "🚶",
        "🧍",
        "🧎",
        "🧑‍🦯",
        "👨‍🦯",
        "👩‍🦯",
        "🧑‍🦼",
        "👨‍🦼",
        "👩‍🦼",
        "🧑‍🦽",
        "👨‍🦽",
        "👩‍🦽",
        "🏃",
        "💃",
        "🕺",
        "👯",
        "🧖",
        "🧘",
        "🧑‍🤝‍🧑",
        "👭",
        "👫",
        "👬",
        "💏",
        "👩‍❤️‍💋‍👨",
        "👨‍❤️‍💋‍👨",
        "👩‍❤️‍💋‍👩",
        "💑",
        "👩‍❤️‍👨",
        "👨‍❤️‍👨",
        "👩‍❤️‍👩",
        "👪",
        "👨‍👩‍👦",
        "👨‍👩‍👧",
        "👨‍👩‍👧‍👦",
        "👨‍👩‍👦‍👦",
        "👨‍👩‍👧‍👧",
        "👨‍👨‍👦",
        "👨‍👨‍👧",
        "👨‍👨‍👧‍👦",
        "👨‍👨‍👦‍👦",
        "👨‍👨‍👧‍👧",
        "👩‍👩‍👦",
        "👩‍👩‍👧",
        "👩‍👩‍👧‍👦",
        "👩‍👩‍👦‍👦",
        "👩‍👩‍👧‍👧",
        "👨‍👦",
        "👨‍👦‍👦",
        "👨‍👧",
        "👨‍👧‍👦",
        "👨‍👧‍👧",
        "👩‍👦",
        "👩‍👦‍👦",
        "👩‍👧",
        "👩‍👧‍👦",
        "👩‍👧‍👧",
        "🕴",
        "🧗",
        "🧗",
        "🧗",
        "🤺",
        "🏇",
        "⛷",
        "🏂",
        "🏌",
        "🏄",
        "🚣",
        "🏊",
        "⛹",
        "🏋",
        "🚴",
        "🚵",
        "🤸",
        "🤼",
        "🤽",
        "🤾",
        "🤹",
        "🧘",
        "👋",
        "🤚",
        "🖐",
        "✋",
        "🫱",
        "🫲",
        "🫳",
        "🫴",
        "🫰",
        "🫵",
        "🫶",
        "🖖",
        "👌",
        "🤌",
        "🤏",
        "✌",
        "🤞",
        "🤟",
        "🤘",
        "🤙",
        "👈",
        "👉",
        "👆",
        "🖕",
        "👇",
        "☝",
        "👍",
        "👎",
        "✊",
        "👊",
        "🤛",
        "🤜",
        "👏",
        "🙌",
        "👐",
        "🤲",
        "🤝",
        "🙏",
        "✍",
        "💅",
        "🤳",
        "💪",
        "🦵",
        "🦶",
        "👂",
        "🦻",
        "👃",
        "🛌",
        "🛀",
        "🏳",
        "🏴",
        "👁",
        "🐈",
        "🐦",
        "🐕",
        "🦺",
        "🐻"
    ];

    const allChars = tonedEmojis.concat(skinColors);
    let chars = [];
    let i = 0;

    for (let c of unicode) {
        // remove last zwj if the next one is a skin color
        if (skinColors.includes(c)) chars.pop();

        // add emoji
        chars.push(c);

        // add zwj
        if (allChars.includes(c)) chars.push("\u200d");

        i++;
    }

    // remove last element if zwj
    if (chars[chars.length - 1] === "\u200d") chars.pop();

    // combine to string
    return chars.join("");
}

init();
