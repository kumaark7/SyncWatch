# SyncWatch Java v0.1

React + TypeScript + Vite frontend, Java 21 + Spring Boot backend.

## Features
- Create/join room
- Google Drive Picker
- Stream selected Drive video through Spring Boot
- HTTP Range forwarding for seeking
- No transcoding or re-encoding
- In-memory rooms
- No playback sync yet (v0.2)

## Run backend
```bash
cd backend
mvn spring-boot:run
```

## Run frontend
Copy `frontend/.env.example` to `frontend/.env`, fill Google values, then:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:8080
