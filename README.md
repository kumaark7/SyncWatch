# SyncWatch

Self-hosted watch parties with synchronized Google Drive movies, room chat, and LiveKit calls and screen sharing.

This describes the current application for **v0.8.0 release preparation**, not a tagged or deployed release.

## Features

- Registered users Sign Up or Sign In, then use Home to Create or Join Room.
- Invite links use `/?room=ROOM_ID`. Anonymous guests enter a name without creating an account; the server establishes a room-scoped guest session.
- The creator becomes Host. Manual Make Host transfers the role to a participant; when the Host leaves, the oldest remaining participant is promoted. Returning former Hosts do not reclaim the role.
- Leave Room returns to Home without logging out registered accounts or disconnecting their Drive connection. Empty rooms are removed. Explicit Close Room ends the room for everyone without Host transfer.
- Host authority comes from server state. Anonymous sessions have narrower endpoint permissions; see PROJECT_CONTEXT.md for limitations affecting promoted guests.
- Collaborative play, pause, manual seek, and ten-second seek controls use authoritative room synchronization, with join-in-progress, drift correction, buffering and autoplay handling.
- Room chat includes participant, call, and Host-change notices.
- LiveKit voice/video calls include device selection, audio processing, camera quality targets, speaker mute, Push-to-Talk, connection indicators, and a floating call window.
- Screen sharing reuses the existing LiveKit connection. One server-authorized share replaces the main player and identifies the sharer. Starting it pauses the movie for everyone; stopping restores the movie without automatically resuming.
- Hosts can block anonymous guest screen sharing; registered participants remain eligible. Screen/tab audio depends on browser support.
- Theater Mode, fullscreen, room keyboard shortcuts, and optional local camera gesture recognition (Open Palm pauses; Thumbs Up plays).

## Architecture

| Layer | Current implementation |
| --- | --- |
| Frontend | React, TypeScript, Vite, native HTML video, STOMP.js |
| Backend | Java 21, Spring Boot, REST, Spring WebSocket/STOMP simple broker |
| Persistent data | File-backed H2 via Spring JDBC: accounts, Remember Me token hashes, encrypted per-user Drive refresh tokens |
| Temporary state | Rooms, playback, presence, chat, and promoted guest Host Drive credentials in backend memory |
| Movie media | Google Drive original bytes through the Spring HTTP Range proxy |
| Call media | Browser WebRTC connection to LiveKit |

Spring owns playback state and broadcasts control/state events. LiveKit carries call and screen media independently. No FFmpeg, transcoding, or re-encoding is used for movies. Browser codec support is still required. Rooms and chat do not survive backend restarts.

## Authentication and Ownership

Accounts use stable server-generated IDs and BCrypt password hashes (cost 12). Session responses expose safe identity information, never password hashes.

HTTP sessions expire after **30 minutes of inactivity**. The active UI calls `/api/auth/session` approximately every five minutes and on focus/visibility restoration. Protected fetch 401s update frontend auth state; POST/DELETE requests are not automatically replayed.

Remember Me uses a separate **30-day** random token, stored as a SHA-256 hash in H2 and rotated on successful restoration. It restores an HTTP session, not a lost room. Logout invalidates the session and revokes the current persistent token. Cookies are HttpOnly and SameSite=Lax; **set SYNCWATCH_COOKIE_SECURE=true in HTTPS production**. Local HTTP defaults to false.

Participant/client identity is bound to the server session's user or guest ID. Browser-supplied client IDs are not authorization proofs. Room actions and LiveKit token issuance check ownership. Call JWTs allow camera and microphone; the backend temporarily grants screen sources to the authoritative active sharer through LiveKit's participant-permission API. Signed LiveKit webhooks reconcile reconnects and unauthorized screen-track publication. Guests have room-scoped REST/STOMP access; Host privileges come from authoritative room state.

## Google Drive

Google Identity Services uses popup authorization-code exchange. The backend exchanges the code; the browser retains only a short-lived Picker access token in memory.

Registered Drive connections persist in H2 by SyncWatch userId across logout/login. Different accounts cannot inherit each other's authorization. Refresh tokens are AES-GCM encrypted using a key derived from the backend Google client secret.

Promoted anonymous guest Hosts can connect their own Drive. Their credentials remain in backend memory, keyed by guest identity, and are discarded on departure/room cleanup or explicit disconnect. Host transfer does not transfer Drive ownership.

For every `/api/stream/{roomId}` request, the backend checks cached room credential expiry and refreshes through the credential owner when necessary. Range and content headers are forwarded, preserving original video/audio bytes. The current proxy propagates upstream failures; forced refresh/retry after an upstream 401 is not implemented.

## Local Setup

Install Java 21, Maven, and a Node.js version supported by Vite 7 (for example Node 22.12+), with npm/Corepack. Calls require a LiveKit server.

From repository root:

```sh
corepack npm install
corepack npm run install:all
corepack npm run dev
```

