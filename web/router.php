<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;

/* Real existing files */
if ($path !== '/' && is_file($file)) {
    return false;
}

/* Extensionless PHP endpoints used by old HNSChat */
$phpRoutes = [
    '/api'    => 'api.php',
    '/id'     => 'id.php',
    '/sync'   => 'sync.php',
    '/upload' => 'upload.php',
];

if (isset($phpRoutes[$path])) {
    require __DIR__ . '/' . $phpRoutes[$path];
    exit;
}

/* Old asset URLs omit .css / .js */
if (str_starts_with($path, '/assets/css/')) {
    $candidate = $file . '.css';
    if (is_file($candidate)) {
        header('Content-Type: text/css; charset=utf-8');
        readfile($candidate);
        exit;
    }
}

if (str_starts_with($path, '/assets/js/')) {
    $candidate = $file . '.js';
    if (is_file($candidate)) {
        header('Content-Type: application/javascript; charset=utf-8');
        readfile($candidate);
        exit;
    }
}

/* Original rewrite rules */
if (preg_match('#^/avatar/([A-Za-z0-9]+)/?$#', $path, $m)) {
    $_GET['id'] = $m[1];
    require __DIR__ . '/etc/avatar.php';
    exit;
}

if (preg_match('#^/preview/([A-Za-z0-9]+)/?$#', $path, $m)) {
    $_GET['id'] = $m[1];
    require __DIR__ . '/etc/preview.php';
    exit;
}

if (preg_match('#^/invite/([A-Za-z0-9-]+)/?$#', $path, $m)) {
    $_GET['invite'] = $m[1];
    require __DIR__ . '/id.php';
    exit;
}

/* Everything else goes to the chat page */
require __DIR__ . '/index.php';
