import { useEffect, useState } from "react";
import { API_URL } from "./api";
import DrivePicker from "./DrivePicker";
import VideoPlayer from "./VideoPlayer";
import "./style.css";

type RoomState = {
  roomId: string;
  fileName: string | null;
  hasFile: boolean;
};

function roomFromUrl() {
  const match = window.location.pathname.match(/^\/room\/([A-Z0-9]+)/i);
  return match?.[1]?.toUpperCase() || "";
}

export default function App() {
  const [roomId, setRoomId] = useState(roomFromUrl());
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    if (!roomId) return;
    fetch(`${API_URL}/api/rooms/${roomId}`)
      .then(async r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setRoom)
      .catch(() => setRoom(null));
  }, [roomId]);

  async function createRoom() {
    const r = await fetch(`${API_URL}/api/rooms`, { method: "POST" });
    const data = await r.json();
    history.pushState({}, "", `/room/${data.roomId}`);
    setRoomId(data.roomId);
    setRoom({ roomId: data.roomId, fileName: null, hasFile: false });
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    const r = await fetch(`${API_URL}/api/rooms/${code}`);
    if (!r.ok) return alert("Room not found.");
    const data = await r.json();
    history.pushState({}, "", `/room/${code}`);
    setRoomId(code);
    setRoom(data);
  }

  async function selectFile(file: {
    id: string;
    name: string;
    accessToken: string;
  }) {
    const r = await fetch(`${API_URL}/api/rooms/${roomId}/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: file.id,
        fileName: file.name,
        accessToken: file.accessToken
      })
    });

    if (!r.ok) return alert("Could not attach Drive file.");
    setRoom({ roomId, fileName: file.name, hasFile: true });
  }

  if (!roomId) {
    return (
      <main className="shell home">
        <h1>SyncWatch</h1>
        <p>Java full-stack Google Drive watch party.</p>
        <button className="primary" onClick={createRoom}>Create Room</button>
        <div className="join">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void joinRoom(); }}
            placeholder="Room code"
            maxLength={6}
          />
          <button onClick={() => void joinRoom()}>Join</button>
        </div>
      </main>
    );
  }

  if (!room) {
    return <main className="shell home"><h1>Room not found</h1></main>;
  }

  return (
    <main className="shell">
      <header>
        <div><strong>SyncWatch</strong><span className="muted"> Room {roomId}</span></div>
        <button onClick={() => navigator.clipboard.writeText(location.href)}>
          Copy invite
        </button>
      </header>

      <VideoPlayer roomId={roomId} hasFile={room.hasFile} />

      <section className="bottom">
        <div>
          <div className="muted">Now playing</div>
          <div>{room.fileName || "No video selected"}</div>
        </div>
        <DrivePicker onSelected={selectFile} />
      </section>
    </main>
  );
}
