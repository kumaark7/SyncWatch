# SyncWatch

**Current source version: v1.0.0**

SyncWatch is a self-hosted watch-party application for synchronized Google Drive movies, room chat, and LiveKit voice, video, and screen sharing. Registered users create rooms, and friends can join through an invite link either with an account or as a room-scoped guest.

The v1.0.0 metadata and release documentation are prepared in this source tree. Tagging and production deployment are separate operator actions.

## Features

- Public Sign Up and Sign In with BCrypt password hashes.
- Thirty-minute HTTP sessions with optional 30-day Remember Me restoration.
- Home flow for creating or joining rooms, plus invite-link guest access without signup.
- Server-owned participant identities and server-authoritative Host permissions.
- Manual Host transfer and deterministic transfer to the oldest remaining participant when a Host leaves.
- Explicit Leave Room, Close Video, and Host-only Close Room lifecycle actions.
- Synchronized Play, Pause, Seek, late join, reconnect recovery, and drift correction.
- Original-quality Google Drive playback with browser-compatible HTTP Range seeking.
- Per-user persistent Drive authorization and memory-only credentials for promoted guest Hosts.
- Room chat with participant, call, and Host-change system messages.
- LiveKit voice/video calls, device selection, Push-to-Talk, and screen sharing.
- Host-controlled guest screen-sharing permission enforced through LiveKit participant permissions.
- Responsive desktop/mobile UI, keyboard shortcuts, and installable PWA support.

## Architecture

```text
Browser or installed PWA
        |
        v
Nginx (HTTPS, static frontend, /api and /ws proxy)
        |
        v
Spring Boot on 127.0.0.1:8080
        |
        +-- H2: users, Drive connections, Remember Me tokens
        +-- memory: active rooms, participants, playback, selected media, chat
```

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, STOMP.js, native HTML5 video |
| Backend | Java 21, Spring Boot 4.1, Maven, REST, Spring WebSocket/STOMP, Spring JDBC |
| Persistent storage | File-backed H2 |
| Movie source | Google Drive Files API through the backend Range proxy |
| Calls | Browser-to-LiveKit WebRTC using short-lived backend-issued tokens |
| Production edge | Nginx serving `frontend/dist` and proxying same-origin `/api` and `/ws` |

### Playback Control Plane

```text
Play / Pause / Seek
  -> STOMP /app/room/{roomId}/control
  -> SyncController
  -> authoritative Room state
  -> /topic/room/{roomId}
  -> playback synchronization logic
  -> HTML5 video element
```

Playback events are globally ordered with `playbackRevision`. `mediaVersion` identifies the selected-media generation, and `seekId` orders explicit seeks. Clients protect established playback from accidental zero-time events while still accepting an explicit seek to zero. A calibrated server clock, periodic authoritative state, late-join snapshots, foreground recalibration, buffering recovery, and bounded autoplay recovery keep clients converged.

### Movie Byte Plane

```text
HTML5 video
  -> GET /api/stream/{roomId} with Range
  -> StreamController
  -> Google Drive alt=media with the same Range / If-Range
  -> 200 or 206 response
  -> browser
```

Movie bytes never travel through STOMP. SyncWatch preserves original media bytes and upstream Range metadata; it does not transcode, re-encode, cache entire movies, or download them to VPS storage. If Drive rejects an opening request with 401, the backend closes that response, refreshes authorization once, and retries the same Range and If-Range. Browser-abandoned requests during rapid seeking are treated as normal downstream cancellation.

### Call Plane

```text
Browser -> authenticated backend token endpoint -> short-lived LiveKit token
Browser -----------------------------------------------------> LiveKit (WebRTC)
```

The backend derives the LiveKit room and participant identity from authorized room state. Join tokens permit camera and microphone by default. Screen-share sources are granted and revoked through LiveKit's server-side participant permission API. Screen sharing pauses the movie and occupies the main player area; stopping sharing restores the movie without automatically resuming it.

## Authentication and Data

Registered account sessions use `HttpSession`. The active frontend revalidates the session approximately every five minutes and on focus/visibility restoration. Protected request failures update frontend authentication state without automatically replaying mutations.

Remember Me stores only a SHA-256 token hash in H2, rotates the token after restoration, and uses an HttpOnly, SameSite=Lax cookie. Set `SYNCWATCH_COOKIE_SECURE=true` in HTTPS production. Participant and Host ownership is verified server-side; a browser-supplied `clientId` is not authorization proof.

Persistent H2 tables:

