# SyncWatch Project Context

This is the current architecture context for SyncWatch v1.0.0. Maven, npm, the health endpoint, the PWA cache namespace, and the packaged JAR use version 1.0.0. Historical v0.3/v0.9 documents are records, not current architecture contracts.

Read `AGENTS.md` before changes. UI work must also follow the root `UI_UX_STANDARD.md`.

## Repository Structure

- `frontend/`: React 19, TypeScript, Vite 7, STOMP.js, native HTML5 video, and LiveKit UI.
- `frontend/src/App.tsx`: authenticated/Home/Room orchestration, room snapshot handling, Drive selection, and shared room UI state.
- `frontend/src/VideoPlayer.tsx`: synchronized media application, local controls, buffering, autoplay recovery, and media lifecycle.
- `frontend/src/playbackSync.ts`: playback ordering, media-generation merging, zero-time guards, and play-rejection state transitions.
- `frontend/src/serverClock.ts`: bounded server-clock calibration using `performance.now()`.
- `frontend/src/useRoomSocket.ts`: one room STOMP lifecycle, subscriptions, stable client identity, reconnect diagnostics, and chat state.
- `frontend/src/party/`: People, chat, LiveKit call controls, and screen-share presentation.
- `frontend/public/`: branding, PWA manifest/icons, and service worker.
- `backend/`: Java 21, Spring Boot 4.1, Maven, REST, WebSocket/STOMP, and Spring JDBC.
- `backend/src/main/resources/schema.sql`: persistent account, Drive connection, and Remember Me tables.
- `deploy/`: publishable production runbooks and an Nginx reference fragment; live VPS configuration remains operator-managed.

Root npm scripts target `backend/` and `frontend/`. There is no legacy Node `server/`/`client/` application pair.

## Production Topology

```text
Browser / installed PWA
        |
        v
Nginx: HTTPS, frontend static files, /api and /ws
        |
        v
Spring Boot: 127.0.0.1:8080
        |
        +-- file-backed H2
        +-- in-memory room services

Browser ---------------- WebRTC ----------------> LiveKit
Spring -------------- LiveKit server API -------> LiveKit
```

Nginx is the intended public HTTP entry point. It serves the Vite build, provides SPA fallback, proxies same-origin API/WebSocket traffic, forwards trusted single-proxy client-address metadata, and preserves Range headers for `/api/stream/`.

## State Ownership and Persistence

Persistent H2 state:

- `syncwatch_users`: registered account identity and BCrypt password hashes.
- `google_drive_connections`: registered-user refresh credentials encrypted with AES-GCM and keyed by user ID.
- `remember_me_tokens`: SHA-256 token hashes, user ownership, and expiry.

In-memory backend state:

- active rooms and participants
- authoritative playback state
- selected media and active access-token cache
- room chat history
- guest temporary Drive credentials
- reconnect/presence timers

Browser state includes the ordinary session cookie, Remember Me cookie, room name/client identity in `sessionStorage`, local call/device preferences, current UI state, and PWA caches. Browser identifiers support continuity but do not establish authorization.

Backend restart preserves registered accounts, password hashes, registered-user Drive connections, and Remember Me records. It does not preserve active rooms, participants, room chat, selected-room state, playback, guest Drive credentials, or ordinary servlet sessions. A remembered account can obtain a new HTTP session after restart, but a lost in-memory room cannot be restored.

## Authentication and Authorization

`AuthController` provides public Sign Up and Sign In by username/email and password. Successful authentication establishes `HttpSession` identity using a stable server-generated user ID. Passwords are BCrypt hashes and safe session responses never expose them.

Servlet inactivity timeout is 30 minutes. The authenticated UI revalidates `/api/auth/session` approximately every five minutes, on focus/visibility restoration, and before Picker/file operations. A protected fetch returning 401 invalidates frontend auth state; state-changing requests are not automatically retried.

Remember Me uses a separate 32-byte random token with a 30-day lifetime. H2 stores its SHA-256 hash, successful restoration atomically consumes and rotates it, and logout revokes it. Cookies are HttpOnly, SameSite=Lax, Path `/`, and Secure when `SYNCWATCH_COOKIE_SECURE=true`.

