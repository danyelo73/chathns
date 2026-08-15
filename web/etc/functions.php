<?php
	function error($message) {
		$output = [
			"success" => false,
			"message" => $message
		];

		die(json_encode($output));
	}

	function generateID($length) {
		$alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
	    $pass = array();
	    $alphaLength = strlen($alphabet) - 1;
	    for ($i = 0; $i < $length; $i++) {
	        $n = rand(0, $alphaLength);
	        $pass[] = $alphabet[$n];
	    }
	    return implode($pass);
	}

	function generateNumber($length) {
		$alphabet = '123456789';
	    $pass = array();
	    $alphaLength = strlen($alphabet) - 1;
	    for ($i = 0; $i < $length; $i++) {
	        $n = rand(0, $alphaLength);
	        $pass[] = $alphabet[$n];
	    }
	    return implode($pass);
	}

	function generateCode($type) {
		switch ($type) {
			case "session":
				$db = "sessions";
				$param = "id";
				$length = 32;
				$prefix = "V2-";
				break;

			case "domain":
				$db = "domains";
				$param = "id";
				$length = 16;
				break;

			case "preview":
				$db = "previews";
				$param = "id";
				$length = 16;
				break;

			case "upload":
				$db = "uploads";
				$param = "id";
				$length = 32;
				break;

			default:
				return;
		}

		tryAgain:
		$id = generateID($length);

		$checkExists = sql("SELECT * FROM `".$db."` WHERE `".$param."` = ?", [@$prefix.$id]);
		if ($checkExists) {
			goto tryAgain;
		}
		
		return $id;
	}

	function guidv4($data) {
	    assert(strlen($data) == 16);

	    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // set version to 0100
	    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // set bits 6-7 to 10

	    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
	}

	function verifyTransaction($tx, $amount) {
		$amount = preg_replace("/[^0-9]/", "", $amount);
		$address = "hs1q8aypu6783ulrecd34yurefxvy3v9vtmhd3flza";

		$response = queryHSW("/wallet/hnschat-hip-2/tx/".$tx);
		foreach (@$response["outputs"] as $key => $output) {
			if (@$response["confirmations"] >= 2 && $output["value"] == $amount && $output["address"] = $address) {
				return true;
			}
		}

		return false;
	}

	function tldForDomain($domain) {
		$split = explode(".", $domain);
		$tld = end($split);

		return $tld;
	}

	function domainForID($id) {
		$getDomain = @sql("SELECT * FROM `domains` WHERE `id` = ?", [$id])[0];
		if ($getDomain) {
			return $getDomain;
		}

		return false;
	}

	function domainForName($name) {
		$getDomain = @sql("SELECT * FROM `domains` WHERE `domain` = ?", [$name])[0];
		if ($getDomain) {
			return $getDomain;
		}

		return false;
	}

	function activeDomainForName($name) {
		$getDomain = @sql("SELECT * FROM `domains` WHERE `domain` = ? AND `claimed` = 1 AND `locked` = 0 AND `deleted` = 0", [$name])[0];
		if ($getDomain) {
			return $getDomain;
		}
		return false;
	}

	function channelForID($id) {
		$getChannel = @sql("SELECT * FROM `channels` WHERE `id` = ?", [$id])[0];
		if ($getChannel) {
			return $getChannel;
		}

		return false;
	}

	function getStakedNames() {
		$getNames = sql("SELECT `name` FROM `channels` WHERE `slds` = 1 AND `hidden` = 0 ORDER BY `name` ASC");

		$names = [];

		if (!$getNames || !is_array($getNames)) {
			return $names;
		}

		foreach ($getNames as $key => $value) {
			$names[] = $value["name"];
		}

		return $names;
	}

	function getStakedHIP2Names() {
		$getNames = sql("SELECT `name` FROM `channels` WHERE `slds` = 1 AND `hip2` = 1 AND `hidden` = 0 ORDER BY `name` ASC");

		$names = [];
		foreach ($getNames as $key => $value) {
			$names[] = $value["name"];
		}

		return $names;
	}

	function isNameStaked($tld) {
		if ($tld === "eth") {
			return "ens";
		}

		$data = [
			"method" => "getnameresource",
			"params" => [$tld],
		];
		$response = queryHSD($data);

		if (@$response["records"]) {
			foreach ($response["records"] as $key => $value) {
				if ($value["type"] == "NS") {
					if (stripos($value["ns"], ".nameserver.io.") !== false || stripos($value["ns"], ".registry.namebase.io.") !== false) {
						return "namebase";
					}
					if ($value["ns"] == "0x06081C6B2B876EABDC41DFD3345e8Fa59588C02e._eth.") {
						return "impervious";
					}
				}
			}
		}
return false;
	}


	function avatarFromTXT($content) {
		$content = trim((string)$content);
		$avatar = false;

		// Current HNS Profile Record Standard.
		if (substr($content, 0, 4) === "ava=") {
			$avatar = trim(substr($content, 4));

			if (substr($avatar, 0, 6) === "imgur.") {
				$code = trim(substr($avatar, 6));

				if (preg_match('/^[A-Za-z0-9]+$/', $code)) {
					$avatar = "https://i.imgur.com/".$code.".png";
				}
				else {
					$avatar = false;
				}
			}
			elseif ($avatar && !preg_match('#^https?://#i', $avatar)) {
				$avatar = "https://".$avatar;
			}
		}
		// Legacy HNSChat records.
		elseif (substr($content, 0, 15) === "profile avatar=") {
			$avatar = trim(substr($content, 15));
		}
		elseif (substr($content, 0, 7) === "avatar=") {
			$avatar = trim(substr($content, 7));
		}

		if ($avatar && filter_var($avatar, FILTER_VALIDATE_URL) !== false) {
			return $avatar;
		}

		return false;
	}


	function fetchHNSProfile($domain) {
		$profile = [];

		if (!$domain || strpos($domain, ".") !== false) {
			return $profile;
		}

		$data = [
			"method" => "getnameresource",
			"params" => [$domain],
		];

		$response = queryHSD($data);

		if (!$response || empty($response["records"])) {
			return $profile;
		}

		/*
		 * HNS Profile Record Standard
		 *
		 * New short forms + legacy forms currently found on-chain.
		 */
		$map = [
			// Current short forms
			"ava"          => "avatar",
			"ali"          => "alias",
			"bio"          => "bio",
			"web"          => "web",
			"email"        => "email",
			"tg"           => "telegram",
			"tg.ac"        => "telegram",
			"x"            => "x",
			"gt"           => "github",
			"red"          => "reddit",
			"wal.hns"      => "hns",
			"wal.btc"      => "btc",
			"wal.eth"      => "eth",

			// Legacy forms
			"profile.bio"  => "bio",
			"url.website"  => "web",
			"url.telegram" => "telegram",
			"url.twitter"  => "x",
			"url.github"   => "github",
			"url.reddit"   => "reddit",
			"wallet.hns"   => "hns",
			"wallet.btc"   => "btc",
			"wallet.eth"   => "eth",
		];

		foreach ($response["records"] as $record) {
			if (empty($record["txt"])) {
				continue;
			}

			foreach ($record["txt"] as $content) {
				$content = trim((string)$content);

				if (!$content) {
					continue;
				}

				/*
				 * Old avatar syntax:
				 * profile avatar=https://...
				 */
				if (preg_match('/^profile\s+avatar\s*=\s*(.+)$/i', $content, $m)) {
					if (empty($profile["avatar"])) {
						$profile["avatar"] = trim($m[1]);
					}
					continue;
				}

				if (strpos($content, "=") === false) {
					continue;
				}

				list($key, $value) = explode("=", $content, 2);

				$key = strtolower(trim($key));
				$value = trim($value);

				if (!$value || !isset($map[$key])) {
					continue;
				}

				$field = $map[$key];

				// First supported value wins.
				if (!isset($profile[$field])) {
					$profile[$field] = $value;
				}
			}
		}

		/*
		 * Normalize avatar through the existing ChatHNS helper.
		 */
		if (!empty($profile["avatar"])) {
			$avatar = avatarFromTXT("ava=".$profile["avatar"]);

			if ($avatar) {
				$profile["avatar"] = $avatar;
			}
			else {
				unset($profile["avatar"]);
			}
		}

		return $profile;
	}


	function fetchAvatar($domain) {
		if (!$domain) {
			return false;
		}

		/*
		 * Handshake TLD:
		 * read the name resource directly from the local Bob/HSD node.
		 */
		if (strpos($domain, ".") === false) {
			$data = [
				"method" => "getnameresource",
				"params" => [$domain],
			];

			$response = queryHSD($data);

			if ($response && !empty($response["records"])) {
				foreach ($response["records"] as $record) {
					if (!empty($record["txt"])) {
						foreach ($record["txt"] as $content) {
							$avatar = avatarFromTXT($content);

							if ($avatar) {
								return $avatar;
							}
						}
					}
				}
			}

			return false;
		}

		/*
		 * Normal domain / SLD:
		 * keep the existing DNS lookup.
		 */
		$getRecords = shell_exec(
			"dig +noall +answer ".
			escapeshellarg($domain).
			" TXT 2>/dev/null"
		);

		preg_match_all(
			"/(?<domain>.+)\..+TXT\s\"(?<value>.+)\"/",
			$getRecords,
			$matches
		);

		if ($matches) {
			foreach ($matches["domain"] as $key => $data) {
				if ($data === $domain) {
					$value = $matches["value"][$key];

					$avatar = avatarFromTXT($value);

					if ($avatar) {
						return $avatar;
					}
				}
			}
		}

		return false;
	}

	function getContents($url) {
		$curl = curl_init();
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_PROXY, "127.0.0.1:8080");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, TRUE);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5); 
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        $c = curl_exec($curl);
        curl_close($curl);

        return $c;
	}

	function getContentsWithCode($url) {
		$curl = curl_init();
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_PROXY, "127.0.0.1:8080");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, TRUE);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5); 
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        $data = curl_exec($curl);
        $code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        return [
        	"data" => $data,
        	"code" => $code
        ];
	}

	function getContentsWithSpoof($url) {
		$curl = curl_init();
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_PROXY, "127.0.0.1:8080");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, TRUE);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5); 
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        curl_setopt($curl, CURLOPT_USERAGENT, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com/bot.html)");
        $c = curl_exec($curl);
        curl_close($curl);

        return $c;
	}

	function post($url, $data) {
		$ch = curl_init($url);
		$payload = json_encode($data);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
		curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		$result = curl_exec($ch);
		curl_close($ch);

		return $result;
	}

	function fetchMetaTags($url) {
		$output = [];
		
		if (filter_var($url, FILTER_VALIDATE_URL) !== false) {
			libxml_use_internal_errors(true);

			$c = getContentsWithSpoof($url);

			if ($c) {
				$d = new DomDocument();
				$d->loadHTML($c);
				$xp = new domxpath($d);

				foreach ($xp->query("//title") as $el) {
					$output["title"] = $el->textContent;
				}
				foreach ($xp->query("//meta[@property='og:title']") as $el) {
					$output["title"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@name='og:title']") as $el) {
					$output["title"] = $el->getAttribute("content");
				}

				foreach ($xp->query("//meta[@property='description']") as $el) {
				    $output["description"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@name='description']") as $el) {
				    $output["description"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@property='og:description']") as $el) {
				    $output["description"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@name='og:description']") as $el) {
				    $output["description"] = $el->getAttribute("content");
				}

				foreach ($xp->query("//meta[@property='og:image']") as $el) {
					$image = $el->getAttribute("content");
					if (validImage($image)) {
						$output["image"] = $image;
					}
				}
				foreach ($xp->query("//meta[@name='og:image']") as $el) {
					$image = $el->getAttribute("content");
					if (validImage($image)) {
						$output["image"] = $image;
					}
				}

				foreach ($xp->query("//meta[@property='og:video:secure_url']") as $el) {
					$output["video"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@name='og:video:secure_url']") as $el) {
					$output["video"] = $el->getAttribute("content");
				}
			}
		}

		if (@$output["title"]) {
			$id = generateCode("preview");
			$insert = sql("INSERT INTO `previews` (id, link, title, description, image, video) VALUES (?,?,?,?,?,?)", [$id, $url, @$output["title"], @$output["description"], @$output["image"], @$output["video"]]);

			if ($insert) {
				$output["id"] = $id;
			}
		}

		return $output;
	}

	function validImage($url) {
		$string = getContents($url);
		if ($string) {
			$id = generateID(16);
			$file = "/tmp/".$id;
			$f = fopen($file, 'wb');
			fputs($f, $string);
			fclose($f);
			$size = getimagesize($file);
			unlink($file);
		}
		return (strtolower(substr(@$size['mime'], 0, 5)) == 'image' ? true : false);  
	}

	function validImageWithoutFetch($string) {
		if ($string) {
			$id = generateID(16);
			$file = "/tmp/".$id;
			$f = fopen($file, 'wb');
			fputs($f, $string);
			fclose($f);
			$size = getimagesize($file);
			unlink($file);
		}
		return (strtolower(substr(@$size['mime'], 0, 5)) == 'image' ? true : false);  
	}

	function validateAddress($address) {
		$data = [
			"method" => "validateaddress",
			"params" => [$address],
		];
		$response = queryHSD($data);
		
		if (@$response["isvalid"] && @$response["isspendable"]) {
			return true;
		}

        return false;
	}

	function queryHSD($data) {
		if (@$data["params"]) {
			foreach ($data["params"] as $key => $value) {
				$data["params"][$key] = trim($value);
			}
		}

		$curl = curl_init();
		curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($data));
		curl_setopt($curl, CURLOPT_HTTPHEADER, ["Content-Type:application/json"]);
		$apiKey = isset($GLOBALS["hsdApiKey"]) ? trim((string)$GLOBALS["hsdApiKey"]) : "";

		if (!$apiKey) {
			return false;
		}

		curl_setopt($curl, CURLOPT_URL, "http://127.0.0.1:12037");
		curl_setopt($curl, CURLOPT_USERPWD, "x:".$apiKey);
		curl_setopt($curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
		curl_setopt($curl, CURLOPT_POST, 1);
		curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
		$response = curl_exec($curl);


		if ($response) {
			$info = @json_decode($response, true);

			if (@$info["result"]) {
				return $info["result"];
			}
		}

		return false;
	}

	function queryHSW($endpoint) {
		$endpoint = trim($endpoint);

		$curl = curl_init();
		curl_setopt($curl, CURLOPT_HTTPHEADER, ["Content-Type:application/json"]);
		curl_setopt($curl, CURLOPT_URL,"http://x:a831d3c59ce474d8e13a7cea3a3935d3d5a55b84698abe38f2eea2329327e2c50@127.0.0.1:12039".$endpoint);
		curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
		$response = curl_exec($curl);


		if ($response) {
			$info = @json_decode($response, true);

			if (@$info) {
				return $info;
			}
		}

		return false;
	}
?>
