<?php
declare(strict_types=1);

// Install this endpoint on the shop's PHP host. Keep its database outside the web root.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Vary: Origin');

function reply(int $status, array $data): void {
    http_response_code($status);
    echo json_encode(['service' => 'mylco-photo-v1'] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}

function privateDatabase(): PDO {
    $webRoot = realpath($_SERVER['DOCUMENT_ROOT']);
    if (!$webRoot || $webRoot === '/') throw new RuntimeException('Web root unavailable');
    $path = getenv('MYLCO_PHOTO_DIR') ?: dirname($webRoot) . '/mylco-photo-private';
    umask(0077);
    if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) throw new RuntimeException('Storage unavailable');
    $path = realpath($path);
    if (!$path || $path === $webRoot || strpos($path . '/', $webRoot . '/') === 0) throw new RuntimeException('Private path required');
    $db = new PDO('sqlite:' . $path . '/orders.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000');
    $db->exec('PRAGMA secure_delete=ON');
    $db->exec('CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $db->prepare("INSERT OR IGNORE INTO settings VALUES ('salt', ?)")->execute([bin2hex(random_bytes(32))]);
    $db->exec('CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
        client TEXT NOT NULL, created INTEGER NOT NULL, attempt INTEGER NOT NULL DEFAULT 0,
        notified INTEGER NOT NULL DEFAULT 0, recipient TEXT NOT NULL, body TEXT NOT NULL, image BLOB NOT NULL
    )');
    $db->exec('CREATE INDEX IF NOT EXISTS requests_created ON requests(created)');
    return $db;
}

function textField(string $name, int $max): string {
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || !preg_match('//u', $value) || strlen($value) > $max ||
        preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) reply(422, ['error' => 'field']);
    return trim($value);
}

function validatedPhoto(): string {
    $file = $_FILES['photo'] ?? null;
    if (!$file || ($file['error'] ?? null) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name']) ||
        $file['size'] < 1 || $file['size'] > 2097152) reply(422, ['error' => 'photo']);
    $info = @getimagesize($file['tmp_name']);
    if (!$info || $info[2] !== IMAGETYPE_JPEG || max($info[0], $info[1]) > 1600) reply(422, ['error' => 'jpeg']);
    $image = @imagecreatefromjpeg($file['tmp_name']);
    if (!$image) reply(422, ['error' => 'jpeg']);
    ob_start();
    $ok = imagejpeg($image, null, 84);
    $bytes = ob_get_clean();
    if (!$ok || !$bytes) throw new RuntimeException('Image conversion failed');
    return $bytes;
}