Invite-link guests receive a room-scoped backend session, server-generated guest ID, and authorized client identity after entering a name. They do not receive a registered account or persistent Remember Me token. Guest HTTP and STOMP access is constrained to the invited room.

Participant ownership is bound to the authenticated user/guest ID. Room controls, Host transfer, media selection, call tokens, and screen-share actions verify that ownership against server room state. Browser-provided room IDs, names, and client IDs are request data, not authorization proofs. A promoted guest Host can transfer Host and manage media within the guest allowlist; Close Room currently requires a registered user session as well as authoritative Host ownership.

## Room Lifecycle and Presence

Registered users create rooms from Home; registered users or invited guests join with a room name tag. The creator initially claims Host ownership. Manual Make Host is server-authoritative. When the current Host genuinely leaves, the oldest remaining participant is promoted deterministically; a previous Host does not regain the role merely by rejoining.

Unexpected STOMP disconnects use `syncwatch.websocket.presence-grace`, defaulting to 30 seconds. During grace, the participant remains logically present: there is no Host transfer, SYSTEM_LEAVE, temporary Drive cleanup, LiveKit removal, or empty-room deletion. Reconnection with the same stable client identity replaces the old STOMP session association and cancels pending departure without duplicate presence messages.

Grace expiry performs normal departure, LiveKit cleanup, guest temporary Drive cleanup, Host transfer when needed, and empty-room cleanup. Explicit Leave Room and Host Close Room are immediate. Close Room terminates the room without Host transfer; Leave Room preserves registered authentication and persistent Drive authorization.

## Playback Synchronization

Playback has a control plane and a byte plane. Movie bytes never travel over STOMP.

Control flow:

```text
local control -> /app/room/{roomId}/control -> SyncController
              -> synchronized Room mutation -> /topic/room/{roomId}
              -> client ordering/recovery -> video element
```

`Room` is authoritative. Every accepted PLAY, PAUSE, and SEEK advances `playbackRevision`; SEEK also advances `seekId`. Selecting or clearing media resets playback and advances the playback revision. `mediaVersion` changes only when media identity changes, keeping ordinary room events from remounting/reloading the video.

Clients reject lower playback revisions across PLAY/PAUSE/SEEK/STATE. Within one revision, a newer STATE snapshot may refine the same state without undoing a newer realtime event. `seekId` separately rejects stale explicit seeks. A new media generation establishes its own ordering context.

Explicit SEEK to zero is authoritative. PLAY, PAUSE, buffering, reconnect, participant updates, Host transfer, screen sharing, and state refresh cannot replace an established nonzero position with an accidental zero. Remote application is suppressed so native media events do not echo duplicate controls.

`serverClock.ts` samples `GET /api/rooms/{roomId}` three times and selects the lowest valid RTT sample. After calibration, estimated server time advances from `performance.now()`, avoiding device wall-clock skew. Calibration occurs on initial connection, STOMP reconnect, and after a meaningful foreground return; foreground refresh updates the clock without reconnecting STOMP or applying an unnecessary playback snapshot. Failure uses a bounded no-transport-age fallback rather than an unbounded wall-clock delta.

Modern clients subscribe, JOIN with `clientSnapshotSupported=true`, and retrieve their own authoritative REST snapshot. The same playback-order guard arbitrates REST and realtime data, so a delayed snapshot cannot overwrite a newer event. The backend retains a temporary legacy JOIN STATE broadcast only for clients that do not advertise snapshot support. PARTICIPANTS remains room-wide, and stable reconnects do not create duplicate SYSTEM_JOIN messages.

`SyncScheduler` sends room STATE every five seconds for rooms that are playing and have a file. Drift correction, hard-seek thresholds, soft rate correction, buffering/seeking recovery, and bounded autoplay recovery remain frontend responsibilities. Genuine `NotAllowedError` displays the user playback-start action; transient `AbortError` retains authoritative play intent and retries only at media recovery boundaries.

## Google Drive Playback

Google Identity Services performs popup authorization-code exchange, and Google Picker selects a file under the `drive.file` scope. The browser uses a short-lived access token for Picker; persistent refresh credentials never need to be returned to frontend JavaScript.