- `syncwatch_users`: stable user IDs, normalized username/email, BCrypt password hash.
- `google_drive_connections`: AES-GCM-encrypted refresh credentials owned by user ID.
- `remember_me_tokens`: hashed persistent-login tokens and expiry.

Backend restarts preserve accounts, password hashes, registered-user Drive connections, and Remember Me records. Active rooms, participants, selected-room state, playback, chat, guest Drive credentials, and ordinary HTTP sessions are in memory and do not survive a restart.

## Google Drive

The Host authorizes Google Drive through Google Identity Services and chooses a video with Google Picker. The browser receives only the short-lived token needed by Picker; stored refresh credentials remain backend-only. Registered users can reuse their own Drive connection after signing in again. A promoted anonymous Host can connect Drive temporarily, but those credentials remain in memory and are removed on disconnect/room cleanup or explicit Drive disconnect.

The app requests the `drive.file` scope. Playback compatibility depends on the browser supporting the selected file's codecs.

## WebSocket Reliability

The STOMP client uses a 2,000 ms reconnect delay and 10,000 ms incoming/outgoing heartbeats. Spring's simple broker also uses scheduled 10-second heartbeats. Unexpected disconnects have a configurable 30-second presence grace: reconnecting with the same stable identity preserves participant/Host state and avoids false leave/join messages. Grace expiry performs normal departure cleanup, Host transfer when required, and empty-room removal. Explicit Leave Room and Close Room remain immediate.

## PWA

SyncWatch includes a web manifest and a service worker with cache namespace `v1.0.0`. Navigations use network-first behavior with a cached shell fallback, while Vite content-hashed assets use cache-first behavior. `/api`, `/api/stream`, `/ws`, non-GET traffic, and cross-origin requests are bypassed. The PWA does not claim offline rooms, playback, authentication, Drive, or calls, and it does not force-reload an active room when an update is installed.

## Development

Prerequisites:

- Java 21
- Maven 3.9+
- Node.js supported by Vite 7 (Node 22.12+ recommended)
- npm/Corepack
- LiveKit server for call testing

From the repository root:

```sh
corepack npm install
corepack npm run install:all
corepack npm run dev
```

The frontend runs at `http://localhost:5173`; Spring runs at `http://localhost:8080`.

Create an ignored `frontend/.env.local` for local frontend configuration:

```dotenv
VITE_API_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=replace-with-local-web-client-id
VITE_GOOGLE_API_KEY=replace-with-restricted-browser-key
VITE_GOOGLE_APP_ID=replace-with-google-cloud-project-number
```

For production, API and WebSocket traffic are same-origin; do not configure localhost as the production API. An ignored `frontend/.env.production` contains only build-time public Google Picker configuration. Never place Google client secrets, LiveKit secrets, tokens, or passwords in a `VITE_` variable.

Backend secrets and deployment settings belong in the process environment, not Git. See [Production Deployment](deploy/PRODUCTION_DEPLOYMENT.md) for the exact variable names and safe placeholders.

## Validation

```sh
corepack npm --prefix frontend test
corepack npm --prefix frontend audit
corepack npm --prefix frontend run build
mvn -f backend/pom.xml test
mvn -f backend/pom.xml package
git diff --check
```

The v1.0.0 release-preparation baseline is 58 passing frontend tests and 125 passing backend tests under Java 21. These counts describe that baseline and may grow as tests are added. The expected backend artifact is `backend/target/syncwatch-1.0.0.jar`.

## Production

Production serves the frontend and same-origin API through HTTPS Nginx. Spring binds to loopback, loads secrets from `/etc/syncwatch.env`, and stores persistent H2 files under `/var/lib/syncwatch`. Review these operator documents before deployment:

- [Production deployment, backup, rollback, and verification](deploy/PRODUCTION_DEPLOYMENT.md)
- [Production security configuration](deploy/PRODUCTION_SECURITY.md)
- [Nginx reference fragment](deploy/nginx/syncwatch-security.conf.example)
- [WebSocket endurance checklist](WEBSOCKET_ENDURANCE_TEST.md)

The v0.9.7 synchronization hardening, functional production testing, large seeks, reconnect recovery, Host transfer, and Drive Range behavior have been validated. Full 2+ hour endurance/performance QA remains intentionally deferred until after v1.0.0; it must not be reported as completed.

Historical documents retain the version they describe: [SECURITY_REVIEW.md](SECURITY_REVIEW.md) records the v0.9 security review, and [ISSUES_FACED_AND_FIXES.txt](ISSUES_FACED_AND_FIXES.txt) records v0.3-era troubleshooting.