function notifyWorkshop(array $r): bool {
    $boundary = 'Mylco-' . $r['number'];
    $headers = "From: Mylco <order@mylco.ru>\r\nMessage-ID: <photo-" . $r['id'] . "@mylco.ru>\r\n" .
        "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"" . $boundary . '"';
    $subject = '=?UTF-8?B?' . base64_encode($r['number'] . ' — заявка с фото') . '?=';
    $body = '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" .
        chunk_split(base64_encode($r['body'])) . '--' . $boundary .
        "\r\nContent-Type: image/jpeg; name=\"detal.jpg\"\r\nContent-Disposition: attachment; filename=\"detal.jpg\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" .
        chunk_split(base64_encode($r['image'])) . '--' . $boundary . "--\r\n";
    return mail($r['recipient'], $subject, $body, $headers);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://step3dlab.github.io', 'https://mylco.ru', 'https://www.mylco.ru'];
if ($origin !== '' && !in_array($origin, $allowed, true)) reply(403, ['error' => 'origin']);
if ($origin !== '') header('Access-Control-Allow-Origin: ' . $origin);
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    http_response_code(204);
    exit;
}
if (!in_array($method, ['POST','GET'], true)) reply(405, ['error' => 'method']);
try {
    if (!function_exists('mail') || !function_exists('imagecreatefromjpeg') || !in_array('sqlite', PDO::getAvailableDrivers(), true))
        reply(503, ['ready' => false]);
    $db = privateDatabase();
    $now = time();
    $db->prepare('DELETE FROM requests WHERE created < ?')->execute([$now - 30 * 86400]);
    if ($method === 'GET') reply(200, ['ready' => true]);
    if (!in_array($origin, $allowed, true)) reply(403, ['error' => 'origin']);
    if (intval($_SERVER['CONTENT_LENGTH'] ?? 0) > 2300000) reply(413, ['error' => 'size']);
    $id = textField('request_id', 36);
    $goal = textField('goal', 8);
    $size = textField('size', 360);
    $contact = textField('contact', 560);
    $note = textField('note', 3200);
    $goals = ['cad' => 'Цифровая модель', 'print' => 'Напечатанная деталь', 'both' => 'Модель и напечатанная деталь'];
    $digits = preg_replace('/\D/', '', $contact);
    $phone = preg_match('/^\+?[0-9() .-]+$/D', $contact) && strlen($digits) >= 7 && strlen($digits) <= 15;
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/Di', $id) ||
        !isset($goals[$goal]) || strlen($size) < 2 || !preg_match('/[0-9]/', $size) ||
        (!$phone && !filter_var($contact, FILTER_VALIDATE_EMAIL))) reply(422, ['error' => 'details']);
    $jpeg = validatedPhoto();
    $fingerprint = hash('sha256', serialize([$goal,$size,$contact,$note,hash('sha256',$jpeg)]));
    $db->exec('BEGIN IMMEDIATE');
    $read = $db->prepare('SELECT * FROM requests WHERE id = ?');
    $read->execute([$id]);
    $r = $read->fetch(PDO::FETCH_ASSOC);
    if ($r && !hash_equals($r['fingerprint'], $fingerprint)) { $db->exec('ROLLBACK'); reply(409, ['error' => 'id_conflict']); }
    if (!$r) {
        $salt = $db->query("SELECT value FROM settings WHERE name='salt'")->fetchColumn();
        $client = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $salt);
        $limits = $db->prepare('SELECT COUNT(*), COUNT(CASE WHEN client=? AND created>=? THEN 1 END) FROM requests WHERE created>=?');
        $limits->execute([$client,$now-3600,$now-86400]);
        [$daily,$hourly] = $limits->fetch(PDO::FETCH_NUM);
        if ($daily >= 100 || $hourly >= 5) { $db->exec('ROLLBACK'); reply(429, ['error' => 'limit']); }
        $number = 'MK-' . strtoupper(bin2hex(random_bytes(6)));
        $recipient = $goal === 'cad' ? 'order@mylco.ru' : 'mylco@inbox.ru';
        $body = "Источник: витрина МылКо.\nЗаявка: $number\nРезультат: " . $goals[$goal] .
            "\nРазмер: $size\nКонтакт для ответа: $contact\n$note";
        $insert = $db->prepare('INSERT INTO requests(id,number,fingerprint,client,created,recipient,body,image) VALUES(?,?,?,?,?,?,?,?)');
        foreach ([$id,$number,$fingerprint,$client,$now,$recipient,$body] as $i => $val) $insert->bindValue($i+1, $val);
        $insert->bindValue(8, $jpeg, PDO::PARAM_LOB);
        $insert->execute();
    }
    $db->exec('COMMIT');
    // Serialize retries; keep the receipt in private storage if delivery is temporarily unavailable.
    $db->exec('BEGIN IMMEDIATE');
    $read->execute([$id]); $r = $read->fetch(PDO::FETCH_ASSOC); $read->closeCursor();
    if (!(int)$r['notified']) {
        if ((int)$r['attempt'] > $now - 15) { $db->exec('ROLLBACK'); reply(503, ['error' => 'retry_later']); }
        $sent = notifyWorkshop($r);
        $db->prepare('UPDATE requests SET notified=?, attempt=? WHERE id=?')->execute([(int)$sent,$now,$id]);
        $db->exec('COMMIT');
        if (!$sent) reply(503, ['error' => 'mail']);
    } else $db->exec('COMMIT');
    reply(200, ['registered' => true, 'request_id' => $id, 'number' => $r['number']]);
} catch (Throwable $e) {
    // Request data and server paths stay out of the public response.
    reply(503, ['ready' => false, 'error' => 'unavailable']);
}
