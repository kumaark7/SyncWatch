# SyncWatch v1.0.0 Production Deployment

This runbook documents the current Ubuntu/Nginx/systemd deployment model. It contains placeholders only and must not be used to store production secrets.

```text
Internet -> Nginx HTTPS -> frontend static files
                         -> /api and /ws -> Spring 127.0.0.1:8080

Browser -> LiveKit directly over WebRTC after backend token authorization
```

Current paths:

- Application checkout: `/home/ubuntu/GitProject/SyncWatch`
- Backend working directory: `/home/ubuntu/GitProject/SyncWatch/backend`
- v1.0.0 JAR: `/home/ubuntu/GitProject/SyncWatch/backend/target/syncwatch-1.0.0.jar`
- Frontend document root: `/var/www/syncwatch`
- Environment file: `/etc/syncwatch.env`
- Persistent H2 directory: `/var/lib/syncwatch`
- Service: `syncwatch.service`

The previous v0.9.7 production service referenced `syncwatch-0.8.0.jar`. Updating the systemd `ExecStart` JAR path is therefore a required v1.0.0 deployment step.

## 1. Build-Time Frontend Configuration

Production API and WebSocket requests are same-origin. Do not set a localhost production API URL. Create ignored `frontend/.env.production` only on the trusted build host:

```dotenv
VITE_GOOGLE_CLIENT_ID=replace-with-production-web-client-id
VITE_GOOGLE_API_KEY=replace-with-referrer-restricted-browser-key
VITE_GOOGLE_APP_ID=replace-with-google-cloud-project-number
```

These values are compiled into browser assets and are not secrets. The API key must still be restricted in Google Cloud. Never put `GOOGLE_CLIENT_SECRET`, LiveKit API secret, refresh/access tokens, passwords, cookies, or encryption material in a `VITE_` variable.

`frontend/.env.production` is ignored by Git and must not be committed.

## 2. Backend Environment

Store production settings in `/etc/syncwatch.env`, readable only by the service account/root. Use actual secret-management procedures; the values below are placeholders.

```ini
GOOGLE_CLIENT_ID=replace-with-oauth-web-client-id
GOOGLE_CLIENT_SECRET=replace-with-oauth-client-secret

LIVEKIT_URL=wss://livekit.example.invalid
LIVEKIT_API_KEY=replace-with-livekit-api-key
LIVEKIT_API_SECRET=replace-with-livekit-api-secret

SYNCWATCH_FRONTEND_ORIGIN=https://play.projectdarkhope.xyz
SYNCWATCH_COOKIE_SECURE=true
SYNCWATCH_WEBSOCKET_PRESENCE_GRACE=30s

SYNCWATCH_DATABASE_URL=jdbc:h2:file:/var/lib/syncwatch/syncwatch-users;DB_CLOSE_ON_EXIT=FALSE
SYNCWATCH_DATABASE_USERNAME=replace-with-database-username
SYNCWATCH_DATABASE_PASSWORD=replace-with-database-password

SERVER_ADDRESS=127.0.0.1
SERVER_FORWARD_HEADERS_STRATEGY=NATIVE
SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES='127\.0\.0\.1'
```

Purpose:

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | For Drive | OAuth web-client identity used by backend exchange |
| `GOOGLE_CLIENT_SECRET` | For Drive | OAuth secret and key material for existing encrypted Drive records |
| `LIVEKIT_URL` | For calls | Browser-reachable LiveKit WebSocket URL returned with call tokens |
| `LIVEKIT_API_KEY` | For calls | LiveKit token/admin/webhook key |
| `LIVEKIT_API_SECRET` | For calls | LiveKit signing/admin/webhook secret |
| `SYNCWATCH_FRONTEND_ORIGIN` | Yes | Exact trusted frontend origin, without path/trailing slash |
| `SYNCWATCH_COOKIE_SECURE` | Yes | Enables Secure session and Remember Me cookies under HTTPS |
| `SYNCWATCH_WEBSOCKET_PRESENCE_GRACE` | Optional | Unexpected-disconnect grace; default and production baseline `30s` |
| `SYNCWATCH_DATABASE_URL` | Yes | Stable file-backed production H2 path |
| `SYNCWATCH_DATABASE_USERNAME` | Recommended | H2 username |
| `SYNCWATCH_DATABASE_PASSWORD` | Recommended | H2 password |
| `SERVER_ADDRESS` | Yes | Binds Spring to loopback only |
| `SERVER_FORWARD_HEADERS_STRATEGY` | Yes behind Nginx | Enables Tomcat's trusted forwarded-header processing |
| `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` | Yes behind Nginx | Trusts only loopback Nginx for effective client addresses |

