import { useEffect, useState } from "react";
import DrivePicker from "./DrivePicker";
import VideoPlayer from "./VideoPlayer";
import { API_URL, socket } from "./socket";
import "./style.css";

type RoomState = {
  roomId: string;
  fileName: string | null;
  hasFile: boolean;
  isHost?: boolean;
};

function getRoomFromUrl() {
  const match = window.location.pathname.match(/^\/room\/([A-Z0-9]+)/i);
  return match?.[1]?.toUpperCase() || "";
}

export default function App() {
  const [roomId, setRoomId] = useState(getRoomFromUrl());
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    if (!roomId) return;

    socket.emit("join-room", { roomId });

    const onState = (state: RoomState) => setRoom(state);

    const onFileSelected = ({
      fileName
    }: {
      fileName: string;
    }) => {
      setRoom((old) =>
        old
          ? { ...old, fileName, hasFile: true }
          : { roomId, fileName, hasFile: true }
      );
    };

    socket.on("room-state", onState);
    socket.on("file-selected", onFileSelected);

    return () => {
      socket.off("room-state", onState);
      socket.off("file-selected", onFileSelected);
    };
  }, [roomId]);

  async function createRoom() {
    const response = await fetch(`${API_URL}/api/rooms`, {
      method: "POST"
    });

    const data = await response.json();
    window.history.pushState({}, "", `/room/${data.roomId}`);
    setRoomId(data.roomId);
  }

  function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    window.history.pushState({}, "", `/room/${code}`);
    setRoomId(code);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          accessToken: file.accessToken
        })
      }
    );

    if (!response.ok) {
      alert("Could not attach the Drive file.");
      return;
    }

    setRoom((old) =>
      old
        ? { ...old, fileName: file.name, hasFile: true }
        : { roomId, fileName: file.name, hasFile: true }
    );
  }

  if (!roomId) {
    return (
      <main className="shell home">
        <h1>Watch Party</h1>
        <p>Private, lightweight, original-quality playback.</p>

        <button className="primary" onClick={createRoom}>
          Create Room
        </button>

        <div className="join">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Room code"
            maxLength={6}
          />
          <button onClick={joinRoom}>Join</button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <div>
          <strong>Watch Party</strong>
          <span className="muted"> Room {roomId}</span>
        </div>

        <button
          onClick={() =>
            navigator.clipboard.writeText(window.location.href)
          }
        >
          Copy invite
        </button>
      </header>

      <VideoPlayer
        roomId={roomId}
        hasFile={Boolean(room?.hasFile)}
      />

      <section className="bottom">
        <div>
          <div className="muted">Now playing</div>
          <div>{room?.fileName || "No video selected"}</div>
        </div>

        <DrivePicker onSelected={selectFile} />
      </section>
    </main>
  );
}
