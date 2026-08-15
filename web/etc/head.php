<?php
	header("Access-Control-Allow-Origin: *");

	$revisionFile = __DIR__."/../revision.txt";
	$revision = file_exists($revisionFile) ? trim(file_get_contents($revisionFile)) : "local-test-2";
?>
<title>HNSChat</title>
<meta charset="utf-8">
<meta name="google" content="notranslate"> 
<meta name="darkreader" content="noplz">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="format-detection" content="telephone=no">

<meta name="title" content="HNSChat">
<meta name="description" content="HNSChat is a free end-to-end encrypted messaging platform where you chat using your Handshake names.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://hns.chat/">
<meta property="og:title" content="HNSChat">
<meta property="og:description" content="HNSChat is a free end-to-end encrypted messaging platform where you chat using your Handshake names.">
<meta property="og:image" content="https://hns.chat/assets/img/cover">
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="https://hns.chat/">
<meta property="twitter:title" content="HNSChat">
<meta property="twitter:description" content="HNSChat is a free end-to-end encrypted messaging platform where you chat using your Handshake names.">
<meta property="twitter:image" content="https://hns.chat/assets/img/cover">
<link rel="manifest" href="/manifest.json">
<link href="https://fonts.googleapis.com/css2?family=Rubik&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style?r=<?php echo $revision; ?>">
<script src="https://code.jquery.com/jquery-3.6.0.min.js" integrity="sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4=" crossorigin="anonymous"></script>
<script type="text/javascript" src="/assets/js/qr?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/qr2?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/he?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/zwj?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/date?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/emojis?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/anchorme?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/mask?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/confetti?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/dish?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/janus?r=<?php echo $revision; ?>"></script>
<script type="text/javascript" src="/assets/js/adapter?r=<?php echo $revision; ?>"></script>
<script type="module" src="/assets/js/script?r=<?php echo $revision; ?>"></script>
<script type="text/javascript">
	var revision = "<?php echo $revision; ?>"; 
</script>