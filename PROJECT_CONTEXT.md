# SyncWatch Project Context

## Project

**Name:** SyncWatch  
**Current development branch:** `v0.3-sync`  
**Repository:** `https://github.com/kumaark7/SyncWatch`

SyncWatch is a lightweight personal watch-party application for playing Google Drive videos in sync across multiple browsers while preserving original video/audio quality.

## Core Goals

- Keep the app lightweight and simple.
- Preserve original video/audio quality.
- No transcoding.
- No re-encoding.
- No FFmpeg in the current architecture.
- Personal-use focused.
- Avoid unnecessary accounts, database, chat, profiles, admin panels, or heavy infrastructure unless explicitly added later.

## Current Stack

### Frontend
- React
- TypeScript
- Vite
- Native HTML5 `<video>`
- `@stomp/stompjs`

### Backend
- Java
- Spring Boot
- Spring Web
- Spring WebSocket/STOMP

### Video Source
- Google Drive

### State
- In-memory room storage
- No persistent database

## Current Architecture

```text
                 SyncWatch

       React + TypeScript + Vite
        ┌─────────────────────┐
        │ Google Picker       │
        │ HTML5 Video         │
        │ STOMP WebSocket     │
        │ Room UI             │
        └─────────┬───────────┘
                  │
           REST + WebSocket
                  │
        ┌─────────▼───────────┐
        │   Spring Boot       │
        │                     │
        │ RoomController      │
        │ RoomStore           │
        │ StreamController    │
        │ WebSocketConfig     │
        │ SyncController      │
        │ SyncScheduler       │
        └─────────┬───────────┘
                  │
                  ▼
             Google Drive
```

## Media Flow

```text
Google Drive original video
        ↓
Spring Boot range proxy
        ↓
Browser <video>
```

Important:

- Spring does not transcode.
- Spring does not re-encode.
- Spring proxies the original Drive bytes.
- HTTP Range requests are forwarded so seeking works.
- Each participant streams independently through Spring.

## Control Flow

```text
Browser action
   ↓
STOMP/WebSocket
   ↓
Spring authoritative room state
   ↓
Broadcast event
   ↓
All room browsers
```

Control messages are tiny and independent from video data.

## Version History

### v0.1
- Google Drive playback MVP
- Google Picker
- Room creation/join
- Original Drive playback

### v0.2
- Migrated backend to Java + Spring Boot
- Kept React/Vite frontend
- Added Spring-based streaming proxy
- HTTP Range support
- No real-time sync yet

### v0.3
Current development version.

Goal:
- Make SyncWatch a genuinely usable personal watch-party app.

## Current v0.3 Features

- Create room
- Join room
- Shareable room URL
- Google Drive Picker
- Google Drive video streaming through Spring Boot
- HTTP Range seeking
- WebSocket/STOMP connection
- Play synchronization
- Pause synchronization
- Seek synchronization
- Join-in-progress
- Periodic room-state synchronization
- Drift correction
- Automatic WebSocket reconnect
- Autoplay-blocked overlay
- Seek/sync visual overlays
- Real buffering overlay
- Copy invite toast
- Host/guest role support
- Per-browser temporary client ID
- Drive file change broadcast

## Host / Guest Model

Current intended behavior:

```text
Create room
   ↓
Normal room page
   ↓
Browser chooses Google Drive file
   ↓
That browser becomes HOST
   ↓
Copy invite
   ↓
/room/ABC123?guest=1
   ↓
Guest joins
```

Rules:

- The first browser that successfully chooses a Google Drive file becomes host.
- Host identity is temporary and exists only in room memory.
- No login/session persistence is required.
- Guest invite URL uses `?guest=1`.
- Guest should not see the Google Drive picker after host assignment.
- Only host should be allowed to change the Drive file.
- A guest attempting to replace the Drive file should receive HTTP 403.
- Host/guest role is based on server-recognized client identity, not only the URL.

## Client Identity

Each browser gets a temporary `clientId`.

Used for:
- Knowing who sent PLAY/PAUSE/SEEK.
- Distinguishing own echoed event from remote event.
- Determining host identity.
- Correct sync overlay labels.

