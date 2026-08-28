import { useEffect, useRef, useState } from "react";
import { API_URL } from "./api";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import GuestJoinPage from "./auth/GuestJoinPage";
import LoginPage from "./auth/LoginPage";
import ConnectionStatus from "./components/ConnectionStatus";
import FullscreenToggle from "./components/FullscreenToggle";
import MediaInfo from "./components/MediaInfo";
import TheaterToggle from "./components/TheaterToggle";
import Toast from "./components/Toast";
import DrivePicker from "./DrivePicker";
import { generateDisplayName, generateRoomName } from "./generatedNames";
import PartyPanel from "./party/PartyPanel";
import ChatToastStack from "./party/chat/ChatToast";
import type { ChatMessage } from "./party/chat/types";
import CallProvider from "./party/call/CallProvider";
import FloatingCallWindow from "./party/call/FloatingCallWindow";
import useFullscreenState from "./party/call/useFullscreenState";
import type { PartyTab } from "./party/types";
import VideoPlayer from "./VideoPlayer";
import { useRoomSocket } from "./useRoomSocket";
import type { Participant, RoomState } from "./types";
import "./style.css";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const TOKEN_EXPIRY_SKEW_MS = 60000;
const NAME_TAG_STORAGE_KEY = "syncwatch-name-tag";
const GOOGLE_CONNECTION_PREFERENCE_KEY = "syncwatch-google-drive-connected";

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
  const inviteRoomId = roomFromUrl();
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showGuestJoin, setShowGuestJoin] = useState(false);

  async function joinGuest(roomId: string, displayName: string) {
    await auth.joinGuest(roomId, displayName);
    window.history.replaceState({}, "", `/room/${roomId}`);
  }

  if (auth.loading) {
    return (
      <main className="loginShell">
        <div className="loginCard loadingCard">Loading SyncWatch...</div>
      </main>
    );
  }

  if (!auth.session.authenticated) {
    if (inviteRoomId && !showAdminLogin) {
      return (
        <GuestJoinPage
          roomId={inviteRoomId}
          onJoin={joinGuest}
          onAdminLogin={() => setShowAdminLogin(true)}
        />
      );
    }

    if (showGuestJoin && !showAdminLogin) {
      return (
        <GuestJoinPage
          roomId=""
          onJoin={joinGuest}
          onAdminLogin={() => {
            setShowGuestJoin(false);
            setShowAdminLogin(true);
          }}
        />
      );
    }

    return (
      <LoginPage
        onLogin={auth.signIn}
        onGuestJoin={() => {
          setShowAdminLogin(false);
          setShowGuestJoin(true);
        }}
      />
    );
  }

  return (
    <AuthenticatedApp
      username={auth.session.username || "User"}
      initialRoomId={
        auth.session.role === "GUEST"
          ? auth.session.allowedRoomId || ""
          : inviteRoomId
      }
      initialDisplayName={auth.session.displayName}
      sessionClientId={auth.session.clientId}
      onLogout={auth.signOut}
    />
  );
}

