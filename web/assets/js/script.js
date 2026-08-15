let { e2ee } = await import(`./e2ee.js?r=${revision}`);
let { ws } = await import(`./ws.js?r=${revision}`);
let { ui } = await import(`./ui.js?r=${revision}`);
let { stream } = await import(`./stream.js?r=${revision}`);
let { listeners } = await import(`./listeners.js?r=${revision}`);

function log(string) {
	console.log(string);
}

export class HNSChat {
	constructor() {
		window.hnschat = this;
this.mobile = false;

		this.host = window.location.host;
		this.hash = window.location.hash.substring(1);
		this.page;
		this.data;

		this.ui = new ui(this);
		this.ws = new ws(this);
		this.listeners = new listeners(this);
		this.e2ee = new e2ee();

		this.streamURL = "https://chathns.com/stream";
		this.stream;

		this.isActive = true;

		this.keys;
		this.session;
		this.domain;
		this.domains;
		this.staked;
		this.conversation;
		this.settings;
		this.messages = [];
		this.seen = {};

		this.users = [];

		this.channels = [];

		this.pms = [];

		this.tab = "channels";

		this.timeFormat = "g:i A";
		this.dateFormat = "F jS, Y";

		this.gotChannels;
		this.gotPms;
		this.gotMentions;

		this.loadingMessages;
		this.replying;
		this.queued = [];

		this.typing;
		this.typingSent;
		this.typingDelay = 2;
		this.typingSendDelay = 1;
		this.lastTyped;
		this.typers = {};

		this.active = [];

		this.avatars = {};

		this.action = "\x01ACTION";

		this.commands = ["me", "shrug", "slap"];

		this.hasBob;

		this.init();
	}

	getPage() {
		let pathname = document.location.pathname;
		let match = pathname.match(/\/(?<page>.+?)(?:\/(?<data>.+)|$)/);
		if (match) {
			let groups = match.groups;

			if (groups.page) {
				this.page = groups.page;
			}
			if (groups.data) {
				this.data = groups.data;
			}
		}
		else {
			this.page = "chat";
		}
	}

	async api(data) {
		if (this.session) {
			data.session = this.session;
		}

		let output = new Promise(function(resolve) {
			$.post("/api", JSON.stringify(data), function(response){
				if (response) {
					let json = JSON.parse(response);
					resolve(json);
				}
			});
		});

		return await output;
	}

	time() {
		return Math.floor(Date.now() / 1000);
	}

	handlePush(init=false) {
		if (localStorage.handlePush) {
			try {
				let info = JSON.parse(localStorage.handlePush);
				
				localStorage.setItem("domain", info.domain);
				localStorage.setItem("conversation", info.conversation);

				if (!init) {
					if (this.domain !== info.domain) {
						this.changeDomain(info.domain);
					}
					this.changeConversation(info.conversation);
				}
			}
			catch {}
		}
		localStorage.removeItem("handlePush");
	}

	async init() {
		this.handlePush(true);
		
		this.getPage();
		switch (this.page) {
			case "sync":
				this.loadSync();
				break;

			case "buy":
				break;

			default:
				try {
					this.keys = JSON.parse(localStorage.keys);
				}
				catch {
					this.keys = await this.e2ee.generateKeys();
					localStorage.setItem("keys", JSON.stringify(this.keys));
				}

				if (this.hash) {
					localStorage.setItem("hash", this.hash);
					history.pushState("", document.title, window.location.pathname + window.location.search);
				}
				else {
					this.hash = localStorage.hash;
				}

				this.mobile = localStorage.mobile || false;

				this.session = localStorage.session;
				this.domain = localStorage.domain;
				this.conversation = localStorage.conversation;

				try {
					this.settings = JSON.parse(localStorage.settings);
					this.loadSettings();
				}
				catch {
					this.settings = {};
				}

				this.firstLaunch = localStorage.firstLaunch;
				if (!this.firstLaunch) {
					localStorage.setItem("firstLaunch", this.time());
				}

				await this.startSession();
				await this.setPublicKey();
				await this.ws.connect();
				break;
		}

		switch (this.page) {
			case "chat":
				this.stream = new stream(this);
				this.ui.setConversationTab();
				this.ui.setupSync();
				this.ui.setupNotifications();
				break;
		}

		if (typeof bob3 != "undefined") {
			this.hasBob = true;
			this.ui.hasBob();
		}
	}

	loadSettings() {
		Object.keys(this.settings).forEach((setting, k) => {
			let value = this.settings[setting];
			switch (setting) {
				case "chatDisplayMode":
					this.ui.chatDisplayMode(value);
					break;

				default:
					this.ui.root.style.setProperty(`--${setting}`, value);
					break;
			}
		});
	}

