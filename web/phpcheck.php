<?php
header("Content-Type: text/plain");
echo "PHP_VERSION=", PHP_VERSION, "\n";
echo "SAPI=", PHP_SAPI, "\n";
echo "INI=", php_ini_loaded_file(), "\n";
echo "upload_max_filesize=", ini_get("upload_max_filesize"), "\n";
echo "post_max_size=", ini_get("post_max_size"), "\n";
echo "memory_limit=", ini_get("memory_limit"), "\n";
?>