function AuthenticatedApp({
  username,
  initialRoomId,
  initialDisplayName,
  sessionClientId,
  onLogout
}: {
  username: string;
  initialRoomId: string;
  initialDisplayName: string | null;
  sessionClientId: string | null;
  onLogout: () => Promise<void>;
}) {
  const [roomId, setRoomId] =
    useState(initialRoomId);

  const [joinCode, setJoinCode] =
    useState(initialRoomId);

  const [nameTag, setNameTag] = useState(
    () => initialDisplayName
      ?? (initialRoomId ? sessionStorage.getItem(NAME_TAG_STORAGE_KEY) : null)
      ?? ""
  );

  const [roomName, setRoomName] = useState("");

  const [joinedNameTag, setJoinedNameTag] = useState(
    () => initialDisplayName?.trim() ?? ""
  );

  const [participants, setParticipants] =
    useState<Participant[]>([]);

  const [room, setRoom] =
    useState<RoomState | null>(null);

  const [toast, setToast] =
    useState("");

  const [theaterMode, setTheaterMode] =
    useState(false);

  const [partyTab, setPartyTab] =
    useState<PartyTab>("people");

  const [chatUnreadCount, setChatUnreadCount] =
    useState(0);

  const [selfViewHidden, setSelfViewHidden] =
    useState(false);

  const appShellRef = useRef<HTMLElement>(null);
  const lastUnreadMessageIdRef = useRef<string | null>(null);
  const fullscreenElement = useFullscreenState();

  const [googleConnection, setGoogleConnection] =
    useState<GoogleConnection | null>(null);

  const [googleReady, setGoogleReady] =
    useState(googleApisReady());

  const [restoringGoogleConnection, setRestoringGoogleConnection] =
    useState(false);

  const googleRestoreAttemptedRef = useRef(false);

  const {
    connected,
    chatReady,
    lastEvent,
    sendControl,
    clientId,
    chatMessages,
    lastChatMessage,
    sendChatMessage,
    sendCallJoined,
    sendCallLeft,
    mergeChatHistory
  } = useRoomSocket(roomId, joinedNameTag, sessionClientId);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const fullscreenActive = Boolean(fullscreenElement);
  const fullscreenCanHostOverlay = Boolean(
    fullscreenElement
      && appShellRef.current
      && (fullscreenElement === appShellRef.current
        || fullscreenElement.contains(appShellRef.current))
  );
  const partyRailHidden = theaterMode || fullscreenActive;
  const chatVisible = partyTab === "chat" && !partyRailHidden;

  useEffect(() => {
    if (!theaterMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setTheaterMode(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [theaterMode]);

  useEffect(() => {
    if (chatVisible) {
      setChatUnreadCount(0);
    }
  }, [chatVisible]);

  useEffect(() => {
    lastUnreadMessageIdRef.current = null;
    setChatUnreadCount(0);
    setPartyTab("people");
    setSelfViewHidden(false);
  }, [roomId]);

  useEffect(() => {
    if (!lastChatMessage
        || (lastChatMessage.type !== "USER"
          && lastChatMessage.type !== "SYSTEM_CALL_JOIN"
          && lastChatMessage.type !== "SYSTEM_CALL_LEAVE")
        || lastChatMessage.senderId === clientId
        || lastUnreadMessageIdRef.current === lastChatMessage.id) {
      return;
    }

    lastUnreadMessageIdRef.current = lastChatMessage.id;
    if (chatVisible) {
      return;
    }

    setChatUnreadCount((count) => count + 1);
  }, [chatVisible, clientId, lastChatMessage]);

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
    const joinedRoom = participants.some((participant) => participant.clientId === clientId);
    if (!roomId || !connected || !joinedNameTag || !joinedRoom) {
      return;
    }

    fetch(
      `${API_URL}/api/rooms/${roomId}/chat?clientId=${encodeURIComponent(clientId)}`,
      { credentials: "include" }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load chat history");
        }

        return response.json() as Promise<ChatMessage[]>;
      })
      .then((messages) => {
        mergeChatHistory(messages);
      })
      .catch(() => {
        // History can race the initial room JOIN; live chat still works once connected.
      });
  }, [roomId, connected, joinedNameTag, clientId, participants, mergeChatHistory]);
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
    const cleanedRoomName = roomName.trim() || generateRoomName();
    const roomNameLength = Array.from(cleanedRoomName).length;
    if (roomNameLength < 2 || roomNameLength > 48) {
      alert("Room name must be 2 to 48 characters.");
      return;
    }

    if (!saveNameTag()) {
      return;
    }

    const response = await fetch(
      `${API_URL}/api/rooms?clientId=${encodeURIComponent(clientId)}&roomName=${encodeURIComponent(cleanedRoomName)}`,
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
    setRoomName(cleanedRoomName);
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
    history.pushState({}, "", `/room/${code}`);
    setRoomId(code);
    setRoom(data);
  }

  function saveNameTag() {
    const cleanedName = nameTag.trim() || generateDisplayName();
    const nameLength = Array.from(cleanedName).length;
    if (nameLength < 2 || nameLength > 32) {
      alert("Your name must be 2 to 32 characters.");
      return false;
    }

    sessionStorage.setItem(NAME_TAG_STORAGE_KEY, cleanedName);
    setNameTag(cleanedName);
    setJoinedNameTag(cleanedName);
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

    const previouslyConnected =
      localStorage.getItem(GOOGLE_CONNECTION_PREFERENCE_KEY) === "true";
    const connection = await requestGoogleAccessToken(
      previouslyConnected ? "" : "consent"
    );
    if (!connection) {
      return;
    }

    if (room?.isHost && room.hasFile) {
      const updated = await updateRoomDriveToken(
        connection.accessToken
      );

      if (!updated) {
        showToast("Could not restore Google Drive access.");
        return;
      }
    }

    setGoogleConnection(connection);
    localStorage.setItem(GOOGLE_CONNECTION_PREFERENCE_KEY, "true");
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

  async function updateRoomDriveToken(accessToken: string) {
    const response = await fetch(
      `${API_URL}/api/rooms/${roomId}/drive-token`,
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          accessToken,
          clientId
        })
      }
    );

    return response.ok;
  }

  useEffect(() => {
    if (
      !googleReady
      || !room?.isHost
      || googleConnection
      || googleRestoreAttemptedRef.current
      || localStorage.getItem(GOOGLE_CONNECTION_PREFERENCE_KEY) !== "true"
    ) {
      return;
    }

    googleRestoreAttemptedRef.current = true;
    let cancelled = false;
    setRestoringGoogleConnection(true);

    void requestGoogleAccessToken("").then(async (connection) => {
      if (!connection || cancelled) {
        return;
      }

      if (room.hasFile) {
        const updated = await updateRoomDriveToken(connection.accessToken);
        if (!updated || cancelled) {
          return;
        }
      }

      setGoogleConnection(connection);
    }).finally(() => {
      if (!cancelled) {
        setRestoringGoogleConnection(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [googleConnection, googleReady, room?.hasFile, room?.isHost, roomId]);

  useEffect(() => {
    if (
      !googleReady ||
      !googleConnection ||
      !room?.isHost ||
      !room.hasFile
    ) {
      return;
    }

    const refreshDelay = Math.max(
      0,
      googleConnection.expiresAt - Date.now()
    );

    const timer = window.setTimeout(async () => {
      const refreshedConnection = await requestGoogleAccessToken("");

      if (!refreshedConnection) {
        setGoogleConnection(null);
        showToast("Google Drive connection expired. Reconnect to continue.");
        return;
      }

      const updated = await updateRoomDriveToken(
        refreshedConnection.accessToken
      );

      if (!updated) {
        setGoogleConnection(null);
        showToast("Could not refresh Google Drive access.");
        return;
      }

      setGoogleConnection(refreshedConnection);
    }, refreshDelay);

    return () => window.clearTimeout(timer);
  }, [
    clientId,
    googleConnection?.expiresAt,
    googleReady,
    room?.hasFile,
    room?.isHost,
    roomId
  ]);

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
    localStorage.removeItem(GOOGLE_CONNECTION_PREFERENCE_KEY);
    googleRestoreAttemptedRef.current = true;

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
    const inviteUrl = `${window.location.origin}/?room=${roomId}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast("Invite link copied");
    } catch {
      showToast("Couldn't copy invite");
    }
  }

  async function logout() {
    await onLogout();
    window.history.replaceState({}, "", "/");
    setRoom(null);
    setRoomId("");
    setGoogleConnection(null);
    setTheaterMode(false);
  }

  async function toggleTheaterMode() {
    if (theaterMode && fullscreenCanHostOverlay) {
      await document.exitFullscreen().catch(() => undefined);
    }

    setTheaterMode((enabled) => !enabled);
  }

  async function toggleContainerFullscreen() {
    try {
      if (fullscreenCanHostOverlay) {
        await document.exitFullscreen();
        return;
      }

      if (!appShellRef.current?.requestFullscreen) {
        showToast("Fullscreen is not available in this browser");
        return;
      }

      await appShellRef.current.requestFullscreen();
    } catch {
      showToast("Could not enter fullscreen");
    }
  }

  const canManageGoogle = Boolean(room?.isHost);
  const googleActions = canManageGoogle ? (
    !googleConnection ? (
      <button
        className="primary"
        disabled={!googleReady || restoringGoogleConnection}
        onClick={() => void connectGoogleDrive()}
      >
        {!googleReady
          ? "Loading Google Drive..."
          : restoringGoogleConnection
            ? "Restoring Google Drive..."
            : "Connect Google Drive"}
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
  const hasWatchLayout = Boolean(roomId && joinedNameTag && room);

  return (
    <main
      ref={appShellRef}
      className={`appShell ${theaterMode ? "theater" : ""} ${fullscreenCanHostOverlay ? "fullscreenMode" : ""} ${!roomId ? "homeShell" : ""} ${hasWatchLayout ? "watchShell" : ""}`}
    >
      <header className="topBar">
        <div className="brandBlock">
          <img
            className="brandLogo"
            src="/brand/syncwatch-logo.png"
            alt="SyncWatch"
          />
          {roomId && (
            <span className="roomTitle" title={`Room code: ${roomId}`}>
              {room?.roomName || roomName || "Watch Party"}
            </span>
          )}
          {room?.isHost && <span className="hostPill">Host</span>}
        </div>

        <div className="topActions">
          <ConnectionStatus connected={connected} hasRoom={hasRoom} />
          {room?.hasFile && (
            <TheaterToggle
              enabled={theaterMode}
              onToggle={() => void toggleTheaterMode()}
            />
          )}
          {room?.hasFile && theaterMode && (
            <FullscreenToggle
              active={fullscreenCanHostOverlay}
              onToggle={() => void toggleContainerFullscreen()}
            />
          )}
          <span className="userPill">{username}</span>
          <button className="headerLogout" onClick={() => void logout()}>Logout</button>
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
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Room name (optional)"
              maxLength={48}
              aria-label="Room name (optional)"
              autoFocus
            />

            <input
              className="nameTagInput"
              value={nameTag}
              onChange={(event) => setNameTag(event.target.value)}
              placeholder="Your name tag (optional)"
              maxLength={32}
              aria-label="Your name tag (optional)"
            />

            <button className="primary" onClick={() => void createRoom()}>
              Create Room
            </button>
          </div>
        </section>
      ) : !joinedNameTag ? (
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
              maxLength={32}
              autoFocus
            />
            <button className="primary" onClick={saveNameTag}>
              Join Watch Party
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
        <CallProvider
          roomId={roomId}
          clientId={clientId}
          onCallJoined={sendCallJoined}
          onCallLeft={sendCallLeft}
        >
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
                    {googleConnection ? (
                      <DrivePicker
                        disabled={!googleReady}
                        getAccessToken={getValidGoogleAccessToken}
                        onSelected={selectFile}
                      />
                    ) : googleActions}
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

            {!partyRailHidden && (
              <PartyPanel
                roomId={roomId}
                participants={participants}
                clientId={clientId}
                connected={chatReady}
                chatMessages={chatMessages}
                activeTab={partyTab}
                unreadCount={chatUnreadCount}
                selfViewHidden={selfViewHidden}
                onTabChange={setPartyTab}
                onClearUnread={() => setChatUnreadCount(0)}
                onToggleSelfView={() => setSelfViewHidden((hidden) => !hidden)}
                onSendChat={sendChatMessage}
                onChatError={showToast}
                onCopyRoom={() => void copyRoomCode()}
                onCopyInvite={() => void copyInvite()}
              />
            )}
          </section>

          <FloatingCallWindow
            roomId={roomId}
            visible={theaterMode || fullscreenCanHostOverlay}
            selfViewHidden={selfViewHidden}
            onToggleSelfView={() => setSelfViewHidden((hidden) => !hidden)}
          />

          <ChatToastStack
            key={roomId}
            message={lastChatMessage}
            clientId={clientId}
            chatVisible={chatVisible}
            suspended={fullscreenActive && !fullscreenCanHostOverlay}
            onOpenChat={!partyRailHidden ? () => setPartyTab("chat") : undefined}
          />
        </CallProvider>
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
