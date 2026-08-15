# HNSChat local test package

Purpose: get the uploaded historical HNSChat `web` + `server` code running locally on a Mac for functional testing before ALF/public deployment.

## What I changed

The original uploaded ZIPs are preserved conceptually, but this test copy has a few local-only compatibility changes:

1. Reconstructed `database.sql` from every SQL query found in the uploaded web/server sources. This is **not** an original upstream database dump.
2. Browser on `localhost` connects directly to `ws://127.0.0.1:4444` instead of expecting production `wss://HOST/wss`.
3. On localhost, **Add Domain** prompts for a fake test HNS name and bypasses Varo verification. This is explicitly test-only.
4. Missing `.git` revision files fall back to `local-test-1`.
5. Removed a duplicated `parse(ws, data)` call in the uploaded server source that would process each WebSocket message twice.
6. Added one public `general` channel in the database seed.

## Not changed yet

- ALF Verify is not implemented.
- Public HNS ownership verification is not enabled in local test mode.
- HNSChat-issued SLD flow remains in the old code but needs a suitable seeded SLD-enabled channel/TLD before testing.
- Janus/video is not configured.
- Expo push is not configured.
- Tenor API is not configured.
- Old Varo code remains for non-localhost operation.
- `dig @127.0.0.44` avatar/cron functionality is untouched and should not be relied on yet.
- No production TLS/WSS/reverse proxy configuration is included.

## 1. Prerequisites on macOS

If Homebrew is available:

```bash
brew install node php mariadb
brew services start mariadb
```

Check:

```bash
node --version
php --version
mariadb --version
```

## 2. Create the local database

Open MariaDB:

```bash
mariadb -u root
```

Then run:

```sql
CREATE DATABASE hnschat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hnschat'@'localhost' IDENTIFIED BY 'CHANGE_ME';
GRANT ALL PRIVILEGES ON hnschat.* TO 'hnschat'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Import the reconstructed schema:

```bash
mariadb -u hnschat -p hnschat < database.sql
```

## 3. Configure web + server

From this package root:

```bash
cp server/config.local.sample.json server/config.json
cp web/etc/config.local.sample.json web/etc/config.json
```

Edit both files:

- replace `CHANGE_ME` with the MariaDB password;
- replace `/ABSOLUTE/PATH/TO/hnschat-test/...` with the real paths on the Mac.

Example if unpacked into `/Users/you/hnschat-test`:

- server path: `/Users/you/hnschat-test/server`
- web path: `/Users/you/hnschat-test/web`

## 4. Install Node dependencies

```bash
cd server
npm install
cd ..
```

## 5. Start the local test

```bash
./start-local.sh
```

Then open:

`http://127.0.0.1:8080`

## 6. First two-user chat test

Use two separate browser profiles/private windows so they receive different HNSChat sessions.

For each browser:

1. Open the identity/domain management UI.
2. Choose **Add Domain**.
3. Because this is localhost, the patched UI asks for a fake local test name instead of calling Varo.
4. Use e.g. `alice` in one browser and `bob` in the other.
5. Select the added identity if necessary.
6. Open `general` and send messages between the two windows.

This verifies only:

`PHP UI -> session DB -> WebSocket -> Node -> MariaDB -> channel/messages -> second browser`

That is the first milestone.

## 7. Next milestones after basic chat works

Do these in order, not simultaneously:

1. PMs, reactions, replies, mini-bio/avatar.
2. TLD-bound channel behavior.
3. HNSChat-issued SLD identities.
4. Replace Varo ownership verification with ALF Verify.
5. Remove/replace obsolete dependencies.
6. Security review.
7. Public TLS/WSS + reverse proxy/tunnel or VPS deployment.

## Important

Do **not** switch `localTestMode` off and expose this test package publicly. The localhost bypass is intentionally insecure and only exists so we can verify whether the historical chat architecture still works.
