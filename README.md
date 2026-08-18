# Lightweight Google Drive Watch Party

## 1. Install

At the project root:

```bash
npm install
npm run install:all
```

## 2. Configure Google

Create `client/.env` from `client/.env.example`.

You need:

- OAuth Client ID for a Web application
- Google API key
- Google Cloud project number (used as Picker App ID)
- Google Drive API enabled
- Google Picker API enabled

For local development, add:

```text
http://localhost:5173
```

to the OAuth client's Authorized JavaScript origins.

The app requests:

```text
https://www.googleapis.com/auth/drive.file
```

The selected file's temporary OAuth access token is sent to your Node server and kept only in the in-memory room object.

## 3. Run

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Important MVP limitations

- Rooms and Google access tokens are stored only in RAM.
- Restarting the server destroys rooms.
- Google access tokens expire; if a long session later gets a 401, re-select/re-authorize the Drive file.
- Anyone with the random room URL can access the room's stream while the room exists.
- There is no transcoding: Drive media bytes are proxied to the browser.
- Browser codec support still applies.
