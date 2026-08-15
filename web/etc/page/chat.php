<body data-page="chat" data-version="<?php echo $revision; ?>">
	<div class="connecting">
		<div class="lds-facebook"><div></div><div></div><div></div></div>
	</div>
	<div id="blackout"></div>
	<div class="popover" data-name="update">
		<div class="head">
			<div class="title">Update</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="subtitle">An update is available. Please reload for the best possible experience.</div>
			<div class="button" data-action="reload">Reload</div>
		</div>
		<div class="response error"></div>
	</div>
	<div class="popover" data-name="createGroup">
		<div class="head">
			<div class="title">Groups</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">

			<div class="groupMainMenu">
				<div class="button action" data-action="showFoundGroup">＋ Found Group</div>
				<div class="button action" data-action="showManageGroup">⚙ Manage Group</div>
				<div class="button action" data-action="showAccounts">👥 Accounts</div>
				<div class="button action" data-action="showRandomStuffTexts">🤝 Random Stuff Texts</div>
			</div>

			<div class="groupFoundSection hidden">

			<div class="subtitle">Create Group</div>

			<input type="text" name="groupName" placeholder="Group TLD">

			<input type="text" name="groupLabel" placeholder="Display name (optional)">

			<input type="text" name="groupURL" placeholder="https://... (optional)">

			<div class="setting">
				<div class="subtitle">Access</div>
				<select name="groupAccess">
					<option value="members">Members</option>
					<option value="rule">Rule</option>
					<option value="internal">Internal SLD</option>
					<option value="namebase">Namebase SLD</option>
				</select>
			</div>

			<div class="setting createRuleSetting hidden">
				<div class="subtitle">Rule</div>
				<select name="groupRule">
					<option value="1to3letters">1–3 Letter</option>
					<option value="10k">10k</option>
					<option value="1emoji">1 Emoji</option>
					<option value="1symbol">1 Symbol</option>
					<option value="newnation">New Nation 🪪 1–999</option>
					<option value="handshakeuser">Guests (.handshakeuser)</option>
				</select>
			</div>

			<div class="setting createMembersSetting">
				<div class="subtitle">Members</div>
				<textarea name="groupMembers" rows="7" placeholder='["mmsp","chathns"]'></textarea>
				<div class="membershipFileActions">
					<label class="button">
						Upload
						<input class="hidden" type="file" name="groupMembersFile" accept=".json,.txt,text/plain,application/json">
					</label>
				</div>
			</div>

			<div class="setting">
				<div class="subtitle">Visibility</div>
				<select name="groupVisibility">
					<option value="public">Public</option>
					<option value="private">Private</option>
					<option value="hidden">Hidden</option>
				</select>
			</div>

			<div class="setting">
				<div class="subtitle">Mode</div>
				<select name="groupMode">
					<option value="group">Group</option>
					<option value="channel">Channel</option>
				</select>
			</div>

			<div class="button" data-action="createGroup">Create</div>

			</div>

			<div class="groupManageSection hidden">

			<div class="subtitle">Manage Groups</div>

			<select name="manageGroup"></select>

			<div class="button" data-action="manageSelectedGroup">Manage</div>

			</div>

			<?php
				$chatHNSRootAdmin = "admin.chathns";
				$chatHNSRootConfigPath = dirname(__DIR__, 3)."/server/config.json";

				if (is_file($chatHNSRootConfigPath)) {
					$chatHNSRootConfig = json_decode(
						file_get_contents($chatHNSRootConfigPath),
						true
					);

					if (
						is_array($chatHNSRootConfig) &&
						!empty($chatHNSRootConfig["rootAdmin"])
					) {
						$chatHNSRootAdmin = strtolower(
							trim((string)$chatHNSRootConfig["rootAdmin"])
						);
					}
				}
				?>
				<div
					class="groupAccountsSection hidden"
					data-root-admin="<?php echo htmlspecialchars($chatHNSRootAdmin, ENT_QUOTES, 'UTF-8'); ?>"
				>
					<div class="subtitle">Accounts</div>

					<input type="text" name="accountSearch" placeholder="Search account">

					<div class="setting">
						<div class="subtitle">Type</div>
						<select name="accountType">
							<option value="all">All</option>
							<option value="official">.official✅</option>
							<option value="handshakeuser">.handshakeuser</option>
							<option value="chathns">.chathns</option>
							
						</select>
					</div>

					<div class="setting">
						<div class="subtitle">Status</div>
						<select name="accountStatus">
							<option value="active" selected>Active</option>
							<option value="locked">Locked</option>
							<option value="all">All</option>
						</select>
					</div>

					<div class="setting">
						<div class="subtitle">Sort</div>
						<select name="accountSort">
							<option value="name">Name</option>
							<option value="created">Created</option>
							<option value="status">Status</option>
						</select>
					</div>

					<div class="accountCreateHolder">
						<div class="button action" data-action="showCreateChatHNSAccount">＋ .chathns Account</div>

						<div class="accountCreateForm hidden">
							<div class="subtitle">New .chathns Account</div>

							<input
								type="text"
								name="managedAccountUsername"
								placeholder="username"
								autocomplete="off"
							>

							<input
								type="password"
								name="managedAccountPassword"
								placeholder="Password · minimum 8 characters"
								autocomplete="new-password"
							>

							<label class="accountAdminToggle">
								<input type="checkbox" name="managedAccountAdmin">
								<span>Global Admin</span>
							</label>

							<div class="accountCreateActions">
								<div class="button action" data-action="createChatHNSAccount">Create</div>
								<div class="button action" data-action="cancelCreateChatHNSAccount">Cancel</div>
							</div>

							<div class="response error accountCreateResponse"></div>
						</div>
					</div>

										<div class="accountExpiryForm hidden">
						<div class="subtitle accountExpiryTitle">Guest Expiry</div>

						<input type="hidden" name="managedExpiryDomain">

						<div class="setting">
							<div class="subtitle">New expiry</div>
							<select name="managedExpiryDays">
								<option value="" selected disabled>Choose…</option>
								<option value="7">≤ 7 days</option>
								<option value="30">≤ 30 days</option>
								<option value="90">≤ 90 days</option>
								<option value="180">≤ 180 days</option>
								<option value="infinite">∞</option>
							</select>
						</div>

						<div class="accountCreateActions">
							<div class="button action" data-action="saveHandshakeUserExpiry">Save</div>
							<div class="button action" data-action="cancelHandshakeUserExpiry">Cancel</div>
						</div>

						<div class="response error accountExpiryResponse"></div>
					</div>

