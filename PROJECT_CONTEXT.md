# SyncWatch Project Context

Current architecture for v1.0.0 release preparation. Maven, npm, and the health endpoint report 1.0.0; Maven packaging produces syncwatch-1.0.0.jar. This document does not pin a development branch or claim a release is deployed. Read AGENTS.md before changes; the UI standard lives at root UI_UX_STANDARD.md.

## Structure

- frontend/: React + TypeScript + Vite, native HTML video, STOMP.js.
- frontend/src/App.tsx: auth/Home/Room coordination, Drive selection and room events.
- frontend/src/VideoPlayer.tsx: synchronized movie controls and media handling.
- frontend/src/party/: People, chat, and LiveKit UI.
- frontend/src/gesture/: optional local MediaPipe gesture recognition.
- backend/: Java 21, Spring Boot 4.1.0, Maven, Spring JDBC, REST and WebSocket/STOMP.
- backend/src/main/resources/schema.sql: persistent account, Drive, and Remember Me tables.

Root package scripts target backend/ and frontend/. There is no Node server/client backend pair.

## Persistent and Temporary State

File-backed H2 stores unique username/email accounts, stable user IDs, BCrypt password hashes (cost 12), encrypted registered-user Drive refresh tokens, and SHA-256 Remember Me token hashes. The default JDBC path ./syncwatch-users is relative to Java's working directory. Production should use an explicit stable path.

RoomStore, Room playback state, presence, and ChatService history are in memory. Spring restart loses rooms/chat and ordinary servlet sessions. Persistent login can restore an account session but cannot restore a lost room.

## Authentication and Participant Identity

AuthController supports public Sign Up and Sign In by username/email plus password, establishing HttpSession with stable userId. AuthSessionResponse returns safe identity fields.

Servlet inactivity timeout remains 30 minutes. App revalidates approximately every five minutes and on focus/visibility restoration, plus before Picker/file operations. AuthProvider handles protected fetch 401s without replaying mutations.

RememberMeService issues 32-byte random tokens, hashes them for H2 storage, expires them after 30 days, and rotates them on successful restoration. Cookies use HttpOnly, SameSite=Lax, and Secure when SYNCWATCH_COOKIE_SECURE=true. Local HTTP defaults to false. Logout invalidates the session and revokes the current remembered token.

Invite links use /?room=ROOM_ID. GuestAuthController establishes a room-scoped session with server-generated guest ID and client ID after name entry. Anonymous guests have no account or persistent Remember Me token.

Stable browser client identity and room name tags use sessionStorage to support refresh. They are not authorization proofs. Participant ownership is bound to a server-session user/guest ID, and incoming actions are checked against it.

AuthFilter protects API/WebSocket access with public auth routes and a narrow guest allowlist. WebSocketAuthInterceptor checks handshake identity and restricts guest destinations to the invited room. HTTP/STOMP origins are explicitly configured.

Room actions verify participant/Host ownership; CallController issues LiveKit tokens only for the caller's own participant. Request client IDs, names, and URL shape cannot establish Host rights.

Current limitation: anonymous guest sessions cannot access the manual Host-transfer or Close Room endpoints through AuthFilter, even after promotion. Do not claim universal availability of those actions to guest Hosts without a separate implementation change.

## Room Lifecycle

Registered Sign In/Sign Up leads to Home, then Create/Join. Creation establishes Host; selecting a Drive file does not assign Host.

Manual Make Host changes authoritative ownership and broadcasts participant/Host state with a chat notice. On deliberate Host departure, the oldest remaining participant is promoted deterministically. A returning former Host does not automatically regain the role.

RoomPresenceService applies a five-second reconnect grace. Replacement STOMP sessions using the same stable identity cancel pending departure, avoiding false leave/join and premature promotion. Real disconnect completes after grace. Explicit Leave acts immediately. Empty rooms are removed.

Close Room explicitly terminates and broadcasts closure without Host transfer. Frontend cleanup clears room-specific identity/state and returns participants to Home. Leave also returns Home; registered auth and persistent Drive authorization are retained. Logout is on Home.

## Playback

Media: Google Drive original bytes -> StreamController HTTP Range proxy -> native browser video.

Control: player/shortcut/gesture -> existing STOMP action -> SyncController authoritative Room -> broadcast -> clients.

Keep seek ordering, remote-event suppression, server-time compensation, play/pause preservation on seek, drift/rate correction, buffering, and autoplay handling intact. SyncScheduler sends state every five seconds for playing rooms with a file. Join/subscription restores room state.

WebSocketConfig provides a scheduler and 10-second broker heartbeats. STOMP.js uses 10-second heartbeats and reconnectDelay 2000. WebSocket traffic is separate from HTTP auth keepalive.

## Drive Ownership and Streaming

GoogleDriveOAuthService uses popup authorization-code exchange with drive.file scope. Short-lived Picker tokens stay in browser memory; refresh tokens remain backend-only.

