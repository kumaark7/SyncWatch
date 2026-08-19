# SyncWatch

SyncWatch is a lightweight personal watch-party application for watching
Google Drive videos together in synchronized rooms.

It uses a React + TypeScript frontend and a Java Spring Boot backend.
Video files are streamed from Google Drive through a Spring HTTP Range
proxy without transcoding or re-encoding, while playback synchronization
is handled separately through Spring WebSocket/STOMP.

## Current Version

### v0.3 Local

v0.3 introduces real-time synchronized playback and turns the original
Google Drive player into a usable watch-party application.

Current status:

-   Local development complete
-   Core synchronization working
-   Google Drive playback working
-   Collaborative playback controls working
-   Host/guest file authority working
-   Production/VPS deployment configuration is the next step

## Features

### Google Drive Playback

-   Google OAuth connection
-   Google Drive Picker
-   Navigate through Drive folders
-   Select supported video files
-   Google token kept in frontend memory only
-   Disconnect Google support
-   Original video/audio bytes are preserved
-   No transcoding, re-encoding, or FFmpeg

Supported Picker MIME types:

``` text
video/mp4
video/webm
video/quicktime
video/x-matroska
```

> Browser playback still depends on the codecs contained inside the
> file. MP4 with H.264 video and AAC audio is the safest option for
> browser compatibility.

### Watch Party Rooms

-   Create temporary rooms
-   Join existing rooms
-   Shareable invite URL
-   Host/guest identification
-   Per-browser temporary client ID
-   Join-in-progress synchronization
-   In-memory room state

Rooms are currently temporary and are not stored in a database.

### Collaborative Playback Controls

Both host and guests can intentionally control playback:

-   Play
-   Pause
-   Seek

The Spring backend maintains the authoritative room playback state and
broadcasts control events to all connected participants.

### Seek Synchronization

v0.3 includes:

-   Explicit remote seek synchronization
-   `seekId` ordering
-   Stale seek protection
-   Latest seek wins during rapid seeking
-   Remote media-event suppression
-   Prevention of play/pause/seek feedback loops

Programmatic changes caused by synchronization are prevented from being
echoed back to the server as new user actions.

### Drift Correction

``` text
Drift <= 250 ms
    Ignore

250 ms < Drift <= 1.5 s
    Temporary playback-rate correction

Drift > 1.5 s
    Hard seek
```

### Autoplay, Buffering and Sync UI

The player handles browser autoplay restrictions and includes UI states
for buffering, host/guest synchronization, pause events, and
autoplay-blocked playback.

## Architecture

``` text
                React + TypeScript + Vite
               ┌──────────────────────────┐
               │ Google Picker            │
               │ Native HTML5 Video       │
               │ STOMP WebSocket Client   │
               │ Room UI                  │
               └────────────┬─────────────┘
                            │
                     REST + WebSocket
                            │
               ┌────────────▼─────────────┐
               │      Spring Boot         │
               │ RoomController           │
               │ RoomStore                │
               │ StreamController         │
               │ SyncController           │
               │ SyncScheduler            │
               │ WebSocketConfig          │
               └────────────┬─────────────┘
                            │
                            ▼
                       Google Drive
```

## Media Flow

``` text
Google Drive
     │ original video bytes
     ▼
Spring Boot HTTP Range Proxy
     │
     ├──────────────► Host <video>
     └──────────────► Guest <video>
```

Each participant independently requests video ranges through the
backend. Spring Boot does not decode, transcode, resize, or re-encode
the media.

Synchronization uses a separate path:

``` text
Browser action
     ▼
STOMP / WebSocket
     ▼
Spring Boot authoritative room state
     ▼
Room broadcast
     ├──────────────► Host
     └──────────────► Guests
```

The video itself is never transferred through WebSocket.

## Host and Guest Model

The browser that successfully selects the Google Drive file becomes the
room host. The backend's `hostClientId` is authoritative.

### Host

The host can connect Google Drive, choose/change the room video,
disconnect Google, and use play/pause/seek.

### Guest

Guests can watch the selected video and collaboratively play, pause, and
seek. Guests cannot access the host's Google token or choose, replace,
or clear the Drive file.

## Google Authentication Model

Google OAuth access tokens are temporary and stored in frontend memory
only.

They are not stored in:

-   `localStorage`
-   `sessionStorage`
-   cookies
-   a database