<div class="accountEditForm hidden">
						<div class="subtitle accountEditTitle">Edit .chathns Account</div>

						<input type="hidden" name="managedEditDomain">

						<input
							type="password"
							name="managedEditPassword"
							placeholder="New password · leave empty to keep current"
							autocomplete="new-password"
						>

						<label class="accountAdminToggle">
							<input type="checkbox" name="managedEditAdmin">
							<span>Global Admin 🌐</span>
						</label>

						<div class="accountCreateActions">
							<div class="button action" data-action="saveChatHNSAccount">Save</div>
							<div class="button action" data-action="cancelEditChatHNSAccount">Cancel</div>
						</div>

						<div class="response error accountEditResponse"></div>
					</div>

					<div class="accountList">
						<div class="subtitle">Account database</div>
						<div class="subtitle">Loading follows next.</div>
					</div>
				</div>

				<div class="groupRandomSection hidden">
				<div class="subtitle">Random Stuff Texts</div>
				<div class="subtitle">Edit the global random-stuff list.</div>
				<textarea name="randomStuffTexts" rows="18" placeholder='[
  "{a} shakes {b}"
]'></textarea>
				<div class="button" data-action="saveRandomStuffTexts">Save</div>
			</div>

		</div>
		<div class="response error"></div>
	</div>

	<div class="popover" data-name="newConversation">
		<div class="head">
			<div class="title">New Conversation</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<input class="tab" type="text" name="domain" placeholder="hnschat/">
			<input type="text" name="message" placeholder="Message">
			<div class="button" data-action="startConversation">Start Conversation</div>
		</div>
		<div class="response error"></div>
	</div>
	<div class="popover" data-name="syncSession">
		<div class="head">
			<div class="title">Sync Session</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="subtitle">Use this QR code or link to sync your session to another browser.</div>
			<div id="qrcode"></div>
			<div class="group">
				<input readonly="readonly" class="copyable" type="text" name="syncLink">
				<div class="icon action clipboard" data-action="clipboard"></div>
			</div>
		</div>
	</div>
	<div class="popover" data-name="donate">
		<div class="head">
			<div class="title">Donate</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="subtitle">If you enjoy using this free service, please consider donating.</div>
			<div class="group">
				<input readonly="readonly" class="copyable" type="text" name="donateAddress" value="hs1q8aypu6783ulrecd34yurefxvy3v9vtmhd3flza">
				<div class="icon action clipboard" data-action="clipboard"></div>
			</div>
			<div class="center">&copy; <?php echo date("Y"); ?>&nbsp;<a href="https://danyelo.com" target="_blank">Danyelo Labs</a></div>
		</div>
	</div>
	<div class="popover" data-name="pay">
		<div class="head">
			<div class="title">Send HNS</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="loading flex shown">
				<div class="lds-facebook"><div></div><div></div><div></div></div>
			</div>
			<div class="content">
				<input type="hidden" name="address">
				<input type="text" name="hns" placeholder="0 HNS">
				<div class="button" data-action="sendPayment">Send with Bob Extension</div>
			</div>
			<div class="response error"></div>
		</div>
	</div>
	<div class="popover" data-name="poll">
		<div class="head">
			<div class="title">Create Poll</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="setting">
				<div class="subtitle">Question</div>
				<input type="text" name="pollQuestion" placeholder="Question">
			</div>
			<div class="setting pollOptions">
				<div class="subtitle">Options</div>
				<input type="text" name="pollOption" placeholder="Option 1">
				<input type="text" name="pollOption" placeholder="Option 2">
			</div>
			<div class="button" data-action="addPollOption">+ Option</div>
			<div class="button" data-action="createPoll">Create Poll</div>
			<div class="response error"></div>
		</div>
	</div>
	<div class="popover" data-name="settings">
		<div class="head">
			<div class="title">Settings</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="setting">
				<div class="subtitle">Avatar URL</div>
				<input class="remote tab" type="text" name="avatar" placeholder="">
			</div>
			<div class="setting">
				<div class="subtitle">HNS Wallet Address</div>
				<input class="remote tab" type="text" name="address" placeholder="">
			</div>
			<div class="setting">
				<div class="subtitle">Chat Bubble Color</div>
				<input class="local color tab" type="color" name="bubbleBackground">
			</div>
			<div class="setting">
				<div class="subtitle">Self Chat Bubble Color</div>
				<input class="local color tab" type="color" name="bubbleSelfBackground">
			</div>
			<div class="setting">
				<div class="subtitle">Mention Chat Bubble Color</div>
				<input class="local color" type="color" name="bubbleMentionBackground">
			</div>
			<div class="setting">
				<div class="subtitle">Chat Display Mode</div>
				<select class="local" name="chatDisplayMode">
					<option value="normal">Normal</option>
					<option value="compact">Compact</option>
				</select>
			</div>
			<div class="setting">
				<div class="subtitle">Sync Session</div>
				<div class="center action link" data-action="syncSession">Show QR + Link</div>
			</div>
			<div class="button" data-action="saveSettings">Save</div>
		</div>
		<div class="response error"></div>
	</div>
	<div class="popover contextMenu" data-name="userContext">
		<div class="actions">
			<div class="action icon edit" data-action="editProfile"></div>
			<div class="action icon save" data-action="saveProfile"></div>
			<div class="action icon close" data-action="undoProfile"></div>
		</div>
		<div class="body">
			<ul>
				<li>
					<div class="pic"></div>
					<span class="user subtitle"></span>
					<div class="icon type"></div>
				</li>
				<li class="bio">
					<div class="title small">Bio</div>
					<div class="bioHolder">
						<div class="bio subtitle"></div>
						<div class="limit"></div>
					</div>
				</li>
				<li class="hnsProfile hidden">
					<div class="hnsProfileFields subtitle"></div>
				</li>
				<li>
					<div class="title small">Joined</div>
					<span class="joined subtitle"></span>
				</li>
				<li class="moderation hidden">
					<div class="title small">Mute</div>
					<input type="range" name="muteDuration" min="0" max="5" step="1" value="0">
					<div class="muteLabel subtitle">0</div>
					<div class="button action" data-action="muteUser">Mute</div>
				</li>
				<li class="groupStaffControl hidden">
					<div class="button action" data-action="toggleGroupStaff">🛂 Make staff</div>
				</li>
			</ul>
			<div class="separator"></div>
			<ul class="contextActions">
				<li class="action" data-action="newConversationWith">
					<div class="icon message"></div>
					<span>Message</span>
				</li>
				<li class="action" data-action="mentionUser">
					<div class="icon mention"></div>
					<span>Mention</span>
				</li>
				<li class="action" data-action="randomStuffUser">
					<div class="icon random"></div>
					<span>Random Cow</span>
				</li>
				<li class="action speaker" data-action="inviteVideo">
					<div class="icon voice"></div>
					<span>Speaker</span>
				</li>
			</ul>
		</div>
	</div>
	<div class="popover" data-name="groupSettings">
		<div class="head">
			<div class="title">Group Settings</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<input type="hidden" name="groupID">

			<div class="subtitle groupSettingsName"></div>

			<div class="setting">
				<div class="subtitle">Display name</div>
				<input type="text" name="groupLabel" placeholder="Optional">
			</div>


			<div class="setting">
				<div class="subtitle">URL</div>
				<input type="text" name="groupURL" placeholder="https://...">
			</div>

			<div class="membershipProtected">
				<div class="membershipLockRow">
					<div class="subtitle">🔒 Access & Membership</div>
					<div class="button membershipUnlockButton" data-action="unlockGroupMembership">Unlock</div>