Keep the current `GOOGLE_CLIENT_SECRET` available when restoring the database; changing it makes existing encrypted Drive connections unreadable.

Google Cloud must enable the Drive and Picker APIs, authorize the exact production web origin, and restrict the browser API key to the production origin. Configure the self-hosted LiveKit server to send signed webhooks to the same-origin backend endpoint with the configured LiveKit API key:

```yaml
webhook:
  api_key: replace-with-livekit-api-key
  urls:
    - https://play.projectdarkhope.xyz/api/livekit/webhook
```

The webhook secret is the matching `LIVEKIT_API_SECRET`; never place it in this YAML example or in frontend configuration.

## 3. Build and Release Validation

Use Java 21 for Maven:

```bash
java -version
mvn -version
corepack npm --prefix frontend ci
corepack npm --prefix frontend test
corepack npm --prefix frontend audit
corepack npm --prefix frontend run build
mvn -f backend/pom.xml test
mvn -f backend/pom.xml package
git diff --check
```

Confirm the artifact and frontend do not contain a production localhost API reference:

```bash
test -f backend/target/syncwatch-1.0.0.jar
if grep -R -n -E 'localhost:8080|127\.0\.0\.1:8080' frontend/dist; then
  echo "Unexpected production localhost API reference" >&2
  exit 1
fi
```

The v1.0.0 release-preparation baseline records 58 frontend tests and 125 backend tests under Java 21. Treat these as a recorded baseline, not permanent expected counts.

## 4. Pre-Deployment Backup

Create a protected, timestamped backup directory and record the exact deployed commit before replacing anything:

```bash
release_backup=/var/backups/syncwatch/pre-v1.0.0-$(date -u +%Y%m%dT%H%M%SZ)
sudo install -d -m 700 "$release_backup"
git -C /home/ubuntu/GitProject/SyncWatch rev-parse HEAD | sudo tee "$release_backup/git-commit.txt" >/dev/null
sudo cp -a /home/ubuntu/GitProject/SyncWatch/backend/target/syncwatch-0.8.0.jar "$release_backup/" 2>/dev/null || true
sudo cp -a /var/www/syncwatch "$release_backup/frontend"
sudo install -m 600 /etc/syncwatch.env "$release_backup/syncwatch.env"
sudo cp -a /etc/systemd/system/syncwatch.service "$release_backup/"
sudo cp -aL /etc/nginx/sites-enabled/play.projectdarkhope.xyz "$release_backup/nginx-site" 2>/dev/null || true
```

Confirm actual unit/vhost paths before copying; distributions may store them elsewhere. Do not delete earlier backups.

For a consistent H2 backup, stop Spring during the maintenance window before copying the open database files:

```bash
sudo systemctl stop syncwatch.service
sudo install -d -m 700 "$release_backup/h2"
sudo cp -a /var/lib/syncwatch/. "$release_backup/h2/"
sudo find "$release_backup/h2" -type f -exec chmod 600 {} \;
```

Stopping Spring ends active rooms, ordinary sessions, chat, and guest credentials. Announce the maintenance window first. Do not migrate, rewrite, or recreate H2 during this release.

## 5. Publish Frontend and Backend

After backups and review, publish the already-validated artifacts:

```bash
sudo rsync -a --delete frontend/dist/ /var/www/syncwatch/
sudo chown -R root:root /var/www/syncwatch
sudo find /var/www/syncwatch -type d -exec chmod 755 {} \;
sudo find /var/www/syncwatch -type f -exec chmod 644 {} \;
```

Update the installed systemd unit to reference the v1.0.0 JAR. Example:

```ini
[Unit]
Description=SyncWatch Spring Boot backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/GitProject/SyncWatch/backend
EnvironmentFile=/etc/syncwatch.env
ExecStart=/usr/bin/java -jar /home/ubuntu/GitProject/SyncWatch/backend/target/syncwatch-1.0.0.jar
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Do not place secret values directly in the unit. Then validate configuration and start/reload services during the approved deployment window:

```bash
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl restart syncwatch.service
sudo systemctl reload nginx
sudo systemctl status syncwatch.service --no-pager
```

Use `deploy/nginx/syncwatch-security.conf.example` as a reviewed fragment for the existing HTTPS vhost, not as an unreviewed replacement for unrelated Nginx configuration.

## 6. H2 Permissions

The directory must remain owner-only and database/backup files must be `0600`:

```bash
sudo chmod 700 /var/lib/syncwatch
sudo chmod 600 /var/lib/syncwatch/*.mv.db
sudo chmod 600 /var/lib/syncwatch/*.bak 2>/dev/null || true
sudo find /var/lib/syncwatch -maxdepth 1 -type f -printf '%m %u:%g %p\n'
```

The service account must retain read/write access. Do not expose an H2 TCP server or web console.

## 7. Health and Public Verification

Local backend health:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

Expected product metadata:

```json
{"ok":true,"version":"1.0.0","backend":"java-spring-boot"}
```

Public checks:

```bash
curl -fsS https://play.projectdarkhope.xyz/api/health
curl -sSI http://play.projectdarkhope.xyz/
curl -sSI https://play.projectdarkhope.xyz/manifest.webmanifest
curl -sSI https://play.projectdarkhope.xyz/service-worker.js
sudo ss -ltnp | grep -E ':(80|443|8080)\b'
```

Verify HTTP redirects to HTTPS, the manifest returns `application/manifest+json`, Spring listens only on `127.0.0.1:8080`, security headers are present, the browser loads the current hashed assets, and `/ws` upgrades successfully. Perform account/session, Create/Join/Leave, playback, large seek, chat, LiveKit, screen-share permission, reconnect-inside-grace, and PWA update checks without using production secrets in logs.

## 8. Rollback

If release verification fails:

1. Stop `syncwatch.service` if the running backend must be replaced.
2. Restore the previous backend JAR and previous systemd `ExecStart` reference from the protected backup.
3. Restore the previous `/var/www/syncwatch` frontend directory.
4. Restore Nginx/systemd/environment files only when they were changed and the saved copy is known-good.
5. Run `systemctl daemon-reload`, `nginx -t`, restart the backend, and reload Nginx as required.
6. Verify local `/api/health`, the public health endpoint, static asset hashes, room entry, and WebSocket upgrade.

Do not restore or replace H2 merely because application rollback is needed; v1.0.0 has no schema migration. Restore the stopped-state database backup only for an actual database failure and only through the established recovery process.

Example commands after confirming backup paths:

```bash
sudo systemctl stop syncwatch.service
sudo rsync -a --delete "$release_backup/frontend/" /var/www/syncwatch/
sudo cp -a "$release_backup/syncwatch.service" /etc/systemd/system/syncwatch.service
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl restart syncwatch.service
sudo systemctl reload nginx
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS https://play.projectdarkhope.xyz/api/health
```

## 9. Release Status

Completed before v1.0.0 deployment:

- v0.9.7 synchronization hardening
- functional production testing
- large-seek and Drive Range validation
- reconnect and Host-transfer testing
- v1.0.0 metadata conversion

Deferred until after v1.0.0:

- full 2+ hour endurance/performance QA

Do not describe the deferred endurance run as passed.
