import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { generateDisplayName } from "../generatedNames";
import { getGuestRoom } from "./authApi";

type Props = {
  initialRoomId: string;
  onJoin: (roomId: string, displayName: string) => Promise<void>;
};

export default function GuestJoinPage({ initialRoomId, onJoin }: Props) {
  const [roomId, setRoomId] = useState(initialRoomId);
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [checking, setChecking] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalizedRoomId = roomId.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalizedRoomId)) {
      setRoomName("");
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setError("");
    const timer = window.setTimeout(() => {
      getGuestRoom(normalizedRoomId)
        .then((room) => {
          if (cancelled) return;
          setRoomName(room?.roomName ?? "");
          if (!room) setError("Room not found");
        })
        .catch((cause) => {
          if (!cancelled) {
            setRoomName("");
            setError(cause instanceof Error ? cause.message : "Could not check this room");
          }
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [roomId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedRoomId = roomId.trim().toUpperCase();
    const name = displayName.trim() || generateDisplayName();
    if (!/^[A-Z0-9]{6}$/.test(normalizedRoomId)) {
      setError("Enter a valid 6-character room ID");
      return;
    }

    setJoining(true);
    setError("");
    try {
      await onJoin(normalizedRoomId, name);
      window.history.replaceState({}, "", `/room/${normalizedRoomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this room");
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard guestJoinCard" onSubmit={submit}>
        <div className="authHeading">
          <img className="authLogo" src="/brand/syncwatch-logo.png" alt="SyncWatch" />
          <h1>Join Watch Party</h1>
          <p>Enter your name to join as a guest.</p>
        </div>

        <label className="fieldLabel">
          Room ID
          <input
            className="guestRoomIdInput"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value.toUpperCase())}
            maxLength={6}
            autoComplete="off"
            disabled={joining}
            required
          />
        </label>

        {roomName && (
          <div className="guestRoomName">
            <span>Room Name:</span>
            <strong>{roomName}</strong>
          </div>
        )}

        <label className="fieldLabel">
          Your name <span className="optionalLabel">Optional</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="A random name will be used if empty"
            maxLength={32}
            autoComplete="nickname"
            disabled={joining}
            autoFocus
          />
        </label>

        {error && <div className="loginError" role="alert">{error}</div>}

        <button
          className="primary loginButton"
          disabled={joining || checking || !roomName}
        >
          {joining ? "Joining..." : checking ? "Checking room..." : "Join Watch Party"}
        </button>
      </form>
    </main>
  );
}
