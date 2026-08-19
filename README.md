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
- OAuth token kept in browser memory only

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
