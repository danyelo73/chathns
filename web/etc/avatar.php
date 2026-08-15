<?php
	include "includes.php";

	$id = trim((string)($_GET["id"] ?? ""));

	if (!$id) {
		http_response_code(404);
		exit;
	}

	$avatarFile = $GLOBALS["path"]."/etc/avatars/".$id;
	$domainInfo = domainForID($id);

	/*
	 * Existing/local ChatHNS avatar has priority.
	 */
	if (
		$domainInfo &&
		!empty($domainInfo["avatar"]) &&
		file_exists($avatarFile)
	) {
		$image = file_get_contents($avatarFile);
		$type = mime_content_type($avatarFile);

		header("Content-Type: ".$type);
		die($image);
	}

	/*
	 * Handshake TLD:
	 * fall back to the avatar from the HNS Profile TXT record.
	 *
	 * We redirect the browser instead of downloading the external
	 * image on the ChatHNS server.
	 */
	if (
		$domainInfo &&
		($domainInfo["type"] ?? "") === "handshake" &&
		!empty($domainInfo["domain"])
	) {
		$domain = strtolower(trim((string)$domainInfo["domain"]));
		$profile = fetchHNSProfile($domain);
		$avatar = trim((string)($profile["avatar"] ?? ""));

		if (
			$avatar &&
			preg_match('#^https://#i', $avatar)
		) {
			header("Location: ".$avatar, true, 302);
			exit;
		}
	}

	http_response_code(404);
	exit;
?>
