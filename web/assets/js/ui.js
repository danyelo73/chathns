let { punycode } = await import(`./punycode.js?r=${revision}`);

export class ui {
	constructor(parent) {
		this.parent = parent;

		this.inThePast = false;

		this.browser = this.getBrowser();
		this.root = document.querySelector(':root');
		this.css = getComputedStyle($("html")[0]);
		this.version = $("body").data("version");
		this.updateAvailable = false;

		this.emojiCategories = {
			"Search": [],
			"People": ["Smileys & Emotion", "People & Body"],
			"Nature": ["Animals & Nature"],
			"Food": ["Food & Drink"],
			"Activities": ["Activities"],
			"Travel": ["Travel & Places"],
			"Objects": ["Objects"],
			"Symbols": ["Symbols"],
			"Flags": ["Flags"]
		}

		if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
			$("body").addClass("desktop");
		}

		this.preloadIcons();
	}

	async gotoMessage(message) {
		let messageExists = $(`.messageRow[data-id=${message}]`).length;
		if (messageExists) {
			this.scrollToMessage(message);
		}
		else {
			let msg = await this.parent.getMessage(message);
			if (msg.message) {
				this.setInThePast(true);
				this.clear("messages");
				this.messagesLoading(true);

				let options = {
					at: message
				}
				this.parent.getMessages(options);
			}
			else {
				return;
			}
		}

		setTimeout(() => {
			this.highlightMessage(message);
		}, 250);
	}

	setInThePast(bool) {
		if (bool) {
			this.inThePast = true;
			$("#jumpToPresent").removeClass("hidden");
		}
		else {
			this.inThePast = false;
			$("#jumpToPresent").addClass("hidden");
		}
	}

	backInPresent(body) {
		let lastMessage = $("#messages > .messageRow[data-id]").last();
		let lastMessageID = lastMessage.data("id");
		
		if (body.after && lastMessageID == body.latestMessage) {
			this.setInThePast(false);
		}
	}

	fetchNewMessages() {
		let lastMessage = $("#messages > .messageRow[data-id]").last();
		let lastMessageID = lastMessage.data("id");
		let lastMessageTime = lastMessage.data("time");

		if (lastMessageID) {
			let options = {
				after: lastMessageID
			}
			this.parent.getMessages(options);
		}
	}

	getVariables() {
		const variables = Array.from(document.styleSheets)
		    .filter(styleSheet => {
		        try { return styleSheet.cssRules; }
		        catch(e) { return false; }
		    })
		    .map(styleSheet => Array.from(styleSheet.cssRules))
		    .flat()
		    .filter(cssRule => cssRule.selectorText === ':root')
		    .map(cssRule => cssRule.cssText.split('{')[1].split('}')[0].trim().split(';'))
		    .flat()
		    .filter(text => text !== "")
		    .map(text => text.split(':'))
		    .map(parts => ({key: parts[0].trim(), value: parts[1].trim() }))
		;
		 return variables;
	}

	preloadIcons() {
		let variables = this.getVariables();

		$.each(variables, (k, data) => {
			let {key,value} = data;
			
			if (key.substring(key.length - 4) == "Icon") {
				let match = value.match(/url\((?<asset>.+)\)/);
				let asset = match.groups.asset.replaceAll("\\", "");
				let link = `${window.location.protocol}//${this.parent.host}${asset}`;
				new Image().src = link;
			}
		});
	}

	setData(e, attr, val) {
		$(e).data(attr, val);
		$(e).attr(`data-${attr}`, val);
	}

	setupSync() {
		let link = this.parent.syncLink();
		let popover = $(".popover[data-name=syncSession]");
		let qr = popover.find("#qrcode");
		let input = popover.find("input[name=syncLink]");
		qr.empty();
		qr.html('<div id="qrlogo"><img draggable="false" src="/assets/img/logo.png"></div>');
		input.val(link);
		if (!qr.find("canvas").length) {
			let qrcode = new QRCode(qr[0], {
				text: link,
				width: 250,
				height: 250,
				colorLight: this.css.getPropertyValue("--tertiaryBackground"),
				colorDark: this.css.getPropertyValue("--primaryForeground"),
				correctLevel: QRCode.CorrectLevel.L
			});
		}
		qr.find("img").attr("draggable", "false");
	}

	copyToClipboard(button) {
		let field = button.parent().find("input")[0];
		field.select();
		field.setSelectionRange(0, 99999);
		navigator.clipboard.writeText(field.value);
		field.setSelectionRange(0, 0);

		button.addClass("copied");
		setTimeout(() => {
			button.removeClass("copied");
		}, 1000);
	}

	sizeInput() {
		let input = $("textarea#message");
		input.css("height", "1px");

		let height = input[0].scrollHeight;

		if (height > 200) {
			height = 200;
		}

		input.css("height", height+"px");
	}

	wordForPosition(text, position) {
		let index = text.indexOf(position);
		let preText = text.substr(0, position);

		if (preText.indexOf(" ") > 0) {
			let words = preText.split(" ");
			return (words.length - 1)
		}
		else {
			return 0;
		}
	}

	updateCompletions() {
		let options = [];

		let closeIfNeeded = false;

		let input = $("textarea#message");
		let text = input.val();
		let words = text.split(" ");
		let position = input[0].selectionStart;

		let word = words[this.wordForPosition(text, position)];
		if (word.length > 1) {
			$("#completions .body .list").empty();

			switch (word[0]) {
				case "@":
					$("#completions .title").html("Users");

					let users = this.parent.usersForConversation(this.parent.conversation);
					options = users.filter(user => {
						let match = Array.from(this.toUnicode(user.domain)).slice(0, Array.from(word).length - 1).join("").toLowerCase();
						let search = word.toLowerCase();

						return !user.locked && "@"+match === search;
					}).slice(0, 10);

					$.each(options, (k, option) => {
						let row = $(`#users .users tr[data-id="${option.id}"]`).clone();
						$("#completions .body .list").append(row);
					});

					closeIfNeeded = true;
					break;

				case "#":
					$("#completions .title").html("Channels");

					let channels = this.parent.channels;
					options = channels.filter(channel => {
						let match = Array.from(this.toUnicode(channel.name)).slice(0, Array.from(word).length - 1).join("").toLowerCase();
						let search = word.toLowerCase();

						return "#"+match === search;
					}).slice(0, 10);

					$.each(options, (k, option) => {
						let row = $(`#conversations .channels tr[data-id="${option.id}"]`).clone();
						$("#completions .body .list").append(row);
					});

					closeIfNeeded = true;
					break;
			}
		}
		else {
			closeIfNeeded = true;
		}
		
		if (options.length) {
			$("#completions .list tr").first().addClass("active");
			this.popover("completions");
		}
		else {
			closeIfNeeded = true;
		}

		if (closeIfNeeded) {
			this.close();
		}
	}

	updateSelectedCompletion(key) {
		if (!$("#completions.shown").length) {
			return;
		}

		let selected = $("#completions tr.active");
		selected.removeClass("active");

		let select;
		let current = selected[0];

		switch (key) {
			case 38:
				if (current.previousSibling) {
					select = current.previousSibling;
				}
				else {
					select = $("#completions .list").children().last();
				}
				break;

			case 40:
				if (current.nextSibling) {
					select = current.nextSibling;
				}
				else {
					select = $("#completions .list").children().first();
				}
				break;
		}

		$(select).addClass("active");
	}

	domains(array) {
		let domains = this.parent.sorted(array, "domain");

		switch (this.parent.page) {
			case "chat":
				$(".header .domains select").empty();
				
				$.each(domains, (k, i) => {
					let verify = "";
					if (i.locked) {
						verify = " (Unverified)";
					}
					$(".header .domains select").append(`<option value="${i.id}">${this.displayName(i)}${verify}</option>`);
				});

				$(".header .domains select").append(`<optgroup label="-----------------"></optgroup>`);
				$(".header .domains select").append(`<option value="manageDomains">Manage Domains</option>`);

				$(".header .domains select").val(this.parent.domain);
				break;

			case "id":
			case "invite":
$(".section#manageDomains .domains").empty();
				$.each(domains, (k, i) => {
					let html = $(`
						<div class="domain" data-id="${i.id}" data-name="${i.domain}">
							<div>${this.displayName(i)}</div>
							<div class="actions">
								<div class="icon action delete" data-action="deleteDomain"></div>
							</div>
						</div>
					`);

					if (i.locked) {
						html.find(".actions").prepend(`<div class="action link" data-action="verifyDomain">Verify</div>`);
					}

					$(".section#manageDomains .domains").append(html);
				});

				if (domains.length) {
					$(".section#manageDomains #startChatting").removeClass("hidden");
				}

				if (this.parent.page !== "invite") {
					this.showSection("manageDomains");
				}
				break;
		}
	}

	removeDomain(id) {
		$(`.section#manageDomains .domains .domain[data-id=${id}]`).remove();
	}

	stakedDomains(domains) {
		$(".section#addDomain select[name=tld]").empty();

		if (this.parent.page == "invite") {
			$(".section[id=addDomain]").find(".button[data-action=addDomain]").addClass("hidden");
			$(".section[id=addDomain]").find(".or").addClass("hidden");

			let info = this.parent.stakedForName(this.parent.data);
			if (info) {
				$(".section#addDomain select[name=tld]").append(`<option value="${info.name}">${this.toUnicode(info.name)}</option>`);
			}
			else {
				$(".section#addDomain").empty();
				$(".section#addDomain").append(`<div class="error response">This invite code isn't valid.</div>`);
			}
			this.showSection("addDomain");
		}
		else {
			$.each(domains, (k, i) => {
				$(".section#addDomain select[name=tld]").append(`<option value="${i.name}">${this.toUnicode(i.name)}</option>`);
			});
		}
	}

	showSection(section) {
		$(".section").find("input").val('');
		$(".section").removeClass("shown");
		$(`.section#${section}`).addClass("shown");
	}

	updateDomainSelect() {
		$(".header .domains select").val(this.parent.domain);
	}

	avatarFallback(string) {
		let fallback;

		if (!this.parent.regex(/[a-zA-Z0-9]/g, string[0]).length) {
			$.each(sortedEmojis, (k, e) => {
				if (string.substring(0, e.emoji.length) == e.emoji) {
					fallback = e.emoji;
					return false;
				}
			});
		}

		if (!fallback) {
			fallback = String.fromCodePoint(string.codePointAt(0)).toUpperCase();
		}
		return fallback; 
	}

	toUnicode(name) {
		let puny = punycode.ToUnicode(name);
		let zwj = nameToUnicode(puny);
		return zwj;
	}

	displayName(identity) {
		let domain = "";

		if (typeof identity === "string") {
			domain = identity;
		}
		else if (identity && identity.domain) {
			domain = identity.domain.toString();
		}

		if (!domain) {
			return "";
		}

		// Temporary guest account
		if (domain.endsWith(".handshakeuser")) {
			let name = domain.slice(0, -14);
			return `${this.toUnicode(name)} ⚠️`;
		}

		// Internal ChatHNS account
		if (domain.endsWith(".chathns")) {
			let account = (
				identity &&
				typeof identity === "object"
			)
				? identity
				: (
					this.parent &&
					typeof this.parent.userForName === "function"
						? this.parent.userForName(domain)
						: null
				);

			if (account && Number(account.admin) === 1) {
				let name = domain.slice(0, -8);
				return `${this.toUnicode(name)} 🌐`;
			}

			return this.toUnicode(domain);
		}

		// Verified Handshake TLD.
		// Delegated SLD identities such as i.buidling are authenticated
		// accounts, but are not verified Handshake TLD owners.
		if (identity && typeof identity === "object" &&
			identity.type === "handshake" && Number(identity.locked) === 0) {

			if (String(domain || "").includes(".")) {
				return this.toUnicode(domain);
			}

			return `${this.toUnicode(domain)} ✅`;
		}

		return this.toUnicode(domain);
	}

	channelDisplayName(channel) {
		if (!channel) return "";

		let name = this.toUnicode(channel.name);
		let status = [];

		// Channel = only owner/admin/staff may post.
		if (Number(channel.adminonly) === 1) {
			status.push("📣");
		}

		// Owner means a currently valid verified Handshake TLD
		// matching the technical group TLD.
		let hasOwner = (this.parent.users || []).some(user => {
			return user &&
				user.type === "handshake" &&
				!user.locked &&
				!user.deleted &&
				this.sameTLD(user.domain, channel.name);
		});

		if (!hasOwner) {
			status.push("⚠️");
		}

		return status.length
			? `${name} ${status.join("")}`
			: name;
	}

	conversation(tab, data) {
		let name = data.name;
		let fallback = "#";

		let user,domain;
		if (tab == "pms") {
			user = this.parent.otherUser(data.users);
			domain = this.parent.userForID(user);
			name = this.displayName(domain);
		}

		if (tab == "channels") {
			name = this.channelDisplayName(data);
		}
		else if (tab != "pms") {
			name = this.toUnicode(name);
		}

		if (tab == "pms") {
			fallback = this.avatarFallback(name);
		}

		let html = $(`
			<tr data-id="${data.id}" data-type="${tab}">
				<td class="avatar">
					<div class="locked">
						<div class="icon lock" title="Locked"></div>
					</div>
					<div class="fallback">${fallback.toUpperCase()}</div>
				</td>
				<td class="title">${name}</td>
			</tr>
		`);

		if (tab == "pms") {
			let active = "";
			if (domain.active) {
				active = " active";
			}

			let avatar = $(`
				<div class="status${active}"></div>
				<div class="favicon" data-id="${user}" data-domain="${name}"></div>
			`);
			html.find(".avatar").prepend(avatar);
		}

		$(`#conversations .${tab} table`).append(html);

		this.updateAvatars();
	}

	updateConversations() {
		let domain = this.parent.userForID(this.parent.domain);

		$.each($("#conversations .sections tr"), (k, c) => {
			let id = $(c).data("id");

			let data;
			if (this.parent.isChannel(id)) {
				data = this.parent.channelForID(id);

				// Keep 📣 / ⚠️ status current when users/channels update.
				if (data) {
					$(c).find("td.title").text(
						this.channelDisplayName(data)
					);
				}

				if (!data.public) {
					let members = [];
					let admins = [];

					try {
						members = Array.isArray(data.members)
							? data.members
							: JSON.parse(data.members || "[]");
					}
					catch {}

					try {
						admins = Array.isArray(data.admins)
							? data.admins
							: JSON.parse(data.admins || "[]");
					}
					catch {}

					let tldOwner =
						Number(data.tldadmin) === 1 &&
						domain &&
						!domain.locked &&
						!domain.deleted &&
						domain.type === "handshake" &&
						this.sameTLD(domain.domain, data.name);

					let hasAccess =
						tldOwner ||
						(domain && Number(domain.admin) === 1) ||
						(domain && admins.includes(domain.domain)) ||
						(domain && members.includes(domain.domain));

					if (!hasAccess) {
						$(c).addClass("locked");
					}
					else {
						$(c).removeClass("locked");
					}
				}
				else {
					$(c).removeClass("locked");
				}
			}
			else {
				data = this.parent.pmForID(id);

				if (data.activity) {
					$(c).removeClass("hidden");
				}
				else {
					$(c).addClass("hidden");
				}

				let otherUser = this.parent.otherUser(data.users);
				let otherUserData = this.parent.userForID(otherUser);

				if (otherUserData.active) {
					$(c).find(".avatar .status").addClass("active");
				}
				else {
					$(c).find(".avatar .status").removeClass("active");
				}
				
				if (otherUserData.locked || otherUserData.deleted) {
					$(c).addClass("locked");
				}
				else if ($(c).hasClass("locked")) {
					$(c).removeClass("locked");

					if (this.parent.conversation == id) {
						this.parent.changeConversation(id);
					}
				}
			}

			if (data.activity >= this.parent.firstLaunch) {
				if (data.id !== this.parent.conversation) {
					this.markUnread(data.id, true);
				}
			}

			if (this.parent.seen[data.id]) {
				if (this.parent.seen[data.id] >= data.activity) {
					this.markUnread(data.id, false);
				}
			}
		});
	}

	conversationStatus() {
		let domain = this.parent.userForID(this.parent.domain);

		if (!domain) {
			return "permissions";
		}

		if (domain.locked) {
			return "verify";
		}

		if (this.parent.isChannel(this.parent.conversation)) {
			let channel = this.parent.channelForID(this.parent.conversation);

			if (!channel) {
				return "permissions";
			}

			// Public groups/channels are readable by everyone.
			if (Number(channel.public) === 1) {
				return true;
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

			let tldOwner =
				Number(channel.tldadmin) === 1 &&
				domain.type === "handshake" &&
				this.sameTLD(domain.domain, channel.name);

			let member =
				members.includes(domain.domain);

			let hasAccess =
				tldOwner ||
				Number(domain.admin) === 1 ||
				admins.includes(domain.domain) ||
				member;

			if (!hasAccess) {
				return "permissions";
			}

			return true;
		}

		let data = this.parent.pmForID(this.parent.conversation);

		if (data) {
			let otherUser = this.parent.otherUser(data.users);
			let otherUserData = this.parent.userForID(otherUser);

			if (otherUserData && (otherUserData.locked || otherUserData.deleted)) {
				return "user";
			}
		}

		return true;
	}

	updateInputBar() {
		$("body").removeClass("unverified");

		let status = this.conversationStatus();
		let mutedUntil = 0;

		if (status === true && this.parent.isChannel(this.parent.conversation)) {
			let muteChannel = this.parent.channelForID(this.parent.conversation);
			let muteMe = this.parent.userForID(this.parent.domain);
			let mutes = {};

			try {
				mutes = (muteChannel.mutes && typeof muteChannel.mutes === "object")
					? muteChannel.mutes
					: JSON.parse(muteChannel.mutes || "{}");
			}
			catch {}

			if (muteMe) {
				mutedUntil = Number(mutes[muteMe.domain] || 0);
			}

			let now = Math.floor(Date.now() / 1000);

			if (mutedUntil === -1 || mutedUntil > now) {
				status = "muted";
			}
		}

		// A channel is the same room object as a group, but only its
		// owner/admins may post. Reading permissions remain independent.
		if (status === true && this.parent.isChannel(this.parent.conversation)) {
			let channel = this.parent.channelForID(this.parent.conversation);
			let me = this.parent.userForID(this.parent.domain);

			if (channel && Number(channel.adminonly) === 1 && me && !this.isAdmin(channel, me)) {
				status = "channel-readonly";
			}
		}

		switch (status) {
			case "user":
			case "verify":
			case "permissions":
			case "channel-readonly":
			case "muted":
				$(".inputHolder").addClass("locked");
				break;

			default:
				$(".inputHolder").removeClass("locked");
				break;
		}

		switch (status) {
			case "user":
				$(".inputHolder .locked").html("This user isn't available.");
				break;

			case "verify":
				$("body").addClass("unverified");
				$(".inputHolder .locked").html("Re-verify your name to chat.");
				break;

			case "permissions":
				$(".inputHolder .locked").html("You don't have permissions to chat here.");
				break;

			case "channel-readonly":
				$(".inputHolder .locked").html("Only admins can post in this channel.");
				break;

			case "muted":
				if (mutedUntil === -1) {
					$(".inputHolder .locked").html("Muted indefinitely.");
				}
				else {
					$(".inputHolder .locked").html(
						"Muted until " +
						new Date(mutedUntil * 1000).toLocaleString()
					);
				}
				break;
		}
	}

	setConversationTab() {
		$("#conversations .tabs .tab").removeClass("active");
		$(`#conversations .tabs .tab[data-tab=${this.parent.tab}]`).addClass("active");

		$(`#conversations .sections .section`).removeClass("shown");
		$(`#conversations .sections .section.${this.parent.tab}`).addClass("shown");

		let button = $("#conversations .actionHolder [data-action=newConversation]");
		let me = this.parent.userForID(this.parent.domain);

		// Private: always show the original compose button.
		if (this.parent.tab === "pms") {
			button
				.removeClass("hidden channelMenuIcon")
				.addClass("icon compose")
				.empty()
				.attr("title", "New Conversation");
			return;
		}

		// Channels: only global ChatHNS admins and TLD group owners
		// get the group hamburger menu.
		let isGlobalAdmin = me && Number(me.admin) === 1;

		let isOwner = false;

		if (me && me.type === "handshake") {
			isOwner = (this.parent.channels || []).some(channel => {
				return Number(channel.tldadmin) === 1 &&
					channel.name === me.domain;
			});
		}

		if (isGlobalAdmin || isOwner) {
			button
				.removeClass("hidden icon compose")
				.addClass("channelMenuIcon")
				.text("☰")
				.attr("title", "Groups");
		}
		else {
			button
				.removeClass("channelMenuIcon icon compose")
				.addClass("hidden")
				.empty();
		}
	}

	setActiveConversation() {
		this.setData($("#holder"), "type", this.parent.tab);

		$("#conversations tr").removeClass("active");
		$(`#conversations tr[data-id=${this.parent.conversation}]`).addClass("active");

		$(".messageHeader table").empty();
		$(".messageHeader table").append($(`#conversations tr.active`).clone());
		$(".messageHeader table tr").removeClass("hidden");

		this.setPinnedMessage();
		this.updateHeader10Zeit();
		setInterval(() => this.updateHeader10Zeit(), 1000);
		this.updateAvatars();

		$(".groupSettingsHeader").addClass("hidden");
		$(".pollComposerButton").addClass("hidden");

		if (this.parent.isChannel(this.parent.conversation)) {
			let channel = this.parent.channelForID(this.parent.conversation);
			let me = this.parent.userForID(this.parent.domain);

			if (channel && me && this.isAdmin(channel, me)) {
				$(".groupSettingsHeader").removeClass("hidden");
				$(".pollComposerButton").removeClass("hidden");
			}
		}
	}

	async setPinnedMessage() {
		$(".pinnedMessage .delete").addClass("hidden");
		$(".pinnedMessage").removeClass("shown");

		let output = new Promise(resolve => {
			if (!this.parent.isChannel(this.parent.conversation)) {
				resolve();
			}

			let channelData = this.parent.channelForID(this.parent.conversation);
			if (channelData.pinned) {
				this.parent.getMessage(channelData.pinned).then(r => {
					if (r.message) {
						let message;

						let decoded = he.decode(he.decode(r.message));
						try {
							let msg = JSON.parse(decoded);

							if (
								msg.poll &&
								msg.poll.question
							) {
								message = String(msg.poll.question);
							}
							else if (msg.message) {
								message = String(msg.message);
							}
							else {
								message = decoded;
							}
						}
						catch {
							message = decoded;
						}
						resolve(message);
					}
					else {
						resolve();
					}
				});
			}
			else {
				resolve();
			}
		});

		let message = await output;
		if (message && message.length) {
			$(".pinnedMessage .message").html(message);

			if (this.parent.isChannel(this.parent.conversation)) {
				let me = this.parent.userForID(this.parent.domain);
				let channel = this.parent.channelForID(this.parent.conversation);

				if (this.isAdmin(channel, me)) {
					$(".pinnedMessage .delete").removeClass("hidden");
				}
			}

			this.linkify($(".pinnedMessage .message"));
			$(".pinnedMessage").addClass("shown");
		}
	}

	sameTLD(a, b) {
		if (a === undefined || a === null || b === undefined || b === null) {
			return false;
		}

		try {
			return this.toUnicode(String(a)).toLowerCase() ===
				this.toUnicode(String(b)).toLowerCase();
		}
		catch {
			return false;
		}
	}

	isGlobalAdmin(user) {
		return Boolean(user && Number(user.admin) === 1);
	}

	isGroupOwner(channel, user) {
		return Boolean(user && channel &&
			Number(channel.tldadmin) === 1 &&
			!user.locked && !user.deleted &&
			user.type === "handshake" &&
			this.sameTLD(channel.name, user.domain));
	}

	isGroupStaff(channel, user) {
		if (!channel || !user || user.locked || user.deleted) return false;
		let admins = [];
		try {
			admins = Array.isArray(channel.admins) ? channel.admins : JSON.parse(channel.admins || "[]");
		}
		catch {}
		return admins.includes(user.domain);
	}

	isAdmin(channel, user) {
		return this.isGlobalAdmin(user) || this.isGroupOwner(channel, user) || this.isGroupStaff(channel, user);
	}

	prepareGroupSettings(popover, channel) {
		let me = this.parent.userForID(this.parent.domain);
		let isGlobal = this.isGlobalAdmin(me);
		let isOwner = this.isGroupOwner(channel, me);
		let canOwn = isGlobal || isOwner;
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

		if (!Array.isArray(admins)) admins = [];
		if (!Array.isArray(members)) members = [];

		let memberType = String(channel.membertype || "manual").toLowerCase();
		if (!["manual", "rule"].includes(memberType)) memberType = "manual";

		let access = "members";

		if (String(channel.registry || "").toLowerCase() === "namebase") {
			access = "namebase";
		}
		else if (Number(channel.slds) === 1) {
			access = "internal";
		}
		else if (memberType === "rule") {
			access = "rule";
		}

		popover.data("membershipUnlocked", false);

		popover.find('input[name="groupLabel"]').val(channel.label || "");
		popover.find('input[name="groupURL"]').val(channel.url || "");

		popover.find('select[name="groupAccess"]')
			.val(access)
			.prop("disabled", true);

		popover.find('select[name="groupRule"]')
			.val(channel.membersource || "10k")
			.prop("disabled", true);

		popover.find(".settingsRuleSetting")
			.toggleClass("hidden", access !== "rule");

		popover.find(".settingsMembersSetting")
			.toggleClass("hidden", access !== "members");

		popover.find('textarea[name="groupMembers"]')
			.val(JSON.stringify(members, null, 2))
			.prop("readonly", access !== "members");

		/*
		 * Safety:
		 * Upload always starts locked when Group Settings opens.
		 * Download in the current unlocked session enables it.
		 */
		popover.find(".groupMembersUploadLabel")
			.addClass("disabled");

		popover.find('input[name="groupMembersFile"]')
			.prop("disabled", true);

		popover.find('textarea[name="groupStaffText"]')
			.val(admins.join("\n"))
			.prop("readonly", !canOwn);

		popover.find(".groupStaffSetting").toggleClass("hidden", !canOwn);

		/*
		 * Global admin may change Access / Rule.
		 * TLD owner sees only the protected group actions.
		 */
		popover.find(".membershipAdminSetting").toggleClass("hidden", !isGlobal);

		popover.find(".membershipLockRow").toggleClass("hidden", !canOwn);
		popover.find(".membershipUnlockButton").removeClass("hidden");
		popover.find(".membershipDeleteButton").addClass("hidden");
		popover.find(".membershipProtected").removeClass("unlocked");

		popover.find(".membershipLockRow .subtitle").text(
			isGlobal ? "🔒 Access & Group Actions" : "🔒 Group Actions"
		);
	}

	markUnread(conversation, bool) {
		if (bool) {
			if (!$(`#conversations tr[data-id=${conversation}]`).hasClass("locked") && conversation !== this.parent.conversation) {
				$(`#conversations tr[data-id=${conversation}]`).addClass("unread");
			}
		}
		else {
			$(`#conversations tr[data-id=${conversation}]`).removeClass("unread");
		}

		this.updateNotifications();
	}

	markMention(conversation, bool) {
		if (bool) {
			if (!$(`#conversations tr[data-id=${conversation}]`).hasClass("locked") && conversation !== this.parent.conversation) {
				$(`#conversations tr[data-id=${conversation}]`).addClass("mentions");
			}
		}
		else {
			$(`#conversations tr[data-id=${conversation}]`).removeClass("mentions");
		}

		this.updateNotifications();
	}

	updateNotifications() {
		if ($("#conversations .pms tr.unread").length) {
			$("#conversations .tab[data-tab=pms]").addClass("notification");
		}
		else {
			$("#conversations .tab[data-tab=pms]").removeClass("notification");
		}

		if ($("#conversations .channels tr.mentions").length) {
			$("#conversations .tab[data-tab=channels]").addClass("notification");
		}
		else {
			$("#conversations .tab[data-tab=channels]").removeClass("notification");
		}

		if ($("#conversations .tab.notification").length) {
			$(".header .left").addClass("notification");
		}
		else {
			$(".header .left").removeClass("notification");
		}
	}

	setLoading(bool) {
		if (bool) {
			$(".connecting").removeClass("hidden");
		}
		else {
			$(".connecting").addClass("hidden");
		}
	}

	clear(type) {
		switch (type) {
			case "channels":
			case "pms":
				$(`#conversations .${type} table`).empty();
				break;

			case "messages":
				$("#messages").empty();
				$(".needSLD").remove();
				break;

			case "input":
				$("textarea#message").val('');
				break;
		}
	}

	setGatedView(data) {
		let channel = this.parent.channelForID(this.parent.conversation);
		let technicalName = `#${this.toUnicode(channel.name)}`;
		let label = String(channel.label || "").trim();
		let url = String(channel.url || "").trim();

		let safe = value => $("<div>").text(value).html();

		let message = label
			? `${safe(label)}<br><span class="subtitle">${safe(technicalName)}</span><br>Private community.`
			: `${safe(technicalName)} is a private community.`;

		if (url) {
			let href = /^https?:\/\//i.test(url)
				? url
				: "https://" + url;

			message += `<br><a href="${safe(href)}" target="_blank" rel="noopener noreferrer">${safe(url)}</a>`;
		}

		let names = this.parent.domains.filter(d => {
			return d.tld == channel.name;
		});

		let html = $(`
			<div class="needSLD">
				<span>${message}</span>
			</div>
		`);
		switch (data.resolution) {
			case "purchase":
				html.append($(`
					<div class="button" data-action="purchaseSLD" data-link="${data.link}">Purchase a .${this.toUnicode(channel.name)}</div>
				`));
				break;

			case "create":
				html.append($(`
					<div class="button" data-action="createSLD" data-tld="${channel.name}">Create a free .${this.toUnicode(channel.name)}</div>
				`));
				break;

			default:
				break;
		}

		names.forEach(name => {
			html.append($(`
				<div class="button" data-action="switchName" data-id="${name.id}">Switch to ${this.displayName(name)}</div>
			`));
		});

		$("#messageHolder").append(html);
	}

	emptyUserList() {
		$("#users #count").html('');
		$("#users .users table").empty();
	}

	setUserList() {
		if (!this.parent.isChannel(this.parent.conversation)) {
			return;
		}

		if ($("#users .group.searching.shown").length) {
			return;
		}

		$("#users .users table").empty();

		let users = this.parent.usersForConversation(this.parent.conversation);
		let sorted = this.parent.sorted(users, "domain");

		let active = sorted.filter(u => {
			return u.active;
		});

		let inactive = sorted.filter(u => {
			return !u.active;
		});

		$.each(active, (k, user) => {
			this.addUserToUserlist(user);
		});

		$.each(inactive, (k, user) => {
			this.addUserToUserlist(user);
		});

		this.updateAvatars();

		$("#users #count").html(users.length.toLocaleString("en-US"));
	}

	updateUserList() {
		if (!this.parent.isChannel(this.parent.conversation)) {
			return;
		}
		
		let users = this.parent.usersForConversation(this.parent.conversation);
		let sorted = this.parent.sorted(users, "domain");

		let active = sorted.filter(u => {
			return u.active;
		});

		let inactive = sorted.filter(u => {
			return !u.active;
		});

		$.each(users, (k, user) => {
			let userEl = $(`#users .user[data-id=${user.id}]`);
			let isActive = !userEl.hasClass("inactive");
			if (user.active) {
				if (!isActive) {
					let position = active.indexOf(user) - 1;
					let before = $($("#users .user").get(position));
					userEl.remove();
					userEl.removeClass("inactive");
					userEl.find(".avatar .status").addClass("active");
					if (position < 0) {
						$("#users table").prepend(userEl);
					}
					else {
						userEl.insertAfter(before);
					}
				}
			}
			else {
				if (isActive) {
					let position = inactive.indexOf(user) + active.length;
					let before = $($("#users .user").get(position));
					userEl.remove();
					userEl.addClass("inactive");
					userEl.find(".avatar .status").removeClass("active");
					if (position < 0) {
						$("#users table").prepend(userEl);
					}
					else {
						userEl.insertAfter(before);
					}
				}
			}
		});
	}

	displayNameInChannel(user, channel) {
		if (!user) return "";

		if (Number(user.admin) === 1) {
			return `${this.toUnicode(user.domain.replace(/\.chathns$/, ""))} 🌐`;
		}

		if (channel) {
			let owner = Number(channel.tldadmin) === 1 &&
				user.type === "handshake" && !user.locked && !user.deleted &&
				this.sameTLD(user.domain, channel.name);

			let admins = [];
			try {
				admins = Array.isArray(channel.admins) ? channel.admins : JSON.parse(channel.admins || "[]");
			}
			catch {}

			if (owner) return `${this.toUnicode(user.domain)} 👑`;
			if (admins.includes(user.domain)) {
				return `${this.toUnicode(user.domain)} 🛂`;
			}
		}

		return this.displayName(user);
	}

	addUserToUserlist(user) {
		let channel = this.parent.isChannel(this.parent.conversation)
			? this.parent.channelForID(this.parent.conversation)
			: null;
		let name = this.displayNameInChannel(user, channel);

		let html = $(`
			<tr class="user" data-id="${user.id}" data-name="${user.domain}">
				${this.avatar("td", user.id, user.domain, true)}
				<td class="title">${name}</td>
			</tr>
		`);

		if (!user.active) {
			html.addClass("inactive");
		}

		$("#users .users table").append(html);
	}

	replaceSpecialMessage(message) {
		if (message.substring(0, 12) == "&#x1;ACTION ") {
			return message.substring(12);
		}
		return message;
	}

	messageSummary(message) {
		let decoded = message;
		try {
			decoded = JSON.parse(message);
		}
		catch {}

		if (decoded.payment) {
			return "sent a payment";
		}
		else if (decoded.attachment) {
			return "sent an attachment";
		}
		else if (decoded.action) {
			return decoded.action;
		}
		else if (decoded.message) {
			return decoded.message;
		}
		return decoded;
	} 

	async insertMessages(data, decrypt=false) {
		let messages = data.messages;

		for (let i in messages) {
			let message = messages[i];

			if ($(`.messageRow[data-id=${message.id}]`).length) {
				return;
			}

			if (decrypt) {
				await this.parent.decryptMessageIfNeeded(this.parent.conversation, message).then(decrypted => {
					message.message = decrypted[0];
					if (message.p_message) {
						message.p_message = decrypted[1];
					}
				});
			}

			if (message.p_message) {
				message.p_message = this.messageSummary(message.p_message);
			}

			let userData = this.parent.userForID(message.user);
			let user = userData.domain;

			let messageChannel = this.parent.isChannel(this.parent.conversation)
				? this.parent.channelForID(this.parent.conversation)
				: null;

			let messageDisplayName = this.displayNameInChannel(userData, messageChannel);

			let messageBody = he.decode(he.decode(message.message));
			messageBody = he.encode(messageBody);
			
			let isAction = false;
			if (messageBody.substring(0, 12) == "&#x1;ACTION ") {
				messageBody = messageBody.substring(12);
				isAction = true;
			}

			let isNotice = false;
			let hasEffect = false;
			let hasStyle = false;

			let html = $(`
				<div class="messageRow" data-id="${message.id}" data-time="${message.time}" data-sender="${message.user}">
					<div class="contents">
						<div class="main">
							${this.avatar("div", message.user, user)}
							<div class="user" data-id="${message.user}">${messageDisplayName}</div>
							<div class="holder msg">
								<div class="message">
									<div class="body"></div>
								</div>
							</div>
						</div>
						<div class="linkHolder"></div>
						<div class="holder react">
							<div class="reactions"></div>
						</div>
					</div>
				</div>
			`);

			let decoded = he.decode(messageBody);
			try {
				let json = JSON.parse(he.decode(decoded));

				if (json.hnschat) {
					if (json.attachment) {
						let link;

						try {
							let url = new URL(json.attachment);

							switch (url.host) {
								case "media.tenor.com":
							case "media0.giphy.com":
							case "media1.giphy.com":
							case "media2.giphy.com":
							case "media3.giphy.com":
							case "media4.giphy.com":
							case "media.giphy.com":
							case "i.giphy.com":
								case "api.zora.co":
									link = json.attachment;
									break;
							}
						}
						catch {
							link = `${window.location.protocol}//${window.location.host}/media.php?id=${encodeURIComponent(json.attachment)}`;
						}

						let attachmentType = String(json.attachmentType || "image").toLowerCase();
						let media;

						if (attachmentType === "video") {
							media = $(`
								<video controls playsinline preload="metadata">
									<source src="${link}">
								</video>
							`);

							html.find(".message").addClass("video");
						}
						else {
							media = $(`
								<a href="${link}" target="_blank" rel="noopener noreferrer">
									<img src="${link}" />
								</a>
							`);

							html.find(".message").addClass("image");
						}

						html.find(".message .body").empty();
						html.find(".message .body").append(media);
					}
					else if (json.payment) {
						let link = `https://niami.io/tx/${json.payment}`;
						let image = $(`
							<a href="${link}" target="_blank">
								<div class="imageHolder">
									<img src="/assets/img/logo.png" />
									<div class="amount">${this.parent.rtrim(json.amount.toLocaleString("en-US", { minimumFractionDigits: 6 }), "0")}</div>
									<div class="txMessage"></div>
								</div>
							</a>
						`);
						html.find(".message").addClass("image payment");
						html.find(".message .body").empty();
						html.find(".message .body").append(image);
					}
					else if (json.poll && json.poll.question && Array.isArray(json.poll.options)) {
						let poll = $("<div>").addClass("chatPoll");
						let question = $("<div>")
							.addClass("pollQuestion")
							.text(json.poll.question);

						let options = $("<div>").addClass("pollOptionList");
						let counts = Array.isArray(message.pollVotes)
							? message.pollVotes
							: json.poll.options.map(() => 0);

						let selected = (
							message.pollSelected !== undefined &&
							message.pollSelected !== null
						)
							? Number(message.pollSelected)
							: null;

						let me = this.parent.userForID(this.parent.domain);
						let guest = Boolean(
							me &&
							(
								me.namespace === "handshakeuser" ||
								me.tld === "handshakeuser"
							)
						);

						json.poll.options.forEach((option, index) => {
							let row = $("<div>")
								.addClass("pollOption")
								.attr("data-message", message.id)
								.attr("data-option", index);

							if (selected === index) {
								row.addClass("selected");
							}

							if (guest) {
								row
									.addClass("pollLocked")
									.attr("title", "Guests can't vote");
							}

							row.append(
								$("<span>")
									.addClass("pollOptionText")
									.text(option)
							);

							row.append(
								$("<span>")
									.addClass("pollOptionCount")
									.text(Number(counts[index]) || 0)
							);

							options.append(row);
						});

						poll.append(question);
						poll.append(options);

						html.find(".message").addClass("poll");
						html.find(".message .body").empty().append(poll);

						messageBody = he.encode(json.poll.question);
					}
					else if (json.action) {
						messageBody = he.encode(json.action);
						html.find(".message .body").html(messageBody);
						isAction = true;
					}
					else if (json.message) {
						messageBody = json.message.toString();
						messageBody = he.encode(messageBody);
						html.find(".message .body").html(messageBody);
					}

					if (json.effect) {
						hasEffect = json.effect;
					}
					if (json.style) {
						hasStyle = json.style;
					}
				}
			}
			catch (e) {
				html.find(".message .body").html(messageBody);
			}

			if (isAction) {
				html.addClass("action");
			}
			
			let firstThree = Array.from(messageBody.toString()).slice(0, 3);
			let isEmojis = true;
			$.each(firstThree, (k, char) => {
				if (!this.isCharEmoji(char)) {
					isEmojis = false;
					return false;
				}
			});
			if (isEmojis) {
				html.addClass("emojis");
			}

			let isDice = true;
			let chars = Array.from(messageBody.toString());
			$.each(chars, (k, char) => {
				if (!["⚀","⚁","⚂","⚃","⚄","⚅"].includes(char)) {
					isDice = false;
					return false;
				}
			});
			if (isDice) {
				html.addClass("emojis dice");
			}

			if (hasStyle) {
				this.setData(html, "style", hasStyle);
			}

			let messageTime = this.tenTime(message.time);
			let actions = $(`
				<div class="hover">
					<div class="time">${messageTime}</div>
					<div class="actions">
						<div class="action icon reply" data-action="reply"></div>
						<div class="action icon emoji" data-action="emojis"></div>
					</div>
				</div>
			`)

			if (message.user == this.parent.domain) {
				html.addClass("self");

				html.find(".holder.msg").prepend(actions);
			}
			else {
				html.find(".holder.msg").append(actions);
			}

			if (this.parent.mentionsMe(message.message)) {
				html.addClass("mention");
			}

			if (message.notice) {
				html.addClass("notice");
			}

			if (message.replying) {
				let reply = $(`
					<div class="reply" data-id="${message.replying}">
						<div class="line"></div>
						<div class="contents">
							<div class="user"></div>
							<div class="body"></div>
						</div>
					</div>
				`);

				if (message.p_user && message.p_message) {
					let messageReplyBody = "";
					if (message.p_message.length) {
						messageReplyBody = he.encode(message.p_message);
						messageReplyBody = this.replaceSpecialMessage(messageReplyBody);
					}

					let p_user = this.parent.userForID(message.p_user);

					this.setData(reply.find(".user"), "id", message.p_user);
					reply.find(".user").html(this.displayName(p_user));
					reply.find(".body").html(messageReplyBody);

					if (message.p_user == this.parent.domain) {
						html.addClass("mention");
					}
				}
				else {
					reply.find(".user").remove();
					reply.find(".body").html("Original message was deleted.");
				}

				html.addClass("replying");
				html.prepend(reply);
			}

			if (hasEffect) {
				let effect = $(`<div class="messageEffect action link" data-action="replayEffect" data-effect="${hasEffect}"><div class="icon replay"></div>Replay</div>`);
				html.find("> .contents").append(effect);
			}

			if (!message.reactions) {
				message.reactions = JSON.stringify({});
			}

			if (data.before || data.at) {
				this.parent.messages.unshift(message);
				$("#messages").prepend(html);
			}
			else {
				this.parent.messages.push(message);
				$("#messages").append(html);
				this.fixScroll();	
			}

			if (!decrypt && hasEffect) {
				this.handleEffect(hasEffect);
			}

			this.updateReactions(message.id);
			this.stylizeMessage(html);
			this.updateAvatars();
		}

		this.parent.loadingMessages = false;

		this.markEmptyIfNeeded();
	}

	async handleEffect(effect) {
		let done = new Promise(resolve => {
			switch (effect) {
				case "confetti":
					startConfetti();
					setTimeout(() => {
						stopConfetti();
						resolve();
					}, 3000);
					break;
			}
		});
		return await done;
	}

	markEmptyIfNeeded() {
		if (!$(".messageRow").length && !$(".needSLD").length) {
			$("#messages").addClass("empty");
		}
		else {
			$("#messages").removeClass("empty");
		}
	}

	deleteMessage(id) {
		let message = $(`.messageRow[data-id=${id}]`);

		if (message.length) {
			let previous = message.prev();
			let next = message.next();

			message.remove();
			if (previous.length) {
				this.stylizeMessage(previous);
			}
			if (next.length) {
				this.stylizeMessage(next);
			}

			if (this.parent.isChannel(this.parent.conversation)) {
				let channel = this.parent.channelForID(this.parent.conversation);
				if (id == channel.pinned) {
					channel.pinned = null;
					this.setPinnedMessage();
				}
			}
		}
	}

	updatePoll(id, counts, selected=undefined) {
		let row = $(`#messages > .messageRow[data-id="${id}"]`);

		if (!row.length || !Array.isArray(counts)) {
			return;
		}

		row.find(".pollOption").each((k, option) => {
			$(option)
				.find(".pollOptionCount")
				.text(Number(counts[k]) || 0);
		});

		if (selected !== undefined) {
			row.find(".pollOption").removeClass("selected");

			if (selected !== null) {
				row.find(`.pollOption[data-option="${selected}"]`)
					.addClass("selected");
			}
		}
	}

	updateReactions(id) {
		let message = $(`.messageRow[data-id=${id}]`);
		message.find(".reactions").empty();

		let reactions = this.parent.messages.filter(m => {
			return m.id == id;
		})[0].reactions;

		if (reactions) {
			let json = JSON.parse(reactions);
			if (Object.keys(json).length) {
				$.each(json, (r, u) => {
					let users = this.userString(u);
					let reaction = $(`
						<div class="reaction" data-reaction="${r}" title="${users}">
							<div>${r}</div>
							<div class="count">${u.length}</div>
						</div>
					`);

					if (u.includes(this.parent.domain)) {
						reaction.addClass("self");
					}

					message.find(".reactions").append(reaction);
				});
			}
		}
	}

	moveConversationToTop(conversation) {
		let div = $(`#conversations tr[data-id=${conversation}]`);
		let parent = div.parent();
		div.remove();
		parent.prepend(div);
	}

	userString(array) {
		let output;

		let users = [...array];
		$.each(users, (k, u) => {
			let name = this.parent.userForID(u).domain;
			users[k] = name;
		});

		if (users.length == 1) {
			output = users[0];
		}
		else {
			let last = users.pop();
			let others = users.join(", ");
			output = `${others} and ${last}`;
		}

		return output;
	}

	isCharEmoji(char) {
		if (char == "\u200d") {
			return true;
		}

		let match = emojis.filter(emoji => {
			return emoji.emoji == char || emoji.emoji.replace("\ufe0f", "") == char;
		});

		if (match.length) {
			return true;
		}

		return false;
	}

	stylizeMessage(message) {
		let messageHolder = $("#messages");

		let firstMessage = $("#messages > .messageRow[data-id]").first();
		let firstMessageID = firstMessage.data("id");

		let lastMessage = $("#messages > .messageRow[data-id]").last();
		let lastMessageID = lastMessage.data("id");

		let messageID = message.data("id");
		let messageTime = message.data("time");
		let messageDate = this.tenDate(messageTime);
		let contents = message.find(".contents");
		let messageSender = message.data("sender");
		let messageUser;

		let previousMessage = message.prev();
		let previousMessageTime = previousMessage.data("time");
		let previousMessageDate = this.tenDate(previousMessageTime);
		let previousMessageSender = previousMessage.data("sender");

		let nextMessage = message.next();
		let nextMessageTime = nextMessage.data("time");
		let nextMessageDate = this.tenDate(nextMessageTime);
		let nextMessageSender = nextMessage.data("sender");
		let nextMessageUser;

		let isFirst = false;
		let isLast = false;

		let isReply = false;

		let isInformational = false;
		let isAction = false;
		let isDate = false;

		let before = false;

		let addUser = false;
		let addNextUser = false;
		let removeUser = false;
		let removeNextUser = false;
		
		let prependDate = false;
		let appendDate = false;

		if (firstMessageID == messageID) {
			isFirst = true;
		}

		if (lastMessageID == messageID) {
			isLast = true;
		}

		if (message.hasClass("replying")) {
			isReply = true;
		}

		if (message.hasClass("informational")) {
			isInformational = true;
		}

		if (message.hasClass("date")) {
			isDate = true;
		}

		if (message.hasClass("action")) {
			isAction = true;
		}

		if (nextMessage.length) {
			before = true;
		}

		if (isFirst || isReply) {
			addUser = true;
		}

		if (!before) {
			if (!isDate && previousMessage.length && messageDate !== previousMessageDate && !previousMessage.hasClass("date")) {
				prependDate = true;
			}
		}
		else {
			if (!isDate && nextMessage.length && messageDate !== nextMessageDate && !nextMessage.hasClass("date")) {
				appendDate = true;
			}
		}

		if (isDate) {
			previousMessage.addClass("last");
			message.addClass("first last");

			if (nextMessage.length) {
				addNextUser = true;
			}
		}
		else {
			let timeDifference;

			messageUser = this.parent.userForID(messageSender).domain;

			if (before) {
				message.addClass("first");
			}
			else {
				message.addClass("last");	
			}

			if (isFirst || isReply) {
				message.addClass("first");
			}

			if (isLast) {
				message.addClass("last");
			}

			if (previousMessage.length) {
				timeDifference = messageTime - previousMessageTime;

				if (timeDifference >= 60 || previousMessageSender !== messageSender) {
					previousMessage.addClass("last");
					message.addClass("first");
					addUser = true;
				}
				else if (!isReply) {
					removeUser = true;
				}
			}

			if (timeDifference < 60 && previousMessageSender == messageSender && !message.hasClass("replying")) {
				previousMessage.removeClass("last");
			}

			if (previousMessageSender !== messageSender) {
				previousMessage.addClass("last");
			}

			if (nextMessage.length) {
				timeDifference = nextMessageTime - messageTime;

				if (timeDifference > 60) {
					nextMessage.addClass("first");
					addNextUser = true;
				}

				if (nextMessage.hasClass("first")) {
					message.addClass("last");
				}
			}

			if (timeDifference < 60 && nextMessageSender == messageSender && !nextMessage.hasClass("replying")) {
				removeNextUser = true;
			}

			if (addUser) {
				if (!contents.find(".user").length) {
					//let user = $('<div class="user" />');
					//user.html(messageUser);
					//contents.prepend(user);
					//contents.prepend(messageAvatar(messageSender, messageUser));
				}
			}
			if (removeUser) {
				message.removeClass("first");
				//message.find(".contents .user").remove();
				//message.find(".contents .avatar").remove();
			}
			if (removeNextUser) {
				message.removeClass("last");
				nextMessage.removeClass("first");
				//nextMessage.find(".contents .user").remove();
				//nextMessage.find(".contents .avatar").remove();
			}
			if (prependDate) {
				let infoRow = $('<div class="messageRow informational date last" />');
				infoRow.html(messageDate);
				infoRow.insertBefore(message);
				this.stylizeMessage(infoRow);
			}
			if (appendDate) {
				let infoRow = $('<div class="messageRow informational date last" />');
				infoRow.html(nextMessageDate);
				infoRow.insertAfter(message);
				this.stylizeMessage(infoRow);
			}
		}

		if (addNextUser) {
			if (!nextMessage.find(".contents .user").length) {
				//nextMessageUser = this.parent.userForID(nextMessageSender).domain;
				//let user = $('<div class="user" />');
				//user.html(nextMessageUser);
				//nextMessage.addClass("first");
				//nextMessage.find(".contents").prepend(user);
				//nextMessage.find(".contents").prepend(messageAvatar(nextMessageSender, nextMessageUser));
			}
		}

		let newLastMessage = $(".messageRow").last();
		if (newLastMessage.hasClass("informational date")) {
			newLastMessage.remove();
		}

		//this.codify(message.find(".contents .body"));
		this.linkify(message.find(".contents .body"));

		this.updateAvatars();
	}

	codify(elements) {
		$.each(elements, (k, e) => {
			e = $(e);

			let output = e.html();

			while (this.parent.regex(/\`{3}(?<code>[.\s\S]+?)\`{3}/gm, output).length) {
				let matches = this.parent.regex(/\`{3}(?<code>[.\s\S]+?)\`{3}/gm, output);
				
				if (matches.length) {
					let result = matches[0];
					let full = result[0];
					let code = result.groups.code;
					let start = result.index;
					let end = (start + full.length);
					let replace = `<pre class="multi"><code class="hljs">${code}</code></pre>`;
					output = this.parent.replaceRange(output, start, end, replace);
				}
			}

			while (this.parent.regex(/\`(?<code>[.\s\S]+?)\`/gm, output).length) {
				let matches = this.parent.regex(/\`(?<code>[.\s\S]+?)\`/gm, output);
				
				if (matches.length) {
					let result = matches[0];
					let full = result[0];
					let code = result.groups.code;
					let start = result.index;
					let end = (start + full.length);
					let replace = `<code>${code}</code>`;
					output = this.parent.replaceRange(output, start, end, replace);
				}
			}

			e.html(output);
		});
	}

	linkify(elements) {
		$.each(elements, (k, e) => {
			e = $(e);

			let output = e.html();
			let links = anchorme.list(output).reverse();

			$.each(links, (k, link) => {
				let href = link.string;

				if (link.isEmail) {
					href = `mailto:${href}`;
				}
				else if (link.isURL && href.substring(0, 8) !== "https://" && href.substring(0, 7) !== "http://") {
					href = `http://${href}`;
				}

				let replace = `<a class="inline link" href="${href}" target="_blank">${link.string}</a>`
				output = this.parent.replaceRange(output, link.start, link.end, replace);
			});

			let mentions = this.usersInMessage(output);
			$.each(mentions, (k, mention) => {
				let id = mention.groups.name;
				if (id == this.parent.domain) {
					e.closest(".messageRow").addClass("mention");
				}
			});

			output = this.replaceIds(output);
			e.html(output);

			this.expandLinks(e);
		});
	}

	expandLinks(message) {
		if (message.hasClass("expanded")) {
			return;
		}

		message.addClass("expanded");

		let links = message.find("a.inline");

		if (links.length) {
			if (!message.parent().hasClass("message")) {
				return;
			}

			let link = links[0].href;
			let embed = this.shouldInlineLink(link);
			if (embed) {
				let div;
				switch (embed) {
					case "image":
						div = $(`
							<a href="${link}" class="previewImage" target="_blank">
								<div class="preview">
									<div class="media">
										<img src="${link}">
									</div>
								</div>
							</a>
						`);
						break;

					case "video":
						div = $(`
							<div class="preview">
								<div class="media">
									<video controls>
										<source src="${link}">
									</video>
								</div>
							</div>
						`);
						break;
				}

				if (div) {
					message.closest(".messageRow").find(".linkHolder").append(div);
					this.fixScroll();
				}
			}
			else {
				let data = {
					action: "getMetaTags",
					url: link
				}
				if (link.substring(0, 7) == "mailto:") {
					return;
				}
				this.parent.api(data).then(r => {
					let div = $(`
						<a href="${link}" class="previewLink" target="_blank">
							<div class="preview"></div>
							<div class="info"></div>
						</a>
					`);

					if (r.tags) {
						let t = r.tags;
						if (t.title) {
							div.find(".info").append(`<div class="title">${t.title}</div>`);

							if (t.description) {
								div.find(".info").append(`<div class="subtitle">${t.description}</div>`);
							}

							/*
							if (t.video) {
								div.find(".preview").prepend(`
									<div class="media">
										<iframe src="${t.video}" frameborder="0" allowfullscreen="" webkitallowfullscreen="true" mozallowfullscreen="true" oallowfullscreen="true" msallowfullscreen="true">
									</div>
								`);
							}
							else
							*/
							if (t.image) {
								div.find(".preview").prepend(`
									<div class="media">
										<img src="https://${window.location.host}${t.image}">
									</div>
								`);
							}

							message.closest(".messageRow").find(".linkHolder").append(div);
							this.fixScroll();
						}
					}
				});
			}
		}
	}

	shouldInlineLink(link) {
		try {
			let url = new URL(link);

			let match;
			switch (url.host) {
				case "hns.chat":
				case "hnschat":
					match = url.pathname.match(/^(\/uploads\/.{32}|\/avatar\/.{16})$/);
					if (match) {
						return "image";
					}
					break;

				case "i.arxius.io":
					match = url.pathname.match(/^\/.{8}\.(jpeg|jpg|png|gif)$/);
					if (match) {
						return "image";
					}
					break;

				case "v.arxius.io":
					match = url.pathname.match(/^\/.{8}$/);
					if (match) {
						return "video";
					}
					break;

				case "i.imgur.com":
					match = url.pathname.match(/^\/.{7}\.(jpeg|jpg|png|gif)$/);
					if (match) {
						return "image";
					}
					break;

				case "i.redd.it":
					match = url.pathname.match(/^\/.{13}\.(jpeg|jpg|png|gif)$/);
					if (match) {
						return "image";
					}
					break;
			}
		}
		catch {}

		return false;
	}

	usersInMessage(message) {
		let matches = this.parent.regex(/\@(?<id>[a-zA-Z0-9]{16}(?:\b|$))/gm, message);
		return matches;
	}

	channelsInMessage(message) {
		let matches = this.parent.regex(/\@(?<id>[a-zA-Z0-9]{8}(?:\b|$))/gm, message);
		return matches;
	}

	replaceIds(message, link=true) {
		let output = message;

		while (this.channelsInMessage(output).length) {
			let channels = this.channelsInMessage(output);
			let result = channels[0];

			let id = result.groups.id;
			let start = result.index;
			let end = (start + id.length + 1);
			
			let replace;
			let match = this.parent.channelForID(id);
			if (match) {
				let channel = match.name;
				replace = `<div class="inline channel" data-id="${id}">#${this.toUnicode(channel)}</div>`;
			}
			else {
				replace = `@\x00${id}`;
			}
			output = this.parent.replaceRange(output, start, end, replace);
		}

		while (this.usersInMessage(output).length) {
			let users = this.usersInMessage(output);
			let result = users[0];

			let id = result.groups.id;
			let start = result.index;
			let end = (start + id.length + 1);

			let replace;
			let match = this.parent.userForID(id);
			if (match) {
				let domain = match.domain;
				replace = `<div class="inline nick" data-id="${id}">@${this.toUnicode(domain)}/</div>`;
			}
			else {
				replace = `@\x00${id}`;
			}
			output = this.parent.replaceRange(output, start, end, replace);
		}

		return output;
	}

	preventTabIfNeeded(e) {
		let target = $(e.target);

		if (this.parent.isKey(e, 9)) {
			if (!target.hasClass("tab")) {
				e.preventDefault();
			}
		}
	}

	focusInputIfNeeded(e) {
		if (!$("input").is(":focus") && !$("#message").is(":focus") && !$("#blackout").is(":visible")) {
			if ((this.parent.keyName(e).length == 1 || this.parent.isKey(e, 9)) && !((e.ctrlKey || e.metaKey))) {
				if (this.parent.isKey(e, 9)) {
					e.preventDefault();
				}
				$("#message").focus();
			}
		}
	}

	removePopoverIfNeeded() {
		if ($("#blackout").is(":visible")) {
			this.close();
			return true;
		}
		return false;
	}

	removeReplyingIfNeeded() {
		if (!$(".popover.shown").length && $("#replying.shown").length) {
			$(".action[data-action=removeReply]").click();
			return true;
		}
		return false;
	}

	undoProfileIfNeeded() {
		if ($(".contextMenu[data-name=userContext].me.editing.shown").length) {
			this.undoProfile();
			return true;
		}
		return false;
	}

	updateReplying() {
		if (this.parent.replying) {
			let name = this.displayName(this.parent.userForID(this.parent.replying.sender));
			$("#replying .message .name").html(name);
			$("#replying").addClass("shown");

			$("#holder").addClass("replying");
			$(".messageRow").removeClass("selected");
			$(".messageRow").removeClass("selecting");
			$(`.messageRow[data-id=${this.parent.replying.message}]`).addClass("selected");
		}
		else {
			$("#replying").removeClass("shown");
			$("#replying .message .name").html('');
			$("#holder").removeClass("replying");
			$(`.messageRow`).removeClass("selected");
		}
	}

	async popover(action) {
		$(".popover.shown").removeClass("shown");

		let popover = $(`.popover[data-name=${action}]`);

		// CHAT HNS GROUP POPOVER RESET
		if (action === "createGroup") {
			popover.find(".groupMainMenu").removeClass("hidden");
			popover.find(".groupFoundSection").addClass("hidden");
			popover.find(".groupManageSection").addClass("hidden");
			popover.find(".groupAccountsSection").addClass("hidden");
			popover.find(".groupRandomSection").addClass("hidden");
			popover.find(".accountCreateForm").addClass("hidden");
			popover.find(".accountEditForm").addClass("hidden");
		}

		let output = new Promise(resolve => {
			switch (action) {
				case "syncSession":
					resolve();
					break;

				case "pay":
					popover.find("input[name=hns]").inputmask({mask: "9{+}[.9{1,6}] HNS", greedy: false, placeholder: "0"});
					popover.find(".response").html("");

					resolve();

					let to = getOtherUser(conversation).domain;
					let toID = getOtherUserID(conversation);

					let data = {
						action: "getAddress",
						domain: toID
					}
					api(data).then(r => {
						popover.find(".loading").removeClass("shown");

						if (r.success) {
							popover.find(".subtitle").html(to+"/ is able to accept payments!");
							popover.find("input[name=address]").val(r.address);
							popover.find(".content").addClass("shown");
							popover.find("input[name=hns]").focus();
						}
						else {
							popover.find(".response").addClass("error");
							popover.find(".response").html(r.message);
						}
					});
					break;

				case "settings":
					popover.find("input[name=avatar]").parent().addClass("hidden");
					popover.find("input[name=address]").parent().addClass("hidden");

					let user = this.parent.userForID(this.parent.domain);
					let tld = user.tld;

					if (["hnschat", "theshake"].includes(tld)) {
						popover.find("input[name=address]").parent().removeClass("hidden");
						popover.find("input[name=avatar]").parent().removeClass("hidden");
						popover.find("input[name=avatar]").val(user.avatar);

						let data = {
							action: "getAddress",
							domain: this.parent.domain
						}

						this.parent.api(data).then(r => {
							if (r.address) {
								popover.find("input[name=address]").val(r.address);
							}
							resolve();
						});
					}
					else {
						resolve();
					}
					break;

				case "completions":
				case "emojis":
					let bottom = $(".inputHolder").outerHeight() + 10;
					popover.css("bottom", bottom+"px");
					resolve();
					break;

				default:
					resolve();
					break;
			}
		});

		output.then(() => {
			if (popover.length) {
				$("#blackout").addClass("shown");
				$("#messageHolder").addClass("noScroll");
				popover.addClass("shown");

				if (action == "newConversation" && popover.find("input[name=domain]").val()) {
					popover.find("input[name=message]").focus();
				}
				else {
					let first = popover.find("input:visible:first");
					if (first.attr("type") !== "color") {
						if (this.isDesktop()) {
							if (!["syncSession"].includes(action)) {
								first.focus();
							}
						}
						else {
							if (!["syncSession", "react"].includes(action)) {
								first.focus();
							}
						}
					}
				}

				if (action === "emojis") {
					$(".popover[data-name=emojis] .body .grid[data-type=emojis]").scrollTop(0);
				}
			}
		});
	}

	close(old=false) {
		$("#blackout").removeClass("shown");
		$("#completions").removeClass("shown");
		$(".popover.shown").find("input:not([readonly])").val('');
		$(".popover.shown").find(".response").html('');
		$(".popover.shown").find(".content").removeClass("shown");
		$(".popover.shown").find(".loading").addClass("shown");
		$(".popover.shown").find(".button").removeClass("disabled");
		$(".popover[data-name=react]").find(".grid[data-type=gifs]").scrollTop(0);
		$(".popover.shown").removeClass("shown");
		$("#messageHolder").removeClass("noScroll");
		$(".popover[data-name=react] .grid[data-type=emojis] .section").removeClass("hidden");
		$(".popover[data-name=react] .grid[data-type=emojis] .section[data-name=Search]").addClass("hidden");
		$("#holder").removeClass("reacting");
		$(".messageRow .hover.visible").removeClass("visible");
		$("#users .user.selected").removeClass("selected");
		$(".popover[data-name=react] .section[data-type=gifs] .column").empty();

		$(".messageRow").removeClass("selecting");
		if (!$("#holder").hasClass("reacting") && !$("#holder").hasClass("replying")) {
			$(".messageRow").removeClass("selected");
		}

		this.updateReplying();
		this.undoProfile();
		this.shouldShowGifs();
	}

	/*
	 * 10Zeit / PCT
	 * 1 day = 10 Zeit = 100 Zenti = 1000 Moments
	 * World day/date = UTC+3
	 * Always truncate, never round.
	 * PCT: 1793 = year 0
	 */
	tenWorldParts(unixSeconds) {
		let world = new Date(
			(Number(unixSeconds) * 1000) + (3 * 60 * 60 * 1000)
		);

		return {
			year: world.getUTCFullYear(),
			month: world.getUTCMonth() + 1,
			day: world.getUTCDate(),
			hour: world.getUTCHours(),
			minute: world.getUTCMinutes(),
			second: world.getUTCSeconds(),
			millisecond: world.getUTCMilliseconds()
		};
	}

	tenTime(unixSeconds) {
		let x = this.tenWorldParts(unixSeconds);

		let msToday =
			x.hour * 3600000 +
			x.minute * 60000 +
			x.second * 1000 +
			x.millisecond;

		// 86400000 ms = 1000 Moments.
		// Math.floor is intentional: never round.
		let totalMoments = Math.floor(
			(msToday * 1000) / 86400000
		);

		if (totalMoments < 0) totalMoments = 0;
		if (totalMoments > 999) totalMoments = 999;

		let zeit = Math.floor(totalMoments / 100);
		let moments = totalMoments % 100;

		return `${zeit}.${String(moments).padStart(2, "0")}`;
	}

	tenDate(unixSeconds) {
		let x = this.tenWorldParts(unixSeconds);
		let pctYear = x.year - 1793;

		let day = String(x.day).padStart(2, "0");
		let month = String(x.month).padStart(2, "0");

		return `${day}.${month}.${pctYear} PCT`;
	}

	updateHeader10Zeit() {
		let now = Date.now();

		/*
		 * UTC+3
		 * 10 Zeit / 100 Zenti / 1000 Moments
		 * Display: 7.42.34 ZEIT
		 * PCT: 1793 = year 0
		 * Always truncate, never round.
		 */
		let shifted = new Date(
			now + (3 * 60 * 60 * 1000)
		);

		let msToday =
			shifted.getUTCHours() * 3600000 +
			shifted.getUTCMinutes() * 60000 +
			shifted.getUTCSeconds() * 1000 +
			shifted.getUTCMilliseconds();

		let total = Math.floor(
			(msToday * 100000) / 86400000
		);

		if (total < 0) total = 0;
		if (total > 99999) total = 99999;

		let zeit = Math.floor(total / 10000);
		let rest = total % 10000;

		let zentiMoment = Math.floor(rest / 100);
		let subMoment = rest % 100;

		let clock =
			`${zeit}.` +
			`${String(zentiMoment).padStart(2, "0")}.` +
			`${String(subMoment).padStart(2, "0")} ZEIT`;

		let day = String(shifted.getUTCDate()).padStart(2, "0");
		let month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
		let pctYear = shifted.getUTCFullYear() - 1793;

		let date = `${day}.${month}.${pctYear} PCT`;

		$("#header10zeit .tenClock").text(clock);
		$("#header10zeit .tenDate").text(date);
	}

	messagesLoading(bool) {
		if (bool) {
			$("#messageHolder #messages").addClass("hidden");
			$("#messageHolder .loading").addClass("shown");
		}
		else {
			$("#messageHolder .loading").removeClass("shown");
			$("#messageHolder #messages").removeClass("hidden");
		}
	}

	updateAvatars() {
		$.each($(".favicon:not(.loaded)"), (k, e) => {
			let favicon = $(e);
			favicon.addClass("loaded");
			let d = favicon.data("domain");
			let id = favicon.data("id");
			let user = this.parent.userForID(id);

			if (user.id) {
				if (Object.keys(this.parent.avatars).includes(id)) {
					if (this.parent.avatars[id]) {
						let original = $("#avatars .favicon[data-id="+id+"]");
						if (original.length) {
							let clone = original[0].cloneNode(true);
							let parent = favicon.parent();
							favicon.remove();
							parent.append(clone);
							//parent.find(".fallback").html('');
							this.updateOtherAvatars(id);
						}
					}
				}
				else {
					this.parent.avatars[id] = false;
					let link = user.avatar;
					if (link || user.type === "handshake") {
						link = `https://${window.location.host}/avatar/${user.id}`;
						let img = $('<img class="loading" />');
						img.attr("src", link).on("load", i => {
							let im = $(i.target);
							favicon.css("background-image", "url("+link+")");
							//favicon.parent().find(".fallback").html('');
							im.remove();
							this.parent.avatars[id] = link;
							let clone = favicon[0].cloneNode(true);
							$("#avatars").append(clone);
							this.updateOtherAvatars(user.id);
						}).on("error", r => {
							$(r.target).remove();
							//this.parent.avatars[id] = false;
						});  
						$("html").append(img);
					}
					else {
						this.parent.avatars[id] = false;
					}
				}
			}
		});
	}

	updateOtherAvatars(id) {
		if (this.parent.avatars[id]) {
			let avatars = [
				$(`#conversations .section.pms .avatar .favicon[data-id=${id}].loaded`),
				$(`.messageHeader .avatar .favicon[data-id=${id}].loaded`),
				$(`#messages .messageRow .avatar .favicon[data-id=${id}].loaded`),
				$(`#users .user .avatar .favicon[data-id=${id}].loaded`),
				$(`.contextMenu[data-name=userContext] .avatar .favicon[data-id=${id}].loaded`),
				$(`.header .avatar .favicon[data-id=${id}].loaded`),
				$(`#videoInfo .users .avatar .favicon[data-id=${id}].loaded`)
			];

			$.each(avatars, (k, avatar) => {
				if (avatar.length) {
					$.each(avatar, (k, a) => {
						a = $(a);
						if (a.css("background-image") === "none" || !a.css("background-image")) {
							let original = $("#avatars .favicon[data-id="+id+"]");
							if (original.length) {
								let clone = original[0].cloneNode(true);
								let parent = a.parent();
								a.remove();
								parent.append(clone);
								//parent.find(".fallback").html('');
							}
						}
					});
				}
			});
		}
	}

	setContextMenuPosition(menu, e) {
		if (!this.isDesktop()) {
			return;
		}

		let hx = window.innerWidth / 2;
		let hy = window.innerHeight / 2;
		let x = e.clientX;
		let y = e.clientY;

		if (x >= hx) {
			x = e.clientX - menu.outerWidth();
		}
		if (y >= hy) {
			y = e.clientY - menu.outerHeight();
		}

		menu.css({ top: y, left: x });
	}

	setCaretPosition(ctrl, pos) {
		if (ctrl.setSelectionRange) {
			ctrl.focus();
			ctrl.setSelectionRange(pos, pos);
		} 
		else if (ctrl.createTextRange) {
			let range = ctrl.createTextRange();
			range.collapse(true);
			range.moveEnd('character', pos);
			range.moveStart('character', pos);
			range.select();
		}
		else {
			var range = document.createRange();
			var selection = window.getSelection();
			range.setStart(ctrl[0].childNodes[0], pos);
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	categoryForEmoji(emoji) {
		let cat = false;
		$.each(Object.keys(this.emojiCategories), (k, category) => {
			let data = this.emojiCategories[category];
			if (data.includes(emoji.category)) {
				cat = category;
				return false;
			}
		});

		if (cat) {
			return cat;
		}

		return false;
	}

	setupReactView(e, sender) {
		let target = $(e.target);
		let action = target.data("action");

		let menu = $(".popover[data-name=react]");
		if (!sender) {
			sender = "";
		}
		this.setData(menu, "sender", sender);

		menu.find(".tab[data-name=categories]").addClass("hidden");
		menu.find(".tab[data-name=gifs]").addClass("hidden");

		if (sender) {
			let row = $(`.messageRow[data-id=${sender}]`);

			if (!row.length) {
				let id = target.closest(".body").find("span.message").data("id");
				row = $("#messages").find(`.messageRow[data-id=${id}]`);
			}

			$("#holder").addClass("reacting");
			$(`.messageRow`).removeClass("selected");
			$(".messageRow").removeClass("selecting");
			row.addClass("selected");

			let hover = row.find(".hover");
			hover.addClass("visible");
			menu.addClass("react");
			this.setContextMenuPosition(menu, e);
		}
		else {
			menu.find(".tab[data-name=gifs]").removeClass("hidden");
			menu.removeClass("react");
			menu.css({ top: "auto" });
		}

		if (!menu.hasClass("loaded")) {
			let data = {
				action: "getGifCategories"
			}
			this.parent.api(data).then(r => {
				if (r.success) {
					$.each(r.categories, (k, c) => {
						let category = $(`
							<div class="category" data-term=${c.term}>
								<div class="title">${c.term}</div>
								<div class="background" style="background-image: url(${c.gif})"></div>
							</div>
						`);
						menu.find(".section[data-type=categories]").append(category);
					});
				}
			});

			$.each(Object.keys(this.emojiCategories), (k, category) => {
				let section = $(`
					<div class="section" data-name="${category}">
						<div class="subtitle">${category}</div>
						<div class="emojis"></div>
					</div>
				`);

				if (k == 0) {
					section.addClass("hidden");
				}

				menu.find(".body .grid[data-type=emojis]").append(section);
			});

			$.each(emojis, (k, emoji) => {
				let category = this.categoryForEmoji(emoji);
				let item = $(`<div class="emoji" data-aliases=${JSON.stringify(emoji.aliases)}>${emoji.emoji}</div>`);
				menu.find(`.body .grid[data-type=emojis] .section[data-name=${category}] .emojis`).append(item);
			});

			menu.addClass("loaded");
		}

		this.switchReactTab(action);
	}

	switchReactTab(tab) {
		let menu = $(".popover[data-name=react]");

		menu.find(`.tabs .tab`).removeClass("active");
		menu.find(".search input[name=searchGifs]").removeClass("shown");
		menu.find(".search input[name=searchEmojis]").removeClass("shown");
		menu.find(`.grid`).removeClass("shown");

		menu.find(`.tabs .tab[data-name=${tab}]`).addClass("active");
		menu.find(`.grid[data-type=${tab}]`).addClass("shown");

		switch (tab) {
			case "gifs":
				menu.find(".search input[name=searchGifs]").addClass("shown");
				break;

			case "emojis":
				menu.find(".search input[name=searchEmojis]").addClass("shown");
				break;
		}
	}

	searchGifs(query) {
		let menu = $(".popover[data-name=react]");
		menu.find(".section[data-type=gifs] .column").empty();

		if (query.length) {
			let data = {
				action: "searchGifs",
				query: query
			}
			this.parent.api(data).then(r => {
				if (r.success) {
					let column;
					let col0 = 0;
					let col1 = 0;
					$.each(r.gifs, (k, g) => {
						if (col0 > col1) {
							column = 1;
							col1 += g.height;
						}
						else {
							column = 0;
							col0 += g.height;
						}
						let gif = $(`<img class="gif" src="${g.preview}" data-id="${g.id}" data-full="${g.full}"></div>`);
						menu.find(`.section[data-type=gifs] .column[data-column=${column}]`).append(gif);
					});
				}
				this.shouldShowGifs();
			});
		}
		else {
			this.shouldShowGifs();
		}
	}

	shouldShowGifs() {
		let menu = $(".popover[data-name=react]");

		if (menu.find(".gif").length) {
			menu.find(".section[data-type=categories]").addClass("hidden");
			menu.find(".section[data-type=gifs]").addClass("shown");
		}
		else {
			menu.find(".section[data-type=gifs]").removeClass("shown");
			menu.find(".section[data-type=categories]").removeClass("hidden");
		}
	}

	handleDoubleClick(target) {
		let id = target.data("id");

		let type;
		if (target.hasClass("inline channel")) {
			type = "channel";
		}
		else {
			type = "user";
		}

		switch (type) {
			case "user":
				let name = this.parent.userForID(id).domain;
				let puny = `${this.toUnicode(name)}/`;
				$(`.popover[data-name=newConversation] input[name=domain]`).val(puny);
				this.popover("newConversation");
				break;

			case "channel":
				$(`#conversations .channels tr[data-id=${id}]`).click();
				break;
		}
	}

	handleRightClick(e, target) {
		let me = this.parent.userForID(this.parent.domain);
		let isChannel = this.parent.isChannel(this.parent.conversation);
		
		let channel = {};
		let isAdmin = false;
		if (isChannel) {
			channel = this.parent.channelForID(this.parent.conversation);
			isAdmin = this.isAdmin(channel, me);
		}

		if (target.hasClass("fallback")) {
			target = target.parent().find(".favicon");
		}

		if (target.hasClass("user") || target.hasClass("favicon") || target.hasClass("inline nick")) {
			let id = target.data("id");	
			let user = this.parent.userForID(id);
			let domain = this.displayName(user);
			let joined = this.tenDate(user.created);
			let bio = null;
			if (user.bio) {
				bio = he.encode(user.bio)
			}

			let avatar = this.avatar("div", id, user.domain, true);

			let userList = target.closest("#users").length;
			if (userList) {
				$(`#users .user[data-id=${id}]`).addClass("selected");
			}

			let menu = $(".popover[data-name=userContext]");
			menu.find(".pic").html(avatar);
			this.setData(menu, "id", id);
			this.setData(menu, "type", user.type);
			menu.find("span.user").html(domain);
			
			menu.find("li.bio").addClass("hidden");

			if (bio || id == this.parent.domain) {
				menu.find("li.bio").removeClass("hidden");
			}

			if (id == this.parent.domain) {
				menu.addClass("me");
			}
			else {
				menu.removeClass("me");
			}

			menu.find("li.action.speaker").addClass("hidden");
			if (channel.video && (isAdmin && user.active && !Object.keys(this.parent.currentVideoUsers()).includes(id))) {
				menu.find("li.action.speaker").removeClass("hidden");
			}

			menu.find("div.bio").html(bio);
			menu.find("span.joined").html(joined);

			/*
			 * HNS TLD profile: TXT records are the profile truth.
			 */
			menu.find("li.hnsProfile").addClass("hidden");
			menu.find(".hnsProfileFields").empty();

			// Restore normal appearance first; special account types override this below.
			menu.find("li.bio .title.small").removeClass("hidden");
			menu.find(".icon.type").removeClass("hidden");

			// Temporary guests have no type logo.
			// Without a matching icon CSS rule the generic icon appears as a white square.
			if (user.domain && user.domain.endsWith(".handshakeuser")) {
				menu.find(".icon.type").addClass("hidden");
			}

			if (user.type === "handshake" && user.domain && !user.domain.includes(".")) {
				// TLD profile is read-only in ChatHNS.
				menu.removeClass("editing");
				menu.find("div.bio").attr("contenteditable", false);

				// TLD + verification badge already identifies the account.
				// The extra Handshake logo is therefore unnecessary.
				menu.find(".icon.type").addClass("hidden");

				// Bio does not need a "Bio" heading in the compact profile.
				menu.find("li.bio .title.small").addClass("hidden");

				this.parent.api({
					action: "getHNSProfile",
					domain: user.domain
				}).then(response => {
					if (!response || !response.success || !response.profile) {
						return;
					}

					const profile = response.profile;
					const safe = value => he.encode(String(value));

					/*
					 * TXT avatar replaces the local/database avatar
					 * in the opened profile.
					 */
					if (profile.avatar) {

						user.avatar = profile.avatar;

						const avatarURL = safe(profile.avatar);

						const avatarHolder = menu.find(".pic .avatar");


						if (avatarHolder.length) {

							avatarHolder.find(".favicon, .fallback").hide();

							avatarHolder.find(".hnsTXTAvatar").remove();


							avatarHolder.append(

								`<img class="hnsTXTAvatar" src="${avatarURL}" alt="">`

							);

						}

					}

					/*
					 * TXT bio.
					 */
					if (profile.bio) {
						menu.find("div.bio").html(safe(profile.bio));
						menu.find("li.bio").removeClass("hidden");
					}
					else {
						menu.find("div.bio").empty();
						menu.find("li.bio").addClass("hidden");
					}

					/*
					 * Compact optional profile actions.
					 * Only existing records are shown.
					 */
					let items = [];

					const external = (label, href, title) => {
						items.push(
							`<a class="hnsProfileItem" href="${safe(href)}" target="_blank" rel="noopener noreferrer" title="${safe(title)}">${label}</a>`
						);
					};

					const valueItem = (label, value, title) => {
						items.push(
							`<span class="hnsProfileItem hnsProfileValue" data-value="${safe(value)}" title="${safe(title)}">${label}</span>`
						);
					};

					if (profile.alias) {
						items.push(
							`<span class="hnsProfileAlias">${safe(profile.alias)}</span>`
						);
					}

					if (profile.web) {
						let href = String(profile.web);

						if (!/^https?:\/\//i.test(href)) {
							href = "https://" + href;
						}

						external("🌐", href, profile.web);
					}

					if (profile.email) {
						external("📧", "mailto:" + profile.email, profile.email);
					}

					if (profile.telegram) {
						let tg = String(profile.telegram).replace(/^@/, "");
						external("TG", "https://t.me/" + tg, profile.telegram);
					}

					if (profile.x) {
						let x = String(profile.x).replace(/^@/, "");
						external("X", "https://x.com/" + x, profile.x);
					}

					if (profile.github) {
						let gh = String(profile.github).replace(/^@/, "");
						external("GH", "https://github.com/" + gh, profile.github);
					}

					if (profile.reddit) {
						let red = String(profile.reddit).replace(/^@/, "");
						external("R", "https://reddit.com/u/" + red, profile.reddit);
					}

					if (profile.hns) {
						valueItem("HNS", profile.hns, profile.hns);
					}

					if (profile.btc) {
						valueItem("BTC", profile.btc, profile.btc);
					}

					if (profile.eth) {
						valueItem("ETH", profile.eth, profile.eth);
					}

					if (items.length) {
						menu.find(".hnsProfileFields").html(
							`<div class="hnsProfileCompact">${items.join("")}</div>`
						);
						menu.find("li.hnsProfile").removeClass("hidden");
					}

					user.hnsProfile = profile;
				})
				.catch(error => console.error("HNS profile:", error));
			}

			let moderation = menu.find("li.moderation");
			moderation.addClass("hidden");

			let staffControl = menu.find("li.groupStaffControl");
			staffControl.addClass("hidden");

			if (isChannel && channel) {
				let canManageStaff =
					this.isGlobalAdmin(me) ||
					this.isGroupOwner(channel, me);

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

				let eligible =
					canManageStaff &&
					id !== this.parent.domain &&
					user &&
					!user.locked &&
					!user.deleted &&
					(
						(
							user.type === "handshake" &&
							members.includes(user.domain)
						) ||
						(
							user.type === "account" &&
							user.namespace === "chathns"
						)
					) &&
					!this.isGroupOwner(channel, user);

				if (eligible) {
					let isStaff = admins.includes(user.domain);
					let button = staffControl.find('[data-action="toggleGroupStaff"]');

					button
						.text(isStaff ? "🛂 Remove staff" : "🛂 Make staff")
						.data("staff", isStaff ? 1 : 0);

					staffControl.removeClass("hidden");
				}
			}

			let canMuteTarget = false;

			if (isChannel && isAdmin && id !== this.parent.domain) {
				let me = this.parent.userForID(this.parent.domain);
				let admins = [];

				try {
					admins = Array.isArray(channel.admins)
						? channel.admins
						: JSON.parse(channel.admins || "[]");
				}
				catch {}

				let meGlobal = Boolean(
					me && Number(me.admin) === 1
				);

				let meOwner = Boolean(
					me &&
					Number(channel.tldadmin) === 1 &&
					me.type === "handshake" &&
					this.sameTLD(me.domain, channel.name)
				);

				let meStaff = Boolean(
					me && admins.includes(me.domain)
				);

				let targetGlobal = Boolean(
					user && Number(user.admin) === 1
				);

				let targetOwner = Boolean(
					user &&
					Number(channel.tldadmin) === 1 &&
					user.type === "handshake" &&
					this.sameTLD(user.domain, channel.name)
				);

				let targetStaff = Boolean(
					user && admins.includes(user.domain)
				);

				canMuteTarget =
					meGlobal ||
					(
						meOwner &&
						!targetGlobal &&
						!targetOwner
					) ||
					(
						meStaff &&
						!targetGlobal &&
						!targetOwner &&
						!targetStaff
					);
			}

			if (canMuteTarget) {
				let mutes = {};

				try {
					mutes = (channel.mutes && typeof channel.mutes === "object")
						? channel.mutes
						: JSON.parse(channel.mutes || "{}");
				}
				catch {}

				let currentMute = Number(mutes[user.domain] || 0);
				let now = Math.floor(Date.now() / 1000);

				let slider = moderation.find('input[name="muteDuration"]');
				let label = moderation.find(".muteLabel");
				let button = moderation.find('[data-action="muteUser"]');

				let labels = [
					"0",
					"1 hour",
					"1 day",
					"3 days",
					"1 month",
					"Forever"
				];

				slider.val(0);
				label.text("0");
				button.text("Mute");
				button.data("activeMute", 0);

				slider.off("input.mute").on("input.mute", function() {
					let step = Number($(this).val());
					label.text(labels[step]);
					button.text(step === 0 ? "Unmute" : "Mute");
					button.data("activeMute", 0);
				});

				if (currentMute === -1) {
					slider.val(5);
					label.text("Muted forever");
					button.text("Unmute");
					button.data("activeMute", 1);
				}
				else if (currentMute > now) {
					label.text(
						"Muted until " +
						new Date(currentMute * 1000).toLocaleString()
					);
					button.text("Unmute");
					button.data("activeMute", 1);
				}

				moderation.removeClass("hidden");
			}

			this.updateAvatars();
			this.linkify($(".contextMenu[data-name=userContext] div.bio"));
			this.popover("userContext");
			this.setContextMenuPosition(menu, e);
		}
		else if (target.hasClass("inline channel")) {
			let id = target.data("id");
			let channel = this.parent.channelForID(id);
			let name = `#${this.toUnicode(channel.name)}`;
			let menu = $(".popover[data-name=channelContext]");
			this.setData(menu, "id", id);
			menu.find("span.channel").html(name);
			this.popover("channelContext");
			this.setContextMenuPosition(menu, e);
		}
		else if (target.closest(".messageRow").length) {
			let message = target.closest(".messageRow");

			if (message.hasClass("informational")) {
				return;
			}

			$(".messageRow").removeClass("selecting");
			message.addClass("selecting");
			let menu = $(".popover[data-name=messageContext]");
			this.setData(menu, "id", message.data("id"));
			this.setData(menu, "sender", message.data("sender"));

			menu.find("li.action.pin").addClass("hidden");
			menu.find("li.action.delete").addClass("hidden");
			menu.find("li.action.bulkSelect").addClass("hidden");
			menu.find("li.action.bulkDelete").addClass("hidden");

			if (isChannel) {
				if (isAdmin) {
					menu.find("li.action.pin").removeClass("hidden");
					menu.find("li.action.delete").removeClass("hidden");
					menu.find("li.action.bulkSelect").removeClass("hidden");

					let marked = $("#messages .messageRow.bulkSelected[data-id]").length;

					menu.find("li.action.bulkSelect span").text(
						message.hasClass("bulkSelected") ? "✓ Unmark" : "Mark"
					);

					if (marked > 0) {
						menu.find("li.action.bulkDelete")
							.removeClass("hidden")
							.find("span")
							.text(`Delete selected (${marked})`);
					}
				}
			}

			this.popover("messageContext");
			this.setContextMenuPosition(menu, e);
		}
	}

	changeConversation(id) {
		$(`#conversations .sections tr[data-id=${id}]`).click();
	}

	updateTypingView() {
		let typers = [];

		$.each(this.parent.typers, (typer, data) => {
			if ((this.parent.time() - data.time) <= this.parent.typingDelay) {
				let name = this.displayName(this.parent.userForID(typer));

				if (data.to == this.parent.conversation) {
					typers.push(`<span>${name}</span>`);
				}
			}
			else {
				delete this.parent.typers[typer];
			}
		});

		let message;
		if (typers.length) {
			if (typers.length > 1) {
				if (typers.length > 5) {
					message = "Many users are typing...";
				}
				else {
					let beginning = typers.slice(0, typers.length - 1);
					let last = typers.pop();
					message = `${beginning.join(", ")} and ${last} are typing...`;
				}
			}
			else {
				message = `${typers[0]} is typing...`;
			}
			$("#typing .message").html(message);
			$("#typing").addClass("shown");
		}
		else {
			$("#typing").removeClass("shown");
		}
	}

	updateMentions(channels) {
		$.each(channels, (k, channel) => {
			$(`#conversations tr[data-id=${channel}]`).addClass("mentions");
		});
	}

	hasBob() {
		$("body").addClass("bob");
	}

	paymentResponse(data) {
		let address = data.address;
		let popover = $(".popover[data-name=pay]");
		popover.find(".loading").removeClass("shown");
		popover.find(".content").addClass("shown");

		if (address) {
			popover.find("input[name=address]").val(address);
			popover.find("input").removeClass("hidden");
			popover.find(".button").removeClass("hidden");
		}
		else {
			popover.find("input").addClass("hidden");
			popover.find(".button").addClass("hidden");
			popover.find(".response").addClass("error");
			popover.find(".response").html(data.message);
		}
	}

	enableTarget(el) {
		el.removeClass("disabled");
	}

	enableButton(type) {
		$(`.button[data-action="${type}" i]`).removeClass("disabled");
	}

	handleSuccess(body) {
		switch (body.type) {
			case "ADDDOMAIN":
			case "ADDSLD":
				this.parent.changeDomain(body.id);
				this.parent.ws.send("DOMAINS");
				break;

			case "VERIFYDOMAIN":
				$(`.section#manageDomains .domain[data-id=${body.id}] .action[data-action=verifyDomain]`).remove();
				break;
		}
	}

	errorResponse(body) {
		if (!body.message) {
			body.message = "An unknown error occurred.";
		}

		switch (body.type) {
			case "PM":
			case "startConversation":
				$(".popover[data-name=newConversation] .response").html(body.message);
				break;

			case "ADDSLD":
			case "ADDDOMAIN":
				$(".section#addDomain .response").html(body.message);
				break;

			case "sendPayment":
				$(".popover[data-name=pay] .response").html(body.message);
				break;

			case "saveSettings":
				$(".popover[data-name=settings] .response").html(body.message);
				break;
		}
	}

	closeMenusIfNeeded() {
		$("#conversations").removeClass("showing");
		$("#users").removeClass("showing");
		$("body").removeClass("menu");
	}

	searchUsers(bool) {
		if (bool) {
			$("#users #count").addClass("hidden");
			$("#users .group.normal").addClass("hidden");
			$("#users .group.searching").addClass("shown");
			$("#users .group.searching input").focus();
		}
		else {
			$("#users .group.searching").removeClass("shown");
			$("#users .group.normal").removeClass("hidden");
			$("#users tr.user").removeClass("hidden");
			$("#users #count").removeClass("hidden");
			$("#users input[name=search]").val('');
		}
	}

	queryUsers(query) {
		let users = $("#users tr.user");

		$.each(users, (k, user) => {
			let match = Array.from(this.toUnicode($(user).data("name").toString())).slice(0, Array.from(query).length).join("").toLowerCase();
			let search = query.toLowerCase();

			if (match == search) {
				$(user).removeClass("hidden");
			}
			else {
				$(user).addClass("hidden");
			}
		});
	}

	showOrHideAttachments() {
		let attachments = $("#attachments");
		if (!attachments.find(".attachment").length) {
			attachments.removeClass("shown");
		}
		else {
			attachments.addClass("shown");
			this.fixScroll();
		}
	}

	setupNotifications() {
		if ('Notification' in window && navigator.serviceWorker) {
			if (!(Notification.permission === "granted" || Notification.permission === "blocked")) {
				Notification.requestPermission(e => {
					if (e === "granted") {
						if ('serviceWorker' in navigator) {
							navigator.serviceWorker.register('/sw.js', {
								scope: '/',
							});
						}
					}
				});
			} 
		}
	}

	sendNotification(title, body, conversation) {
		if ('Notification' in window && navigator.serviceWorker) {
			if (Notification.permission == 'granted') {
				navigator.serviceWorker.getRegistration().then(reg => {
					let sound = new Audio("/assets/sound/pop");
					sound.play();

					var options = {
						body: body,
						icon: '/assets/img/logo.png',
						vibrate: [100, 50, 100],
						data: {
							dateOfArrival: this.parent.time(),
							primaryKey: 1
						},
						conversation: conversation
					};

					var notification = new Notification(title, options);
					notification.onclick = () => {
						this.parent.changeConversation(conversation);
						window.focus();
					};
				});
			}
		}
	}

	stripHTML(string) {
		var div = document.createElement("div");
		div.innerHTML = string.replace("<div>", "\n");
		var text = div.textContent || div.innerText || "";
		return text.trim();
	}

	clearSelection() {
		if (window.getSelection) {
			window.getSelection().removeAllRanges();
		}
		else if (document.selection) {
			document.selection.empty();
		}
	}

	getBrowser() {
		var browser = (function() {
		    var test = function(regexp) {return regexp.test(window.navigator.userAgent)}
		    switch (true) {
		        case test(/edg/i): return "Microsoft Edge";
		        case test(/trident/i): return "Microsoft Internet Explorer";
		        case test(/firefox|fxios/i): return "Mozilla Firefox";
		        case test(/opr\//i): return "Opera";
		        case test(/ucbrowser/i): return "UC Browser";
		        case test(/samsungbrowser/i): return "Samsung Browser";
		        case test(/chrome|chromium|crios/i): return "Google Chrome";
		        case test(/safari/i): return "Apple Safari";
		        default: return "Other";
		    }
		})();

		return browser;
	};

	fixScroll() {
		switch (this.browser) {
			case "Apple Safari":
				let messageHolder = $("#messageHolder");
				let scrollTop = messageHolder[0].scrollTop;

				if (scrollTop >= 0) {
					messageHolder.scrollTop(-1);
					messageHolder.scrollTop(0);
				}
				break;
		}
	}

	scrollToMessage(id) {
		let messageHolder = $("#messageHolder");
		$(`.messageRow[data-id=${id}]`)[0].scrollIntoView({ behavior: 'smooth', block: 'start', inline: "nearest" });
	}

	highlightMessage(id) {
		$(`.messageRow[data-id=${id}]`).addClass("highlighted");
		setTimeout(() => {
			$(`.messageRow[data-id=${id}]`).removeClass("highlighted");
		}, 3000);
	}

	handleHash() {
		let hash = this.parent.hash;
		if (!hash) {
			return;
		}
		hash = hash.toLowerCase().trim();
		let split = hash.split(":");
		let action = split[0];
		let param = split[1];
		
		switch (action) {
			case "message":
				if (param) {
					let puny = `${this.toUnicode(param)}/`;
					$(`.popover[data-name=newConversation] input[name=domain]`).val(puny);
					this.popover("newConversation");
				}
				break;

			case "channel":
				let channel = this.parent.channelForName(param);
				if (channel) {
					this.parent.changeConversation(channel.id);
				}
				break;
		}

		localStorage.removeItem("hash");
	}

	tabComplete() {
		let prefix = "";
		let suffix = "";

		var text = $("#message").val();

		var options = [];
		if (text[0] === "/") {
			if (text.length > 1 && text[1] !== "/") {
				prefix = "/";
				suffix = " ";
				options = this.parent.commands;

				text = text.substring(1);

			}
		}
		else {
			return;
		}

		options.sort();

		let matches = options.filter(option => {
			option = String(option);

			if (option.length) {
				return option.substr(0, text.length).toLowerCase() == text.toLowerCase();
			}
			return;
		});

		if (matches.length) {
			$("#message").val(prefix+matches[0]+suffix);
		}
	}

	editProfile() {
		let menu = $(".contextMenu[data-name=userContext]");
		menu.addClass("editing");

		let bio = menu.find("div.bio");
		let bioText = this.sanitizeContentEditable(bio[0]);
		bio.html(he.encode(bioText));
		bio.attr("contenteditable", true);
		bio.focus();

		if (bioText.length) {
			this.setCaretPosition(bio, bioText.length);
		}

		this.updateBioLimit();
	}

	saveProfile() {
		let menu = $(".contextMenu[data-name=userContext]");
		menu.removeClass("editing");

		let bio = menu.find("div.bio");
		let bioText = this.sanitizeContentEditable(bio[0]);
		bio.html(he.encode(bioText));
		bio.attr("contenteditable", false);
		this.linkify(bio);

		let data = {
			bio: bioText
		}
		this.parent.ws.send(`SAVEPROFILE ${JSON.stringify(data)}`);
	}

	undoProfile() {
		let menu = $(".contextMenu[data-name=userContext].me.editing");
		if (menu.length) {
			menu.removeClass("editing");

			let bio = menu.find("div.bio");
			let id = menu.data("id");
			let user = this.parent.userForID(id);
			let bioText = user.bio;
			if (bioText) {
				bioText = he.encode(bioText);
			}
			bio.html(bioText);
			bio.attr("contenteditable", false);
			this.linkify(bio);
		}
	}

	updateBioLimit(e) {
		let menu = $(".contextMenu[data-name=userContext]");
		let bio = menu.find("div.bio").text();
		let save = menu.find(".action.save");
		let max = 140;

		let string = `${bio.length} / ${max}`;
		let limit = menu.find(".bioHolder .limit");
		limit.html(string);

		if (bio.length > max) {
			save.addClass("disabled");
			limit.addClass("error");
		}
		else {
			save.removeClass("disabled");
			limit.removeClass("error");
		}
	}

	sanitizeContentEditable(el) {
		let value = "";
		let newLine = true;

		let nodes = el.childNodes;

		if (nodes) {
		 	nodes.forEach(node => {
		 		if (node.nodeName === "BR") {
		 			value += "\n";
		 			newLine = true;
		 			return;
		 		}

		 		if (node.nodeName === "DIV" && newLine == false) {
		 			value += "\n";
		 		}

		 		newLine = false;

		 		if (node.nodeType === 3 && node.textContent) {
		 			value += node.textContent;
		 		}

		 		if (node.childNodes) {
			 		value += this.sanitizeContentEditable(node);
			 	}

		 	});
		 }

	 	return value.trim();
	}

	checkVersion(version) {
		if (!this.updateAvailable && this.version !== version) {
			this.updateAvailable = true;
			this.popover("update");
		}
	}

	newTab(e) {
		if (e && ((e.ctrlKey || e.metaKey) || e.button == 1)) {
			return true;
		}
		return false;
	}

	openURL(page, e=null) {
		if (e && (this.newTab(e) || e.newTab)) {
			window.open(page, "_blank");
		}
		else {
			window.location = page;
		}
	}

	avatar(type, id, domain, status=false) {
		let user = this.parent.userForID(id)
		let puny = this.toUnicode(domain);

		let active = "";
		if (user.active) {
			active = " active";
		}

		let statusHTML = "";
		if (status) {
			statusHTML = `<div class="status${active}"></div>`;
		}

		return `
			<${type} class="avatar">
				${statusHTML}
				<div class="favicon" data-id="${id}" data-domain="${domain}"></div>
				<div class="fallback">${this.avatarFallback(puny)}</div>
			</${type}>
		`;
	}

	changeMe(id) {
		let domain = this.parent.userForID(id).domain;
		let avatar = this.avatar("td", id, domain);
		$("#me").html(avatar);
	}

	chatDisplayMode(mode) {
		switch (mode) {
			case "compact":
				$("body").addClass("compact");
				break;

			default:
				$("body").removeClass("compact");
				break;
		}
	}

	isDesktop() {
		return !$(".header .icon.menu").is(":visible");
	}

	isCompact() {
		return $("body").hasClass("compact");
	}

	async scanQR() {
		let popover = $(".popover[data-name=qr]");
		let loading = popover.find(".loading");

		this.getCameraFeed($("#camera")).then(() => {
			loading.removeClass("shown");
			this.lookForQR().then((qr) => {
				this.openURL(qr);
			});
		});
	}

	async getCameraFeed(el, device) {
		return new Promise(resolve => {
			let videoEl = el[0];
			let config = { 
				video: { 
					facingMode: "environment"
				}
			};
			navigator.mediaDevices.getUserMedia(config).then(stream => {
				videoEl.srcObject = stream;
				videoEl.play();

				videoEl.addEventListener('loadedmetadata', function() {
					resolve();
				});
			});
		});
	}

	async lookForQR() {
		return new Promise(resolve => {
			let interval = setInterval(() => {
				let canvasElement = $("#frame")[0];
				let canvas = canvasElement.getContext("2d");
				let videoEl = $("#camera")[0];
				let height = $(videoEl).height() * 2;
				let width = $(videoEl).width() * 2;

				canvas.drawImage(videoEl, 0, 0, canvasElement.width, canvasElement.height);
		        var imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
		        var code = jsQR(imageData.data, imageData.width, imageData.height);

		        if (code) {
		          clearInterval(interval);
		          resolve(code.data);
		        }
			}, 100);
		});
	}

	async showVideoIfNeeded() {
		$("#videoContainer").removeClass("shown");
		$("#videoInfo .link").removeClass("shown");
		$("#videoInfo .users").empty();
		$("#videoInfo .watchers").empty();
		$("#videoInfo .watching").removeClass("shown");
		$("#videoInfo").removeClass("shown");

		if (!this.parent.isChannel(this.parent.conversation)) {
			return;
		}

		let channel = this.parent.channelForID(this.parent.conversation);
		let me = this.parent.userForID(this.parent.domain);
		let active = channel.video;
		let users = Object.keys(channel.videoUsers);
		let speakers = channel.videoSpeakers;
		let joined = users.includes(this.parent.domain);
		let watchers = channel.videoWatchers;
		let watching = channel.watching;

		if (active) {
			$("#videoInfo .title").addClass("shown");

			$.each(users, (k, u) => {
				let avatar = this.avatar("div", u, this.parent.userForID(u).domain);
				$("#videoInfo .users").append(avatar);
			});
			$.each(watchers, (k, u) => {
				if (!users.includes(u)) {
					let avatar = this.avatar("div", u, this.parent.userForID(u).domain);
					$("#videoInfo .watchers").append(avatar);
				}
			});

			if ($("#videoInfo .watchers .avatar").length) {
				$("#videoInfo .watching").addClass("shown");
			}

			this.updateAvatars();

			$("#videoInfo").addClass("shown");

			if (!watching) {
				$("#videoInfo .link[data-action=viewVideo]").addClass("shown");
			}
		}
		
		if (this.isAdmin(channel, me)) {
			$("#videoInfo").addClass("shown");

			if (active) {
				$("#videoInfo .link[data-action=startVideo]").removeClass("shown");
				$("#videoInfo .link[data-action=endVideo]").addClass("shown");

				if (!joined) {
					$("#videoInfo .link[data-action=joinVideo]").addClass("shown");
				}
			}
			else {
				$("#videoInfo .link[data-action=startVideo]").addClass("shown");
			}
		}
		else if (speakers.includes(me.id)) {
			$("#videoInfo").addClass("shown");
			if (!joined) {
				$("#videoInfo .link[data-action=joinVideo]").addClass("shown");
			}
		}

		let done = new Promise(resolve => {
			if (active) {
				if (joined || watching) {
					$("#videoInfo .link[data-action=leaveVideo]").addClass("shown");

					if (joined) {
						$("#videoInfo .link[data-action=viewVideo]").removeClass("shown");
					}
				}
			}
			else {
				$("#videoInfo .title").removeClass("shown");
			}

			if (!watching && !joined) {
				$("#videoContainer").removeClass("shown");
			}

			if (active && (joined || watching && users.length)) {
				if (!$("#videoContainer").hasClass("shown")) {
					$("#videoContainer").addClass("shown");
					this.parent.stream.init().then(() => {
						this.updateVideoUsers();
						resolve();
					});
				}
				else {
					this.updateVideoUsers();

					/*
					 * Janus may announce a publisher slightly before
					 * JOINVIDEO updates videoUsers. In that case the
					 * first announcement is intentionally ignored.
					 * Re-read the current Janus participant list now
					 * that ChatHNS knows the new speaker.
					 */
					if (
						this.parent.stream &&
						this.parent.stream.sfu
					) {
						this.parent.stream.publishers(
							this.parent.stream.sfu
						);
					}

					resolve();
				}
			}
			else {
				resolve();
			}
		});
		return await done;
	}

	muteAll() {
		this.setMute("toggleScreen", 1);
		this.setMute("toggleAudio", 1);
		this.setMute("toggleVideo", 1);
	}

	setMute(button, state) {
		if (state == 1) {
			$(`.controls .button[data-action=${button}]`).addClass("muted");
		}
		else if (state == 0) {
			$(`.controls .button[data-action=${button}]`).removeClass("muted");
		}
		else {
			$(`.controls .button[data-action=${button}]`).toggleClass("muted");
		}
	}

	updateVideoUsers() {
		let users = this.parent.currentVideoUsers();

		$.each(Object.keys(users), (k, u) => {
			this.parent.stream.addCam(u);

			let info = users[u];
			if (info.video) {
				$(`.cam[data-id=${u}]`).removeClass("videoMuted");
			}
			else {
				$(`.cam[data-id=${u}]`).addClass("videoMuted");
			}

			if (info.audio) {
				$(`.cam[data-id=${u}]`).removeClass("audioMuted");
			}
			else {
				$(`.cam[data-id=${u}]`).addClass("audioMuted");
			}

		});

		$.each($(".cam"), (k, c) => {
			let id = $(c).data("id");
			if (!Object.keys(users).includes(id)) {
				this.parent.stream.removeCam(id);
			}
		});

		if (Object.keys(users).includes(this.parent.domain)) {
			$("#videoContainer").addClass("publishing");
		}
		else {
			$("#videoContainer").removeClass("publishing");
		}

		this.parent.stream.dish.resize();
		this.parent.stream.dish.resize();
		this.parent.stream.dish.resize();
	}
}

/* HNS profile wallet values: click to copy */
$(document).on("click", ".hnsProfileValue", function(e) {
	e.preventDefault();
	e.stopPropagation();

	const item = $(this);
	const value = String(item.attr("data-value") || "");

	if (!value) {
		return;
	}

	navigator.clipboard.writeText(value).then(() => {
		if (!item.data("original-label")) {
			item.data("original-label", item.text());
		}

		const original = item.data("original-label");

		item.text("✓");

		setTimeout(() => {
			item.text(original);
		}, 1000);
	}).catch(error => {
		console.error("Wallet copy:", error);
	});
});
