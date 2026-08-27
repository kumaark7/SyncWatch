import { useParticipants } from "@livekit/components-react";
import { useState } from "react";
import CallTile from "./CallTile";
import { useCall } from "./CallProvider";
import useFloatingWindow from "./useFloatingWindow";

type Props = {
  roomId: string;
  visible: boolean;
};

export default function FloatingCallWindow({ roomId, visible }: Props) {
  const participants = useParticipants();
  const { status, leaveCall } = useCall();
  const [minimized, setMinimized] = useState(false);
  const floating = useFloatingWindow();

  if (!visible || status === "idle") {
    return null;
  }

  if (minimized) {
    return (
      <button
        className="floatingCallMinimized"
        style={{ transform: floating.style.transform }}
        aria-label="Restore call"
        title="Restore call"
        onClick={() => setMinimized(false)}
      >
        <span className={`floatingCallStatusDot ${status}`} aria-hidden="true" />
        <span>Call</span>
        <span>{participants.length}</span>
      </button>
    );
  }

  return (
    <section
      className="floatingCallWindow"
      style={floating.style}
      aria-label={`Room ${roomId} call`}
    >
      <header
        className="floatingCallHeader"
        onPointerDown={floating.startDrag}
        onPointerMove={floating.moveOperation}
        onPointerUp={floating.endOperation}
        onPointerCancel={floating.endOperation}
      >
        <div>
          <span className={`floatingCallStatusDot ${status}`} aria-hidden="true" />
          <strong>Call</strong>
          <span>Room {roomId}</span>
        </div>
        <button
          aria-label="Minimize call"
          title="Minimize call"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setMinimized(true)}
        >
          &minus;
        </button>
      </header>

      <div
        className="floatingCallGrid"
        data-count={participants.length}
      >
        {participants.map((participant) => (
          <CallTile
            key={participant.identity}
            participant={participant}
            onLeave={participant.isLocal ? leaveCall : undefined}
          />
        ))}
      </div>

      {!floating.mobile && (
        <div
          className="floatingCallResizeHandle"
          role="separator"
          aria-label="Resize call window"
          title="Resize call window"
          onPointerDown={floating.startResize}
          onPointerMove={floating.moveOperation}
          onPointerUp={floating.endOperation}
          onPointerCancel={floating.endOperation}
        />
      )}
    </section>
  );
}