</div>

				<div class="membershipLockedArea">
					<div class="setting membershipAdminSetting">
						<div class="subtitle">Access</div>
						<select name="groupAccess" disabled>
							<option value="members">Members</option>
							<option value="rule">Rule</option>
							<option value="internal">Internal SLD</option>
							<option value="namebase">Namebase SLD</option>
						</select>
					</div>

					<div class="setting membershipAdminSetting settingsRuleSetting hidden">
						<div class="subtitle">Rule</div>
						<select name="groupRule" disabled>
					<option value="1to3letters">1–3 Letter</option>
					<option value="10k">10k</option>
					<option value="1emoji">1 Emoji</option>
					<option value="1symbol">1 Symbol</option>
					<option value="newnation">New Nation 🪪 1–999</option>
					<option value="handshakeuser">Guests (.handshakeuser)</option>
				</select>
					</div>
					<div class="button destructive" data-action="clearChat">Clear Chat</div>
				</div>
			</div>


			<div class="setting settingsMembersSetting">
				<div class="subtitle">Members</div>
				<textarea name="groupMembers" rows="9" placeholder='["mmsp","chathns"]'></textarea>
				<div class="membershipFileActions">
					<label class="button groupMembersUploadLabel">
						Upload
						<input class="hidden" type="file" name="groupMembersFile" accept=".json,.txt,text/plain,application/json">
					</label>
					<div class="button" data-action="downloadGroupMembers">Download</div>
				</div>
			</div>

			<div class="setting groupStaffSetting">
				<div class="subtitle">Group Staff 🛂</div>
				<textarea name="groupStaffText" rows="3" placeholder="staff1, staff2"></textarea>
			</div>

			<div class="setting">
				<div class="subtitle">Visibility</div>
				<select name="groupVisibility">
					<option value="public">Public</option>
					<option value="private">Private</option>
					<option value="hidden">Hidden</option>
				</select>
			</div>

			<div class="setting">
				<div class="subtitle">Mode</div>
				<select name="groupMode">
					<option value="group">Group</option>
					<option value="channel">Channel</option>
				</select>
			</div>

			<div class="button" data-action="saveGroupSettings">Save</div>
			
			<div class="button destructive membershipDeleteButton hidden" data-action="deleteGroup">Delete Group</div>
		</div>
		<div class="response error"></div>
	</div>

	<div class="popover contextMenu" data-name="channelContext">
		<div class="body">
			<ul>
				<li>
					<span class="channel subtitle"></span>
				</li>
			</ul>
			<div class="separator"></div>
			<ul>
				<li class="action" data-action="switchConversation">
					<div class="icon view"></div>
					<span>View</span>
				</li>
				<li class="action groupSettings hidden" data-action="openGroupSettings">
					<div class="icon edit"></div>
					<span>Settings</span>
				</li>
			</ul>
		</div>
	</div>
	<div class="popover contextMenu" data-name="messageContext">
		<div class="body">
			<ul>
				<li class="action reply" data-action="reply">
					<div class="icon reply"></div>
					<span>Reply</span>
				</li>
				<li class="action emoji" data-action="emojis">
					<div class="icon emoji"></div>
					<span>React</span>
				</li>
				<li class="action pin" data-action="pinMessage">
					<div class="icon pin"></div>
					<span>Pin</span>
				</li>
				<li class="action bulkSelect hidden" data-action="toggleMessageSelection">
					<div class="icon view"></div>
					<span>Mark</span>
				</li>
				<li class="action bulkDelete error hidden" data-action="deleteSelectedMessages">
					<div class="icon delete"></div>
					<span>Delete selected</span>
				</li>
				<li class="action delete error" data-action="deleteMessage">
					<div class="icon delete"></div>
					<span>Delete</span>
				</li>
			</ul>
		</div>
	</div>
	<div id="holder">
		<div class="header">
			<div class="left">
				<div class="icon menu"></div>
			</div>
			<div class="center">
				<a class="logo" href="https://hns.lu" target="_blank" rel="noopener noreferrer" title="HNS.LU">
					<img draggable="false" src="/assets/img/logo.png">
				</a>
				<a id="header10zeit"
					href="https://rosenburg.de"
					target="_blank"
					rel="noopener noreferrer">
					<div class="tenClock">0.00.00 ZEIT</div>
					<div class="tenDate">01.01.0 PCT</div>
				</a>
				<div class="messageHeader">
					<table></table>
					<div class="pinnedMessage flex">
						<div class="icon pin"></div>
						<div class="message"></div>
						<div class="action icon delete" data-action="pinMessage"></div>
					</div>
				</div>
				<div class="end">
					<div id="me"></div>
					<div class="domains">
						<select></select>
					</div>
				</div>
			</div>
			<div class="right">
				<div class="icon users"></div>
			</div>
		</div>
		<div id="chats">
			<div id="conversations" class="sidebar">
				<div class="title">
					<div class="tabs">
						<div class="tab" data-tab="channels">Channels</div>
						<div class="tab" data-tab="pms">Private</div>
					</div>
					<div class="actionHolder">
						<div class="action icon compose" data-action="newConversation" title="New"></div>
					</div>
				</div>
				<div class="sections">
					<div class="section channels">
						<table></table>
					</div>
					<div class="section pms">
						<table></table>
					</div>
				</div>
				<div class="footer">
					<div class="action link" data-action="settings">Settings</div>
					<div class="action link" data-action="docs">Info</div>
					<div class="action link" data-action="donate">Donate</div>
				</div>
			</div>
			<div class="content">
				<div class="pinnedMessage flex">
					<div class="icon pin"></div>
					<div class="message"></div>
					<div class="action icon delete" data-action="pinMessage"></div>
				</div>
				<div id="closeMenu"></div>
				<div id="videoInfo" class="flex">
					<div class="info">
						<div class="users"></div>
						<div class="title flex">
							<span>LIVE</span>
							<div class="icon audio"></div>
						</div>
						<div class="watching flex">
							<div class="watchers"></div>
						</div>
					</div>
					<div class="actions">
						<div class="link" data-action="viewVideo">Watch</div>
						<div class="link" data-action="startVideo">Stream</div>
						<div class="link" data-action="joinVideo">Join</div>
						<div class="link destructive" data-action="leaveVideo">Leave</div>
						<div class="link destructive" data-action="endVideo">End</div>
					</div>
				</div>
				<div id="videoContainer" class="flex">
					<div class="controls">
						<div class="button outline muted" data-action="toggleScreen">
							<div class="icon screen"></div>
						</div>
						<div class="button outline muted" data-action="toggleAudio">
							<div class="icon voice"></div>
						</div>
						<div class="button outline muted" data-action="toggleVideo">
							<div class="icon video"></div>
						</div>
						<div class="button outline muted" data-action="leaveVideo">
							<div class="icon leave"></div>
						</div>
					</div>
				
			