The root scripts install frontend dependencies, resolve Maven dependencies, and launch backend/frontend development processes. Alternatively, use separate terminals:

```sh
cd backend
mvn spring-boot:run
```

```sh
cd frontend
corepack npm run dev
```

Open http://localhost:5173. Spring defaults to http://localhost:8080; WebSocket endpoint is `/ws`.

Create an untracked `frontend/.env.local`:

```dotenv
VITE_API_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your-web-client-id
VITE_GOOGLE_API_KEY=your-browser-api-key
VITE_GOOGLE_APP_ID=your-google-cloud-project-number
```

Set these in the backend process environment; Spring does not automatically read frontend dotenv files:

| Variable | Purpose |
| --- | --- |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | OAuth web client and backend-only secret |
| LIVEKIT_URL | Browser-reachable server; local example ws://localhost:7880 |
| LIVEKIT_API_KEY / LIVEKIT_API_SECRET | Credentials matching the LiveKit server |
| SYNCWATCH_COOKIE_SECURE | true for HTTPS production |
| SYNCWATCH_DATABASE_URL | JDBC URL; default jdbc:h2:file:./syncwatch-users;DB_CLOSE_ON_EXIT=FALSE |
| SYNCWATCH_DATABASE_USERNAME / SYNCWATCH_DATABASE_PASSWORD | Optional database credentials |
| SYNCWATCH_FRONTEND_ORIGIN | Override syncwatch.frontend-origin; default http://localhost:5173 |
| SERVER_FORWARD_HEADERS_STRATEGY | Set to NATIVE behind the trusted production Nginx proxy |
| SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES | Trusted proxy regex; production uses only loopback Nginx |
| SERVER_ADDRESS | Production bind address; use 127.0.0.1 behind Nginx |

Enable Google Drive and Picker APIs, authorize the frontend origin for OAuth, and restrict the browser API key appropriately. The app requests `drive.file`. Never place Google or LiveKit secrets in `VITE_` variables.

For local LiveKit, run `livekit-server --dev` and configure its matching development credentials in the backend. Production requires a properly configured LiveKit service and HTTPS/WSS. Configure the LiveKit server to send signed webhooks to the backend's public `https://YOUR_SYNCWATCH_HOST/api/livekit/webhook` endpoint, using the same API key configured for SyncWatch:

```yaml
webhook:
  api_key: YOUR_LIVEKIT_API_KEY
  urls:
    - https://YOUR_SYNCWATCH_HOST/api/livekit/webhook
```

The endpoint validates LiveKit's JWT signature and raw-body hash. Without webhook delivery, immediate permission changes still apply to connected participants, but stale-token reconnect and modified-client publication reconciliation are not complete. Camera/screen permissions and system-audio capture depend on the browser/platform.

H2's default path is relative to the Java working directory. Use a stable absolute database path in production and back it up consistently. Preserve the Google client secret alongside that operational backup: changing it prevents decrypting existing Drive credentials. Keep secrets and database files out of Git. Production database and backup files should be owner-only (`0600`) inside an owner-only directory.

See [deploy/PRODUCTION_SECURITY.md](deploy/PRODUCTION_SECURITY.md) for the trusted-proxy, loopback binding, Nginx header/logging, H2 permission, deployment, and verification steps. The accompanying [Nginx template](deploy/nginx/syncwatch-security.conf.example) intentionally logs `$uri` without query strings or Referer.

## Keyboard Shortcuts

Shortcuts apply inside rooms and ignore editable targets and Ctrl/Alt/Meta modifiers.

| Key | Action |
| --- | --- |
| Space / P | Synchronized Play/Pause |
| Left / Right | Synchronized seek -10/+10 seconds |
| Up / Down | Local volume +5%/-5% |
| M | Microphone mute/unmute |
| V | Camera on/off |
| C | Toggle Chat |
| Hold T | Push-to-Talk when enabled |
| F | Fullscreen |
| ? | Shortcut help |

## Validation and Deployment

```sh
mvn -f backend/pom.xml test
corepack npm --prefix frontend run build
git diff --check
```

The frontend build runs TypeScript and Vite; no separate frontend test/lint script exists. OAuth, two-person playback/calls, native screen capture, and mobile layouts also require runtime checks.

Serve `frontend/dist` with SPA fallback and proxy `/api` and `/ws` to Spring. Build with the public API origin in VITE_API_URL; otherwise it defaults to localhost. Configure the exact frontend origin and secure cookies. In production, Spring should bind to `127.0.0.1:8080` and accept forwarding information only from the loopback Nginx proxy.

STOMP uses 10-second heartbeats, a two-second reconnect delay, and a five-second presence grace. Nginx WebSocket routing needs HTTP/1.1 Upgrade headers; proxy_read_timeout 3600s and proxy_send_timeout 3600s provide additional idle-timeout protection. The tracked Nginx file is a reference template; live deployment configuration and secrets remain operator-managed.

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for implementation boundaries and remaining release housekeeping.
