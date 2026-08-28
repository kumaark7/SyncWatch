import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { checkGuestRoom } from "./authApi";

type Props = {
  roomId: string;
  onJoin: (roomId: string, displayName: string) => Promise<void>;
  onAdminLogin: () => void;
};

export default function GuestJoinPage({ roomId, onJoin, onAdminLogin }: Props) {
  const inviteMode = Boolean(roomId);
  const [roomCode, setRoomCode] = useState(roomId);
  const [roomTitle, setRoomTitle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomAvailable, setRoomAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inviteMode) {
      setRoomAvailable(null);
      return;
    }

    let cancelled = false;
    setRoomAvailable(null);

    checkGuestRoom(roomId)
      .then((roomInfo) => {
        if (!cancelled) {
          setRoomTitle(roomInfo?.roomName ?? "");
          setRoomAvailable(Boolean(roomInfo));
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
  }, [inviteMode, roomId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanedRoomCode = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanedRoomCode)) {
      setError("Enter a valid 6-character room ID.");
      return;
    }

    const cleanedName = displayName.trim();
    const nameLength = Array.from(cleanedName).length;
    if (nameLength < 2 || nameLength > 32) {
      setError("Your name must be 2 to 32 characters.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (!inviteMode) {
        const roomInfo = await checkGuestRoom(cleanedRoomCode);
        if (!roomInfo) {
          setError("Room not found or no longer available.");
          return;
        }
        setRoomTitle(roomInfo.roomName);
      }

      await onJoin(cleanedRoomCode, cleanedName);
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
          <p>{inviteMode
            ? roomTitle
              ? `Room Name: ${roomTitle}`
              : roomAvailable === null
                ? "Checking room..."
                : "Room name unavailable"
            : "Enter your room ID and display name."}</p>
        </div>

        {!inviteMode && (
          <label className="fieldLabel">
            Room ID
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              disabled={loading}
              autoFocus
            />
          </label>
        )}

        {inviteMode && roomAvailable === false ? (
          <div className="loginError">Room not found or no longer available.</div>
        ) : (
          <label className="fieldLabel">
            Your name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={64}
              disabled={(inviteMode && roomAvailable !== true) || loading}
              autoFocus={inviteMode}
            />
          </label>
        )}

        {error && <div className="loginError">{error}</div>}

        {(!inviteMode || roomAvailable !== false) && (
          <button
            className="primary loginButton"
            disabled={
              loading
              || (inviteMode && roomAvailable !== true)
              || (!inviteMode && !/^[A-Z0-9]{6}$/.test(roomCode.trim().toUpperCase()))
              || Array.from(displayName.trim()).length < 2
            }
          >
            {inviteMode && roomAvailable === null
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