Registered refresh tokens are AES-GCM encrypted in H2 by userId. The key derives from GOOGLE_CLIENT_SECRET; rotating that secret affects stored-token decryption. Connections survive logout/login and role changes without cross-user inheritance.

Promoted guest Hosts can authorize their own Drive using an encrypted backend memory map keyed by guest ID. Departure/room cleanup or explicit Disconnect removes temporary credentials. They never enter the persistent account connection table.

GoogleDriveOAuthController resolves the current registered user, or verifies that a guest owns the current Host participant. Code exchange validates X-Requested-With and OAuth redirect origin. Disconnect affects only the caller's authorization.

Room caches the selected file's credential owner, access token, and expiresAt. Host transfer does not transfer authorization or rewrite the file owner. A new Host may connect their own Drive while the selected movie continues with its original owner's credentials.

accessTokenFor(room) checks expiry for each stream request and refreshes through the credential owner when needed; refresh work is synchronized. StreamController preserves Range, successful upstream status, Content-Range and other content headers. No transcoding, FFmpeg, HLS/DASH conversion, or movie-quality adjustment is present.

Known boundary: upstream non-2xx responses are propagated. Forced refresh and retry of the same Range request after upstream 401 is not implemented.

## Chat and Calls

ChatService stores room history in memory and broadcasts participant/call/Host-change notices. Party UI contains People, Chat, and Call.

CallProvider creates one LiveKit Room with adaptiveStream:true and dynacast:true. LiveKit carries WebRTC media independently of movie streaming. Controls include devices, mic/camera, speaker mute, connection indicators, floating/minimized layout, audio processing, and requested camera quality.

Adaptive Stream controls received call quality. Manual camera presets request local capture quality. Neither changes Drive movie bytes. PushToTalkProvider uses hold T, ignores typing, and respects manual OFF. Optional gesture recognition reuses the local camera and runs locally.

## Screen Sharing

ScreenShareController reserves one participant per application room with ownership checks. The Host can block anonymous guest shares; registered users and the Host remain eligible. RoomResponse/SyncEvent include sharer identity and guest-permission state.

CallProvider uses the existing LiveKit participant's setScreenShareEnabled with browser-supported audio. After capture starts, VideoPlayer.pausePlayback sends the existing synchronized PAUSE action. ScreenShareStage overlays the exact main-player area and labels the sharer. Stop restores the movie without sending PLAY.

Local track termination, call leave/disconnect, provider cleanup, and room departure release sharing state. The native browser picker determines tab/window/screen selection. System audio and capture support vary by browser/platform.

Security boundary: LiveKit join tokens permit camera and microphone but not screen sources. After an authenticated participant claims the one active share, the backend uses LiveKit `UpdateParticipant` to temporarily add `SCREEN_SHARE` and `SCREEN_SHARE_AUDIO`; stop, Host blocking, incompatible Host transfer, and departure revoke them while preserving camera/mic/data. Signed `participant_joined` and `track_published` webhooks reconcile self-hosted reconnects and modified clients. Production LiveKit must send webhooks to `/api/livekit/webhook` using the configured API key.

## Keyboard Shortcuts

RoomKeyboardShortcuts and PushToTalkProvider are the source of truth. Ignore editable targets and Ctrl/Alt/Meta modifiers; reuse existing actions.

| Key | Action |
| --- | --- |
| Space / P | synchronized Play/Pause |
| Left / Right | synchronized seek -10/+10 seconds |
| Up / Down | local volume +5%/-5% |
| M / V | microphone / camera |
| C | Chat |
| Hold T | Push-to-Talk when enabled |
| F | fullscreen |
| ? | help |

## Validation

From repository root:

```sh
mvn -f backend/pom.xml test
corepack npm --prefix frontend run build
git diff --check
```

Build runs TypeScript and Vite. No separate frontend lint/test script exists. Backend tests cover authentication, Remember Me, guest isolation, ownership, lifecycle, reconnect presence, Drive ownership, and screen-share control.

Manual verification should cover account switching, guest invites, refresh, Host transfer, Leave/Close, late joining, long-session seeking, reconnect grace, two-person calls, screen sharing/audio, browser Stop sharing, and mobile/fullscreen. Passing unit tests does not establish successful browser OAuth or native media capture.

## Remaining Release Housekeeping

- The private root tooling package retains its existing name, watch-party-mvp; its version is 1.0.0.
- ISSUES_FACED_AND_FIXES.txt is historical troubleshooting, not the current architecture contract.
- Production security deployment guidance and an Nginx reference snippet are tracked under `deploy/`; live Nginx, systemd, environment, and secret files remain operator-managed.
- Bundle-size warnings and browser runtime verification remain separate work. No optimization or behavior change is implied here.

See README.md for current setup, environment variables, and production cookie/database requirements.
