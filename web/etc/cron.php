<?php
	include "includes.php";

	// ACTIVATE NEW CHANNELS
	$getChannels = sql("SELECT * FROM `channels` WHERE `tx` IS NOT NULL AND `activated` = 0 AND `hidden` = 1");
	if ($getChannels) {
		foreach ($getChannels as $key => $data) {
			$verify = verifyTransaction($data["tx"], $data["fee"]);

			if ($verify) {
				sql("UPDATE `channels` SET `activated` = 1, `hidden` = 0 WHERE `id` = ?", [$data["id"]]);
			}
		}
	}

	// FIND REGISTRY FOR SLD GATED COMMUNITIES
	$getChannels = sql("SELECT * FROM `channels` WHERE `public` = 0 AND `hidden` = 0 AND `registry` IS NULL");
	foreach ($getChannels as $key => $data) {
		$tld = $data["name"];

		$staked = isNameStaked($tld);
		if ($staked) {
			sql("UPDATE `channels` SET `registry` = ? WHERE `ai` = ?", [$staked, $data["ai"]]);
		}
	}

	// FETCH AVATARS
	$getUsers = sql("SELECT * FROM `domains` WHERE `claimed` = 1 AND `deleted` = 0 ORDER BY `ai` DESC");
	$stakedNames = getStakedNames();

	if (!$getUsers || !is_array($getUsers)) {
		$getUsers = [];
	}

	foreach ($getUsers as $key => $data) {
		$avatar = fetchAvatar($data["domain"]);
		$avatarFile = $GLOBALS["path"]."/etc/avatars/".$data["id"];

		$tld = tldForDomain($data["domain"]);
		if ($tld && in_array($tld, $stakedNames, true)) {
			if ($data["avatar"]) {
				$avatar = $data["avatar"];
			}
		}

		if ($avatar) {
			$curl = curl_init();
			curl_setopt($curl, CURLOPT_URL, $avatar);
			curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
			curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5);
			curl_setopt($curl, CURLOPT_TIMEOUT, 10);

			$imageData = curl_exec($curl);
			$imageCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);

			if ($imageCode == 200 && $imageData && validImageWithoutFetch($imageData)) {
				sql("UPDATE `domains` SET `avatar` = ? WHERE `id` = ?", [$avatar, $data["id"]]);

				$newSize = strlen($imageData);
				$currentSize = file_exists($avatarFile) ? filesize($avatarFile) : 0;

				if ((int)$newSize !== (int)$currentSize) {
					file_put_contents($avatarFile, $imageData);
				}
			}
		}
	}
?>