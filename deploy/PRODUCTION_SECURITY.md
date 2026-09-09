# Production Security Configuration

This runbook applies to the single-proxy production topology:

```text
Internet -> Nginx HTTPS -> Spring Boot on 127.0.0.1:8080
```

It contains no credentials. Keep `/etc/syncwatch.env`, TLS private keys, Google credentials, LiveKit credentials, and database credentials outside Git.

## 1. Trusted client address and loopback binding

Add these non-secret settings to `/etc/syncwatch.env`:

```ini
SERVER_FORWARD_HEADERS_STRATEGY=NATIVE
SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES='127\.0\.0\.1'
SERVER_ADDRESS=127.0.0.1
```

`SERVER_ADDRESS` is production-only; do not add it to the shared `application.properties`, because local development may intentionally bind differently.

Apply the Nginx directives from `deploy/nginx/syncwatch-security.conf.example`. In this single-proxy topology, `$remote_addr` is the client address observed by Nginx. Overwriting `X-Forwarded-For` prevents a caller-provided chain from becoming trusted input. Spring's native Tomcat forwarding support then derives the servlet-effective `request.getRemoteAddr()`, which remains the only address consumed by `RequestRateLimitFilter`.

The dedicated `location ^~ /api/stream/` block must remain above the generic `/api/` proxy. It forwards browser `Range` and `If-Range` headers unchanged, disables response/request buffering, and allows long-running original-quality media responses without caching private Drive content.

## 2. H2 permissions

Keep the database directory owner-only and tighten existing database/backup files without deleting or rewriting them:

```bash
sudo chmod 700 /var/lib/syncwatch
sudo chmod 600 /var/lib/syncwatch/*.mv.db
sudo chmod 600 /var/lib/syncwatch/*.bak 2>/dev/null || true
```

Confirm ownership before changing it. The service account must retain read/write access to the directory and files.

## 3. Controlled deployment

Back up the current Nginx vhost and `/etc/syncwatch.env` through the normal protected operations process. Then validate before reloading or restarting:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart syncwatch.service
```

The Nginx reload is non-disruptive. Restarting Spring ends in-memory rooms, guest sessions, ordinary HTTP sessions, and chat history; schedule it for a maintenance window. Persistent accounts, Remember Me records, registered-user Drive connections, and H2 data remain on disk.

## 4. Production verification

Verify Spring listens only on loopback and Nginx remains the public entry point:

```bash
sudo ss -ltnp | grep -E ':(80|443|8080)\b'
curl -fsS http://127.0.0.1:8080/api/auth/session -o /dev/null
```

From a machine outside the VPS, confirm direct backend access fails:

```bash
curl --connect-timeout 5 http://play.projectdarkhope.xyz:8080/api/auth/session
```

Verify HTTPS headers without printing cookies or authorization data:

```bash
curl -sSI https://play.projectdarkhope.xyz/ | grep -Ei '^(strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy):'
```

Verify the dedicated access log does not retain a harmless query marker:

```bash
curl -fsS 'https://play.projectdarkhope.xyz/?audit_probe=QUERY_MUST_NOT_APPEAR' -o /dev/null
sudo tail -n 5 /var/log/nginx/syncwatch-access.log
sudo grep -F 'QUERY_MUST_NOT_APPEAR' /var/log/nginx/syncwatch-access.log
```

The final `grep` must return no matches. Do not use a real room invite, OAuth code, cookie, token, or session identifier as the marker.

To verify rate-limit identity end-to-end during a maintenance test, send invalid login attempts from two genuinely different public networks. Exhausting the 30-request login window on network A must produce `429` only for A; the first equivalent request from network B must return the normal invalid-login response rather than `429`. Adding a fake `X-Forwarded-For` on A must not evade its existing limit. Do not use real credentials, and stop after the required observation.

## 5. Rollback

If validation fails, restore the protected Nginx vhost and environment backup, run `sudo nginx -t`, reload Nginx, and restart `syncwatch.service`. Do not alter or recreate the H2 database as part of rollback.
