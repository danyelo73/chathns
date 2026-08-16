<?php
include __DIR__ . "/includes.php";

/*
 * ChatHNS retention cleanup
 *
 * Video files:  7 days
 * Image files: 30 days
 * Messages:    180 days
 *
 * Existing migrated uploads with created = 0 are never auto-deleted.
 * Pinned channel messages are never auto-deleted.
 * Uploads referenced by pinned channel messages are also preserved.
 *
 * Default is DRY RUN.
 * Real deletion requires: php cleanup.php --delete
 */

$delete = in_array("--delete", $argv ?? [], true);
$now = time();

$videoBefore   = $now - (7 * 86400);
$imageBefore   = $now - (30 * 86400);
$messageBefore = $now - (180 * 86400);

$stats = [
    "videos"   => 0,
    "images"   => 0,
    "messages" => 0
];

/*
 * Collect pinned message IDs and attachment IDs.
 * Pins exist only for channels, where message content is readable.
 */
$pinnedMessageIds = [];
$pinnedUploadIds = [];

$channels = sql(
    "SELECT `pinned`
     FROM `channels`
     WHERE `pinned` IS NOT NULL
       AND `pinned` <> ''"
);

if ($channels && is_array($channels)) {
    foreach ($channels as $channel) {
        $messageId = (string)$channel["pinned"];

        if ($messageId === "") {
            continue;
        }

        $pinnedMessageIds[$messageId] = true;

        $rows = sql(
            "SELECT `message`
             FROM `messages`
             WHERE `id` = ?
             LIMIT 1",
            [$messageId]
        );

        if (!$rows || !isset($rows[0]["message"])) {
            continue;
        }

        $decoded = json_decode($rows[0]["message"], true);

        if (
            is_array($decoded) &&
            !empty($decoded["attachment"]) &&
            is_string($decoded["attachment"])
        ) {
            $pinnedUploadIds[$decoded["attachment"]] = true;
        }
    }
}

/*
 * Expire local uploads.
 */
$uploads = sql(
    "SELECT `id`, `type`, `created`
     FROM `uploads`
     WHERE `created` > 0
       AND (
            (`type` = 'video' AND `created` < ?)
         OR (`type` = 'image' AND `created` < ?)
       )",
    [$videoBefore, $imageBefore]
);

if ($uploads && is_array($uploads)) {
    foreach ($uploads as $upload) {
        $id = (string)$upload["id"];
        $type = (string)$upload["type"];

        if (isset($pinnedUploadIds[$id])) {
            continue;
        }

        if ($type === "video") {
            $stats["videos"]++;
        }
        elseif ($type === "image") {
            $stats["images"]++;
        }

        if (!$delete) {
            echo "WOULD DELETE upload {$type} {$id}\n";
        }

        if ($delete) {
            $file = $GLOBALS["path"] . "/uploads/" . $id;

            if (is_file($file)) {
                @unlink($file);
            }

            sql(
                "DELETE FROM `uploads`
                 WHERE `id` = ?",
                [$id]
            );
        }
    }
}

/*
 * Expire messages older than 180 days, except pinned messages.
 */
$messages = sql(
    "SELECT `id`, `time`
     FROM `messages`
     WHERE `time` < ?",
    [$messageBefore]
);

if ($messages && is_array($messages)) {
    foreach ($messages as $message) {
        $id = (string)$message["id"];

        if (isset($pinnedMessageIds[$id])) {
            continue;
        }

        $stats["messages"]++;

        if (!$delete) {
            echo "WOULD DELETE message {$id}\n";
        }

        if ($delete) {
            sql(
                "DELETE FROM `messages`
                 WHERE `id` = ?",
                [$id]
            );
        }
    }
}

if ($delete) {
    echo date("Y-m-d H:i:s")
        . " ChatHNS cleanup: "
        . "videos={$stats["videos"]}, "
        . "images={$stats["images"]}, "
        . "messages={$stats["messages"]}\n";
}
else {
    echo "\nDRY RUN only. Nothing deleted.\n";
    echo "Videos:   {$stats["videos"]}\n";
    echo "Images:   {$stats["images"]}\n";
    echo "Messages: {$stats["messages"]}\n";
}
?>