Expected event concept:

```json
{
  "type": "SEEK",
  "time": 42.5,
  "playing": true,
  "senderClientId": "abc123",
  "hostClientId": "abc123",
  "serverTime": 123456789
}
```

## Sync Behavior

### PLAY
- Browser sends PLAY with current timestamp.
- Spring updates room state.
- Spring broadcasts PLAY.

### PAUSE
- Browser sends PAUSE with timestamp.
- Spring updates room state.
- Spring broadcasts PAUSE.

### SEEK
- Explicit user seek should immediately move all participants.
- SEEK must preserve the server-authoritative room play/pause state.
- A guest that is locally paused because of autoplay blocking must not accidentally pause the whole room when seeking.

## Drift Correction

Current target behavior:

```text
drift <= 250 ms
→ ignore

250 ms to 1.5 s
→ use temporary playbackRate correction
   0.97x or 1.03x

drift > 1.5 s
→ hard seek
```

Important:
- Periodic STATE messages should not trigger frequent hard seeks.
- Small drift should not cause visible jumps or extra media range requests.
- `serverTime` compensation should be used to estimate the current authoritative playback position when the room is playing.

Concept:

```ts
target =
  event.playing
    ? event.time + (Date.now() - event.serverTime) / 1000
    : event.time
```

## Join In Progress

When a new guest joins a playing room:

```text
Room currently around 32:15
        ↓
Guest joins
        ↓
Spring sends authoritative room state
        ↓
Guest seeks near current position
        ↓
Guest starts playback if browser allows
```

## Autoplay Handling

Browsers may reject programmatic `video.play()` before a user gesture.

Expected behavior:
- Do not treat this as an app failure.
- Show an overlay:
  `▶ Start synced playback`
- Clicking the overlay should:
  - count as user interaction
  - seek to current room position if necessary
  - start playback
  - remove the overlay

## Sync / Buffering Overlays

GIF assets:

```text
frontend/public/sync/
├── host-syncing.gif
└── client-syncing.gif
```

Expected labels:

```text
Host-originated seek
→ Host syncing...

Guest-originated seek
→ Guest syncing...

Actual media waiting/stalled
→ Buffering...
```

Important:
- Only one status overlay should be visible at a time.
- Do not show both “syncing” and “buffering” simultaneously.
- `waiting` / `stalled` should trigger Buffering.
- `playing` / `canplay` should clear Buffering.
- The browser that initiated a seek should not mislabel its own echoed event as remote.

## Copy Invite

Copy invite should create:

```text
http://localhost:5173/room/ABC123?guest=1
```

Production equivalent should use the production origin automatically.

Toast:

```text
Guest invite copied!
```

## Google Picker

Frontend environment variables:

```env
VITE_API_URL=http://localhost:8080

VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_API_KEY=...
VITE_GOOGLE_APP_ID=...
```

Definitions:
- `VITE_GOOGLE_CLIENT_ID` = OAuth web client ID
- `VITE_GOOGLE_API_KEY` = browser API key
- `VITE_GOOGLE_APP_ID` = Google Cloud project number

Required APIs:
- Google Drive API
- Google Picker API

OAuth scope:

```text
https://www.googleapis.com/auth/drive.file
```

Picker builder should use:
- `setAppId(APP_ID)`
- `setOAuthToken(accessToken)`
- `setDeveloperKey(API_KEY)`
- `setOrigin(top page protocol + host)`

Expected local origin:

```text
http://localhost:5173
```

## Google Auth Philosophy

Current desired behavior:
- One-time authorization per room/session is enough.
- Do not save a persistent login session.
- Do not store refresh tokens.
- Do not add user accounts.
- Access token is held only temporarily.
- Server keeps Drive access token in RAM only.
- Server restart clears rooms/tokens.
- If token expires, graceful reauthorization can be added later.

## Google Picker 401 Issue

Observed issue:

```text
GET https://docs.google.com/picker?... 401 Unauthorized
```

Also observed Picker request containing:

```text
parent=http://localhost:5173/favicon.ico
```

Work already attempted:
- Added explicit `setOrigin(...)`.
- Picker origin should be top-level protocol + host.

