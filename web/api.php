<?php
	include "etc/includes.php";

	$json = file_get_contents('php://input');
	$data = json_decode($json, true);

	if (!$data) {
		$data = $_GET;
	}

	if (!@$data["action"]) {
		die();
	}

	$output = [
		"success" => true,
		"fields" => []
	];

	foreach ($data as $key => $value) {
		if (!is_array($data[$key])) {
			$data[$key] = trim($value, ". ".chr(194).chr(160).PHP_EOL);
		}
	}

	switch ($data["action"]) {
		case "setPublicKey":
		case "getPublicKey":
		case "saveSettings":
		case "getGifCategories":
		case "searchGifs":
		case "pushToken":
		case "getMessage":
			if ($data["session"]) {
				$keyValid = @sql("SELECT * FROM `sessions` WHERE `id` = ?", [$data["session"]]);
				if (!$keyValid) {
					error("Invalid key.");
				}
			}
			else {
				error("Missing key.");
			}
			break;
	}

	switch ($data["action"]) {
	case "getHNSProfile":
		$domain = strtolower(trim((string)($data["domain"] ?? "")));

		// Only real HNS TLDs. Guests/accounts contain a dot.
		if (!$domain || strpos($domain, ".") !== false) {
			$output["profile"] = [];
			break;
		}

		if (!preg_match('/^(?:[a-z0-9][a-z0-9-]{0,61}[a-z0-9]|[a-z0-9])$/', $domain)) {
			$output["profile"] = [];
			break;
		}

		$output["profile"] = fetchHNSProfile($domain);
		break;

		case "checkName":
			if (!activeDomainForName($data["domain"])) {
				error("The domain provided isn't available to message.");
			}
			break;

		case "startSession":
			$code = "V2-".generateCode("session");
			sql("INSERT INTO `sessions` (id) VALUES (?)", [$code]);
			$output["session"] = $code;
			break;

		case "adminCreateChatHNSAccount":
				$requestDomainID = trim((string)($data["domain"] ?? ""));
				$requestSession = trim((string)($data["session"] ?? ""));

				if (!$requestDomainID || !$requestSession) {
					error("Global admin access required.");
				}

				/*
				 * Nur eine aktive Global-Admin-Identität derselben
				 * Browser-Session darf .chathns Accounts anlegen.
				 */
				$adminIdentity = sql(
					"SELECT `id`
					 FROM `domains`
					 WHERE `id` = ?
					 AND `session` = ?
					 AND `admin` = 1
					 AND `locked` = 0
					 AND `deleted` = 0
					 LIMIT 1",
					[$requestDomainID, $requestSession]
				);

				if (!$adminIdentity) {
					error("Global admin access required.");
				}

				$username = strtolower(trim((string)($data["username"] ?? "")));
				$password = (string)($data["password"] ?? "");
				$makeAdmin = !empty($data["admin"]);
				$namespace = "chathns";

				if (!$username || !$password) {
					error("Username and password required.");
				}

				if (!preg_match('/^(?:[a-z0-9][a-z0-9-]{0,61}[a-z0-9]|[a-z0-9])$/', $username)) {
					error("Username may contain letters, numbers and hyphens only.");
				}

				if (strlen($password) < 8) {
					error("Password must be at least 8 characters.");
				}

				$domainName = $username.".chathns";

				$existingAccount = sql(
					"SELECT `ai`
					 FROM `accounts`
					 WHERE `username` = ?
					 AND `namespace` = ?
					 LIMIT 1",
					[$username, $namespace]
				);

				if ($existingAccount) {
					error("Account already exists.");
				}

				$existingDomain = sql(
					"SELECT `id`
					 FROM `domains`
					 WHERE `domain` = ?
					 AND `deleted` = 0
					 LIMIT 1",
					[$domainName]
				);

				if ($existingDomain) {
					error("Account already exists.");
				}

				$newSession = "V2-".generateCode("session");

				sql(
					"INSERT INTO `sessions` (`id`) VALUES (?)",
					[$newSession]
				);

				$domainID = generateCode("domain");
				$created = time();
				$role = $makeAdmin ? "admin" : "user";
				$domainAdmin = $makeAdmin ? 1 : 0;

				sql(
					"INSERT INTO `domains`
					 (`id`, `domain`, `type`, `session`, `created`,
					  `claimed`, `admin`)
					 VALUES (?, ?, 'account', ?, ?, 1, ?)",
					[
						$domainID,
						$domainName,
						$newSession,
						$created,
						$domainAdmin
					]
				);

				sql(
					"INSERT INTO `accounts`
					 (`username`, `namespace`, `password_hash`,
					  `session`, `domain_id`, `role`,
					  `created`, `disabled`)
					 VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
					[
						$username,
						$namespace,
						password_hash($password, PASSWORD_DEFAULT),
						$newSession,
						$domainID,
						$role,
						$created
					]
				);

				$output["success"] = true;
				$output["domain"] = $domainID;
				$output["name"] = $domainName;
				$output["namespace"] = $namespace;
				$output["role"] = $role;
				$output["admin"] = $makeAdmin;
				break;

			case "adminUpdateChatHNSAccount":
				$requestDomainID = trim((string)($data["domain"] ?? ""));
				$requestSession = trim((string)($data["session"] ?? ""));

				/*
				 * Only an active global admin from this browser session
				 * may manage .chathns accounts.
				 */
				$actor = sql(
					"SELECT `id`
					 FROM `domains`
					 WHERE `id` = ?
					 AND `session` = ?
					 AND `admin` = 1
					 AND `locked` = 0
					 AND `deleted` = 0
					 LIMIT 1",
					[$requestDomainID, $requestSession]
				);

				if (!$actor) {
					error("Global admin access required.");
				}

				$accountName = strtolower(trim((string)($data["account"] ?? "")));
				$password = (string)($data["password"] ?? "");

				/*
				 * Root admin is configured locally and cannot be changed
				 * through the web account-management panel.
				 */
				$rootAdmin = "";
				$rootConfigPath = dirname(__DIR__)."/server/config.json";

				if (is_file($rootConfigPath)) {
					$rootConfig = json_decode(
						file_get_contents($rootConfigPath),
						true
					);

					if (
						is_array($rootConfig) &&
						!empty($rootConfig["rootAdmin"])
					) {
						$rootAdmin = strtolower(
							trim((string)$rootConfig["rootAdmin"])
						);
					}
				}

				if ($accountName === $rootAdmin) {
					error("The root admin cannot be modified from the web panel.");
				}
				$makeAdmin = !empty($data["admin"]);

				if (
					!$accountName ||
					!str_ends_with($accountName, ".chathns")
				) {
					error("Invalid .chathns account.");
				}

				$username = substr($accountName, 0, -8);

				if (!preg_match('/^(?:[a-z0-9][a-z0-9-]{0,61}[a-z0-9]|[a-z0-9])$/', $username)) {
					error("Invalid .chathns account.");
				}

				if ($password !== "" && strlen($password) < 8) {
					error("Password must be at least 8 characters.");
				}

				$accounts = sql(
					"SELECT *
					 FROM `accounts`
					 WHERE `username` = ?
					 AND `namespace` = 'chathns'
					 LIMIT 1",
					[$username]
				);

				if (!$accounts) {
					error("Account not found.");
				}

				$account = $accounts[0];

				$domains = sql(
					"SELECT `id`, `domain`, `admin`, `locked`, `deleted`
					 FROM `domains`
					 WHERE `id` = ?
					 AND `deleted` = 0
					 LIMIT 1",
					[$account["domain_id"]]
				);

				if (!$domains) {
					error("Account identity not found.");
				}

				$target = $domains[0];
				$currentlyAdmin = (int)$target["admin"] === 1;

				/*
				 * A global admin can only be demoted when another active
				 * global admin remains.
				 */
				if ($currentlyAdmin && !$makeAdmin) {
					$otherAdmins = sql(
						"SELECT `id`
						 FROM `domains`
						 WHERE `admin` = 1
						 AND `locked` = 0
						 AND `deleted` = 0
						 AND `id` <> ?",
						[$target["id"]]
					);

					if (!$otherAdmins || count($otherAdmins) < 1) {
						error("Please appoint another global admin before removing this admin.");
					}
				}

				$newRole = $makeAdmin ? "admin" : "user";
				$newAdmin = $makeAdmin ? 1 : 0;

				sql(
					"UPDATE `domains`
					 SET `admin` = ?
					 WHERE `id` = ?",
					[$newAdmin, $target["id"]]
				);

				sql(
					"UPDATE `accounts`
					 SET `role` = ?
					 WHERE `domain_id` = ?",
					[$newRole, $target["id"]]
				);

				if ($password !== "") {
					sql(
						"UPDATE `accounts`
						 SET `password_hash` = ?
						 WHERE `domain_id` = ?",
						[
							password_hash($password, PASSWORD_DEFAULT),
							$target["id"]
						]
					);
				}

				$output["success"] = true;
				$output["name"] = $target["domain"];
				$output["admin"] = $makeAdmin;
				$output["role"] = $newRole;
				$output["passwordChanged"] = $password !== "";
				break;


			case "adminDeleteAccount":
				$requestDomainID = trim((string)($data["domain"] ?? ""));
				$requestSession = trim((string)($data["session"] ?? ""));
				$accountName = strtolower(trim((string)($data["account"] ?? "")));

				/*
				 * Only an active global admin from this browser session
				 * may delete managed accounts.
				 */
				$actors = sql(
					"SELECT `id`, `domain`
					 FROM `domains`
					 WHERE `id` = ?
					 AND `session` = ?
					 AND `admin` = 1
					 AND `locked` = 0
					 AND `deleted` = 0
					 LIMIT 1",
					[$requestDomainID, $requestSession]
				);

				if (!$actors) {
					error("Global admin access required.");
				}

				$actor = $actors[0];

				if (!$accountName) {
					error("Account required.");
				}

				/*
				 * Root admin comes from the local server config.
				 */
				$rootAdmin = "";
				$rootConfigPath = dirname(__DIR__)."/server/config.json";

				if (is_file($rootConfigPath)) {
					$rootConfig = json_decode(
						file_get_contents($rootConfigPath),
						true
					);

					if (
						is_array($rootConfig) &&
						!empty($rootConfig["rootAdmin"])
					) {
						$rootAdmin = strtolower(
							trim((string)$rootConfig["rootAdmin"])
						);
					}
				}

				if ($accountName === $rootAdmin) {
					error("The root admin cannot be deleted.");
				}

				/*
				 * Only managed account namespaces are deletable here.
				 * Verified Handshake TLDs are deliberately excluded.
				 */
				if (str_ends_with($accountName, ".chathns")) {
					$namespace = "chathns";
					$username = substr($accountName, 0, -8);
				}
				else if (str_ends_with($accountName, ".handshakeuser")) {
					$namespace = "handshakeuser";
					$username = substr($accountName, 0, -14);
				}
				else {
					error("This account type cannot be deleted here.");
				}

				$accounts = sql(
					"SELECT *
					 FROM `accounts`
					 WHERE `username` = ?
					 AND `namespace` = ?
					 LIMIT 1",
					[$username, $namespace]
				);

				if (!$accounts) {
					error("Account not found.");
				}

				$account = $accounts[0];

				$targets = sql(
					"SELECT `id`, `domain`, `admin`, `locked`, `deleted`
					 FROM `domains`
					 WHERE `id` = ?
					 LIMIT 1",
					[$account["domain_id"]]
				);

				if (!$targets) {
					error("Account identity not found.");
				}

				$target = $targets[0];

				if ((int)$target["deleted"] === 1) {
					error("Account is already deleted.");
				}

				/*
				 * Never delete the identity currently performing
				 * the administration action.
				 */
				if ((string)$target["id"] === (string)$actor["id"]) {
					error("You cannot delete your current account.");
				}

				/*
				 * Global admins must first be demoted explicitly.
				 */
				if ((int)$target["admin"] === 1) {
					error("Remove Global Admin rights before deleting this account.");
				}

				/*
				 * Soft delete:
				 * - historical identity/messages remain intact
				 * - account can no longer log in
				 * - normal domain queries ignore it
				 */
				sql(
					"UPDATE `domains`
					 SET `deleted` = 1,
					     `locked` = 1,
					     `admin` = 0
					 WHERE `id` = ?",
					[$target["id"]]
				);

				sql(
					"UPDATE `accounts`
					 SET `disabled` = 1,
					     `role` = 'user'
					 WHERE `domain_id` = ?",
					[$target["id"]]
				);

				$output["success"] = true;
				$output["name"] = $target["domain"];
				$output["deleted"] = true;
				break;

			case "adminSetHandshakeUserExpiry":
				$requestDomainID = trim((string)($data["domain"] ?? ""));
				$requestSession = trim((string)($data["session"] ?? ""));
				$accountName = strtolower(trim((string)($data["account"] ?? "")));
				$days = (string)($data["days"] ?? "");

				$actor = sql(
					"SELECT `id`
					 FROM `domains`
					 WHERE `id` = ?
					 AND `session` = ?
					 AND `admin` = 1
					 AND `locked` = 0
					 AND `deleted` = 0
					 LIMIT 1",
					[$requestDomainID, $requestSession]
				);

				if (!$actor) {
					error("Global admin access required.");
				}

				if (!str_ends_with($accountName, ".handshakeuser")) {
					error("Only .handshakeuser accounts have an expiry.");
				}

				$username = substr($accountName, 0, -14);

				$accounts = sql(
					"SELECT `ai`, `domain_id`, `disabled`
					 FROM `accounts`
					 WHERE `username` = ?
					 AND `namespace` = 'handshakeuser'
					 LIMIT 1",
					[$username]
				);

				if (!$accounts) {
					error("Account not found.");
				}

				if ((int)$accounts[0]["disabled"] === 1) {
					error("Deleted or expired accounts cannot be extended.");
				}

				if ($days === "infinite") {
					$expiresAt = null;
				}
				else {
					$allowed = [7, 30, 90, 180];
					$daysInt = (int)$days;

					if (!in_array($daysInt, $allowed, true)) {
						error("Invalid expiry.");
					}

					/*
					 * Extension starts now, not from the old expiry.
					 */
					$expiresAt = time() + ($daysInt * 86400);
				}

				sql(
					"UPDATE `accounts`
					 SET `expires_at` = ?
					 WHERE `ai` = ?",
					[$expiresAt, $accounts[0]["ai"]]
				);

				$output["success"] = true;
				$output["name"] = $accountName;
				$output["expires_at"] = $expiresAt;
				break;

			case "registerAccount":
			$username = strtolower(trim(@$data["username"]));
			$password = @$data["password"];
			$namespace = "handshakeuser";

			if (!$username || !$password) {
				error("Username and password required.");
			}

			// Same basic naming rules as ChatHNS SLDs:
			// letters, numbers and hyphen; no dots.
			if (!preg_match('/^(?:[a-z0-9][a-z0-9-]{0,61}[a-z0-9]|[a-z0-9])$/', $username)) {
				error("Username may contain letters, numbers and hyphens only.");
			}

			if (strlen($password) < 8) {
				error("Password must be at least 8 characters.");
			}

			$domainName = $username.".".$namespace;

			$existingAccount = sql(
				"SELECT `ai` FROM `accounts`
				 WHERE `username` = ?
				 AND `namespace` = ?
				 LIMIT 1",
				[$username, $namespace]
			);

			if ($existingAccount) {
				error("Username already registered.");
			}

			$existingDomain = sql(
				"SELECT `id` FROM `domains`
				 WHERE `domain` = ?
				 AND `deleted` = 0
				 LIMIT 1",
				[$domainName]
			);

			if ($existingDomain) {
				error("Username already registered.");
			}

			// Reuse current browser session when valid.
			$session = trim((string)($data["session"] ?? ""));

			if ($session) {
				$sessionExists = sql(
					"SELECT `id` FROM `sessions`
					 WHERE `id` = ?
					 LIMIT 1",
					[$session]
				);

				if (!$sessionExists) {
					$session = "";
				}
			}

			if (!$session) {
				// Mirror the existing startSession behaviour.
				$session = "V2-".generateCode("session");
				sql("INSERT INTO `sessions` (`id`) VALUES (?)", [$session]);
			}

			$domainID = generateCode("domain");
			$created = time();
			$expiresAt = $created + (7 * 86400);

			sql(
				"INSERT INTO `domains`
				 (`id`, `domain`, `type`, `session`, `created`, `claimed`)
				 VALUES (?, ?, 'account', ?, ?, 1)",
				[$domainID, $domainName, $session, $created]
			);

			sql(
				"INSERT INTO `accounts`
				 (`username`, `namespace`, `password_hash`, `session`,
				  `domain_id`, `role`, `created`, `expires_at`, `disabled`)
				 VALUES (?, ?, ?, ?, ?, 'user', ?, ?, 0)",
				[
					$username,
					$namespace,
					password_hash($password, PASSWORD_DEFAULT),
					$session,
					$domainID,
					$created,
					$expiresAt
				]
			);

			$output["session"] = $session;
			$output["domain"] = $domainID;
			$output["name"] = $domainName;
			$output["namespace"] = $namespace;
			$output["role"] = "user";
			$output["expires_at"] = $expiresAt;
			break;

		case "loginAccount":
			$login = strtolower(trim(@$data["username"]));
			$password = @$data["password"];

			if (!$login || !$password) {
				error("Username and password required.");
			}

			// Accept a full namespaced account or a bare username.
			if (str_contains($login, ".")) {
				$parts = explode(".", $login, 2);
				$username = $parts[0];
				$namespace = $parts[1];
			}
			else {
				$username = $login;
				$namespace = "handshakeuser";
			}

			$accounts = sql(
				"SELECT * FROM `accounts`
				 WHERE `username` = ?
				 AND `namespace` = ?
				 AND `disabled` = 0
				 LIMIT 1",
				[$username, $namespace]
			);

			if (!$accounts || !password_verify($password, $accounts[0]["password_hash"])) {
				error("Invalid username or password.");
			}

			$account = $accounts[0];

			/*
			 * Temporary .handshakeuser accounts expire at a fixed time.
			 * Login activity never extends the deadline.
			 */
			if (
				$account["namespace"] === "handshakeuser" &&
				$account["expires_at"] !== null &&
				(int)$account["expires_at"] <= time()
			) {
				sql(
					"UPDATE `accounts`
					 SET `disabled` = 1
					 WHERE `ai` = ?",
					[$account["ai"]]
				);

				sql(
					"UPDATE `domains`
					 SET `locked` = 1,
					     `deleted` = 1
					 WHERE `id` = ?",
					[$account["domain_id"]]
				);

				error("Guest account expired.");
			}

			$domain = @sql(
				"SELECT `id`, `domain`, `admin`
				 FROM `domains`
				 WHERE `id` = ?
				 AND `deleted` = 0
				 LIMIT 1",
				[$account["domain_id"]]
			)[0];

			if (!$domain) {
				error("Account identity not found.");
			}

			// If this browser already has a valid session, add the
			// account identity to that session instead of replacing it.
			$currentSession = trim((string)($data["session"] ?? ""));

			if ($currentSession) {
				$sessionExists = @sql(
					"SELECT `id` FROM `sessions` WHERE `id` = ? LIMIT 1",
					[$currentSession]
				);

				if ($sessionExists) {
					sql(
						"UPDATE `domains` SET `session` = ? WHERE `id` = ?",
						[$currentSession, $domain["id"]]
					);

					sql(
						"UPDATE `accounts` SET `session` = ? WHERE `domain_id` = ?",
						[$currentSession, $domain["id"]]
					);

					$account["session"] = $currentSession;
				}
			}

			$output["session"] = $account["session"];
			$output["domain"] = $domain["id"];
			$output["name"] = $domain["domain"];
			$output["namespace"] = $account["namespace"];
			$output["role"] = $account["role"];
			break;
			
		case "setPublicKey":
			$insert = sql("UPDATE `sessions` SET `pubkey` = ? WHERE `id` = ? AND `pubkey` IS NULL", [$data["pubkey"], $data["session"]]);
			break;

		case "getPublicKey":
			$key = @sql("SELECT `pubkey` FROM `sessions` WHERE `id` = ?", [$data["session"]])[0]["pubkey"];
			$output["pubkey"] = $key;
			break;

		case "getAddress":
			$address = @sql("SELECT `address` FROM `domains` WHERE `id` = ?", [$data["domain"]])[0];
			if ($address["address"]) {
				$output["address"] = $address["address"];
			}
			break;

		case "saveSettings":
			$settings = json_decode($data["settings"], true);
			
			$domainInfo = domainForID($data["domain"]);
			$tld = tldForDomain($domainInfo["domain"]);

			if (@$settings["avatar"]) {
				if (in_array($tld, getStakedNames())) {
					$settings["avatar"] = trim($settings["avatar"]);

					if (!validImage($settings["avatar"])) {
						error("The Avatar URL provided isn't a valid image.");
					}

					sql("UPDATE `domains` SET `avatar` = ? WHERE `id` = ? AND `session` = ?", [$settings["avatar"], $data["domain"], $data["session"]]);

					$output["avatar"] = $settings["avatar"];
				}
				else {
					error("Only SLD's of staked TLD's can set an Avatar here.");
				}
			}

			if (@$settings["address"]) {
				if (in_array($tld, getStakedHIP2Names())) {
					$settings["address"] = trim($settings["address"]);
					
					if (!validateAddress($settings["address"])) {
						error("The HNS Address provided isn't valid.");
					}

					sql("UPDATE `domains` SET `address` = ? WHERE `id` = ? AND `session` = ?", [$settings["address"], $data["domain"], $data["session"]]);
				}
				else {
					error("Only SLD's of certain staked TLD's can set an address here.");
				}
			}
			break;

		case "getMetaTags":
			$checkCache = @sql("SELECT `id`, `link`, `title`, `description`, `image`, `video` FROM `previews` WHERE `link` = ?", [$data["url"]])[0];
			if ($checkCache) {
				unset($checkCache["link"]);

				foreach ($checkCache as $key => $value) {
					if (!$value) {
						unset($checkCache[$key]);
					}
				}

				$tags = $checkCache;
			}
			else {
				$tags = fetchMetaTags($data["url"]);
			}
			
			if (@$tags["id"]) {
				if (@$tags["title"]) {
					$output["tags"] = $tags;
				}

				if (@$output["tags"]["image"]) {
					$output["tags"]["image"] = "/preview/".$tags["id"];
				}

				if (@$output["tags"]["description"]) {
					$output["tags"]["description"] = $output["tags"]["description"];
				}
			}
			break;

		case "getGifCategories":
			$categories = [];
			$getGifs = file_get_contents("https://api.giphy.com/v2/categories?key=".$GLOBALS["tenorKey"]."&client_key=HNSChat&limit=20");
			$json = json_decode($getGifs, true);

			if (@$json["tags"]) {
				foreach ($json["tags"] as $key => $tag) {
					$categories[] = [
						"term" => @$tag["searchterm"],
						"gif" => @$tag["image"]
					];
				}
			}

			$output["categories"] = $categories;
			break;

		case "searchGifs":
			if (@$data["query"]) {
				$gifs = [];
				$getGifs = file_get_contents("https://api.giphy.com/v2/search?q=".urlencode($data["query"])."&key=".$GLOBALS["tenorKey"]."&client_key=HNSChat&limit=100");
				$json = json_decode($getGifs, true);

				if (@$json["results"]) {
					foreach ($json["results"] as $key => $gif) {
						$gifs[] = [
							"id" => @$gif["id"],
							"preview" => @$gif["media_formats"]["tinygif"]["url"],
							"full" => @$gif["media_formats"]["gif"]["url"],
							"width" => @$gif["media_formats"]["gif"]["dims"][0],
							"height" => @$gif["media_formats"]["gif"]["dims"][1],
						];
					}
				}

				$output["gifs"] = $gifs;
			}
			break;

		case "getMessage":
			$message = @sql("SELECT * FROM `messages` WHERE `id` = ?", [$data["id"]])[0];
			if ($message) {
				$domain = domainForID($data["domain"]);
				$channel = channelForID($message["conversation"]);
				if ($channel) {
					$members = json_decode($channel["members"] ?? "[]", true);
						$admins = json_decode($channel["admins"] ?? "[]", true);

						if (!is_array($members)) $members = [];
						if (!is_array($admins)) $admins = [];

						$userDomain = strtolower((string)($domain["domain"] ?? ""));
						$userTLD = strtolower((string)($domain["tld"] ?? ""));
						$channelName = strtolower((string)($channel["name"] ?? ""));

						$canRead =
							!empty($channel["public"]) ||
							!empty($domain["admin"]) ||
							($userTLD !== "" && $userTLD === $channelName) ||
							in_array($userDomain, $admins, true) ||
							in_array($userDomain, $members, true) ||
							in_array($userTLD, $members, true);

						if ($canRead) {
						$output = [
							"success" => true,
							"id" => $message["id"],
							"time" => $message["time"],
							"conversation" => $message["conversation"],
							"user" => $message["user"],
							"message" => $message["message"],
							"reactions" => $message["reactions"],
						];

						if (@$message["reply"]) {
							$output["reply"] = true;
							$output["replying"] = $message["replying"];
						}
					}
				}
			}
			break;

		case "pushToken":
			if (preg_match("/^ExponentPushToken\[.+?\]$/", $data["token"])) {
				$exists = @sql("SELECT JSON_CONTAINS(`push`, JSON_QUOTE(?), '$') AS `exists` FROM `sessions` WHERE `id` = ?", [$data["token"], $data["session"]])[0]["exists"];
				if (!$exists) {
					sql("UPDATE `sessions` SET `push` = JSON_ARRAY_APPEND(`push`, '$', ?) WHERE `id` = ?", [$data["token"], $data["session"]]);
				}
			}
			break;
		
		default:
			$output["message"] = "Unknown function.";
			$output["success"] = false;
			break;
	}

	end:
	if (@$output["fields"] && @count($output["fields"])) {
		$output["fields"] = array_unique($output["fields"]);
		$output["success"] = false;
	}
	else {
		unset($output["fields"]);
	}

	die(json_encode($output));
?>
