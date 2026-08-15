<?php
	include "etc/includes.php";

	set_time_limit(0);

	if (@!$_FILES["file"]) {
		error("Missing file.");
	}
	if (@!$_POST["key"]) {
		error("Missing key.");
	}

	$output["success"] = true;

	$key = $_POST["key"];
	$name = $_FILES["file"]["name"];
	$tmp = $_FILES["file"]["tmp_name"];
	$size = filesize($tmp);

	$fileType = mime_content_type($tmp);

	if (!$fileType || $fileType === "application/octet-stream") {
		$fileType = shell_exec("exiftool -mimetype -b ".escapeshellarg($tmp));
	}

	$fileType = trim((string)$fileType);

	$allowedImages = [
		"image/jpeg",
		"image/png",
		"image/webp",
		"image/gif"
	];

	$allowedVideos = [
		"video/mp4"
	];

	if (in_array($fileType, $allowedImages, true)) {
		$type = "image";
	}
	elseif (in_array($fileType, $allowedVideos, true)) {
		$type = "video";
	}
	else {
		error("Only JPEG, PNG, WebP, GIF and MP4 are supported.");
	}

	if ($size > 25600000) {
		error("Maximum file size is 25MB.");
	}

	switch ($type) {
		case "image":
			$imageInfo = getimagesize($tmp);
			$width  = $imageInfo[0];
			$height = $imageInfo[1];

			if (!$imageInfo || $width < 1 && $height < 1 || strpos(file_get_contents($tmp),"<?php") !== false || strpos(file_get_contents($tmp),"<script") !== false) {
				error("Something is wrong with this image.");
			}
			break;
		
		default:
			break;
	}

	$id = generateCode("upload");
	$insert = sql("INSERT INTO `uploads` (type, id, name, size, session) VALUES (?,?,?,?,?)", [$type, $id, $name, $size, $key]);
	$path = $GLOBALS["path"]."/uploads/".$id;
	$move = move_uploaded_file($tmp, $path);

	if (!$insert || !$move) {
		unlink($path);
		error("Something went wrong. Try again?");
	}
	else {
		$output["id"] = $id;
		$output["type"] = $type;
	}

	die(json_encode($output));
?>