	loadSync() {
		let hash = this.hash;
		let db64 = this.db64(hash);
		let json = JSON.parse(db64);
		this.session = json.session;
		localStorage.setItem("session", this.session);

		if (json.settings) {
			this.settings = json.settings;
			localStorage.setItem("settings", JSON.stringify(this.settings));
		}

		let data = {
			action: "getPublicKey"
		}
		this.api(data).then(r => {
			if (r.success) {
				let pubkey = JSON.parse(r.pubkey);
				this.e2ee.importKey(pubkey.x, pubkey.y, json.privkey).then(privkey => {
					this.keys = {
						privateKeyJwk: privkey,
						publicKeyJwk: pubkey
					};

					localStorage.setItem("keys", JSON.stringify(this.keys));
					this.ui.openURL("/");
				});
			}
		});
	}

	db64(str) {
		str = (str + '==='.slice((str.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/');
		return atob(str);
	}

	b64(str) {
		str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
		return btoa(str);
	}

	syncLink() {
		let data = {
			session: this.session,
			privkey: this.keys.privateKeyJwk.d,
			settings: this.settings
		}

		let json = JSON.stringify(data);
		let encoded = this.b64(json);
		let link = "https://"+this.host+"/sync#"+encoded;

		return link;
	}

	regex(pattern, string) {
		return [...string.matchAll(pattern)];
	}

	rtrim(str, chr) {
	  let rgxtrim = (!chr) ? new RegExp('\\s+$') : new RegExp(chr+'+$');
	  return str.replace(rgxtrim, '');
	}

	replaceRange(s, start, end, substitute) {
		let before = s.substr(0, start);
		let after = s.substr(end, (s.length -end));

		return before+substitute+after;
	}

	sorted(array, by) {
		return array.sort((a, b) => a[by].localeCompare(b[by]));
	}

	isKey(e, key) {
		if (this.key(e) == key) {
			return true
		}
		return false;
	}

	key(e) {
		return e.which || e.keyCode;
	}

	keyName(e) {
		return e.key;
	}

	setPublicKey() {
		let data = {
			action: "setPublicKey",
			pubkey: JSON.stringify(this.keys.publicKeyJwk)
		};

		return this.api(data);
	}

	async startSession() {
		if (this.session) {
			return;
		}

		let data = {
			"action": "startSession"
		};

		return this.api(data).then(r => {
			this.session = r.session;
			localStorage.setItem("session", r.session);
		});
	}

	sendDomain() {
		const validDomain = this.domains.find(d => d.id == this.domain);

		if (!validDomain) {
			if (this.domains.length) {
				this.domain = this.domains[0].id;
				localStorage.setItem("domain", this.domain);
			}
			else {
				this.domain = null;
				localStorage.removeItem("domain");
				this.ui.openURL("/id");
				return;
			}
		}

		this.ws.send(`DOMAIN ${this.domain}`);
	}

	message(data) {
		let message = data.toString();
		let parsed = message.match(/(?<command>[A-Z]+)(\s(?<body>.+))?/);
		this.handle(parsed.groups);
	}

	async handle(parsed) {
		let command = parsed.command;
		let body = parsed.body;
		let push = false;

		if (body) {
			try {
				body = JSON.parse(body);

				for (var k in body) {
					try {
						body[k] = JSON.parse(body[k]);
					}
					catch {}

					for (var i in body[k]) {
						try {
							body[k][i] = JSON.parse(body[k][i]);
						}
						catch {}
					}
				}
			}
			catch {}
		}

		switch (command) {
			case "SUCCESS":
				switch (body.type) {
					case "SETCHANNELSETTINGS":
						this.ws.send("CHANNELS");
						break;

					case "ADDDOMAIN":
					case "ADDSLD":
						this.ui.enableButton(body.type);
						this.pendingDomain = body.id;
						this.ws.send("DOMAINS");
						break;

					case "DELETEDOMAIN":
						this.ui.removeDomain(body.id);
						break;

					case "VERIFYDOMAIN":
						this.ui.handleSuccess(body);
						break;

					case "GETADDRESS":
						this.ui.paymentResponse(body);
						break;
				}
				break;

			case "ERROR":
				switch (body.type) {
					case "ADDDOMAIN":
						this.ui.errorResponse(body);
						break;

					case "ADDSLD":
						this.ui.enableButton(body.type);
						this.ui.errorResponse(body);
						break;

					case "MESSAGES":
						this.ui.setUserList();
						this.ui.messagesLoading(false);
						this.ui.setGatedView(body);
						this.ui.markEmptyIfNeeded();
						this.loadingMessages = false;
						break;

					case "DOMAIN":
						this.domain = null;
						this.sendDomain();
						break;

					case "PM":
						if (body.id) {
							let otherUser = this.otherUserFromPM(body.id);
							let queuedMessage = this.queuedMessage(otherUser.domain);
							if (queuedMessage) {
								this.ui.changeConversation(body.id);
								this.ui.close();
							}
						}
						else {
							this.ui.errorResponse(body);
						}
						break;

					case "GETADDRESS":
						this.ui.paymentResponse(body);
						break;
				}
				break;

			case "CHANNELMUTE":
				{
					let channel = this.channelForID(body.channel);

					if (channel) {
						let mutes = {};

						try {
							mutes = (channel.mutes && typeof channel.mutes === "object")
								? channel.mutes
								: JSON.parse(channel.mutes || "{}");
						}
						catch {}

						if (Number(body.until) === 0) {
							delete mutes[body.domain];
						}
						else {
							mutes[body.domain] = Number(body.until);
						}

						channel.mutes = JSON.stringify(mutes);

						if (body.channel === this.conversation) {
							this.ui.updateInputBar();
						}

						// Re-sync authoritative group state from server.
						this.ws.send("CHANNELS");
					}
				}
				break;

			case "INVALIDSESSION":
				localStorage.removeItem("session");
				localStorage.removeItem("domain");
				localStorage.removeItem("conversation");

				this.session = null;
				this.domain = null;
				this.conversation = null;

				this.ui.openURL("/id");
				break;

			case "IDENTIFIED":
				if (this.page !== "sync") {
					if (body.seen) {
						this.seen = body.seen;
					}
					this.ws.send("DOMAINS");
				}
				break;

			case "DOMAINS":
				$.each(body, (k, domain) => {
					if (body[k].domain !== undefined && body[k].domain !== null) {
						body[k].domain = body[k].domain.toString();
					}

					if (body[k].tld !== undefined && body[k].tld !== null) {
						body[k].tld = body[k].tld.toString();
					}
				});

				this.domains = body;
				this.ui.domains(this.domains);

				if (this.pendingDomain) {
					let pending = this.domains.find(d => d.id == this.pendingDomain);

					if (pending) {
						this.domain = this.pendingDomain;
						localStorage.setItem("domain", this.domain);
					}

					this.pendingDomain = null;
				}

				switch (this.page) {
					case "chat":
						this.sendDomain();
						break;

					case "id":
					case "invite":
						this.ws.send(`STAKED`);
						break;
				}
				break;

			case "STAKED":
				this.staked = body;
				this.ui.stakedDomains(body);
				break;

			case "DOMAIN":
				this.ui.updateDomainSelect();
				this.ws.send("USERS");
				break;

			case "USERS":
				$.each(body, (k, user) => {
					body[k].domain = body[k].domain.toString();
				});
				this.users = body;
				this.ws.send(`PING`);
				this.ws.send(`CHANNELS`);
				this.ws.send(`PMS`);
				break;

			case "USER":
				this.users = this.users.filter(u => {
					return u.id != body.id;
				});

				body.domain = body.domain.toString();
				this.users.push(body);

				if (body.id !== this.domain) {
					let pm = this.pmWithUser(body.id);
					if (pm) {
						this.makeSecret(pm);
					}
				}

				this.ui.setUserList();
				this.ui.updateConversations();
				break;

			case "CHANNELS":
				this.ui.clear("channels");
				this.channels = body;
				if (this.channels.length) {
					let sorted = this.channels.sort((a, b) => {
						let aActivity = ("activity" in a) ? Number(a.activity) : -1;
						let bActivity = ("activity" in b) ? Number(b.activity) : -1;

						return bActivity - aActivity;
					});

					$.each(sorted, (k, channel) => {
						this.ui.conversation("channels", channel);
					});
				}
				this.ui.updateConversations();
				this.ui.updateInputBar();
				this.gotChannels = true;
				this.ws.send(`MENTIONS`);
				this.ready(true);
				break;

			case "CHANNEL":
				this.channels.push(body);
				this.ui.conversation("channels", body);
				this.ui.updateConversations();
				break;

			case "PMS":
			this.ui.clear("pms");
			this.pms = Array.isArray(body) ? body : [];

			if (this.pms.length) {
				let sorted = this.pms.sort((a, b) => {
					return b.activity - a.activity;
				});

				Promise.all(
					sorted.map(async conversation => {
						let key = await this.makeSecret(conversation);
						return { conversation, key };
					})
				).then(results => {
					/*
					 * Broken PMs are skipped.
					 * They must never keep the loading screen alive.
					 */
					this.pms = results
						.filter(result => result.key)
						.map(result => result.conversation);

					this.pms.forEach(conversation => {
						this.ui.conversation("pms", conversation);
					});

					this.ui.updateConversations();
					this.gotPms = true;
					this.ready(true);
				});
			}
			else {
				this.ui.updateConversations();
				this.gotPms = true;
				this.ready(true);
			}
			break;

		case "PM":
				this.pms.push(body);
				this.makeSecret(body).then((key) => {
					this.ui.conversation("pms", body);

					let otherUser = this.otherUserFromPM(body.id);
					let queuedMessage = this.queuedMessage(otherUser.domain);
					if (queuedMessage) {
						this.ui.changeConversation(body.id);
						this.ui.close();
					}
				});
				break;

			case "MESSAGES":
				this.ui.setUserList();
				this.ui.insertMessages(body, true).then(() => {
					this.ui.messagesLoading(false);

					if (body.at) {
						this.ui.scrollToMessage(body.at);
					}
					else if (body.after) {
						this.ui.backInPresent(body);
					}

					if (!this.isChannel(this.conversation)) {
						let otherUser = this.otherUserFromPM(this.conversation);
						let queuedMessage = this.queuedMessage(otherUser.domain);
						if (queuedMessage) {
							this.queued = this.queued.filter(q => {
								return q.domain !== queuedMessage.domain;
							});
							this.sendMessage(this.conversation, queuedMessage.message);
						}
					}
				});
				break;

			case "MESSAGE":
			case "NOTICE":
				delete this.typers[body.user];

				let c;
				if (this.isChannel(body.conversation)) {
					c = this.channelForID(body.conversation);
				}
				else {
					c = this.pmForID(body.conversation);
				}
				c.activity = body.time;

				this.ui.updateConversations();
				this.ui.moveConversationToTop(body.conversation);

				await this.decryptMessageIfNeeded(body.conversation, body).then(decrypted => {
					body.message = decrypted[0];
					if (body.p_message) {
						body.p_message = decrypted[1];
					}

					if (typeof body.message == "object") {
						if (body.message.message) {
							body.message.message = body.message.message.toString();
						}
						body.message = JSON.stringify(body.message);
					}
					if (typeof body.p_message == "object") {
						if (body.p_message.message) {
							body.p_message.message = body.p_message.message.toString();
						}
						body.p_message = JSON.stringify(body.p_message);
					}

					body.message = body.message.toString();
					if (body.p_message) {
						body.p_message = body.p_message.toString();
					}

					if (!this.ui.inThePast && body.conversation == this.conversation) {
						let data = {
							messages: [body]
						}
						this.ui.insertMessages(data);
						this.seen[this.conversation] = this.time();
						
						if (!this.isActive) {
							if (this.isChannel(body.conversation)) {
								if (this.mentionsMe(body.message)) {
									push = "mention";
								}
								else if (this.replyingToMe(body)) {
									push = "reply";
								}
							}
							else {
								push = "pm";
							}
						}
					}
					else {
						if (this.isChannel(body.conversation)) {
							if (this.mentionsMe(body.message)) {
								this.ui.markMention(body.conversation, true);
								push = "mention";
							}
							else if (this.replyingToMe(body)) {
								push = "reply";
							}
						}
						else {
							push = "pm";
						}
					}

					if (push) {
						if (body.user !== this.domain) {
							let name;

							switch (push) {
								case "pm":
									name = this.ui.displayName(this.userForID(body.user));
									break;

								case "mention":
								case "reply":
									name = `${this.ui.displayName(this.userForID(body.user))} - #${this.ui.toUnicode(c.name)}`;
									break;
							}

							let subtitle = this.ui.messageSummary(decrypted[0]);
							subtitle = this.ui.stripHTML(this.ui.replaceIds(subtitle)); 
							this.ui.sendNotification(name, subtitle, body.conversation);
						}
					}
				});
				break;

			case "CLEARCHAT":
				if (body.conversation == this.conversation) {
					this.messages = [];
					this.ui.clear("messages");

					if (this.isChannel(this.conversation)) {
						let channel = this.channelForID(this.conversation);

						if (channel) {
							channel.pinned = null;
						}

						this.ui.setPinnedMessage();
					}

					this.ui.markEmptyIfNeeded();
				}
				break;

			case "DELETEMESSAGES":
				if (
					body.conversation == this.conversation &&
					Array.isArray(body.ids)
				) {
					body.ids.forEach(id => {
						this.ui.deleteMessage(id);
					});

					this.messages = this.messages.filter(message => {
						return !body.ids.includes(message.id);
					});
				}
				break;

			case "DELETEMESSAGE":
				this.ui.deleteMessage(body.id);
				break;

			case "POLLVOTE":
				if (
					body.conversation == this.conversation &&
					body.message &&
					Array.isArray(body.counts)
				) {
					let message = this.messages.filter(m => {
						return m.id == body.message;
					})[0];

					if (message) {
						message.pollVotes = body.counts;

						if (
							Object.prototype.hasOwnProperty.call(body, "selected")
						) {
							message.pollSelected = body.selected;
						}
					}

					this.ui.updatePoll(
						body.message,
						body.counts,
						Object.prototype.hasOwnProperty.call(body, "selected")
							? body.selected
							: undefined
					);

					this.seen[this.conversation] = this.time();
				}
				break;

			case "REACT":
				if (body.conversation == this.conversation) {
					let message = this.messages.filter(m => {
						return m.id == body.message;
					})[0];

					try {
						let json = JSON.parse(message.reactions);

						if (!Object.keys(json).includes(body.reaction)) {
							json[body.reaction] = [];
						}

						if (json[body.reaction].includes(body.user)) {
							let x = json[body.reaction].indexOf(body.user);
							delete json[body.reaction].splice(x, 1);

							if (!Object.keys(json[body.reaction]).length) {
								delete json[body.reaction];
							}
						}
						else {
							json[body.reaction].push(body.user);
						}

						message.reactions = JSON.stringify(json);
						this.ui.updateReactions(body.message);
						this.seen[this.conversation] = this.time();
					}
					catch {}
				}
				break;

			case "TYPING":
				this.typers[body.from] = {
					to: body.to,
					time: this.time()
				}
				break;

			case "MENTIONS":
				this.ui.updateMentions(body);
				this.gotMentions = true;
				this.ready(true);
				break;

			case "PONG":
				this.updateActiveUsers(body.active);
				//this.ui.checkVersion(body.version);
				break;

			case "CHANNELDELETED":
				this.channels = this.channels.filter(c => c.id !== body.channel);
				$(`#conversations .channels tr[data-id=${body.channel}]`).remove();

				if (this.conversation == body.channel) {
					localStorage.removeItem("conversation");

					if (this.channels.length) {
						this.changeConversation(this.channels[0].id);
					}
				}

				this.ui.updateConversations();
				break;


			case "CHANNELMODE":
				{
					let channel = this.channelForID(body.channel);
					if (channel) {
						channel.adminonly = body.adminonly;
						if (this.conversation == body.channel) {
							this.ui.updateInputBar();
						}
					}
				}
				break;

			case "PINMESSAGE":
				this.channelForID(body.conversation).pinned = body.id;
				if (this.conversation == body.conversation) {
					this.ui.setPinnedMessage();
				}
				break;

			case "STARTVIDEO":
				this.ui.muteAll();
				this.channelForID(body.conversation).video = true;
				this.channelForID(body.conversation).videoUsers = body.users;
				this.ui.showVideoIfNeeded();
				break;

			case "INVITEVIDEO":
				this.channelForID(body.conversation).videoSpeakers = body.speakers;
				this.ui.showVideoIfNeeded();
				break;

			case "JOINVIDEO":
				if (body.users) {
					this.channelForID(body.conversation).videoUsers = body.users;
				}
				if (body.watchers) {
					this.channelForID(body.conversation).videoWatchers = body.watchers;
				}
				if (body.speakers) {
					this.channelForID(body.conversation).videoSpeakers = body.speakers;
				}
				this.ui.showVideoIfNeeded();
				break;

			case "VIEWVIDEO":
				if (body.users) {
					this.channelForID(body.conversation).videoUsers = body.users;
				}
				if (body.watchers) {
					this.channelForID(body.conversation).videoWatchers = body.watchers;
					if (body.watchers.includes(this.domain)) {
						this.channelForID(body.conversation).watching = true;
					}
				}
				this.ui.showVideoIfNeeded();
				break;

			case "LEAVEVIDEO":
				if (body.users) {
					this.channelForID(body.conversation).videoUsers = body.users;
				}
				if (body.watchers) {
					this.channelForID(body.conversation).videoWatchers = body.watchers;
				}
				if (body.speakers) {
					this.channelForID(body.conversation).videoSpeakers = body.speakers;
				}
				this.ui.showVideoIfNeeded();
				break;

			case "ENDVIDEO":
				/*
				 * A finished stream must discard the old Janus/SFU state.
				 * Otherwise init() sees this.janus from the previous stream
				 * and does not create a fresh session.
				 */
				this.stream.close();
				this.endVideo(body.conversation);
				break;

			case "MUTEVIDEO":
			case "MUTEAUDIO":
				let toggle;
				let user = this.channelForID(body.conversation).videoUsers[body.user];
				switch (command) {
					case "MUTEVIDEO":
						toggle = "toggleVideo";
						user.video = !user.video;
						break;

					case "MUTEAUDIO":
						toggle = "toggleAudio";
						user.audio = !user.audio;
						break;
				}
				this.ui.updateVideoUsers();
				if (body.user == this.domain) {
					this.ui.setMute(toggle, -1);
				}
				break;

			case "CONNECTED":
				if (this.userForID(body)) {
					this.userForID(body).active = true;
					this.ui.updateUserList();
					this.ui.updateConversations();
				}
				break;

			case "DISCONNECTED":
				if (this.userForID(body)) {
					this.userForID(body).active = false;
					this.ui.updateUserList();
					this.ui.updateConversations();
				}
				break;
		}
	}

	endAllVideo() {
		try {
			this.stream.close();
			$.each(this.channels, (k, c) => {
				this.endVideo(c.id);
			});
		}
		catch {};
	}

	endVideo(conversation) {
		this.channelForID(conversation).videoUsers = {};
		this.channelForID(conversation).videoWatchers = [];
		this.channelForID(conversation).videoSpeakers = [];
		this.channelForID(conversation).video = false;
		this.channelForID(conversation).watching = false;
		this.ui.showVideoIfNeeded();
	}

	currentVideoUsers() {
		return this.channelForID(this.conversation).videoUsers;
	}

	updateActiveUsers(active) {
		if (this.users) {
			let current = this.active;
			this.active = active;

			current.forEach(u => {
				if (!active.includes(u)) {
					let user = this.userForID(u);
					if (user) {
						user.active = false;
					}
				}
			});

			active.forEach(u => {
				let user = this.userForID(u);
				if (user) {
					user.active = true;
				}
			});

			this.ui.updateUserList();
			this.ui.updateConversations();
		}
	}

	otherUserFromPM(id) {
		let pm = this.pmForID(id);
		let otherUserID = this.otherUser(pm.users);
		let otherUser = this.userForID(otherUserID);
		return otherUser;
	}

	queuedMessage(domain) {
		return this.queued.filter(q => {
			return q.domain == domain;
		})[0];
	}

	ready(bool) {
		if (bool) {
			if (this.gotChannels && this.gotPms && this.gotMentions) {
				this.ui.changeMe(this.domain);
				this.ui.setLoading(false);
				this.ui.handleHash();
				this.changeConversation(this.conversation);
				this.changedConversation();
			}
		}
		else {
			this.gotChannels = false;
			this.gotPms = false;
			this.gotMentions = false;
			this.ui.setLoading(true);
		}
	}

	isChannel(name) {
		if (name) {
			if (name.toString().length == 8) {
				return true;
			}
		}
		return false;
	}

	channelForID(id) {
		return this.channels.filter(c => {
			return c.id == id;
		})[0];
	}

	channelForName(name) {
		return this.channels.filter(c => {
			return c.name == name;
		})[0];
	}

	stakedForName(name) {
		return this.staked.filter(c => {
			return c.name == name;
		})[0];
	}

	pmForID(id) {
		return (this.pms || []).filter(c => {
			return c.id == id;
		})[0];
	}

	pmWithUser(id) {
		return (this.pms || []).filter(c => {
			return c.users.includes(id);
		})[0];
	}

	otherUser(users) {
		return users.filter(u => {
			return u !== this.domain;
		})[0];
	}

	userForID(id) {
		if (this.users) {
			return this.users.filter(u => {
				return u.id == id;
			})[0];
		}
		return false;
	}

	userForName(name, active=false) {
		return this.users.filter(u => {
			return (u.domain == name || this.ui.toUnicode(u.domain) == name) && !u.locked && !u.deleted;
		})[0];
	}

	usersForConversation(id) {
		if (this.channels) {
			let conversation = this.channels.filter(c => {
				return c.id == id;
			})[0];

			let users = this.users.filter(u => {
				return !u.locked;
			});
			if (!conversation.public) {
				let members = [];
				let admins = [];

				try {
					members = Array.isArray(conversation.members)
						? conversation.members
						: JSON.parse(conversation.members || "[]");
				}
				catch {}

				try {
					admins = Array.isArray(conversation.admins)
						? conversation.admins
						: JSON.parse(conversation.admins || "[]");
				}
				catch {}

				users = this.users.filter(u => {
					if (!u || u.locked || u.deleted) {
						return false;
					}

					let tldOwner =
						Number(conversation.tldadmin) === 1 &&
						u.type === "handshake" &&
						u.domain === conversation.name;

					let member =
						members.includes(u.domain);

					return tldOwner ||
						Number(u.admin) === 1 ||
						admins.includes(u.domain) ||
						member;
				});
			}

			return users;
		}
		return [];
	}

	changeConversation(id) {
		let current = this.conversation;
		let change = id;

		if (!this.pmForID(id) && !this.channelForID(id)) {
			id = false;
		}

		if (!id) {
			change = this.channels[0].id;
		}

		if (current !== change) {
			this.conversation = change;
			localStorage.setItem("conversation", this.conversation);
			this.changedConversation();
		}
	}

	changedConversation() {
		this.ui.closeMenusIfNeeded();

		this.messages = [];
		this.ui.clear("input");
		this.ui.clear("messages");
		this.ui.setInThePast(false);
		this.ui.messagesLoading(true);
		this.ui.emptyUserList();
		this.ui.searchUsers(false);
		this.ui.clearSelection();
		this.ui.updateTypingView();
		this.getMessages();

		if (this.isChannel(this.conversation)) {
			this.tab = "channels";
		}
		else {
			this.tab = "pms";
		}

		this.ui.setConversationTab();

		this.ui.setActiveConversation();
		this.ui.markUnread(this.conversation, false);
		this.ui.markMention(this.conversation, false);
		this.ui.updateInputBar();

		this.ui.showVideoIfNeeded();

		this.seen[this.conversation] = this.time();
		this.ws.send(`CHANGEDCONVERSATION ${this.conversation}`);
	}

	getMessage(id) {
		let data = {
			action: "getMessage",
			domain: this.domain,
			id: id
		};

		return this.api(data);
	}

	getMessages(options={}) {
		if (this.loadingMessages) {
			return;
		}

		this.loadingMessages = true;
		
		let data = {
			conversation: this.conversation,
		};
		let merged = {...data,...options};

		this.ws.send(`MESSAGES ${JSON.stringify(merged)}`);
	}

	async makeSecret(pm) {
		try {
			if (!pm || !pm.id) {
				return false;
			}

			let otherUser = this.otherUserFromPM(pm.id);

			if (
				!otherUser ||
				!otherUser.pubkey ||
				!this.keys ||
				!this.keys.privateKeyJwk
			) {
				console.warn("Skipping unusable PM:", pm.id);
				return false;
			}

			let key = await this.e2ee.deriveKey(
				otherUser.pubkey,
				this.keys.privateKeyJwk
			);

			otherUser.sharedkey = key;
			return key;
		}
		catch (error) {
			console.warn("Skipping broken PM:", pm && pm.id, error);
			return false;
		}
	}

	async decryptedBody(conversation, message) {
		let output = new Promise(resolve => {
			let pm = this.pmForID(conversation);
			let user = this.userForID(this.otherUser(pm.users));

			this.e2ee.decryptMessage(message, user.sharedkey, conversation).then(decrypted => {
				resolve(decrypted.trim());
			});
		});

		return await output;
	}

	async decryptMessageIfNeeded(conversation, message) {
		let body = new Promise(resolve => {
			if (this.isChannel(conversation)) {
				resolve(message.message);
			}
			else {
				this.decryptedBody(conversation, message.message).then(decrypted => {
					resolve(decrypted);
				});
			}
		});

		let replyBody = new Promise(resolve => {
			if (message.p_message) {
				if (this.isChannel(conversation)) {
					resolve(message.p_message);
				}
				else {
					this.decryptedBody(conversation, message.p_message).then(decrypted => {
						resolve(decrypted);
					});
				}
			}
			else {
				resolve();
			}
		});

		let prepared = await Promise.all([body, replyBody]);
		return prepared;
	}

	async encryptedBody(conversation, message) {
		let output = new Promise(resolve => {
			let pm = this.pmForID(conversation);
			let user = this.userForID(this.otherUser(pm.users));

			this.e2ee.encryptMessage(message, user.sharedkey, conversation).then(encrypted => {
				resolve(encrypted.trim());
			});
		});

		return await output;
	}

	async encryptMessageIfNeeded(conversation, message) {
		let output = new Promise(resolve => {
			if (this.isChannel(conversation)) {
				resolve(message);
			}
			else {
				this.encryptedBody(conversation, message).then(encrypted => {
					resolve(encrypted);
				});
			}
		});

		return await output;
	}

	changeDomain(domain) {
		this.domain = domain;
		localStorage.setItem("domain", domain);

		if (this.page == "chat") {
			this.ready(false);
			this.ws.send(`DOMAIN ${domain}`);
		}
	}

	usersInMessage(message) {
		let matches = this.regex(/\@(?<name>[^ \x00]+?)\//gm, message);
		return matches;
	}

	channelsInMessage(message) {
		let matches = this.regex(/\#(?<name>[^ \x00]+?)(?:\s|$)/gm, message);
		return matches;
	}

	replaceCompletions(text) {
		let output = text;

		while (this.usersInMessage(output).length) {
			let users = this.usersInMessage(output);
			let result = users[0];

			let name = result.groups.name;
			let start = result.index;
			let end = (start + name.length + 1 + 1);
			
			let match = this.users.filter(u => {
				return this.ui.toUnicode(u.domain) == name && !u.locked;
			});

			let replace;
			if (match.length) {
				let id = match[0].id;
				replace = `@${id}`;
			}
			else {
				replace = `@\x00${name}/`;
			}
			output = this.replaceRange(output, start, end, replace);
		}

		while (this.channelsInMessage(output).length) {
			let channels = this.channelsInMessage(output);
			let result = channels[0];

			let name = result.groups.name;
			let start = result.index;
			let end = (start + name.length + 1);
			
			let match = this.channels.filter(c => {
				return this.ui.toUnicode(c.name) == name;
			});

			let replace;
			if (match.length) {
				let id = match[0].id;
				replace = `@${id}`;
			}
			else {
				replace = `#\x00${name}`;
			}
			output = this.replaceRange(output, start, end, replace);
		}

		return output;
	}

	sendTyping() {
		let input = $("textarea#message").val();

		if (!this.typing || !input || (input && input[0] == "/")) {
			return;
		}

		let send = true;
		if (this.typingSent) {
			let diff = this.time() - this.typingSent;

			if (diff < this.typingSendDelay) {
				send = false;
			}
		}

		if (send) {
			this.typingSent = this.time();

			let data = {
				from: this.domain,
				to: this.conversation
			}

			this.ws.send(`TYPING ${JSON.stringify(data)}`);
		}
	}

	updateTypingStatus() {
		if (this.lastTyped) {
			if ((this.time() - this.lastTyped) > this.typingDelay) {
				this.typing = false;
				this.lastTyped = false;
			}
			else if ($("textarea#message").is(":focus") && $("textarea#message").val() !== "") {
				this.typing = true;
			}
		}
	}

	sendMessage(conversation, message) {
		if (!message.trim().length) {
			return;
		}

		this.encryptMessageIfNeeded(conversation, message).then(encrypted => {
			let data = {
				conversation: conversation,
				message: encrypted
			}

			if (this.replying) {
				data.replying = this.replying.message;
			}

			this.typing = false;
			this.ws.send(`MESSAGE ${JSON.stringify(data)}`);

			this.replying = null;
			this.ui.updateReplying();
		});
	}

	async sendPayment(address, amount) {
		const wallet = await bob3.connect();

		if (!amount) {
			return { message: "Please enter an amount." };
		}

		try {
			const send = await wallet.send(address, amount);
			return send;
		}
		catch (error) {
			return error;
		}
	}

	async upload(data, attachment) {
		let output = new Promise(resolve => {
			$.ajax({
				url: "/upload.php",
				type: "POST",
				data: data,
				cache: false,
				contentType: false,
				processData: false,
				timeout: 60000,
				xhr: () => {
					let p = $.ajaxSettings.xhr();
					p.upload.onprogress = () => {};
					return p;
				},
				success: (response) => {
					try {
						let json = (typeof response === "string")
							? JSON.parse(response)
							: response;

						resolve(json || {
							success: false,
							message: "Invalid upload response."
						});
					}
					catch (e) {
						console.error("Upload response error:", response, e);
						resolve({
							success: false,
							message: "Invalid upload response."
						});
					}
				},
				error: (xhr, status, error) => {
					console.error("Upload failed:", status, error, xhr.responseText);

					let message = "Upload failed.";

					if (status === "timeout") {
						message = "Upload timed out.";
					}
					else if (xhr.responseText) {
						try {
							let json = JSON.parse(xhr.responseText);
							if (json.message) message = json.message;
						}
						catch {}
					}

					resolve({
						success: false,
						message: message
					});
				}
			});
		});

		return await output;
	}

	deleteAttachment(id) {
		let data = {
			action: "deleteAttachment",
			id: id
		};

		return this.api(data);
	}

	mentionsMe(message) {
		if (message.includes(`@${this.domain}`)) {
			return true;
		}
		return false;
	}

	replyingToMe(message) {
		if (message.p_user && message.p_user == this.domain) {
			return true;
		}
		return false;
	}
}

new HNSChat();
/* ALF HNS TLD handover */
(() => {
	try {
		const params = new URLSearchParams(window.location.search);
		if (params.get("alf") !== "1") {
			return;
		}

		const ticket = sessionStorage.getItem("alf_ticket");

		if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) {
			console.error("Invalid ALF ticket");
			return;
		}

		const timer = setInterval(() => {
			try {
				if (window.hnschat && hnschat.ws && hnschat.ws.socket && hnschat.ws.socket.readyState === WebSocket.OPEN) {
					clearInterval(timer);

					hnschat.ws.send(`ADDDOMAIN ${JSON.stringify({
						alfTicket: ticket
					})}`);

					sessionStorage.removeItem("alf_ticket");
					sessionStorage.removeItem("alf_login_state");

					history.replaceState({}, document.title, "/id");
				}
			}
			catch {}
		}, 250);
	}
	catch (e) {
		console.error(e);
	}
})();
