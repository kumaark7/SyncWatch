import { useParticipants } from "@livekit/components-react";
import { useCall } from "./CallProvider";
import CallTile from "./CallTile";

type Props = {
  selfViewHidden: boolean;
  onToggleSelfView: () => void;
};

export default function CallPanel({ selfViewHidden, onToggleSelfView }: Props) {
  const participants = useParticipants();
  const {
    status,
    error,
    joinCall,
    leaveCall,
    listenersWhoMutedMe,
    mutedRemoteParticipantIds,
    toggleRemoteAudio,
    clearError
  } = useCall();
  const visibleParticipants = selfViewHidden
    ? participants.filter((participant) => !participant.isLocal)
    : participants;
  const tileLayout = visibleParticipants.length >= 4
    ? `callTiles callTilesGrid ${visibleParticipants.length > 6 ? "callTilesOverflow" : ""}`
    : `callTiles callTilesStack callTilesCount${Math.max(visibleParticipants.length, 1)}`;

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
      <div className="callPanelToolbar">
        <div className={`callConnectionState ${status}`}>
          {status === "connected"
            ? "Connected"
            : status === "reconnecting"
              ? "Reconnecting..."
              : "Connecting..."}
        </div>
        {selfViewHidden && (
          <button
            className="callSelfToggle"
            aria-label="Show my preview"
            title="Show my preview"
            onClick={onToggleSelfView}
          >
            Show self
          </button>
        )}
      </div>

      {visibleParticipants.length > 0 ? (
        <div className={tileLayout} data-count={visibleParticipants.length}>
          {visibleParticipants.map((participant) => (
            <CallTile
              key={participant.identity}
              participant={participant}
              onLeave={participant.isLocal ? leaveCall : undefined}
              onHideSelf={participant.isLocal ? onToggleSelfView : undefined}
              remoteAudioMuted={mutedRemoteParticipantIds.has(participant.identity)}
              onToggleRemoteAudio={participant.isLocal
                ? undefined
                : () => toggleRemoteAudio(participant.identity)}
              listenersWhoMutedMe={participant.isLocal
                ? Array.from(listenersWhoMutedMe.values())
                : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="callSelfHiddenState">
          <strong>Self preview hidden</strong>
          <span>Your camera and microphone remain connected.</span>
        </div>
      )}

      {error && <p className="callError" role="alert">{error}</p>}
    </section>
  );
}
