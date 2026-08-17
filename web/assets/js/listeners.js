let { punycode } = await import(`./punycode.js?r=${revision}`);
export class listeners {
	constructor(app) {
		this.gifTimer;
		this.lastGifSearch = 0;

		this.longPress = 0;
		this.longPressTimer;

		$(window).on("focus", e => {
			app.isActive = true;
			app.ui.markUnread(app.conversation, false);
		});

		$(document).on("mouseenter", e => {
		    app.isActive = true;
		    app.ui.markUnread(app.conversation, false);
		});

		$(window).on("blur", e => {
			app.isActive = false;
		});

		$(document).on("mouseleave", e => {
		    app.isActive = false;
		});

		$(document).on("keydown", e => {
			let keyTarget = $(e.target);

			/*
			 * Group member search handles its own keyboard input.
			 * Do not redirect Enter or typed characters to chat input.
			 */
			if (
				keyTarget.closest('.popover[data-name="groupSettings"]').length &&
				keyTarget.attr("name") === "groupMemberSearch"
			) {
				return;
			}

			if (app.isKey(e, 27)) {
				e.preventDefault();
				
				if (app.ui.undoProfileIfNeeded()) {
					return;
				}

				if (app.ui.removeReplyingIfNeeded()) {
					return;
				}

				if (app.ui.removePopoverIfNeeded()) {
					return;
				}
			}

			app.ui.preventTabIfNeeded(e);
			app.ui.focusInputIfNeeded(e);
		});

		$("html").on("click", "#blackout", (e) => {
			if (!this.longPress) {
				app.ui.close();
			}
		});

		$("html").on("click", "#closeMenu", () => {
			app.ui.closeMenusIfNeeded();
		});

		$("html").on("click", "#conversations .tabs .tab", e => {
			app.tab = $(e.target).data("tab");
			app.ui.setConversationTab();
		});

		$("html").on("change", ".header .domains select", e => {
			app.typing = false;

			let domain = $(e.target).val();

			if (domain == "manageDomains") {
				app.ui.openURL("/id");
			}
			else {
				app.changeDomain(domain);
			}
		});

		$("html").on("click", "#conversations tr", e => {
			app.typing = false;

			let row = e.target.closest("tr");
			let conversation = $(row).data("id");
			
			if (conversation == app.conversation || app.loadingMessages) {
				app.ui.closeMenusIfNeeded();
				return;
			}

			app.changeConversation(conversation);
			localStorage.setItem("conversation", conversation);
		});

		$("#messageHolder").on("scroll", e => {
			this.longPress = 0;
			clearTimeout(this.longPressTimer);

			let messageHolder = $(e.target);
			if (app.loadingMessages) {
				return;
			}

			let height = messageHolder.outerHeight();
			let scrollTop = messageHolder[0].scrollTop;
			let scrollHeight = messageHolder[0].scrollHeight - messageHolder.height();

			if ((scrollHeight - height) == 0) {
				return;
			}

			let calc = Math.floor(scrollHeight + scrollTop);
			if (calc <= 1) {
				let firstMessage = $("#messages > .messageRow[data-id]").first();
				let firstMessageID = firstMessage.data("id");
				if (firstMessageID) {
					let options = {
						before: firstMessageID
					}
					app.getMessages(options);
				}
			}
			else if (calc == scrollHeight) {
				app.ui.fetchNewMessages();
			}
		});

		$("html").on("keydown", "textarea#message", e => {
			let target = $(e.target);

			let key = app.key(e);

			if ($("#completions.shown").length) {
				switch (key) {
					case 38:
					case 40:
						e.preventDefault();
						break;

					case 9:
					case 13:
						e.preventDefault();
						$("#completions tr.active").click();
						return;
				}
			}

			switch (key) {
				case 9:
					app.ui.tabComplete();
					break;
					
				case 38:
				case 40:
				case 27:
					return;
			}

			if (target.val() && target.val()[0] !== "/" && e.key.length == 1) {
				app.lastTyped = app.time();
			}

			if (app.isKey(e, 13) && !e.shiftKey) {
				e.preventDefault();

				let data;
				let attachments = $("#attachments .attachment");
				if (attachments.find(".uploading").length) {
					return;
				}

				$.each(attachments, (k, attachment) => {
					let id = $(attachment).data("id");
					data = {
						hnschat: 1,
						attachment: id,
							attachmentType: $(attachment).data("type") || "image"
					};
					app.sendMessage(app.conversation, JSON.stringify(data));
				});

				let value = target.val().trim();
				app.ui.clear("input");
				$("#attachments").empty();
				app.ui.showOrHideAttachments();

				let replaced = app.replaceCompletions(value);
				if (replaced.length) {
					if (replaced[0] == "/") {
						replaced = replaced.substring(1);
						let split = replaced.split(" ");
						let command = split.shift();
						let rest = split.join(" ");

						switch (command) {
							case "me":
								data = {
									hnschat: 1,
									localCommand: true,
									action: rest
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							case "help":
								data = {
									hnschat: 1,
									message: "/help"
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							case "dice":
								data = {
									hnschat: 1,
									localCommand: true,
									message: ["⚀","⚁","⚂","⚃","⚄","⚅"][Math.floor(Math.random() * 6)]
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							case "shrug":
								data = {
									hnschat: 1,
									localCommand: true,
									message: "¯\\_(ツ)_/¯"
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							case "fancy":
								data = {
									hnschat: 1,
									localCommand: true,
									message: rest,
									style: command
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							case "confetti":
								data = {
									hnschat: 1,
									localCommand: true,
									message: rest,
									effect: command
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							case "slap":
								data = {
									hnschat: 1,
									localCommand: true,
									action: `slaps ${rest} around a bit with a large trout`
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;

							default:
								data = {
									hnschat: 1,
									message: "/" + replaced
								};
								app.sendMessage(app.conversation, JSON.stringify(data));
								break;
						}
					}
					else {
						data = {
							hnschat: 1,
							message: replaced
						};
						app.sendMessage(app.conversation, JSON.stringify(data));
					}
				}
			}

			app.ui.sizeInput();
		});

		$("html").on("input paste keyup focus click", "textarea#message", e => {
			let key = app.key(e);

			switch (key) {
				case 13:
					return;

				case 27:
					app.ui.close();
					return;

				case 38:
				case 40:
					e.preventDefault();
					app.ui.updateSelectedCompletion(key);
					return;
			}

			switch (key) {
				case 16:
				case 17:
				case 18:
				case 20:
				case 91:
				case 93:
					break;

				default:
					app.ui.updateCompletions();
					break;
			}
			
			app.ui.sizeInput();
		});

		$("html").on("click", "#completions tr", e => {
			let target = $(e.target).closest("tr");

			$("#completions tr").removeClass("active");
			target.addClass("active");

			let completion = target.find(".title").html();

			if (target.hasClass("command")) {
				// Command rows already contain the leading slash.
				completion = `${completion} `;
			}
			else if (target.hasClass("user")) {
				completion = `@${completion}/`;
			}
			else {
				completion = `#${completion}`;
			}

			let input = $("textarea#message");
			let text = input.val();
			let words = text.split(" ");
			let position = input[0].selectionStart;
			let word = app.ui.wordForPosition(text, position);
			let before = words[word];
			words[word] = `${completion} `;

			let newPosition = 0;
			for (let i = 0; i < words.length; i++) {
				newPosition += words[i].length;

				if (i == word) {
					newPosition += i;
					break;
				}
			}

			let replaced = words.join(" ");
			input.val(replaced);
			app.ui.setCaretPosition(input[0], newPosition);
			app.ui.close();
		});

		$("html").on("click", ".action, .button, .link", e => {
			let target = $(e.target);

			if ($("body").hasClass("touching")) {
				return;
			}

			target.parent().find(".response").html('');
			target.parent().parent().find(".response").html('');

			if (target.hasClass("disabled")) {
				return;
			}
			target.addClass("disabled");

			let action = target.data("action");

			var sender,context;
			var data;
			var id,domain,sld,tld,message,name;

			switch (action) {
				case "scanQR":
					app.ui.scanQR();
					app.ui.popover("qr");
					app.ui.enableTarget(target);
					break;

				case "reply":
					context = target.closest(".contextMenu");
					if (context.length) {
						app.replying = {
							message: context.data("id"),
							sender: context.data("sender"),
						}
					}
					else {
						app.replying = {
							message: target.closest(".messageRow").data("id"),
							sender: target.closest(".messageRow").data("sender"),
						}
					}

					app.ui.close();
					app.ui.updateReplying();
					$(".input #message").focus();
					app.ui.enableTarget(target);
					break;

				case "removeReply":
					app.replying = null;
					app.ui.updateReplying();
					app.ui.enableTarget(target);
					break;

				case "donate":
				case "syncSession":
					app.ui.popover(action);
					app.ui.enableTarget(target);
					break;

				case "replayEffect":
					app.ui.handleEffect(target.data("effect")).then(() => {
						app.ui.enableTarget(target);
					});
					break;

				case "settings":
					$(".popover[data-name=settings] input[name=bubbleBackground]").val(app.ui.css.getPropertyValue("--bubbleBackground").trim());
					$(".popover[data-name=settings] input[name=bubbleSelfBackground]").val(app.ui.css.getPropertyValue("--bubbleSelfBackground").trim());
					$(".popover[data-name=settings] input[name=bubbleMentionBackground]").val(app.ui.css.getPropertyValue("--bubbleMentionBackground").trim());
					if (app.settings.chatDisplayMode) {
						$(".popover[data-name=settings] select[name=chatDisplayMode]").val(app.settings.chatDisplayMode);
					}
					app.ui.popover(action);
					app.ui.enableTarget(target);
					break;

				case "docs":
					app.ui.openURL("https://info.chathns.com", { newTab: true });
					app.ui.enableTarget(target);
					break;

				case "poll":
					{
						let popover = $(".popover[data-name=poll]");
						popover.find(".response").text("");
						popover.find('[data-action="createPoll"]').removeClass("disabled");
						app.ui.popover("poll");
						app.ui.enableTarget(target);
					}
					break;

				case "pay":
					{
						let recipient = app.otherUserFromPM(app.conversation);
						let popover = $(".popover[data-name=pay]");

						popover.find(".loading").addClass("shown");
						popover.find(".content").removeClass("shown");
						popover.find(".response").text("").removeClass("error");
						popover.find("input[name=address]").val("");
						popover.find("input[name=hns]").val("");

						app.ui.popover(action);
						app.ui.enableTarget(target);

						if (!recipient || !recipient.domain) {
							app.ui.paymentResponse({
								message: "This user isn't currently accepting payments."
							});
							break;
						}

						/*
						 * Real HNS TLD:
						 * wallet comes from the HNS Profile Record Standard.
						 *
						 * Current: wal.hns=hs1...
						 * Legacy:  wallet.hns=hs1...
						 *
						 * Both are normalized by fetchHNSProfile().
						 */
						if (!recipient.domain.includes(".")) {
							app.api({
								action: "getHNSProfile",
								domain: recipient.domain
							}).then(r => {
								let address =
									r &&
									r.profile &&
									typeof r.profile.hns === "string"
										? r.profile.hns.trim()
										: "";

								if (/^hs1[a-z0-9]+$/i.test(address)) {
									app.ui.paymentResponse({
										address: address
									});
								}
								else {
									app.ui.paymentResponse({
										message: "This user isn't currently accepting payments."
									});
								}
							}).catch(() => {
								app.ui.paymentResponse({
									message: "Could not read the HNS wallet."
								});
							});

							break;
						}

						/*
						 * Internal / SLD account:
						 * retain the existing locally stored wallet path.
						 */
						app.ws.send(`GETADDRESS ${recipient.id}`);
					}
					break;

				case "sendPayment":
					let address = target.parent().find("input[name=address]").val();
					let amount = target.parent().find("input[name=hns]").val().replace(/[^0-9.]/g, '');
					app.sendPayment(address, amount).then(r => {
						if (r.message) {
							let data = {
								type: action,
								message: `Error: ${r.message}`
							}
							app.ui.errorResponse(data);
						}
						else if (r.hash) {
							let data = {
								hnschat: 1,
								payment: r.hash,
								amount: amount
							}
							app.sendMessage(app.conversation, JSON.stringify(data));
							app.ui.close();
						}
						app.ui.enableTarget(target);
					});
					break;

				case "showFoundGroup":
					{
						let popover = target.closest(".popover");
						popover.find(".groupMainMenu").addClass("hidden");
						popover.find(".groupFoundSection").removeClass("hidden");
						popover.find(".groupManageSection").addClass("hidden");
						popover.find(".groupAccountsSection").addClass("hidden");
						popover.find(".groupRandomSection").addClass("hidden");
						app.ui.enableTarget(target);
					}
					break;

				case "showManageGroup":
					{
						let popover = target.closest(".popover");
						popover.find(".groupMainMenu").addClass("hidden");
						popover.find(".groupFoundSection").addClass("hidden");
						popover.find(".groupManageSection").removeClass("hidden");
						popover.find(".groupAccountsSection").addClass("hidden");
						popover.find(".groupRandomSection").addClass("hidden");
						app.ui.enableTarget(target);
					}
					break;

				case "showCreateChatHNSAccount":
					{
						let popover = target.closest(".popover");

						popover.find(".accountCreateForm").removeClass("hidden");
						popover.find(".accountCreateResponse").text("");
						popover.find('input[name="managedAccountUsername"]').focus();

						app.ui.enableTarget(target);
					}
					break;

				case "cancelCreateChatHNSAccount":
					{
						let popover = target.closest(".popover");

						popover.find(".accountCreateForm").addClass("hidden");
						popover.find('input[name="managedAccountUsername"]').val("");
						popover.find('input[name="managedAccountPassword"]').val("");
						popover.find('input[name="managedAccountAdmin"]').prop("checked", false);
						popover.find(".accountCreateResponse").text("");

						app.ui.enableTarget(target);
					}
					break;

				case "createChatHNSAccount":
					{
						let popover = target.closest(".popover");

						let username = String(
							popover.find('input[name="managedAccountUsername"]').val() || ""
						).trim().toLowerCase();

						let password = String(
							popover.find('input[name="managedAccountPassword"]').val() || ""
						);

						let admin = popover
							.find('input[name="managedAccountAdmin"]')
							.is(":checked");

						let response = popover.find(".accountCreateResponse");
						response.text("");

						if (!/^(?:[a-z0-9][a-z0-9-]{0,61}[a-z0-9]|[a-z0-9])$/.test(username)) {
							response.text("Username may contain letters, numbers and hyphens only.");
							app.ui.enableTarget(target);
							break;
						}

						if (password.length < 8) {
							response.text("Password must be at least 8 characters.");
							app.ui.enableTarget(target);
							break;
						}

						app.api({
							action: "adminCreateChatHNSAccount",
							domain: app.domain,
							session: app.session,
							username: username,
							password: password,
							admin: admin
						}).then(r => {
							if (!r || r.error || r.success === false) {
								response.text(
									(r && (r.message || r.error))
										? (r.message || r.error)
										: "Could not create account."
								);

								app.ui.enableTarget(target);
								return;
							}

							alert(
								`Created ${r.name}` +
								(r.admin ? " as Global Admin." : ".")
							);

							popover.find(".accountCreateForm").addClass("hidden");
							popover.find('input[name="managedAccountUsername"]').val("");
							popover.find('input[name="managedAccountPassword"]').val("");
							popover.find('input[name="managedAccountAdmin"]').prop("checked", false);

							/*
							 * Refresh identities/users via the existing websocket.
							 * A page reload is not required for creation itself.
							 */
							app.ws.send("DOMAINS");

							app.ui.enableTarget(target);
						}).catch(() => {
							response.text("Could not create account.");
							app.ui.enableTarget(target);
						});
					}
					break;

				case "cancelEditChatHNSAccount":
					{
						let popover = target.closest(".popover");

						popover.find(".accountEditForm").addClass("hidden");
						popover.find('input[name="managedEditDomain"]').val("");
						popover.find('input[name="managedEditPassword"]').val("");
						popover.find('input[name="managedEditAdmin"]').prop("checked", false);
						popover.find(".accountEditResponse").text("");

						app.ui.enableTarget(target);
					}
					break;

				case "saveChatHNSAccount":
					{
						let popover = target.closest(".popover");

						let domain = String(
							popover.find('input[name="managedEditDomain"]').val() || ""
						).trim().toLowerCase();

						let password = String(
							popover.find('input[name="managedEditPassword"]').val() || ""
						);

						let admin = popover
							.find('input[name="managedEditAdmin"]')
							.is(":checked");

						let response = popover.find(".accountEditResponse");
						response.text("");

						if (!domain.endsWith(".chathns")) {
							response.text("Invalid .chathns account.");
							app.ui.enableTarget(target);
							break;
						}

						if (password.length > 0 && password.length < 8) {
							response.text("Password must be at least 8 characters.");
							app.ui.enableTarget(target);
							break;
						}

						app.api({
							action: "adminUpdateChatHNSAccount",
							domain: app.domain,
							session: app.session,
							account: domain,
							password: password,
							admin: admin
						}).then(r => {
							if (!r || r.error || r.success === false) {
								response.text(
									(r && (r.message || r.error))
										? (r.message || r.error)
										: "Could not update account."
								);

								app.ui.enableTarget(target);
								return;
							}

							alert(`Updated ${domain}.`);

							/*
							 * Reload guarantees that admin status, labels
							 * and account list all use the new DB state.
							 */
							window.location.reload();
						}).catch(() => {
							response.text("Could not update account.");
							app.ui.enableTarget(target);
						});
					}
					break;

				case "cancelHandshakeUserExpiry":
					{
						let popover = target.closest(".popover");

						popover.find(".accountExpiryForm").addClass("hidden");
						popover.find('input[name="managedExpiryDomain"]').val("");
						popover.find('select[name="managedExpiryDays"]').val("");
						popover.find(".accountExpiryResponse").text("");

						app.ui.enableTarget(target);
					}
					break;

				case "saveHandshakeUserExpiry":
					{
						let popover = target.closest(".popover");

						let domain = String(
							popover.find('input[name="managedExpiryDomain"]').val() || ""
						).trim().toLowerCase();

						let days = String(
							popover.find('select[name="managedExpiryDays"]').val() || ""
						);

						let response = popover.find(".accountExpiryResponse");
						response.text("");

						if (!days) {
							response.text("Choose an expiry.");
							app.ui.enableTarget(target);
							break;
						}

						app.api({
							action: "adminSetHandshakeUserExpiry",
							domain: app.domain,
							session: app.session,
							account: domain,
							days: days
						}).then(r => {
							if (!r || r.error || r.success === false) {
								response.text(
									(r && (r.message || r.error))
										? (r.message || r.error)
										: "Could not update expiry."
								);

								app.ui.enableTarget(target);
								return;
							}

							let label = days === "infinite"
								? "∞"
								: `${days} days`;

							alert(`Expiry for ${domain}: ${label}`);

							popover.find(".accountExpiryForm").addClass("hidden");
							app.ui.enableTarget(target);
						}).catch(() => {
							response.text("Could not update expiry.");
							app.ui.enableTarget(target);
						});
					}
					break;

				case "showAccounts":
					{
						let me = app.userForID(app.domain);

						if (!me || Number(me.admin) !== 1) {
							app.ui.enableTarget(target);
							break;
						}

						let popover = target.closest(".popover");

						popover.find(".groupMainMenu").addClass("hidden");
						popover.find(".groupFoundSection").addClass("hidden");
						popover.find(".groupManageSection").addClass("hidden");
						popover.find(".groupAccountsSection").removeClass("hidden");
						popover.find(".groupRandomSection").addClass("hidden");

						let classifyAccount = user => {
							let domain = String(user.domain || "").toLowerCase();

							if (domain.endsWith(".handshakeuser")) {
								return {
									key: "handshakeuser",
									label: ".handshakeuser"
								};
							}

							if (domain.endsWith(".chathns")) {
								return {
									key: "chathns",
									label: ".chathns"
								};
							}

							if (!domain.includes(".")) {
								return {
									key: "official",
									label: ".official✅"
								};
							}

							return {
								key: "other",
								label: "Other"
							};
						};

						let accountDate = value => {
							if (!value) return "—";

							let date;

							if (/^[0-9]+$/.test(String(value))) {
								let n = Number(value);

								if (n < 1000000000000) {
									n *= 1000;
								}

								date = new Date(n);
							}
							else {
								date = new Date(value);
							}

							if (isNaN(date.getTime())) {
								return String(value);
							}

							return date.toLocaleDateString();
						};

						let renderAccounts = () => {
							let query = String(
								popover.find('input[name="accountSearch"]').val() || ""
							).trim().toLowerCase();

							let type = String(
								popover.find('select[name="accountType"]').val() || "all"
							);

							let statusFilter = String(
								popover.find('select[name="accountStatus"]').val() || "active"
							);

							let sort = String(
								popover.find('select[name="accountSort"]').val() || "name"
							);

							let rootAdmin = String(
								popover.find(".groupAccountsSection").attr("data-root-admin") ||
								""
							).trim().toLowerCase();

							let users = Array.isArray(app.users)
								? app.users.slice()
								: [];

							users = users.filter(user => {
								let kind = classifyAccount(user);

								if (type !== "all" && kind.key !== type) {
									return false;
								}

								if (
									statusFilter === "active" &&
									(Number(user.locked) === 1 || Number(user.deleted) === 1)
								) {
									return false;
								}

								if (
									statusFilter === "locked" &&
									Number(user.locked) !== 1
								) {
									return false;
								}

								if (
									query &&
									!String(user.domain || "")
										.toLowerCase()
										.includes(query)
								) {
									return false;
								}

								return true;
							});

							let statusFor = user => {
								if (Number(user.deleted) === 1) return "Deleted";
								if (Number(user.locked) === 1) return "Locked";
								if (Number(user.admin) === 1) return "Admin";
								return "Active";
							};

							let createdValue = user => {
								let value = user.created;

								if (!value) return 0;

								if (/^[0-9]+$/.test(String(value))) {
									let n = Number(value);
									return n < 1000000000000 ? n * 1000 : n;
								}

								let d = new Date(value);
								return isNaN(d.getTime()) ? 0 : d.getTime();
							};

							users.sort((a, b) => {
								if (sort === "created") {
									return createdValue(b) - createdValue(a);
								}

								if (sort === "status") {
									let sa = statusFor(a);
									let sb = statusFor(b);

									let cmp = sa.localeCompare(sb);
									if (cmp !== 0) return cmp;
								}

								return String(a.domain || "")
									.localeCompare(
										String(b.domain || ""),
										undefined,
										{
											numeric: true,
											sensitivity: "base"
										}
									);
							});

							let holder = popover.find(".accountList");
							holder.empty();

							holder.append(
								$("<div>")
									.addClass("accountSummary")
									.text(
										`${users.length} account${users.length === 1 ? "" : "s"}`
									)
							);

							if (!users.length) {
								holder.append(
									$("<div>")
										.addClass("accountEmpty")
										.text("No accounts found.")
								);
								return;
							}

							users.forEach(user => {
								let kind = classifyAccount(user);
								let status = statusFor(user);

								let row = $("<div>")
									.addClass("accountRow")
									.attr("data-domain", user.domain || "")
									.attr("data-kind", kind.key);

								let main = $("<div>").addClass("accountMain");

								main.append(
									$("<div>")
										.addClass("accountName")
										.text(user.domain || "—")
								);

								let meta = `${app.ui.tenDate(Number(user.created))}`;



								if (kind.key === "handshakeuser") {


									if (


										user.expires_at === null ||


										user.expires_at === undefined ||


										user.expires_at === ""


									) {


										meta += " · ∞";


									}


									else {


										let expires = Number(user.expires_at);



										if (expires) {


											meta += " · " +


												app.ui.tenDate(expires);


										}


									}


								}



								main.append(


									$("<div>")


									.addClass("accountMeta")


									.text(meta)


								);

								let right = $("<div>").addClass("accountRight");

								right.append(
									$("<div>")
										.addClass(
											"accountStatus accountStatus" +
											status.replace(/[^A-Za-z]/g, "")
										)
										.text(status)
								);

								let actions = $("<div>").addClass("accountActions");

								if (kind.key === "official") {
									actions.append(
										$("<button>")
											.attr("type", "button")
											.addClass("accountAction")
											.attr("data-account-action", "manageOfficial")
											.attr("data-domain", user.domain || "")
											.text("Manage")
									);
								}
								else if (kind.key === "handshakeuser") {
									actions.append(
										$("<button>")
											.attr("type", "button")
											.addClass("accountAction")
											.attr("data-account-action", "expiry")
											.attr("data-domain", user.domain || "")
											.text("Expiry")
									);

									actions.append(
										$("<button>")
											.attr("type", "button")
											.addClass("accountAction destructive")
											.attr("data-account-action", "deleteAccount")
											.attr("data-domain", user.domain || "")
											.text("Delete")
									);
								}
								else if (kind.key === "chathns") {
									let isRootAdmin =
										String(user.domain || "").toLowerCase() === rootAdmin;

									let isGlobalAdminAccount =
										Number(user.admin) === 1;

									let isCurrentAccount =
										String(user.id) === String(app.domain);

									if (isRootAdmin) {
										actions.append(
											$("<span>")
												.addClass("accountProtected")
												.text("Protected")
										);
									}
									else {
										actions.append(
											$("<button>")
												.attr("type", "button")
												.addClass("accountAction")
												.attr("data-account-action", "editAccount")
												.attr("data-domain", user.domain || "")
												.text("Edit")
										);

										if (!isGlobalAdminAccount && !isCurrentAccount) {
											actions.append(
												$("<button>")
													.attr("type", "button")
													.addClass("accountAction destructive")
													.attr("data-account-action", "deleteAccount")
													.attr("data-domain", user.domain || "")
													.text("Delete")
											);
										}
										else {
											actions.append(
												$("<span>")
													.addClass("accountProtected")
													.text("Protected")
											);
										}
									}
								}

								right.append(actions);

								row.append(main);
								row.append(right);

								holder.append(row);
							});
						};


						popover
							.off("input.accounts", 'input[name="accountSearch"]')
							.on(
								"input.accounts",
								'input[name="accountSearch"]',
								renderAccounts
							);

						popover
							.off("change.accounts", 'select[name="accountType"]')
							.on(
								"change.accounts",
								'select[name="accountType"]',
								renderAccounts
							);

						popover
							.off("change.accountStatus", 'select[name="accountStatus"]')
							.on(
								"change.accountStatus",
								'select[name="accountStatus"]',
								renderAccounts
							);

						popover
							.off("change.accountSort", 'select[name="accountSort"]')
							.on(
								"change.accountSort",
								'select[name="accountSort"]',
								renderAccounts
							);

						popover
							.off("click.accountActions", "[data-account-action]")
							.on(
								"click.accountActions",
								"[data-account-action]",
								function() {
									let button = $(this);
									let action = button.data("account-action");
									let domain = button.data("domain");

									if (action === "manageOfficial") {
										alert(`Manage ${domain} follows next.`);
										return;
									}

									if (action === "expiry") {
										popover.find(".accountEditForm").addClass("hidden");
										popover.find(".accountCreateForm").addClass("hidden");
										popover.find(".accountExpiryForm").removeClass("hidden");

										popover.find(".accountExpiryTitle")
											.text(`Expiry ${domain}`);

										popover.find('input[name="managedExpiryDomain"]')
											.val(domain);

										let expiryUser = (app.users || []).find(u => {
											return String(u.domain || "").toLowerCase() ===
												String(domain || "").toLowerCase();
										});

										let expirySelect =
											popover.find('select[name="managedExpiryDays"]');

										if (
											expiryUser &&
											(
												expiryUser.expires_at === null ||
												expiryUser.expires_at === undefined ||
												expiryUser.expires_at === ""
											)
										) {
											expirySelect.val("infinite");
										}
										else if (expiryUser && Number(expiryUser.expires_at)) {
											let now = Math.floor(Date.now() / 1000);
											let daysLeft = Math.ceil(
												(Number(expiryUser.expires_at) - now) / 86400
											);

											if (daysLeft <= 7) {
												expirySelect.val("7");
											}
											else if (daysLeft <= 30) {
												expirySelect.val("30");
											}
											else if (daysLeft <= 90) {
												expirySelect.val("90");
											}
											else if (daysLeft <= 180) {
												expirySelect.val("180");
											}
											else {
												expirySelect.val("");
											}
										}
										else {
											expirySelect.val("");
										}

										popover.find(".accountExpiryResponse")
											.text("");

										return;
									}

									if (action === "editAccount") {
										let user = (app.users || []).find(u => {
											return String(u.domain || "").toLowerCase() ===
												String(domain || "").toLowerCase();
										});

										popover.find(".accountEditForm").removeClass("hidden");
										popover.find(".accountEditTitle").text(`Edit ${domain}`);
										popover.find('input[name="managedEditDomain"]').val(domain);
										popover.find('input[name="managedEditPassword"]').val("");
										popover.find('input[name="managedEditAdmin"]')
											.prop("checked", Boolean(user && Number(user.admin) === 1));
										popover.find(".accountEditResponse").text("");

										popover.find('input[name="managedEditPassword"]').focus();
										return;
									}

									if (action === "deleteAccount") {
										let confirmed = confirm(
											`Delete ${domain}?\n\n` +
											`The account will be disabled and marked deleted. ` +
											`Historical messages remain.`
										);

										if (!confirmed) {
											return;
										}

										button.prop("disabled", true);

										app.api({
											action: "adminDeleteAccount",
											domain: app.domain,
											session: app.session,
											account: domain
										}).then(r => {
											if (!r || r.error || r.success === false) {
												alert(
													(r && (r.message || r.error))
														? (r.message || r.error)
														: "Could not delete account."
												);

												button.prop("disabled", false);
												return;
											}

											alert(`Deleted ${domain}.`);

											/*
											 * Reload account/domain state so the
											 * Active/Locked/All filters immediately
											 * use the new database state.
											 */
											window.location.reload();
										}).catch(() => {
											alert("Could not delete account.");
											button.prop("disabled", false);
										});

										return;
									}
								}
							);

						renderAccounts();

						app.ui.enableTarget(target);
					}
					break;

				
				case "showRandomStuffTexts":
					{
						let popover = target.closest(".popover");
						popover.find(".groupMainMenu").addClass("hidden");
						popover.find(".groupFoundSection").addClass("hidden");
						popover.find(".groupManageSection").addClass("hidden");
						popover.find(".groupAccountsSection").addClass("hidden");
						popover.find(".groupRandomSection").removeClass("hidden");

						fetch("/etc/random-stuff.json?ts=" + Date.now())
							.then(r => r.json())
							.then(data => {
								popover.find('textarea[name="randomStuffTexts"]').val(
									JSON.stringify(data, null, 2)
								);
							})
							.catch(() => {
								popover.find('textarea[name="randomStuffTexts"]').val(
									"Could not load random-stuff.json"
								);
							});

						app.ui.enableTarget(target);
					}
					break;

				case "createGroup":
					{
						let popover = target.closest(".popover");
						let name = popover.find('input[name="groupName"]').val().trim();
						let visibility = popover.find('select[name="groupVisibility"]').val();
						let mode = popover.find('select[name="groupMode"]').val();
						let access = popover.find('select[name="groupAccess"]').val();
						let memberType = access === "rule" ? "rule" : "manual";
						let memberSource = access === "rule"
							? popover.find('select[name="groupRule"]').val()
							: null;

						if (!name) {
							popover.find(".response").text("A group name is required.");
							app.ui.enableTarget(target);
							break;
						}

						let groupURL = popover.find('input[name="groupURL"]').val().trim();

						let data = {
							name: name,
							label: popover.find('input[name="groupLabel"]').val().trim(),
							url: groupURL,
							access: access,
							public: visibility === "public",
							hidden: visibility === "hidden",
							mode: mode,
							membertype: memberType,
							membersource: memberSource
						};

						if (access === "members") {
							let raw = popover.find('textarea[name="groupMembers"]').val().trim();
							let members = [];

							if (raw) {
								try {
									let parsed = JSON.parse(raw);

									if (!Array.isArray(parsed)) {
										throw new Error();
									}

									members = parsed;
								}
								catch {
									members = raw
										.split(/[\n,]+/)
										.map(v => v.trim())
										.filter(Boolean);
								}
							}

							data.members = [...new Set(
								members
									.map(v => {
										v = String(v).trim();
										try {
											return app.ui.toASCII(v).toLowerCase();
										}
										catch {
											return v.toLowerCase();
										}
									})
									.filter(Boolean)
							)].sort((a, b) => a.localeCompare(b));
						}

						app.ws.send(`CREATECHANNEL ${JSON.stringify(data)}`);
						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "manageSelectedGroup":
					{
						let popover = target.closest(".popover");
						let id = popover.find('select[name="manageGroup"]').val();
						let channel = app.channelForID(id);

						if (channel) {
							let settings = $(".popover[data-name=groupSettings]");

							settings.find('input[name="groupID"]').val(channel.id);
							settings.find(".groupSettingsName").text(`#${channel.name}`);

							let visibility = Number(channel.hidden) === 1
								? "hidden"
								: (Number(channel.public) === 1 ? "public" : "private");

							settings.find('select[name="groupVisibility"]').val(visibility);
							settings.find('select[name="groupMode"]').val(
								Number(channel.adminonly) === 1 ? "channel" : "group"
							);

							let members = [];
							try {
								members = Array.isArray(channel.members)
									? channel.members
									: JSON.parse(channel.members || "[]");
							}
							catch {}

							settings.find('input[name="groupMembers"]').val(members.join(", "));
							app.ui.prepareGroupSettings(settings, channel);

							app.ui.close();
							app.ui.popover("groupSettings");
						}

						app.ui.enableTarget(target);
					}
					break;

				case "newConversation":
					if (!app.userForID(app.domain).locked) {
						let me = app.userForID(app.domain);
						let activeTab = $("#conversations .tabs .tab.active").data("tab");

						if (activeTab === "channels" && me) {
							let isGlobalAdmin = Number(me.admin) === 1;

							let ownedGroups = (app.channels || []).filter(channel => {
								return Number(channel.tldadmin) === 1 &&
									me.type === "handshake" &&
									channel.name === me.domain;
							});

							if (isGlobalAdmin) {
								let popover = $(".popover[data-name=createGroup]");
								let select = popover.find('select[name="manageGroup"]');

								select.empty();

								$.each(app.channels || [], (k, channel) => {
									select.append(
										$("<option>")
											.val(channel.id)
											.text("#" + channel.name)
									);
								});

								popover.find(".groupMainMenu").removeClass("hidden");
							popover.find(".groupFoundSection").addClass("hidden");
							popover.find(".groupManageSection").addClass("hidden");
							popover.find(".groupAccountsSection").addClass("hidden");
							popover.find(".groupRandomSection").addClass("hidden");
							app.ui.popover("createGroup");
							}
							else if (ownedGroups.length === 1) {
								let channel = ownedGroups[0];
								let settings = $(".popover[data-name=groupSettings]");

								settings.find('input[name="groupID"]').val(channel.id);
								settings.find(".groupSettingsName").text(`#${channel.name}`);

								let visibility = Number(channel.hidden) === 1
									? "hidden"
									: (Number(channel.public) === 1 ? "public" : "private");

								settings.find('select[name="groupVisibility"]').val(visibility);
								settings.find('select[name="groupMode"]').val(
									Number(channel.adminonly) === 1 ? "channel" : "group"
								);

								let members = [];
								try {
									members = Array.isArray(channel.members)
										? channel.members
										: JSON.parse(channel.members || "[]");
								}
								catch {}

								settings.find('input[name="groupMembers"]').val(members.join(", "));
							app.ui.prepareGroupSettings(settings, channel);

								app.ui.popover("groupSettings");
							}
							else {
								app.ui.popover(action);
							}
						}
						else {
							app.ui.popover(action);
						}
					}
					app.ui.enableTarget(target);
					break;

				case "newConversationWith":
					id = target.closest(".contextMenu").data("id");
					name = app.userForID(id).domain;
					let puny = `${app.ui.toUnicode(name)}/`;
					$(`.popover[data-name=newConversation] input[name=domain]`).val(puny);
					app.ui.popover("newConversation");
					app.ui.enableTarget(target);
					break;

				case "mentionUser":
					id = target.closest(".contextMenu").data("id");
					name = `@${app.userForID(id).domain}/`;
					let text = $("#message").val();
					text = `${text}${name} `;
					$("#message").val(text);
					app.ui.close();
					app.ui.closeMenusIfNeeded();
					app.ui.enableTarget(target);
					$("#message").focus();
					break;

				case "randomStuffUser":

					{

						id = target.closest(".contextMenu").data("id");

						name = `@${app.userForID(id).domain}/`;


						fetch("/etc/random-stuff.json", { cache: "no-store" })

							.then(r => {

								if (!r.ok) throw new Error("Random stuff JSON unavailable");

								return r.json();

							})

							.then(items => {

								if (!Array.isArray(items) || !items.length) {

									throw new Error("Random stuff JSON is empty");

								}


								let template = items[Math.floor(Math.random() * items.length)];


								let me = app.userForID(app.domain);

								let sender = me ? `@${me.domain}/` : "";


								message = String(template)

									.replaceAll("{a}", sender)

									.replaceAll("{b}", name);


								data = {

									hnschat: 1,

									action: message

								};


								app.sendMessage(app.conversation, JSON.stringify(data));

							})

							.catch(err => {

								console.error(err);

								alert("Random stuff unavailable.");

							});


						app.ui.close();

						app.ui.closeMenusIfNeeded();

						app.ui.enableTarget(target);

						$("#message").focus();

					}

					break;

				case "toggleGroupStaff":
					{
						let menu = target.closest(".popover");
						let id = menu.data("id");
						let user = app.userForID(id);
						let channel = app.channelForID(app.conversation);

						if (!user || !channel) {
							app.ui.enableTarget(target);
							break;
						}

						let admins = [];

						try {
							admins = Array.isArray(channel.admins)
								? [...channel.admins]
								: JSON.parse(channel.admins || "[]");
						}
						catch {}

						let domain = String(user.domain).toLowerCase().trim();

						admins = admins
							.map(v => String(v).toLowerCase().trim())
							.filter(Boolean);

						let makeStaff = !admins.includes(domain);

						app.ws.send(`SETCHANNELSTAFF ${JSON.stringify({
							channel: channel.id,
							user: id,
							staff: makeStaff
						})}`);

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "muteUser":
					{
						let menu = target.closest(".popover");
						let id = menu.data("id");
						let step = Number(
							menu.find('input[name="muteDuration"]').val()
						);

						let durations = [
							0,
							3600,
							86400,
							259200,
							2592000,
							-1
						];

						let duration = durations[step];

						if (target.data("activeMute")) {
							duration = 0;
						}

						app.ws.send(`SETCHANNELMUTE ${JSON.stringify({
							channel: app.conversation,
							user: id,
							duration: duration
						})}`);

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "openActiveGroupSettings":
					{
						let channel = app.channelForID(app.conversation);

						if (channel) {
							let popover = $(".popover[data-name=groupSettings]");

							popover.find('input[name="groupID"]').val(channel.id);
							popover.find(".groupSettingsName").text(`#${channel.name}`);

							let visibility = Number(channel.hidden) === 1
								? "hidden"
								: (Number(channel.public) === 1 ? "public" : "private");

							popover.find('select[name="groupVisibility"]').val(visibility);
							popover.find('select[name="groupMode"]').val(
								Number(channel.adminonly) === 1 ? "channel" : "group"
							);

							let members = [];
							try {
								members = Array.isArray(channel.members)
									? channel.members
									: JSON.parse(channel.members || "[]");
							}
							catch {}

							popover.find('textarea[name="groupMembers"]').val(JSON.stringify(members, null, 2));
							app.ui.prepareGroupSettings(popover, channel);

							app.ui.popover("groupSettings");
						}

						app.ui.enableTarget(target);
					}
					break;

				case "openGroupSettings":
					{
						id = target.closest(".contextMenu").data("id");
						let channel = app.channelForID(id);

						if (channel) {
							let popover = $(".popover[data-name=groupSettings]");

							popover.find('input[name="groupID"]').val(channel.id);
							popover.find(".groupSettingsName").text(`#${channel.name}`);

							let visibility = Number(channel.hidden) === 1
								? "hidden"
								: (Number(channel.public) === 1 ? "public" : "private");

							popover.find('select[name="groupVisibility"]').val(visibility);
							popover.find('select[name="groupMode"]').val(
								Number(channel.adminonly) === 1 ? "channel" : "group"
							);

							let members = [];
							try {
								members = Array.isArray(channel.members)
									? channel.members
									: JSON.parse(channel.members || "[]");
							}
							catch {}

							popover.find('textarea[name="groupMembers"]').val(JSON.stringify(members, null, 2));
							app.ui.prepareGroupSettings(popover, channel);

							app.ui.close();
							app.ui.popover("groupSettings");
						}

						app.ui.enableTarget(target);
					}
					break;

				case "addGroupMember":
					{
						let popover = target.closest(".popover");
						let id = popover.find('input[name="groupID"]').val();
						let channel = app.channelForID(id);
						let input = popover.find('input[name="quickGroupMember"]');
						let member = input.val().trim();

						if (member) {
							try {
								member = app.ui.toASCII(member).toLowerCase();
							}
							catch {}
						}

						if (!channel || !member) {
							app.ui.enableTarget(target);
							break;
						}

						let members = [];

						try {
							members = Array.isArray(channel.members)
								? [...channel.members]
								: JSON.parse(channel.members || "[]");
						}
						catch {
							members = [];
						}

						if (!Array.isArray(members)) {
							members = [];
						}

						members = members
							.map(v => String(v).trim().toLowerCase())
							.filter(Boolean);

						if (!members.includes(member)) {
							members.push(member);
						}

						members = [...new Set(members)]
							.sort((a, b) => a.localeCompare(b));

						let visibility = Number(channel.hidden) === 1
							? "hidden"
							: (Number(channel.public) === 1 ? "public" : "private");

						let data = {
							channel: id,
							label: channel.label || "",
							url: channel.url || "",
							visibility: visibility,
							mode: Number(channel.adminonly) === 1 ? "channel" : "group",
							members: members
						};

						app.ws.send(
							`SETCHANNELSETTINGS ${JSON.stringify(data)}`
						);

						input.val("");
						app.ui.enableTarget(target);
					}
					break;

				case "saveGroupSettings":
					{
						let popover = target.closest(".popover");
						let id = popover.find('input[name="groupID"]').val();
						let channel = app.channelForID(id);
						let unlocked = popover.data("membershipUnlocked") === true;
						let me = app.userForID(app.domain);
						let canChangeAccess = app.ui.isGlobalAdmin(me);

						if (!channel) {
							app.ui.enableTarget(target);
							break;
						}

						let access =
							popover.find('select[name="groupAccess"]').val();

						let memberType = access === "rule" ? "rule" : "manual";

						let data = {
							channel: id,
							label: popover.find('input[name="groupLabel"]').val().trim(),
							url: popover.find('input[name="groupURL"]').val().trim(),
							visibility: popover.find('select[name="groupVisibility"]').val(),
							mode: popover.find('select[name="groupMode"]').val()
						};

						if (canChangeAccess) {
							let sort = Number(
								popover.find('input[name="groupSort"]').val()
							);

							if (!Number.isInteger(sort) || sort < 0 || sort > 99) {
								sort = 0;
							}

							data.sort = sort;
							data.color = popover.data("groupColorActive")
								? popover.find('input[name="groupColor"]').val()
								: "";
						}


						/*
						 * Access / Rule is global-admin configuration.
						 * Owner Unlock is only for protected group actions.
						 */
						if (unlocked && canChangeAccess) {
							data.membershipUnlocked = true;
							data.access = access;
							data.membertype = memberType;

							if (access === "rule") {
								data.membersource =
									popover.find('select[name="groupRule"]').val();
							}
						}

						// Manual membership list can be maintained normally.
						if (access === "members") {
							let raw =
								popover.find('textarea[name="groupMembers"]').val().trim();

							let members = [];

							if (raw) {
								try {
									let parsed = JSON.parse(raw);

									if (!Array.isArray(parsed)) {
										throw new Error();
									}

									members = parsed;
								}
								catch {
									members = raw
										.split(/[\n,]+/)
										.map(v => v.trim())
										.filter(Boolean);
								}
							}

							data.members = [...new Set(
								members
									.map(v => String(v).trim().toLowerCase())
									.filter(Boolean)
							)].sort((a, b) => a.localeCompare(b));
						}

						// Staff is independent from the Membership lock.
						if (!popover.find(".groupStaffSetting").hasClass("hidden")) {
							let rawStaff =
								popover.find('textarea[name="groupStaffText"]').val();

							data.staff = [...new Set(
								rawStaff
									.split(/[\n,]+/)
									.map(v => v.trim())
									.filter(Boolean)
							)];
						}

						app.ws.send(
							`SETCHANNELSETTINGS ${JSON.stringify(data)}`
						);

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "lockGroupSettings":
					{
						let popover = target.closest(".popover");

						popover.data("membershipUnlocked", false);

						popover.find(".membershipProtected").removeClass("unlocked");
						popover.find(".membershipLockedArea").addClass("hidden");
						popover.find(".groupProtectedSetting").addClass("hidden");
						popover.find(".settingsRuleSetting").addClass("hidden");
						popover.find(".settingsMembersSetting").addClass("hidden");
						popover.find(".groupBasicSetting").removeClass("hidden");
						popover.find(".membershipDeleteButton").addClass("hidden");

						popover.find('[name="groupAccess"]').prop("disabled", true);
						popover.find('[name="groupRule"]').prop("disabled", true);
						popover.find('[name="groupSort"]').prop("disabled", true);
						popover.find('[name="groupColor"]').prop("disabled", true);

						popover.find(".membershipLockRow .subtitle")
							.text("🔒 Access & Group Actions");

						target
							.text("Unlock")
							.attr("data-action", "unlockGroupMembership");

						app.ui.enableTarget(target);
					}
					break;

				case "clearGroupColor":
					{
						let popover = target.closest(".popover");

						popover.data("groupColorActive", false);
						popover.find('input[name="groupColor"]').val("#808080");

						app.ui.enableTarget(target);
					}
					break;

				case "unlockGroupMembership":
					{
						let popover = target.closest(".popover");

						/*
						 * Same button is a real Unlock / Lock toggle.
						 * Locking never asks for confirmation.
						 */
						if (popover.data("membershipUnlocked") === true) {
							popover.data("membershipUnlocked", false);

							popover.find(".membershipProtected").removeClass("unlocked");
							popover.find(".membershipLockedArea").addClass("hidden");
							popover.find(".groupProtectedSetting").addClass("hidden");
							popover.find(".settingsRuleSetting").addClass("hidden");
							popover.find(".settingsMembersSetting").addClass("hidden");
							popover.find(".groupBasicSetting").removeClass("hidden");
							popover.find(".membershipDeleteButton").addClass("hidden");

							popover.find('[name="groupAccess"]').prop("disabled", true);
							popover.find('[name="groupRule"]').prop("disabled", true);
							popover.find('[name="groupSort"]').prop("disabled", true);
							popover.find('[name="groupColor"]').prop("disabled", true);

							popover.find(".membershipLockRow .subtitle")
								.text("🔒 Access & Group Actions");

							target.text("Unlock");

							app.ui.enableTarget(target);
							break;
						}
						let id = popover.find('input[name="groupID"]').val();
						let channel = app.channelForID(id);

						if (!channel) {
							app.ui.enableTarget(target);
							break;
						}

						let members = [];
						try {
							members = Array.isArray(channel.members)
								? channel.members
								: JSON.parse(channel.members || "[]");
						}
						catch {}

						let warning = members.length
							? `This group already has ${members.length} member(s).\n\nChanging membership can remove access. Unlock anyway?`
							: "Unlock membership settings?";

						if (!confirm(warning)) {
							app.ui.enableTarget(target);
							break;
						}

						popover.data("membershipUnlocked", true);
						popover.find(".membershipProtected").addClass("unlocked");
						popover.find(".membershipLockedArea").removeClass("hidden");
						popover.find(".groupProtectedSetting").removeClass("hidden");
						popover.find(".groupBasicSetting").addClass("hidden");

						let me = app.userForID(app.domain);
						let canChangeAccess = app.ui.isGlobalAdmin(me);

						popover.find(".membershipLockRow .subtitle").text(
							canChangeAccess ? "🔓 Group Settings" : "🔓 Group Actions"
						);

						if (canChangeAccess) {
							popover.find('[name="groupAccess"]').prop("disabled", false);
							popover.find('[name="groupSort"]').prop("disabled", false);
							popover.find('[name="groupColor"]').prop("disabled", false);

							popover.find('[name="groupAccess"]').trigger("change");
						}

						popover.find(".membershipDeleteButton").removeClass("hidden");

						target.text("Lock");

						app.ui.enableTarget(target);
					}
					break;

				case "downloadGroupMembers":
					{
						let popover = target.closest(".popover");
						let id = popover.find('input[name="groupID"]').val();
						let channel = app.channelForID(id);
						let raw = popover.find('textarea[name="groupMembers"]').val();

						let blob = new Blob([raw], {type: "application/json;charset=utf-8"});
						let href = URL.createObjectURL(blob);
						let a = document.createElement("a");

						a.href = href;
						a.download = (channel ? channel.name : "members") + "-members.json";
						document.body.appendChild(a);
						a.click();
						a.remove();
						URL.revokeObjectURL(href);

						/*
						 * Safety: member upload is enabled only after
						 * the current member list has been downloaded.
						 */
						if (
							popover.find('select[name="groupAccess"]').val() === "members"
						) {
							popover.find(".groupMembersUploadLabel").removeClass("disabled");
							popover.find('input[name="groupMembersFile"]').prop("disabled", false);
						}

						app.ui.enableTarget(target);
					}
					break;

				case "deleteGroup":
					{
						let popover = target.closest(".popover");
						let id = popover.find('input[name="groupID"]').val();
						let channel = app.channelForID(id);

						if (channel && confirm(`Delete #${channel.name}?`)) {
							app.ws.send(`DELETECHANNEL ${JSON.stringify({channel: id})}`);
							app.ui.close();
						}

						app.ui.enableTarget(target);
					}
					break;

				case "switchConversation":
					id = target.closest(".contextMenu").data("id");
					$(`#conversations tr[data-id=${id}]`).click();
					app.ui.close();
					app.ui.enableTarget(target);
					break;

				case "startConversation":
					domain = target.parent().find("input[name=domain]").val().trim();
					domain = app.rtrim(domain, "/").trim();
					domain = app.userForName(domain).domain;
					message = target.parent().find("input[name=message]").val();

					if (message.length) {
						app.queued.push({
							domain: domain,
							message: message
						});

						data = {
							domain: domain
						}
						app.ws.send(`PM ${JSON.stringify(data)}`);
					}
					else {
						data = {
							type: action,
							message: "Please enter a message.",
						}
						app.ui.errorResponse(data);
					}
					app.ui.enableTarget(target);
					break;

				case "clipboard":
					app.ui.copyToClipboard(target);
					app.ui.enableTarget(target);
					break;

				case "gifs":
				case "emojis":
					context = target.closest(".contextMenu");
					if (context.length) {
						sender = context.data("id");
					}
					else {
						sender = target.closest(".messageRow").data("id");
					}
					
					app.ui.setupReactView(e, sender);
					app.ui.popover("react");
					app.ui.enableTarget(target);
					break;

				case "createSLD":
					e.newTab = true;
					app.ui.openURL("/id");
					app.ui.enableTarget(target);
					break;

				case "purchaseSLD":
					e.newTab = true;
					app.ui.openURL(target.data("link"), e);
					app.ui.enableTarget(target);
					break;

				case "switchName":
					domain = target.data("id");
					app.changeDomain(domain);
					break;

				case "newDomain":
					app.ui.showSection("addDomain");
					app.ui.enableTarget(target);
					break;

				case "addDomain":
					{
						const bytes = new Uint8Array(24);
						crypto.getRandomValues(bytes);
						const state = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
						sessionStorage.setItem("alf_login_state", state);

						const url = "https://alf.li/verify/?service=hnschat&state=" + encodeURIComponent(state);
						window.location.href = url;
					}
					break;
					case "registerAccount":
						{
							const section = target.closest(".section");
							const username = section.find('input[name="accountUsername"]').val().trim();
							const password = section.find('input[name="accountPassword"]').val();

							section.find(".accountResponse").text("");

							if (!username || !password) {
								section.find(".accountResponse").text("Username and password required.");
								app.ui.enableTarget(target);
								break;
							}

							fetch("/api", {
								method: "POST",
								headers: {
									"Content-Type": "application/json"
								},
								body: JSON.stringify({
									action: "registerAccount",
									username: username,
									password: password,
									session: localStorage.getItem("session")
								})
							})
							.then(r => r.json())
							.then(r => {
								if (!r.success) {
									section.find(".accountResponse").text(r.message || "Registration failed.");
									app.ui.enableTarget(target);
									return;
								}

								localStorage.setItem("session", r.session);

								// Registration/login adds the account to the
								// existing session and selects that identity.
								localStorage.setItem("domain", r.domain);

								localStorage.removeItem("conversation");

								window.location.href = "/";
							})
							.catch(() => {
								section.find(".accountResponse").text("Registration failed.");
								app.ui.enableTarget(target);
							});
						}
						break;

					case "loginAccount":
						{
							const section = target.closest(".section");
							const username = section.find('input[name="accountUsername"]').val().trim();
							const password = section.find('input[name="accountPassword"]').val();

							section.find(".accountResponse").text("");

							if (!username || !password) {
								section.find(".accountResponse").text("Username and password required.");
								app.ui.enableTarget(target);
								break;
							}

							fetch("/api", {
								method: "POST",
								headers: {
									"Content-Type": "application/json"
								},
								body: JSON.stringify({
									action: "loginAccount",
									username: username,
									password: password,
									session: localStorage.getItem("session")
								})
							})
							.then(r => r.json())
							.then(r => {
								if (!r.success) {
									section.find(".accountResponse").text(r.message || "Login failed.");
									app.ui.enableTarget(target);
									return;
								}

								// Keep the existing browser session.
								// API returns the same session after attaching the account.
								localStorage.setItem("session", r.session);

								// Registration/login adds the account to the
								// existing session and selects that identity.
								localStorage.setItem("domain", r.domain);

								localStorage.removeItem("conversation");

								window.location.href = "/";
							})
							.catch(() => {
								section.find(".accountResponse").text("Login failed.");
								app.ui.enableTarget(target);
							});
						}
						break;

case "addSLD":
					sld = target.parent().find("input[name=sld]").val();
					tld = target.parent().find("select[name=tld]").val();
					data = {
						sld: sld,
						tld: tld
					}
					app.ws.send(`ADDSLD ${JSON.stringify(data)}`);
					break;

case "addSLDDomain":
					{
						const bytes = new Uint8Array(24);
						crypto.getRandomValues(bytes);
						const state = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
						sessionStorage.setItem("alf_login_state", state);

						const url = "https://alf.li/sld-verify/?service=hnschat&state=" + encodeURIComponent(state);
						window.location.href = url;
					}
					break;
					case "registerAccount":
						{
							const section = target.closest(".section");
							const username = section.find('input[name="accountUsername"]').val().trim();
							const password = section.find('input[name="accountPassword"]').val();

							section.find(".accountResponse").text("");

							if (!username || !password) {
								section.find(".accountResponse").text("Username and password required.");
								app.ui.enableTarget(target);
								break;
							}

							fetch("/api", {
								method: "POST",
								headers: {
									"Content-Type": "application/json"
								},
								body: JSON.stringify({
									action: "registerAccount",
									username: username,
									password: password,
									session: localStorage.getItem("session")
								})
							})
							.then(r => r.json())
							.then(r => {
								if (!r.success) {
									section.find(".accountResponse").text(r.message || "Registration failed.");
									app.ui.enableTarget(target);
									return;
								}

								localStorage.setItem("session", r.session);

								// Registration/login adds the account to the
								// existing session and selects that identity.
								localStorage.setItem("domain", r.domain);

								localStorage.removeItem("conversation");

								window.location.href = "/";
							})
							.catch(() => {
								section.find(".accountResponse").text("Registration failed.");
								app.ui.enableTarget(target);
							});
						}
						break;

					case "loginAccount":
						{
							const section = target.closest(".section");
							const username = section.find('input[name="accountUsername"]').val().trim();
							const password = section.find('input[name="accountPassword"]').val();

							section.find(".accountResponse").text("");

							if (!username || !password) {
								section.find(".accountResponse").text("Username and password required.");
								app.ui.enableTarget(target);
								break;
							}

							fetch("/api", {
								method: "POST",
								headers: {
									"Content-Type": "application/json"
								},
								body: JSON.stringify({
									action: "loginAccount",
									username: username,
									password: password,
									session: localStorage.getItem("session")
								})
							})
							.then(r => r.json())
							.then(r => {
								if (!r.success) {
									section.find(".accountResponse").text(r.message || "Login failed.");
									app.ui.enableTarget(target);
									return;
								}

								// Keep the existing browser session.
								// API returns the same session after attaching the account.
								localStorage.setItem("session", r.session);

								// Registration/login adds the account to the
								// existing session and selects that identity.
								localStorage.setItem("domain", r.domain);

								localStorage.removeItem("conversation");

								window.location.href = "/";
							})
							.catch(() => {
								section.find(".accountResponse").text("Login failed.");
								app.ui.enableTarget(target);
							});
						}
						break;

case "addSLD":
					sld = target.parent().find("input[name=sld]").val();
					tld = target.parent().find("select[name=tld]").val();
					data = {
						sld: sld,
						tld: tld
					}
					app.ws.send(`ADDSLD ${JSON.stringify(data)}`);
					break;

				case "deleteDomain":
					domain = target.closest(".domain").data("id");
					data = {
						id: domain
					};
					app.ws.send(`DELETEDOMAIN ${JSON.stringify(data)}`);
					break;

				case "manageDomains":
					app.ui.showSection("manageDomains");
					app.ui.enableTarget(target);
					break;

				case "clearChat":
					if (!app.conversation) {
						app.ui.enableTarget(target);
						break;
					}

					if (!confirm("Clear this chat?\n\nAll messages will be permanently deleted.")) {
						app.ui.enableTarget(target);
						break;
					}

					data = {
						conversation: app.conversation
					};

					app.ws.send(`CLEARCHAT ${JSON.stringify(data)}`);
					app.ui.close();
					app.ui.enableTarget(target);
					break;

				case "toggleMessageSelection":
					{
						let menu = target.closest(".contextMenu");
						let id = menu.data("id");
						let row = $(`#messages .messageRow[data-id="${id}"]`);

						if (row.length) {
							row.toggleClass("bulkSelected");
						}

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "clearMessageSelection":
					{
						$("#messages .messageRow.bulkSelected")
							.removeClass("bulkSelected");

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "deleteSelectedMessages":
					{
						let rows = $("#messages .messageRow.bulkSelected[data-id]");
						let ids = [];

						rows.each((k, row) => {
							let id = $(row).data("id");
							if (id !== undefined && id !== null && id !== "") {
								ids.push(id);
							}
						});

						if (!ids.length) {
							app.ui.close();
							app.ui.enableTarget(target);
							break;
						}

						if (!confirm(
							`Delete ${ids.length} selected message${ids.length === 1 ? "" : "s"}?\n\n` +
							`This cannot be undone.`
						)) {
							app.ui.enableTarget(target);
							break;
						}

						app.ws.send(`DELETEMESSAGES ${JSON.stringify({
							ids: ids,
							conversation: app.conversation
						})}`);

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "addPollOption":
					{
						let popover = $(".popover[data-name=poll]");
						let count = popover.find('input[name="pollOption"]').length + 1;

						if (count <= 10) {
							popover.find(".pollOptions").append(
								$("<input>")
									.attr("type", "text")
									.attr("name", "pollOption")
									.attr("placeholder", `Option ${count}`)
							);
						}

						app.ui.enableTarget(target);
					}
					break;

				case "createPoll":
					{
						let popover = $(".popover[data-name=poll]");
						let question = String(
							popover.find('input[name="pollQuestion"]').val() || ""
						).trim();

						let options = [];

						popover.find('input[name="pollOption"]').each((k, input) => {
							let value = String($(input).val() || "").trim();

							if (value && !options.includes(value)) {
								options.push(value);
							}
						});

						if (!question) {
							popover.find(".response").text("Enter a question.");
							app.ui.enableTarget(target);
							break;
						}

						if (options.length < 2) {
							popover.find(".response").text("Enter at least two options.");
							app.ui.enableTarget(target);
							break;
						}

						let poll = JSON.stringify({
							hnschat: 1,
							poll: {
								question: question,
								options: options
							}
						});

						app.sendMessage(app.conversation, poll);

						popover.find('input[name="pollQuestion"]').val("");
						popover.find(".pollOptions").html(
							'<div class="subtitle">Options</div>' +
							'<input type="text" name="pollOption" placeholder="Option 1">' +
							'<input type="text" name="pollOption" placeholder="Option 2">'
						);
						popover.find(".response").text("");

						app.ui.close();
						app.ui.enableTarget(target);
					}
					break;

				case "deleteMessage":
					message = target.closest(".contextMenu").data("id");
					data = {
						id: message
					}
					app.ws.send(`DELETEMESSAGE ${JSON.stringify(data)}`);
					app.ui.close();
					app.ui.enableTarget(target);
					break;

				case "pinMessage":
					message = target.closest(".contextMenu").data("id");
					data = {
						conversation: app.conversation,
						id: message
					}
					app.ws.send(`PINMESSAGE ${JSON.stringify(data)}`);
					app.ui.close();
					app.ui.enableTarget(target);
					break;

				case "searchUsers":
					if (target.hasClass("close")) {
						app.ui.searchUsers(false);
					}
					else {
						app.ui.searchUsers(true);
					}
					app.ui.enableTarget(target);
					break;

				case "saveSettings":
					let fields = $(".popover[data-name=settings] .local");
					$.each(fields, (k, field) => {
						let name = $(field).attr("name");
						let val = $(field).val();
						app.settings[name] = val;
					});
					localStorage.setItem("settings", JSON.stringify(app.settings));
					app.loadSettings();

					data = {
						action: "saveSettings",
						domain: app.domain,
						settings: {}
					}

					fields = $(".popover[data-name=settings] input.remote");
					$.each(fields, (k, field) => {
						let name = $(field).attr("name");
						let val = $(field).val();
						data.settings[name] = val;
					});

					data.settings = JSON.stringify(data.settings);

					app.api(data).then(r => {
						if (r.success) {
							if (r.avatar) {
								delete app.avatars[app.domain];
								app.userForID(app.domain).avatar = r.avatar;
								$(`.favicon.loaded[data-id=${app.domain}]`).removeClass("loaded");
								app.ui.updateAvatars();
								app.ws.send(`SAVEDSETTINGS`);
							}
							app.ui.close();
						}
						else {
							data = {
								type: action,
								message: r.message,
							}
							app.ui.errorResponse(data);
						}

						app.ui.enableTarget(target);
					});
					break;

				case "file":
					$("#file")[0].click();
					app.ui.enableTarget(target);
					break;

				case "removeAttachment":
					let attachment = target.parent().parent();
					attachment.remove();
					app.ui.showOrHideAttachments();
					data = {
						id: attachment.data("id")
					}
					app.ws.send(`DELETEATTACHMENT ${JSON.stringify(data)}`);
					break;

				case "editProfile":
					app.ui.editProfile();
					app.ui.enableTarget(target);
					break;

				case "saveProfile":
					app.ui.saveProfile();
					app.ui.enableTarget(target);
					break;

				case "undoProfile":
					app.ui.undoProfile();
					app.ui.enableTarget(target);
					break;

				case "close":
					app.ui.close();
					app.ui.enableTarget(target);
					break;

				case "reload":
					window.location.reload();
					break;

				case "startVideo":
				case "joinVideo":
					app.channelForID(app.conversation).watching = true;
					data = {
						conversation: app.conversation
					}
					if (app.channelForID(app.conversation).video) {
						app.ws.send(`JOINVIDEO ${JSON.stringify(data)}`);
					}
					else {
						app.ws.send(`STARTVIDEO ${JSON.stringify(data)}`);
					}
					app.ui.enableTarget(target);
					break;

				case "inviteVideo":
					id = target.closest(".contextMenu").data("id");

					data = {
						conversation: app.conversation,
						user: id
					}
					app.ws.send(`INVITEVIDEO ${JSON.stringify(data)}`);
					app.ui.close();
					app.ui.closeMenusIfNeeded();
					app.ui.enableTarget(target);
					break;

				case "leaveVideo":
					if (Object.keys(app.channelForID(app.conversation).videoUsers).includes(app.domain)) {
						app.stream.unpublish();
					}
					else {
						app.channelForID(app.conversation).watching = false;
						app.stream.close();
						app.ui.showVideoIfNeeded();
					}
					data = {
						conversation: app.conversation
					}
					app.ws.send(`LEAVEVIDEO ${JSON.stringify(data)}`);
					app.ui.enableTarget(target);
					break;

				case "endVideo":
					if (Object.keys(app.channelForID(app.conversation).videoUsers).includes(app.domain)) {
						app.stream.unpublish();
					}
					data = {
						conversation: app.conversation
					}
					app.ws.send(`ENDVIDEO ${JSON.stringify(data)}`);
					app.ui.enableTarget(target);
					break;

				case "toggleVideo":
					app.stream.mute("video", !$(".controls .button[data-action=toggleVideo]").hasClass("muted"));
					data = {
						conversation: app.conversation
					}
					app.ws.send(`MUTEVIDEO ${JSON.stringify(data)}`);
					app.ui.enableTarget(target);
					break;

				case "toggleAudio":
					app.stream.mute("audio", !$(".controls .button[data-action=toggleAudio]").hasClass("muted"));
					data = {
						conversation: app.conversation
					}
					app.ws.send(`MUTEAUDIO ${JSON.stringify(data)}`);
					app.ui.enableTarget(target);
					break;

				case "toggleScreen":
					app.stream.toggleScreen();
					app.ui.enableTarget(target);
					break;

				case "viewVideo":
					data = {
						conversation: app.conversation
					}
					app.ws.send(`VIEWVIDEO ${JSON.stringify(data)}`);
					app.ui.enableTarget(target);
					break;

				default:
					app.ui.enableTarget(target);
					break;
			}
		});

		$("html").on("keyup", ".popover[data-name=react] input", e => {
			if (app.isKey(e, 27)) {
				e.preventDefault();
				return;
			}

			let query = $(e.currentTarget).val().replace(/[^a-zA-Z0-9]/gi, '').toLowerCase();
			if (query) {
				let emo = $(".popover[data-name=react] .section:not([data-name=Search]) .emoji");
				let matches = emo.filter((k, em) => {
					let aliases = $(em).data("aliases");

					$.each(aliases, (k, alias) => {
						aliases[k] = alias.replace(/[^a-zA-Z0-9]/gi, '').toLowerCase();
					});

					return aliases.join("|").includes(query);
				});

				$(".popover[data-name=react] .grid .section[data-name=Search] .emojis").empty();
				$.each(matches, (k, match) => {
					let clone = match.cloneNode(true);
					$(".popover[data-name=react] .grid .section[data-name=Search] .emojis").append(clone);
				});

				$(".popover[data-name=react] .grid .section").addClass("hidden");
				$(".popover[data-name=react] .grid .section[data-name=Search]").removeClass("hidden");
			}
			else {
				$(".popover[data-name=react] .grid .section").removeClass("hidden");
				$(".popover[data-name=react] .grid .section[data-name=Search]").addClass("hidden");
			}
		});

		$("html").on("click", ".popover[data-name=react] .emoji", e => {
			let sender = $(".popover[data-name=react]").data("sender");
			let emoji = $(e.currentTarget);
			let em = emoji.html();

			if (sender.length) {
				let reacting = $(".messageRow .hover.visible").closest(".messageRow").data("id");
				app.ui.close();
				let data = {
					conversation: app.conversation,
					message: reacting,
					reaction: em
				};
				app.ws.send(`REACT ${JSON.stringify(data)}`);
			}
			else {
				let field = $(".input #message");
				let current = field.val();
				let split = Array.from(current);
				let position = field[0].selectionStart;
				let added = app.replaceRange(current, position, position, em);
				field.val(added);
				app.ui.close();
				$(".input #message").focus();
				app.ui.setCaretPosition(field[0], position + em.length);
			}
		});

		$("html").on("click", ".pollOption", e => {
			let target = $(e.currentTarget);

			if (target.hasClass("pollLocked")) {
				let poll = target.closest(".chatPoll");

				poll.find(".pollVoteNotice").remove();

				poll.append(
					$("<div>")
						.addClass("pollVoteNotice")
						.text("Guests can't vote.")
				);

				setTimeout(() => {
					poll.find(".pollVoteNotice").fadeOut(200, function() {
						$(this).remove();
					});
				}, 1800);

				return;
			}

			let me = app.userForID(app.domain);

			if (
				!me ||
				me.locked ||
				me.deleted ||
				me.namespace === "handshakeuser" ||
				me.tld === "handshakeuser"
			) {
				return;
			}

			let data = {
				conversation: app.conversation,
				message: target.data("message"),
				option: Number(target.data("option"))
			};

			app.ws.send(`POLLVOTE ${JSON.stringify(data)}`);
		});

		$("html").on("click", ".reaction", e => {
			let target = $(e.currentTarget);
			let reacting = target.closest(".messageRow").data("id");
			let em = target.data("reaction");

			let data = {
				conversation: app.conversation,
				message: reacting,
				reaction: em
			};
			app.ws.send(`REACT ${JSON.stringify(data)}`);
		});

		$("html").on("click", "#react .tab", e => {
			let target = $(e.target);
			let name = target.data("name");
			app.ui.switchReactTab(name);
		});

		$("html").on("click", "#react .category", e => {
			let target = $(e.target);
			let term = target.data("term");
			$("#react input[name=searchGifs]").val(term);
			app.ui.searchGifs(term);
		});

		$("html").on("input", "#react input[name=searchGifs]", e => {
			let target = $(e.target);
			let value = target.val().trim();
			
			clearInterval(this.gifTimer);
			this.lastGifSearch = app.time();
			this.gifTimer = setInterval(() => {
				let timeSince = app.time() - this.lastGifSearch;
				if (timeSince >= 1) {
					app.ui.searchGifs(value);
					clearInterval(this.gifTimer);
				}
			}, 100);
		});

		$("html").on("click", "#react .gif", e => {
			let target = $(e.target);
			let gif = target.data("full");

			let data = {
				hnschat: 1,
				attachment: gif
			};
			app.sendMessage(app.conversation, JSON.stringify(data));
			app.ui.close();
		});

		$("html").on("click", e => {
			let target = $(e.currentTarget);
		});

		$("html").on("click", "#users .user, .messageRow .user, .messageRow .favicon, .inline.nick, .header .favicon, .inline.channel, .cam table .user, .screen table .user, #videoInfo .avatar > div", e => {
			let target = $(e.currentTarget);

			if (!app.userForID(app.domain).locked) {
				app.ui.handleRightClick(e, target);
			}
		});

		$("html").on("input paste keydown focus click", ".contextMenu[data-name=userContext] .bioHolder .bio", e => {
			app.ui.updateBioLimit(e);
		});

		$(window).on("contextmenu", e => {
			let target = $(e.target);

			if (["INPUT", "TEXTAREA", "A"].includes(target.prop("tagName")) || target.hasClass("body") || (target.hasClass("inline") && !(target.hasClass("nick") || target.hasClass("channel")))) {
				return;
			}
			else {
				e.preventDefault();

				app.ui.handleRightClick(e, target);
			}
		});

		$("html").on("touchstart", ".messageRow", e => {
			let target = $(e.target);
			if (!(target.hasClass("messageRow") || target.hasClass("message") || target.hasClass("body") || target.hasClass("main") || target.hasClass("msg") || target.hasClass("hover"))) {
				return;
			}

			$("body").addClass("touching");
			this.longPress = e.timeStamp;
			this.longPressTimer = setTimeout(() => {
				app.ui.handleRightClick(e, target);
			}, 500);
		});

		$("html").on("touchcancel", ".messageRow", e => {
			$("body").removeClass("touching");
			this.longPress = 0;
			clearTimeout(this.longPressTimer);
		});

		$("html").on("touchend", ".messageRow", e => {
			if ($("#blackout").hasClass("shown")) {
				setTimeout(() => {
					this.longPress = 0;
					clearTimeout(this.longPressTimer);
					$("body").removeClass("touching");
				}, 500);
			}

			let duration = e.timeStamp - this.longPress;
			if (duration < 500) {
				this.longPress = 0;
				clearTimeout(this.longPressTimer);
				$("body").removeClass("touching");
			}
		});

		$("html").on("click", ".header .icon.menu", e => {
			if ($("#conversations").hasClass("showing")) {
				$("body").removeClass("menu");
				$("#conversations").removeClass("showing");
			}
			else {
				if ($("#users").hasClass("showing")) {
					$("body").removeClass("menu");
					$("#users").removeClass("showing")
				}
				$("body").addClass("menu");
				$("#conversations").addClass("showing");
			}
		});

		$("html").on("click", ".header .icon.users", e => {
			if ($("#holder[data-type=pms]").length) {
				return;
			}

			if ($("#users").hasClass("showing")) {
				$("body").removeClass("menu");
				$("#users").removeClass("showing");
			}
			else {
				if ($("#conversations").hasClass("showing")) {
					$("body").removeClass("menu");
					$("#conversations").removeClass("showing")
				}
				$("body").addClass("menu");
				$("#users").addClass("showing");
			}
		});

		$("html").on("keyup", "input", e => {
			let target = $(e.target);

			// Member Search handles Enter itself.
			if (
				target.closest('.popover[data-name="groupSettings"]').length &&
				target.attr("name") === "groupMemberSearch"
			) {
				return;
			}

			if (app.isKey(e, 13)) {
				let submit = target.parent().find(".button").last();
				if (!submit.length) {
					submit = target.closest(".section").find(".button").last();
				}
				submit.click();
			}
		});

		$("html").on("keydown", "input[name=hns]", e => {
			let key = e.key;
			let keyCode = app.key(e);
			let match = key.match(/[a-z ]/g);
			if (match && !(e.shiftKey || e.metaKey || e.ctrlKey) && !(keyCode >= 37 && keyCode <= 40)) {
				e.preventDefault();
			}
		});

		$("html").on("keyup", "#users input[name=search]", e => {
			if (app.isKey(e, 27)) {
				app.ui.searchUsers(false);
			}
			else {
				let target = $(e.target);
				let value = target.val().trim();
				app.ui.queryUsers(value);
			}
		});

		$("html").on("change", "#file", e => {
			let input = $(e.currentTarget)[0];
			let file = input.files[0];

			if (!file) {
				return;
			}

			const allowed = [
				"image/jpeg",
				"image/png",
				"image/webp",
				"image/gif",
				"video/mp4"
			];

			if (!allowed.includes(file.type)) {
				alert("Only JPEG, PNG, WebP, GIF and MP4 are supported.");
				input.value = "";
				return;
			}

			if (file.type.startsWith("image/") && file.size > 10000000) {
				alert("Maximum image size is 10MB.");
				input.value = "";
				return;
			}

			if (file.type === "video/mp4" && file.size > 25000000) {
				alert("Maximum video size is 25MB.");
				input.value = "";
				return;
			}

			let url = URL.createObjectURL(file);
			let isVideo = file.type.startsWith("video/");

			let attachment = $(`
				<div class="attachment">
					<div class="removeHolder">
						<div class="icon action remove" data-action="removeAttachment"></div>
					</div>
					<div class="uploading lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
				</div>
			`);

			if (isVideo) {
				attachment.append(`<video src="${url}" muted playsinline></video>`);
			}
			else {
				attachment.css("background-image", `url(${url})`);
			}

			$("#attachments").append(attachment);
			app.ui.showOrHideAttachments();

			let data = new FormData;
			data.append("file", file);
			data.append("key", app.session);

			app.upload(data, attachment).then(r => {
				attachment.find(".uploading").remove();

				if (r.success) {
					attachment.attr("data-id", r.id);
					attachment.attr("data-type", r.type || (isVideo ? "video" : "image"));
				}
				else {
					alert(r.message);
					attachment.remove();
				}

				URL.revokeObjectURL(url);
				input.value = "";

				app.ui.showOrHideAttachments();
				$("#message").focus();
			});
		});

		$("html").on("input paste keydown focus click", ".popover[data-name=settings] input.color", e => {
			let target = $(e.currentTarget);
			let name = `--${target.attr("name")}`;
			let value = target.val();
			app.ui.root.style.setProperty(name, value);
		});

		$("html").on("input change", '.popover[data-name="groupSettings"] input[name="groupColor"]', e => {
			let popover = $(e.currentTarget).closest(".popover");
			popover.data("groupColorActive", true);
		});

		$("html").on("change", ".popover[data-name=settings] select[name=chatDisplayMode]", e => {
			let target = $(e.target);
			let value = target.val();
			app.ui.chatDisplayMode(value);
		});

		$("html").on("click", "#messages .messageRow", e => {
			// Normal message clicks become selection clicks
			// only after bulk selection has already been started.
			if (!$("#messages .messageRow.bulkSelected[data-id]").length) {
				return;
			}

			let target = $(e.target);

			// Keep normal interactive elements working.
			if (
				target.closest("a, .user, .favicon, .reply, .action, button, input, textarea").length
			) {
				return;
			}

			let row = $(e.currentTarget);

			if (
				row.hasClass("informational") ||
				!row.attr("data-id")
			) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();

			row.toggleClass("bulkSelected");
		});

		$("html").on("click", ".messageRow .reply .body", e => {
			let target = $(e.target);
			let message = target.closest(".reply").data("id");
			app.ui.gotoMessage(message);
		});

		$("html").on("click", ".messageHeader td.groupHeaderLink", e => {
			if ($(e.target).is("a")) {
				return;
			}

			let url = $(e.currentTarget).attr("data-url");

			if (url) {
				window.open(url, "_blank", "noopener");
			}
		});

		$("html").on("click", ".pinnedMessage", e => {
			let target = $(e.target);
			if (target.hasClass("delete")) {
				return;
			}
			let message = app.channelForID(app.conversation).pinned;
			app.ui.gotoMessage(message);
		});

		$("html").on("click", "#jumpToPresent", e => {
			app.ui.setInThePast(false);
			app.ui.clear("messages");
			app.ui.messagesLoading(true);
			app.getMessages();
		});

		$(window).on("message", e => {
			if (e.originalEvent.data) {
				switch (e.originalEvent.data) {
					case "handlePush":
						app.handlePush();
						break;

					case "mobileApp":
						localStorage.setItem("mobile", true);
						break;
				}
			}
		});
	}
}

// Group member search.
// - Search field keeps keyboard focus.
// - Finds text at beginning, middle or end.
// - Searches stored xn-- value and decoded Unicode/emoji.
// - Enter cycles to the next result.
function groupMemberSearch(popover, advance = false) {
	let input = popover.find('input[name="groupMemberSearch"]')[0];
	let textarea = popover.find('textarea[name="groupMembers"]')[0];

	if (!input || !textarea) return;

	let query = String(input.value || "").trim();

	if (!query) {
		popover.data("groupMemberSearchQuery", "");
		popover.data("groupMemberSearchIndex", 0);
		input.title = "";
		return;
	}

	try {
		if (/^https?:\/\//i.test(query)) {
			let url = new URL(query);
			let parts = url.pathname.split("/").filter(Boolean);

			if (parts.length) {
				query = decodeURIComponent(parts[parts.length - 1]);
			}
		}
	}
	catch {}

	query = query.replace(/^\/+|\/+$/g, "");

	let normalize = value => String(value || "")
		.normalize("NFC")
		.replace(/\uFE0F/g, "")
		.toLowerCase();

	let qUnicode = normalize(query);
	let qAscii = qUnicode;

	try {
		let asciiInput = String(query || "")
			.normalize("NFC")
			.replace(/\uFE0F/g, "");

		qAscii = String(punycode.ToASCII(asciiInput) || "")
			.trim()
			.toLowerCase();
	}
	catch {}

	let lines = textarea.value.split("\n");
	let matches = [];

	lines.forEach((line, lineIndex) => {
		let stored = String(line || "")
			.replace(/^[\s"\[]+|[\s",\]]+$/g, "")
			.trim();

		if (!stored) return;

		let ascii = normalize(stored);
		let rawUnicode = ascii;
		let displayUnicode = ascii;

		try {
			rawUnicode = normalize(punycode.ToUnicode(stored));
		}
		catch {}

		try {
			displayUnicode = normalize(punycode.ToUnicode(stored));
		}
		catch {}

		if (
			ascii.includes(qAscii) ||
			ascii.includes(qUnicode) ||
			rawUnicode.includes(qUnicode) ||
			displayUnicode.includes(qUnicode)
		) {
			matches.push({
				lineIndex: lineIndex,
				stored: stored
			});
		}
	});

	if (!matches.length) {
		popover.data("groupMemberSearchQuery", qUnicode);
		popover.data("groupMemberSearchIndex", 0);
		input.title = "No match";
		return;
	}

	let oldQuery = String(
		popover.data("groupMemberSearchQuery") || ""
	);

	let index = Number(
		popover.data("groupMemberSearchIndex")
	) || 0;

	if (oldQuery !== qUnicode) {
		index = 0;
	}
	else if (advance) {
		index++;

		if (index >= matches.length) {
			index = 0;
		}
	}

	popover.data("groupMemberSearchQuery", qUnicode);
	popover.data("groupMemberSearchIndex", index);

	let match = matches[index];

	// Calculate exact character position in textarea.
	let offset = 0;

	for (let i = 0; i < match.lineIndex; i++) {
		offset += lines[i].length + 1;
	}

	let inside = lines[match.lineIndex].indexOf(match.stored);

	if (inside < 0) inside = 0;

	try {
		textarea.setSelectionRange(
			offset + inside,
			offset + inside + match.stored.length
		);
	}
	catch {}

	// Scroll matching row into view without changing focus.
	let maxScroll = Math.max(
		0,
		textarea.scrollHeight - textarea.clientHeight
	);

	textarea.scrollTop =
		(match.lineIndex / Math.max(1, lines.length - 1)) *
		maxScroll;

	input.title =
		`${index + 1} / ${matches.length}: ${match.stored}`;

	input.focus();
}


$(document).on(
	"input",
	'.popover[data-name="groupSettings"] input[name="groupMemberSearch"]',
	function() {
		let popover = $(this).closest(".popover");

		// Any changed search text begins again with result 1.
		popover.data("groupMemberSearchQuery", "");
		popover.data("groupMemberSearchIndex", 0);

		groupMemberSearch(popover, false);
	}
);


$(document).on(
	"keydown",
	'.popover[data-name="groupSettings"] input[name="groupMemberSearch"]',
	function(e) {
		if (e.key !== "Enter") {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		groupMemberSearch(
			$(this).closest(".popover"),
			true
		);

		return false;
	}
);


$(document).on(
	"keyup",
	'.popover[data-name="groupSettings"] input[name="groupMemberSearch"]',
	function(e) {
		if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			return false;
		}
	}
);

// Group access UI helpers.
$(document).on("change", '.popover[data-name="createGroup"] select[name="groupAccess"]', function() {
	let popover = $(this).closest(".popover");
	let access = $(this).val();

	popover.find(".createRuleSetting").toggleClass("hidden", access !== "rule");
	popover.find(".createMembersSetting").toggleClass("hidden", access !== "members");
});

$(document).on("change", '.popover[data-name="groupSettings"] select[name="groupAccess"]', function() {
	let popover = $(this).closest(".popover");
	let access = $(this).val();
	let unlocked = popover.data("membershipUnlocked") === true;

	popover.find(".settingsRuleSetting")
		.toggleClass("hidden", access !== "rule");

	popover.find('[name="groupRule"]')
		.prop("disabled", !unlocked || access !== "rule");

	popover.find(".settingsMembersSetting")
		.toggleClass("hidden", access !== "members");
});

$(document).on("change", '.popover[data-name="createGroup"] input[name="groupMembersFile"]', function() {
	let input = this;
	let popover = $(input).closest(".popover");

	if (!input.files || !input.files[0]) {
		return;
	}

	let file = input.files[0];

	if (file.size > 2 * 1024 * 1024) {
		alert("Maximum file size is 2 MB.");
		input.value = "";
		return;
	}

	let reader = new FileReader();

	reader.onload = function(e) {
		let raw = String(e.target.result || "").trim();
		let members = [];

		try {
			let parsed = JSON.parse(raw);

			if (!Array.isArray(parsed)) {
				throw new Error();
			}

			members = parsed;
		}
		catch {
			members = raw
				.split(/[\n,]+/)
				.map(v => v.trim())
				.filter(Boolean);
		}

		members = [...new Set(
			members
				.map(v => String(v).trim())
				.filter(Boolean)
		)];

		popover.find('textarea[name="groupMembers"]').val(
			JSON.stringify(members, null, 2)
		);

		input.value = "";
	};

	reader.readAsText(file);
});

$(document).on("click", '.popover[data-name="groupSettings"] .groupMembersUploadLabel.disabled', function(e) {
	e.preventDefault();
	e.stopPropagation();
	alert("Download first to create a backup.");
	return false;
});

$(document).on("change", '.popover[data-name="groupSettings"] input[name="groupMembersFile"]', function() {
	let input = this;
	let popover = $(input).closest(".popover");

	if (
		popover.find('select[name="groupAccess"]').val() !== "members" ||
		!input.files ||
		!input.files[0]
	) {
		input.value = "";
		return;
	}

	let file = input.files[0];

	if (file.size > 2 * 1024 * 1024) {
		alert("Maximum file size is 2 MB.");
		input.value = "";
		return;
	}

	let reader = new FileReader();

	reader.onload = function(e) {
		let raw = String(e.target.result || "").trim();
		let members = [];

		try {
			let parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) throw new Error();
			members = parsed;
		}
		catch {
			members = raw
				.split(/[\n,]+/)
				.map(v => v.trim())
				.filter(Boolean);
		}

		popover.find('select[name="groupAccess"]').val("members").trigger("change");
		popover.find('textarea[name="groupMembers"]').val(JSON.stringify(members, null, 2));
		input.value = "";
	};

	reader.readAsText(file);
});
