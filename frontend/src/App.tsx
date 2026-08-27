import { useEffect, useState } from "react";
import { API_URL } from "./api";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import LoginPage from "./auth/LoginPage";
import ConnectionStatus from "./components/ConnectionStatus";
import MediaInfo from "./components/MediaInfo";
import TheaterToggle from "./components/TheaterToggle";
import Toast from "./components/Toast";
import DrivePicker from "./DrivePicker";
import PartyPanel from "./party/PartyPanel";
import VideoPlayer from "./VideoPlayer";
import { useRoomSocket } from "./useRoomSocket";
import type { Participant, RoomState } from "./types";
import "./style.css";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const TOKEN_EXPIRY_SKEW_MS = 60000;
const NAME_TAG_STORAGE_KEY = "syncwatch-name-tag";

type GoogleConnection = {
  accessToken: string;
  expiresAt: number;
};

function roomFromUrl() {
  const pathMatch =
    window.location.pathname.match(
      /^\/room\/([A-Z0-9]+)/i
    );

  if (pathMatch?.[1]) {
    return pathMatch[1].toUpperCase();
  }

  return new URLSearchParams(window.location.search)
    .get("room")
    ?.toUpperCase() || "";
}

function googleApisReady() {
  return Boolean(
    window.google?.accounts?.oauth2 &&
      window.gapi
  );
}

function AppContent() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <main className="loginShell">
        <div className="loginCard loadingCard">Loading SyncWatch...</div>
      </main>
    );
  }

  if (!auth.session.authenticated) {
    return <LoginPage onLogin={auth.signIn} />;
  }

  return <AuthenticatedApp username={auth.session.username || "User"} onLogout={auth.signOut} />;
}

