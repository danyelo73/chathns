<?php
include "etc/includes.php";

$id = isset($_GET["id"]) ? (string)$_GET["id"] : "";

if (!preg_match('/^[A-Za-z0-9]{32}$/', $id)) {
	http_response_code(400);
	exit;
}

$row = @sql(
	"SELECT type, name, size FROM uploads WHERE id = ? LIMIT 1",
	[$id]
)[0];

if (!$row) {
	http_response_code(404);
	exit;
}

$file = $GLOBALS["path"]."/uploads/".$id;

if (!is_file($file)) {
	http_response_code(404);
	exit;
}

$size = filesize($file);
$mime = mime_content_type($file);

if (!$mime) {
	$mime = ($row["type"] === "video")
		? "video/mp4"
		: "application/octet-stream";
}

header("Content-Type: ".$mime);
header("Content-Disposition: inline");
header("Accept-Ranges: bytes");
header("Cache-Control: public, max-age=31536000, immutable");

$start = 0;
$end = $size - 1;
$status = 200;

if (isset($_SERVER["HTTP_RANGE"])) {
	if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER["HTTP_RANGE"], $m)) {
		if ($m[1] !== "") {
			$start = (int)$m[1];
		}

		if ($m[2] !== "") {
			$end = (int)$m[2];
		}

		if ($start > $end || $start >= $size) {
			header("Content-Range: bytes */".$size);
			http_response_code(416);
			exit;
		}

		if ($end >= $size) {
			$end = $size - 1;
		}

		$status = 206;
	}
}

$length = $end - $start + 1;

http_response_code($status);

if ($status === 206) {
	header("Content-Range: bytes ".$start."-".$end."/".$size);
}

header("Content-Length: ".$length);

if ($_SERVER["REQUEST_METHOD"] === "HEAD") {
	exit;
}

$fp = fopen($file, "rb");

if (!$fp) {
	http_response_code(500);
	exit;
}

fseek($fp, $start);

$remaining = $length;
$chunk = 1024 * 256;

while ($remaining > 0 && !feof($fp)) {
	$read = min($chunk, $remaining);
	$data = fread($fp, $read);

	if ($data === false || $data === "") {
		break;
	}

	echo $data;
	$remaining -= strlen($data);

	if (function_exists("fastcgi_finish_request")) {
		// Do not call it here; streaming must continue.
	}

	flush();
}

fclose($fp);
exit;
?>
