<?php

/*
 * ChatHNS local root recovery.
 *
 * CLI ONLY.
 * The root account name comes from server/config.json.
 * No password is stored in config.json.
 */

if (PHP_SAPI !== "cli") {
	fwrite(STDERR, "CLI only.\n");
	exit(1);
}

$configPath = __DIR__."/config.json";

if (!is_file($configPath)) {
	fwrite(STDERR, "ERROR: config.json not found.\n");
	exit(1);
}

$config = json_decode(file_get_contents($configPath), true);

if (!is_array($config)) {
	fwrite(STDERR, "ERROR: Invalid config.json.\n");
	exit(1);
}

$rootAdmin = strtolower(trim((string)($config["rootAdmin"] ?? "")));

if (!$rootAdmin) {
	fwrite(STDERR, "ERROR: rootAdmin is not configured.\n");
	exit(1);
}

echo "ChatHNS Root Recovery\n";
echo "Root: ".$rootAdmin."\n\n";

if (!function_exists("mysqli_connect")) {
	fwrite(STDERR, "ERROR: PHP mysqli extension is not available.\n");
	exit(1);
}

echo "New password: ";

$canHide = function_exists("shell_exec");

if ($canHide) {
	@shell_exec("stty -echo");
}

$password = rtrim((string)fgets(STDIN), "\r\n");

if ($canHide) {
	@shell_exec("stty echo");
	echo "\n";
}

if (strlen($password) < 8) {
	fwrite(STDERR, "ERROR: Password must be at least 8 characters.\n");
	exit(1);
}

echo "Repeat password: ";

if ($canHide) {
	@shell_exec("stty -echo");
}

$repeat = rtrim((string)fgets(STDIN), "\r\n");

if ($canHide) {
	@shell_exec("stty echo");
	echo "\n";
}

if (!hash_equals($password, $repeat)) {
	fwrite(STDERR, "ERROR: Passwords do not match.\n");
	exit(1);
}

$db = @new mysqli(
	$config["sqlHost"],
	$config["sqlUser"],
	$config["sqlPass"],
	$config["sqlDatabase"]
);

if ($db->connect_errno) {
	fwrite(STDERR, "ERROR: Database connection failed.\n");
	exit(1);
}

$db->set_charset("utf8mb4");

$stmt = $db->prepare(
	"SELECT
		a.ai,
		a.domain_id,
		d.domain
	 FROM accounts a
	 INNER JOIN domains d ON d.id = a.domain_id
	 WHERE LOWER(d.domain) = ?
	 LIMIT 1"
);

$stmt->bind_param("s", $rootAdmin);
$stmt->execute();

$result = $stmt->get_result();
$row = $result->fetch_assoc();

if (!$row) {
	fwrite(
		STDERR,
		"ERROR: Root identity exists in config, but no password account was found.\n"
	);
	exit(1);
}

$hash = password_hash($password, PASSWORD_DEFAULT);

$db->begin_transaction();

try {
	$stmt = $db->prepare(
		"UPDATE accounts
		 SET password_hash = ?,
		     role = 'admin',
		     disabled = 0
		 WHERE domain_id = ?"
	);

	$stmt->bind_param("ss", $hash, $row["domain_id"]);
	$stmt->execute();

	$stmt = $db->prepare(
		"UPDATE domains
		 SET admin = 1,
		     locked = 0,
		     deleted = 0,
		     claimed = 1
		 WHERE id = ?"
	);

	$stmt->bind_param("s", $row["domain_id"]);
	$stmt->execute();

	$db->commit();

	echo "\nOK: Root password reset.\n";
	echo "OK: Global-admin rights restored.\n";
	echo "OK: Account unlocked and enabled.\n";
}
catch (Throwable $e) {
	$db->rollback();
	fwrite(STDERR, "ERROR: Recovery failed.\n");
	exit(1);
}

$db->close();