function AuthenticatedApp({
  username,
  onLogout
}: {
  username: string;
  onLogout: () => Promise<void>;
}) {
  const [roomId, setRoomId] =
    useState(roomFromUrl());

  const [joinCode, setJoinCode] =
    useState(roomFromUrl());

  const [nameTag, setNameTag] = useState(
    () => sessionStorage.getItem(NAME_TAG_STORAGE_KEY) ?? ""
  );

  const [participants, setParticipants] =
    useState<Participant[]>([]);

  const [room, setRoom] =
    useState<RoomState | null>(null);

  const [toast, setToast] =
    useState("");

  const [theaterMode, setTheaterMode] =
    useState(false);

  const [googleConnection, setGoogleConnection] =
    useState<GoogleConnection | null>(null);

  const [googleReady, setGoogleReady] =
    useState(googleApisReady());

  const {
    connected,
    lastEvent,
    sendControl,
    clientId
  } = useRoomSocket(roomId, nameTag.trim());

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  useEffect(() => {
    if (googleReady) {
      return;
    }

    const timer = window.setInterval(() => {
      if (googleApisReady()) {
        setGoogleReady(true);
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [googleReady]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    fetch(
      `${API_URL}/api/rooms/${roomId}?clientId=${encodeURIComponent(
        clientId
      )}`,
      { credentials: "include" }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Room not found");
        }

        return response.json();
      })
      .then((data) => {
        setRoom(data);
      })
      .catch(() => {
        setRoom(null);
      });
  }, [roomId, clientId]);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }

    if (lastEvent.type === "PARTICIPANTS") {
      setParticipants(lastEvent.participants ?? []);
      return;
    }

    setRoom((previous) => {
      if (!previous) {
        return previous;
      }

      const eventHost = lastEvent.hostClientId;
      const isHost = Boolean(eventHost) && eventHost === clientId;

      if (lastEvent.type === "FILE_SELECTED") {
        return {
          ...previous,
          hasFile: true,
          fileName: lastEvent.fileName ?? "Google Drive video",
          playing: false,
          currentTime: 0,
          serverTime: lastEvent.serverTime,
          hostAssigned: true,
          isHost
        };
      }

      if (lastEvent.type === "FILE_CLEARED") {
        setTheaterMode(false);

        return {
          ...previous,
          hasFile: false,
          fileName: null,
          playing: false,
          currentTime: 0,
          serverTime: lastEvent.serverTime,
          hostAssigned: Boolean(eventHost) || previous.hostAssigned,
          isHost: eventHost ? isHost : previous.isHost
        };
      }

      return {
        ...previous,
        playing: lastEvent.playing,
        currentTime: lastEvent.time,
        serverTime: lastEvent.serverTime,
        hostAssigned: Boolean(eventHost) || previous.hostAssigned,
        isHost: eventHost ? isHost : previous.isHost
      };
    });
  }, [lastEvent, clientId]);

  useEffect(() => {
    if (room && !room.isHost) {
      setGoogleConnection(null);
    }
  }, [room]);

  async function createRoom() {
    if (!saveNameTag()) {
      return;
    }

    const response = await fetch(
      `${API_URL}/api/rooms?clientId=${encodeURIComponent(clientId)}`,
      {
        method: "POST",
        credentials: "include"
      }
    );

    if (!response.ok) {
      alert("Could not create room.");
      return;
    }

    const data = await response.json();
    history.pushState({}, "", `/room/${data.roomId}`);
    setRoomId(data.roomId);
    setJoinCode(data.roomId);
    setRoom(data);
  }

  async function joinRoom() {
    if (!saveNameTag()) {
      return;
    }

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      return;
    }

    const response = await fetch(
      `${API_URL}/api/rooms/${code}?clientId=${encodeURIComponent(clientId)}`,
      { credentials: "include" }
    );

    if (!response.ok) {
      alert("Room not found.");
      return;
    }

    const data = await response.json();
    history.pushState({}, "", `/room/${code}?guest=1`);
    setRoomId(code);
    setRoom(data);
  }

  function saveNameTag() {
    const cleanedName = nameTag.trim();
    if (!cleanedName) {
      alert("Enter a name tag before continuing.");
      return false;
    }

    sessionStorage.setItem(NAME_TAG_STORAGE_KEY, cleanedName);
    setNameTag(cleanedName);
    return true;
  }

  function requestGoogleAccessToken(prompt = "") {
    return new Promise<GoogleConnection | null>((resolve) => {
      if (!CLIENT_ID) {
        alert("Missing VITE_GOOGLE_CLIENT_ID in frontend/.env");
        resolve(null);
        return;
      }

      if (!googleReady || !window.google?.accounts?.oauth2) {
        resolve(null);
        return;
      }

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (tokenResponse: any) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            console.error(
              "Google OAuth token error:",
              tokenResponse.error || "No access token returned"
            );
            alert("Google Drive authorization failed. Please try again.");
            resolve(null);
            return;
          }

          const expiresInSeconds = Number(tokenResponse.expires_in) || 3600;
          resolve({
            accessToken: tokenResponse.access_token,
            expiresAt: Date.now() + expiresInSeconds * 1000 - TOKEN_EXPIRY_SKEW_MS
          });
        },
        error_callback: (error: any) => {
          console.error("Google OAuth popup error:", error);
          resolve(null);
        }
      });

      tokenClient.requestAccessToken({ prompt });
    });
  }

  async function connectGoogleDrive() {
    if (!googleReady) {
      return;
    }

    if (googleConnection && googleConnection.expiresAt > Date.now()) {
      showToast("Google Drive already connected");
      return;
    }

    const connection = await requestGoogleAccessToken("consent");
    if (!connection) {
      return;
    }

    setGoogleConnection(connection);
    showToast("Connected to Google Drive");
  }

  async function getValidGoogleAccessToken() {
    if (!googleReady) {
      return null;
    }

    if (googleConnection && googleConnection.expiresAt > Date.now()) {
      return googleConnection.accessToken;
    }

    showToast("Please connect Google Drive first");
    return null;
  }

  async function selectFile(file: {
    id: string;
    name: string;
    accessToken: string;
  }) {
    const response = await fetch(`${API_URL}/api/rooms/${roomId}/file`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fileId: file.id,
        fileName: file.name,
        accessToken: file.accessToken,
        clientId
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      alert(result?.error || "Could not attach Drive file.");
      return;
    }

    setRoom(await response.json());
  }

  async function disconnectGoogleDrive() {
    const token = googleConnection?.accessToken;
    setGoogleConnection(null);

    if (token && googleReady && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }

    if (room?.isHost) {
      const response = await fetch(
        `${API_URL}/api/rooms/${roomId}/file?clientId=${encodeURIComponent(clientId)}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.error || "Could not disconnect Google Drive.");
        return;
      }

      setRoom(await response.json());
      setTheaterMode(false);
    }

    showToast("Disconnected from Google Drive");
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      showToast("Room code copied");
    } catch {
      showToast("Couldn't copy room code");
    }
  }

  async function copyInvite() {
    const inviteUrl = `${window.location.origin}/room/${roomId}?guest=1`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast("Invite link copied");
    } catch {
      showToast("Couldn't copy invite");
    }
  }

  async function logout() {
    await onLogout();
    setRoom(null);
    setRoomId("");
    setGoogleConnection(null);
    setTheaterMode(false);
  }

  const canManageGoogle = Boolean(room?.isHost);
  const googleActions = canManageGoogle ? (
    !googleConnection ? (
      <button
        className="primary"
        disabled={!googleReady}
        onClick={() => void connectGoogleDrive()}
      >
        {googleReady ? "Connect Google Drive" : "Loading Google Drive..."}
      </button>
    ) : (
      <>
        <DrivePicker
          disabled={!googleReady}
          getAccessToken={getValidGoogleAccessToken}
          onSelected={selectFile}
        />
        <button
          disabled={!googleReady}
          onClick={() => void disconnectGoogleDrive()}
        >
          {googleReady ? "Disconnect Google" : "Loading Google Drive..."}
        </button>
      </>
    )
  ) : null;

  const hasRoom = Boolean(roomId && room);

  return (
    <main className={`appShell ${theaterMode ? "theater" : ""} ${!roomId ? "homeShell" : ""}`}>
      <header className="topBar">
        <div className="brandBlock">
          <strong>SyncWatch</strong>
          {roomId && <span>Room {roomId}</span>}
          {room?.isHost && <span className="hostPill">Host</span>}
        </div>

        <div className="topActions">
          <ConnectionStatus connected={connected} hasRoom={hasRoom} />
          {room?.hasFile && (
            <TheaterToggle
              enabled={theaterMode}
              onToggle={() => setTheaterMode((enabled) => !enabled)}
            />
          )}
          <span className="userPill">{username}</span>
          <button onClick={() => void logout()}>Logout</button>
        </div>
      </header>

      {!roomId ? (
        <section className="homePanel">
          <div className="homeIntro">
            <div className="eyebrow">Private watch rooms</div>
            <h1>Ready for movie night?</h1>
            <p>Connect Google Drive, choose a video, and watch together in sync.</p>
          </div>

          <div className="roomEntryCard">
            <input
              className="nameTagInput"
              value={nameTag}
              onChange={(event) => setNameTag(event.target.value)}
              placeholder="Your name tag"
              maxLength={40}
              aria-label="Your name tag"
            />

            <button className="primary" onClick={() => void createRoom()}>
              Create Room
            </button>

            <div className="join">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void joinRoom();
                  }
                }}
                placeholder="Room code"
                maxLength={6}
              />
              <button onClick={() => void joinRoom()}>Join</button>
            </div>
          </div>
        </section>
      ) : !nameTag.trim() ? (
        <section className="homePanel compactHome">
          <div className="roomEntryCard">
            <h1>Choose your name tag</h1>
            <p>Your name tag is visible only to people in this room.</p>
            <input
              className="nameTagInput"
              value={nameTag}
              onChange={(event) => setNameTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  saveNameTag();
                }
              }}
              placeholder="Your name tag"
              maxLength={40}
              autoFocus
            />
            <button className="primary" onClick={saveNameTag}>
              Enter room
            </button>
          </div>
        </section>
      ) : !room ? (
        <section className="homePanel compactHome">
          <div className="roomEntryCard">
            <h1>Room not found</h1>
            <p>Check the invite link or enter a different room code.</p>
            <div className="join">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Room code"
                maxLength={6}
              />
              <button onClick={() => void joinRoom()}>Join</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="watchLayout">
          <div className="watchColumn">
            <section className="playerSurface">
              <VideoPlayer
                roomId={roomId}
                hasFile={room.hasFile}
                fileName={room.fileName}
                initialTime={room.currentTime}
                initialPlaying={room.playing}
                syncEvent={lastEvent?.type === "PARTICIPANTS" ? null : lastEvent}
                onControl={sendControl}
                clientId={clientId}
                isHost={room.isHost}
              />

              {!room.hasFile && googleActions && (
                <div className="emptyPlayerAction">
                  {googleActions}
                </div>
              )}
            </section>

            <MediaInfo
              fileName={room.fileName}
              googleConnected={Boolean(googleConnection)}
              isHost={room.isHost}
              googleActions={googleActions}
            />
          </div>

          {!theaterMode && (
            <PartyPanel
              roomId={roomId}
              participants={participants}
              clientId={clientId}
              onCopyRoom={() => void copyRoomCode()}
              onCopyInvite={() => void copyInvite()}
            />
          )}
        </section>
      )}

      <Toast message={toast} />
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}