Registered-user refresh credentials are AES-GCM encrypted in H2 by user ID. The encryption key derives from `GOOGLE_CLIENT_SECRET`, so changing that secret prevents existing connection records from being decrypted. Promoted guest Hosts may connect their own Drive, but those credentials stay in an encrypted in-memory map keyed by guest identity and are removed on guest departure/room cleanup or explicit disconnect. Host transfer never transfers Drive ownership.

Movie flow:

```text
video Range request -> /api/stream/{roomId} -> StreamController
                    -> Google Drive alt=media with Range/If-Range
                    -> original 200/206 response -> browser
```

`StreamController` incrementally copies the upstream body and preserves status plus `Content-Range`, `Content-Length`, `Content-Type`, `Accept-Ranges`, `ETag`, and `Last-Modified`. Long offsets support multi-gigabyte files. On the first upstream 401 while opening a request, the initial body is closed, authorization refresh occurs once, and the exact Range/If-Range is retried once. A second 401 is returned without another retry. Expected browser-aborted responses stop copying and close Drive resources; genuine upstream failures remain errors. There is no transcoding, HLS/DASH conversion, whole-file JVM buffering, or VPS media storage.

## Chat, Calls, and Screen Sharing

`ChatService` stores bounded room history in memory and broadcasts user messages plus presence, call, and Host-change system messages. Chat uses the existing room STOMP connection and subscription.

`CallController` issues a short-lived LiveKit token only for the authenticated participant in the requested SyncWatch room. The token derives the LiveKit room/identity server-side and grants room join, camera, microphone, data publishing, and subscription without room-admin privileges. The browser then connects directly to LiveKit over WebRTC; call media never flows through Spring.

Only one participant can hold the SyncWatch screen-share lease. Authorized sharing temporarily adds LiveKit `SCREEN_SHARE` and `SCREEN_SHARE_AUDIO` sources through `UpdateParticipant`; revocation removes an active track and prevents immediate republishing. Signed LiveKit webhooks reconcile reconnects and modified clients. Screen sharing pauses synchronized movie playback, replaces the main player presentation, and never auto-resumes the movie when sharing stops.

## PWA and Frontend Networking

Production `api.ts` uses same-origin requests. Development may use `VITE_API_URL`, defaulting to `http://localhost:8080` only when `import.meta.env.DEV` is true. Production `.env.production` provides public Google build-time values and must remain ignored.

The PWA service worker uses cache namespace `v1.0.0`. Navigation is network-first with cached shell fallback. Same-origin Vite content-hashed assets are cache-first. `/api`, `/api/stream`, `/ws`, cross-origin, and non-GET requests bypass the worker. `skipWaiting` and `clients.claim` update worker control without forcing an active room to reload.

## Configuration

Shared defaults are in `backend/src/main/resources/application.properties`. Production settings and secrets belong in `/etc/syncwatch.env`; frontend build-time values belong in ignored `frontend/.env.production`. Exact names, safe placeholders, systemd, Nginx, H2 permissions, backup, rollback, and health checks are documented in `deploy/PRODUCTION_DEPLOYMENT.md` and `deploy/PRODUCTION_SECURITY.md`.

## Validation and Release Status

```sh
corepack npm --prefix frontend test
corepack npm --prefix frontend audit
corepack npm --prefix frontend run build
mvn -f backend/pom.xml test
mvn -f backend/pom.xml package
git diff --check
```

The v1.0.0 release-preparation baseline records 58 passing frontend tests and 125 passing backend tests under Java 21. Browser OAuth, two-person synchronized playback, native capture, and production proxy behavior still require runtime checks in addition to automated tests.

Completed release evidence includes v0.9.7 synchronization hardening, functional production checks, large seeks, reconnect recovery, Host transfer, Drive Range behavior, and v1.0.0 metadata conversion. Full 2+ hour endurance/performance QA is deferred until after v1.0.0 and must not be described as passed.

Historical scope is intentionally preserved in `SECURITY_REVIEW.md` (v0.9) and `ISSUES_FACED_AND_FIXES.txt` (v0.3). `WEBSOCKET_ENDURANCE_TEST.md` is the current reconnect/endurance checklist.
