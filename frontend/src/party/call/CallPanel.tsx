import { useParticipants } from "@livekit/components-react";
import { useCall } from "./CallProvider";
import CallTile from "./CallTile";

export default function CallPanel() {
  const participants = useParticipants();
  const {
    status,
    error,
    joinCall,
    leaveCall,
    clearError
  } = useCall();
  const tileLayout = participants.length >= 4
    ? `callTiles callTilesGrid ${participants.length > 6 ? "callTilesOverflow" : ""}`
    : `callTiles callTilesStack callTilesCount${Math.max(participants.length, 1)}`;

  if (status === "idle") {
    return (
      <section className="callJoinState">
        <div>
          <h3>Join room call</h3>
          <p>Join voice and video chat without interrupting the movie.</p>
        </div>
        {error && <p className="callError" role="alert">{error}</p>}
        <button
          className="primary"
          onClick={() => {
            clearError();
            void joinCall();
          }}
        >
          Join Call
        </button>
        <small>Camera and microphone start off.</small>
      </section>
    );
  }

  return (
    <section className="callPanel">
      <div className={`callConnectionState ${status}`}>
        {status === "connected"
          ? "Connected"
          : status === "reconnecting"
            ? "Reconnecting..."
            : "Connecting..."}
      </div>

      <div className={tileLayout} data-count={participants.length}>
        {participants.map((participant) => (
          <CallTile
            key={participant.identity}
            participant={participant}
            onLeave={participant.isLocal ? leaveCall : undefined}
          />
        ))}
      </div>

      {error && <p className="callError" role="alert">{error}</p>}
    </section>
  );
}
