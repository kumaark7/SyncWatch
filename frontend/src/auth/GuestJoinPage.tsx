import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { checkGuestRoom } from "./authApi";

type Props = {
  roomId: string;
  onJoin: (roomId: string, displayName: string) => Promise<void>;
  onAdminLogin: () => void;
};

export default function GuestJoinPage({ roomId, onJoin, onAdminLogin }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [roomAvailable, setRoomAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRoomAvailable(null);

    checkGuestRoom(roomId)
      .then((available) => {
        if (!cancelled) {
          setRoomAvailable(available);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoomAvailable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanedName = displayName.trim();
    const nameLength = Array.from(cleanedName).length;
    if (nameLength < 2 || nameLength > 32) {
      setError("Your name must be 2 to 32 characters.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onJoin(roomId, cleanedName);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join watch party.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div>
          <div className="brandMark">SyncWatch</div>
          <h1>Join Watch Party</h1>
          <p>Room {roomId}</p>
        </div>

        {roomAvailable === false ? (
          <div className="loginError">Room not found or no longer available.</div>
        ) : (
          <label className="fieldLabel">
            Your name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={64}
              disabled={roomAvailable !== true || loading}
              autoFocus
            />
          </label>
        )}

        {error && <div className="loginError">{error}</div>}

        {roomAvailable !== false && (
          <button
            className="primary loginButton"
            disabled={roomAvailable !== true || loading || Array.from(displayName.trim()).length < 2}
          >
            {roomAvailable === null
              ? "Checking room..."
              : loading
                ? "Joining..."
                : "Join Watch Party"}
          </button>
        )}

        <button type="button" className="ghostButton" onClick={onAdminLogin}>
          Admin Login
        </button>
      </form>
    </main>
  );
}