Refreshing the application may therefore require reconnecting Google
Drive.

## Tech Stack

### Frontend

-   React
-   TypeScript
-   Vite
-   Native HTML5 `<video>`
-   `@stomp/stompjs`
-   Google Identity Services
-   Google Picker API

### Backend

-   Java
-   Spring Boot
-   Spring Web
-   Spring WebSocket
-   STOMP
-   In-memory room storage

### Media

-   Google Drive
-   HTTP Range requests
-   Native browser video decoding

## Local Development

Requirements:

-   Java
-   Maven
-   Node.js
-   npm

``` bash
java -version
mvn -version
node -v
npm -v
```

## Google Cloud Setup

Create an OAuth 2.0 Client ID, API key, and Google Cloud project number.
Enable the required Google Drive/Picker APIs.

Local OAuth JavaScript origin:

``` text
http://localhost:5173
```

Local API key HTTP referrer:

``` text
http://localhost:5173/*
```

Create `frontend/.env` from the provided example:

``` env
VITE_GOOGLE_CLIENT_ID=your_client_id
VITE_GOOGLE_API_KEY=your_api_key
VITE_GOOGLE_APP_ID=your_project_number
VITE_API_URL=http://localhost:8080
```

Do not commit the real `.env` file.

## Running Locally

Backend:

``` bash
cd backend
mvn spring-boot:run
```

Frontend:

``` bash
cd frontend
npm install
npm run dev
```

Default URLs:

``` text
Frontend: http://localhost:5173
Backend:  http://localhost:8080
```

## Testing a Watch Party

1.  Open SyncWatch in a normal browser window.
2.  Create a room.
3.  Connect Google Drive.
4.  Choose a video.
5.  Copy the room invite.
6.  Open the invite in another browser or Incognito window.
7.  Start synchronized playback.
8.  Test play, pause, and seek from both participants.
9.  Try a long and rapid seek.
10. Verify both players converge to approximately the same playback
    position.

## Server Validation

The backend defensively ignores invalid commands such as:

-   Unknown room
-   Unsupported control type
-   Missing client identity
-   Negative playback timestamp
-   Non-finite playback timestamp

Valid host and guest playback commands continue through the
collaborative synchronization path. Drive file modification remains
restricted to the room host.

## Current Limitations

v0.3 intentionally does not provide:

-   Persistent rooms
-   User accounts
-   Room passwords
-   Chat or video chat
-   Redis/PostgreSQL
-   HLS
-   YouTube
-   WebTorrent
-   Screen sharing
-   Shared virtual browser
-   Server-side transcoding
-   FFmpeg processing

Complete reconnect/rejoin/resync recovery and additional
buffering/overlay polish are planned for later versions.

## Version History

### v0.1

-   Google Drive playback MVP
-   Google Picker
-   Room creation/join
-   Google Drive video playback

### v0.2

-   Migrated backend to Java Spring Boot
-   React/Vite frontend retained
-   Spring-based Google Drive proxy
-   HTTP Range support

### v0.3

-   Spring WebSocket/STOMP
-   Play/pause/seek synchronization
-   Collaborative controls
-   `seekId` ordering and stale seek protection
-   Feedback-loop suppression
-   Join-in-progress
-   Periodic state synchronization
-   Drift correction
-   Host/guest authority
-   Google connection lifecycle
-   Drive folder navigation
-   Autoplay handling
-   Sync/buffering overlays
-   Defensive server validation

## Roadmap

### v0.3 Production Deployment

-   VPS deployment
-   Production frontend build
-   Production CORS configuration
-   HTTPS/WSS
-   Reverse proxy configuration
-   Production Google OAuth origins
-   Production API referrer restrictions
-   VPS host/guest testing

### Future

-   Full reconnect/rejoin/resync recovery
-   Buffering UX improvements
-   Seek overlay polish
-   Room expiration/cleanup
-   Room passwords
-   HTTP video URL support
-   HLS
-   Additional media providers
-   Shared browser mode

## Design Philosophy

SyncWatch deliberately uses a small architecture:

``` text
Google Drive
      +
Spring Boot
      +
HTTP Range
      +
WebSocket/STOMP
      +
Native HTML5 Video
```

The goal is reliable synchronized playback without unnecessary media
processing or infrastructure. Original media quality is preserved
because SyncWatch proxies the source bytes instead of transcoding them.

## License

See the repository license for licensing information.
