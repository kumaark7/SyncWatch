import { useEffect, useState } from "react";
import { API_URL } from "./api";
import DrivePicker from "./DrivePicker";
import VideoPlayer from "./VideoPlayer";
import { useRoomSocket } from "./useRoomSocket";
import type { RoomState } from "./types";
import "./style.css";

function roomFromUrl() {
  const match = window.location.pathname.match(/^\/room\/([A-Z0-9]+)/i);
  return match?.[1]?.toUpperCase() || "";
}

function isGuestInvite() {
  return new URLSearchParams(window.location.search).get("guest") === "1";
}

export default function App() {
  const [roomId, setRoomId] = useState(roomFromUrl());
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [toast, setToast] = useState("");

  const {
    connected,
    lastEvent,
    sendControl,
    clientId
  } = useRoomSocket(roomId);

  useEffect(() => {
    if (!roomId) return;

    fetch(
      `${API_URL}/api/rooms/${roomId}?clientId=${encodeURIComponent(clientId)}`
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Room not found");
        return response.json();
      })
      .then(setRoom)
      .catch(() => setRoom(null));
  }, [roomId, clientId]);

  useEffect(() => {
    if (!lastEvent) return;

    setRoom((previous) => {
      if (!previous) return previous;

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

  async function createRoom() {
    const response = await fetch(`${API_URL}/api/rooms`, {
      method: "POST"
    });

    if (!response.ok) {
      alert("Could not create room.");
      return;
    }

    const data = await response.json();

    history.pushState({}, "", `/room/${data.roomId}`);
    setRoomId(data.roomId);
    setRoom(data);
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const response = await fetch(
      `${API_URL}/api/rooms/${code}?clientId=${encodeURIComponent(clientId)}`
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

  async function selectFile(file: {
    id: string;
    name: string;
    accessToken: string;
  }) {
    const response = await fetch(
      `${API_URL}/api/rooms/${roomId}/file`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          accessToken: file.accessToken,
          clientId
        })
      }
    );

    if (!response.ok) {
      const result = await response.json().catch(() => null);

      alert(
        result?.error ||
          "Could not attach Drive file."
      );
      return;
    }

    const state = await response.json();
    setRoom(state);
  }

  async function copyInvite() {
    const inviteUrl =
      `${window.location.origin}/room/${roomId}?guest=1`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setToast("Guest invite copied!");
    } catch {
      setToast("Couldn't copy invite");
    }

    window.setTimeout(() => setToast(""), 2000);
  }

  if (!roomId) {
    return (
      <main className="shell home">
        <h1>SyncWatch</h1>
        <p>Java full-stack Google Drive watch party.</p>

        <button className="primary" onClick={createRoom}>
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

          <button onClick={() => void joinRoom()}>
            Join
          </button>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="shell home">
        <h1>Room not found</h1>
      </main>
    );
  }

  const canChooseFile =
    room.isHost ||
    (!room.hostAssigned && !isGuestInvite());

  return (
    <main className="shell">
      <header>
        <div>
          <strong>SyncWatch</strong>
          <span className="muted"> Room {roomId}</span>
          <span className="muted">
            {" "}
            {room.isHost ? "★ Host" : "Guest"}
          </span>
          <span className="muted">
            {" "}
            {connected ? "● Synced" : "● Reconnecting"}
          </span>
        </div>

        <button onClick={() => void copyInvite()}>
          Copy invite
        </button>
      </header>

      <VideoPlayer
        roomId={roomId}
        hasFile={room.hasFile}
        fileName={room.fileName}
        initialTime={room.currentTime}
        initialPlaying={room.playing}
        syncEvent={lastEvent}
        onControl={sendControl}
        clientId={clientId}
        isHost={room.isHost}
      />

      <section className="bottom">
        <div>
          <div className="muted">Now playing</div>
          <div>{room.fileName || "No video selected"}</div>
        </div>

        {canChooseFile && (
          <DrivePicker onSelected={selectFile} />
        )}
      </section>

      {toast && (
        <div
          className="toast"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