</div>
				<div id="messageHolder">
					<div class="popover" id="completions" data-name="completions">
						<div class="head">
							<div class="title"></div>
							<div class="icon action close" data-action="close"></div>
						</div>
						<div class="body">
							<table class="list"></table>
						</div>
					</div>
					<div class="popover" id="react" data-name="react">
						<div class="head">
							<div class="title">
								<div class="tabs">
									<div class="tab" data-name="gifs">Gifs</div>
									<div class="tab" data-name="emojis">Emojis</div>
								</div>
							</div>
							<div class="icon action close" data-action="close"></div>
						</div>
						<div class="body">
							<div class="search">
								<input type="text" name="searchGifs" placeholder="Search · Powered by GIPHY">
								<input type="text" class="shown" name="searchEmojis" placeholder="Search Emojis">
							</div>
							<div class="grids">
								<div class="grid" data-type="gifs">
									<div class="section" data-type="categories"></div>
									<div class="section flex" data-type="gifs">
										<div class="column" data-column="0"></div>
										<div class="column" data-column="1"></div>
									</div>
								</div>
								<div class="grid shown" data-type="emojis"></div>
							</div>
						</div>
					</div>
					<div id="messages"></div>
					<div id="jumpToPresent" class="hidden">
						<div class="action" data-action="jumpToPresent">Jump To Present</div>
					</div>
					<div class="loading flex">
						<div class="lds-facebook"><div></div><div></div><div></div></div>
					</div>
				</div>
				<div class="inputContainer">
					<div id="typing" class="flex">
						<div class="message"></div>
					</div>
					<div id="replying" class="flex">
						<div class="message">Replying to <span class="name"></span></div>
						<div class="action icon remove" data-action="removeReply"></div>
					</div>
					<div id="attachments" class="flex"></div>
					<div class="inputHolder">
						<div class="input">
							<div class="action icon plus" data-action="file">
								<input id="file" type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4">
							</div>
							<div class="action icon pay" data-action="pay"></div>
							<div class="action pollComposerButton hidden" data-action="poll" title="Create Poll">📊</div>
							<div class="inputs">
								<textarea id="message" placeholder="Message"></textarea>
							</div>
							<div class="action icon emoji big" data-action="emojis"></div>
						</div>
						<div class="locked"></div>
					</div>
				</div>
			</div>
			<div id="users" class="sidebar">
				<div class="title">
					<div class="group normal">
						<div class="action icon search" data-action="searchUsers"></div>
						<div>Users</div>
					</div>
					<div class="group flex searching">
						<input type="text" name="search">
						<div class="action icon close" data-action="searchUsers"></div>
					</div>
					<div id="count"></div>
				</div>
				<div class="sections">
					<div class="section users">
						<table></table>
					</div>
				</div>
			</div>
		</div>
	</div>
	<div id="avatars"></div>
</body>