Need to verify:
1. 401 is gone after current Picker patch.
2. `parent` / origin is correct.
3. Google Drive API enabled.
4. Google Picker API enabled.
5. API key referrer restrictions include local origin.
6. OAuth Authorized JavaScript origin includes local origin.
7. App ID is Cloud project number.
8. Fresh short-lived token is requested on each Picker action.

Do not log OAuth access tokens intentionally.

## Browser Console Noise

Ignore unless behavior is broken:
- React DevTools development notice
- Browser extension errors
- Passive listener warnings from Google Picker
- favicon 404
- Tracking Prevention warnings if Picker still works

Relevant:
- Picker 401
- Spring HTTP errors
- STOMP connection errors
- media `waiting` / `stalled`
- failed stream range requests

## Video Buffering

Native HTML5 video controls its own preloading strategy.

Current:
- `preload="auto"`

Important:
- Browser may stop preloading after enough media is buffered.
- `preload="auto"` is a hint, not a guarantee to download entire file.
- Different clients may buffer different amounts.
- This is normal.

Do not replace the media stack just to force full download unless there is a real need.

## Player Strategy

Current recommendation:
- Keep native `<video>` for v0.3.
- Do not move to Video.js/Shaka/HLS/DASH yet.
- Preserve low complexity and original-quality progressive playback.
- Advanced player stack can be considered in v0.4+.

## Smooth Playback Priority

Current v0.3 priority:
1. Avoid unnecessary hard seeks.
2. Keep drift small using playbackRate.
3. Only show Buffering on real media stall.
4. Keep quality untouched.
5. Do not overcomplicate the media path.

## Current Testing

Test using:
- normal Chrome/Edge tab
- Incognito/InPrivate tab
- same room

Expected checklist:

```text
Create room              ✓
Choose Drive file        ✓
Host role assigned       ✓
Copy guest invite        ✓
Guest joins              ✓
Guest picker hidden      ✓
Both show Synced         ✓
Play sync                ✓
Pause sync               ✓
Host seek                ✓
Guest seek               ✓
Guest seek does not pause room ✓
Join mid-play            ✓
Autoplay overlay         ✓
Reconnect                ✓
Smooth drift correction  ✓
Buffering overlay        ✓
No duplicate overlays    ✓
Picker 401 gone          ✓
Long playback test       ✓
```

## Quality Requirement

Non-negotiable:
- No intentional quality loss.
- No transcoding.
- No bitrate reduction.
- No resolution reduction.
- No audio conversion.

Current media path should remain byte-for-byte proxy style wherever possible.

## Out of Scope for v0.3

Do not add unless explicitly requested:
- User accounts
- Database
- Chat
- Reactions
- Profiles
- Admin panel
- Redis
- FFmpeg
- Transcoding
- Upload system
- Playlist system
- Complex permissions
- Persistent login/session system

## v0.3 Definition of Done

v0.3 is considered usable when:

1. Host selects Drive file.
2. Guest opens invite.
3. Both stream same original file.
4. Play/pause/seek sync works reliably.
5. Guest seek does not break room play state.
6. Join-in-progress works.
7. Drift remains low over several minutes.
8. No repeated hard-seek stutter.
9. Autoplay blocking has a clear user-action overlay.
10. Real buffering has a clear status overlay.
11. Host/guest role labels are correct.
12. Guest cannot replace host Drive file.
13. Google Picker works reliably without recurring 401.
14. App remains lightweight.

## Next Work

Before declaring v0.3 complete:

1. Test the latest host-role patch.
2. Verify host becomes `★ Host` only after Drive selection.
3. Verify copied invite ends with `?guest=1`.
4. Verify guest has no Drive picker.
5. Verify host and guest seek labels are correct.
6. Verify sender does not process its own SEEK as remote.
7. Verify real buffering overlay replaces sync overlay instead of stacking.
8. Verify Picker 401 is resolved.
9. Run 2–3 minute uninterrupted playback test.
10. Test reconnect.
11. Then commit/tag v0.3.

## Git

Current branch:

```text
v0.3-sync
```

Do not tag v0.3 until the final test checklist passes.
