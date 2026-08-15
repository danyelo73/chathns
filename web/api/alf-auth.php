<?php

declare(strict_types=1);

include dirname(__DIR__) . '/etc/config.php';

$secret = (string) ($GLOBALS['alfSecret'] ?? '');

if ($secret === '') {
    http_response_code(500);
    exit('ALF service is not configured.');
}

$tld = strtolower(trim((string) ($_GET['tld'] ?? '')));
$service = (string) ($_GET['service'] ?? '');
$state = (string) ($_GET['state'] ?? '');
$exp = (int) ($_GET['exp'] ?? 0);
$nonce = (string) ($_GET['nonce'] ?? '');
$sig = strtolower((string) ($_GET['sig'] ?? ''));

if (
    !preg_match(
        '/^(?:xn--[a-z0-9-]{1,59}|[a-z0-9-]{1,63})(?:\.(?:xn--[a-z0-9-]{1,59}|[a-z0-9-]{1,63}))*$/',
        $tld
    )
) {
    http_response_code(400);
    exit('Invalid ALF name.');
}

if ($service !== 'hnschat') {
    http_response_code(400);
    exit('Invalid service.');
}

if (!preg_match('/^[A-Za-z0-9_-]{16,128}$/', $state)) {
    http_response_code(400);
    exit('Invalid state.');
}

if ($exp < time() || $exp > time() + 900) {
    http_response_code(403);
    exit('Expired login.');
}

if (!preg_match('/^[a-f0-9]{24}$/', $nonce)) {
    http_response_code(400);
    exit('Invalid nonce.');
}

$payload = $tld . '|' . $service . '|' . $state . '|' . $exp . '|' . $nonce;
$expected = hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $sig)) {
    http_response_code(403);
    exit('Invalid signature.');
}

$ticket = bin2hex(random_bytes(32));
$ticketDir = dirname(__DIR__) . '/data/alf-tickets';

if (!is_dir($ticketDir)) {
    mkdir($ticketDir, 0700, true);
}

$ticketData = [
    'tld' => $tld,
    'state' => $state,
    'created' => time(),
    'expires' => time() + 120
];

file_put_contents(
    $ticketDir . '/' . $ticket . '.json',
    json_encode($ticketData, JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALF verified</title>
</head>
<body>
<script>
sessionStorage.setItem("alf_ticket", <?=json_encode($ticket)?>);
window.location.href = "/id?alf=1";
</script>
</body>
</html>
