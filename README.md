# SyncWatch

SyncWatch is a lightweight self-hosted watch-party application for watching Google Drive videos together in real time.

**Current version:** v0.3

## Features

- Create and join watch rooms
- Google Drive video picker
- Navigate through Drive folders
- Synchronized play, pause, and seek
- Collaborative playback controls
- Host-controlled video selection
- Join-in-progress synchronization
- Drift correction during playback
- HTTPS/WSS production support
- No database required
- Persistent Google Drive authorization with backend token refresh

## Stack

**Frontend**
- React
- TypeScript
- Vite

**Backend**
- Java 21
- Spring Boot
- WebSocket / STOMP

**Production**
- Nginx
- systemd
- Let's Encrypt / Certbot

## Google Drive OAuth

SyncWatch uses Google Identity Services' popup authorization-code flow. The
browser receives only the short-lived access token needed by Google Picker. The
backend stores the refresh token in an encrypted, HTTP-only cookie and refreshes
room streaming access before it expires.

Configure the same OAuth web client on both sides:

```env
# frontend/.env
VITE_GOOGLE_CLIENT_ID=your-web-client-id
VITE_GOOGLE_API_KEY=your-browser-api-key
VITE_GOOGLE_APP_ID=your-google-cloud-project-number

# Backend process environment
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-web-client-secret
```

For production, also set `SYNCWATCH_COOKIE_SECURE=true` and configure
`syncwatch.frontend-origin` to the exact public frontend origin. Never place the
Google client secret in a `VITE_` variable or commit it to Git.

## How Sync Works

The Spring Boot server maintains the authoritative room state.

```text
Host / Guest
     │
     │ REST + WebSocket/STOMP
     ▼
Spring Boot
     │
     ├── room state
     ├── play / pause
     ├── seek
     └── current playback position
