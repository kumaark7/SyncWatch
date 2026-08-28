import { useParticipants } from "@livekit/components-react";
import { useState, type KeyboardEvent } from "react";
import CallTile from "./CallTile";
import { useCall } from "./CallProvider";
import useFloatingWindow from "./useFloatingWindow";

type Props = {
  roomId: string;
  visible: boolean;
  selfViewHidden: boolean;
  onToggleSelfView: () => void;
};

export default function FloatingCallWindow({
  roomId,
  visible,
  selfViewHidden,
  onToggleSelfView
}: Props) {
  const participants = useParticipants();
  const { status, leaveCall } = useCall();
  const [minimized, setMinimized] = useState(false);
  const floating = useFloatingWindow();
  const visibleParticipants = selfViewHidden
    ? participants.filter((participant) => !participant.isLocal)
    : participants;

  if (!visible || status === "idle") {
    return null;
  }

  function keyboardStep(event: KeyboardEvent<HTMLElement>) {
    return event.shiftKey ? 32 : 16;
  }

  function handleMoveKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const step = keyboardStep(event);
    const movement = event.key === "ArrowLeft" ? [-step, 0]
      : event.key === "ArrowRight" ? [step, 0]
        : event.key === "ArrowUp" ? [0, -step]
          : event.key === "ArrowDown" ? [0, step]
            : null;

    if (movement) {
      event.preventDefault();
      floating.moveBy(movement[0], movement[1]);
    }
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLElement>) {
    const step = keyboardStep(event);
    const resize = event.key === "ArrowLeft" ? [-step, 0]
      : event.key === "ArrowRight" ? [step, 0]
        : event.key === "ArrowUp" ? [0, -step]
          : event.key === "ArrowDown" ? [0, step]
            : null;

    if (resize) {
      event.preventDefault();
      floating.resizeBy(resize[0], resize[1]);
    }
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
      className={`floatingCallWindow ${floating.resizing ? "isResizing" : ""}`}
      style={floating.style}
      aria-label={`Room ${roomId} call`}
    >
      <div
        className="floatingCallDragGrip"
        tabIndex={0}
        aria-label="Move call window with arrow keys"
        title="Drag to move call window"
        onPointerDown={floating.startDrag}
        onLostPointerCapture={floating.cancelOperation}
        onKeyDown={handleMoveKeyDown}
      >
        <span className="floatingCallGripMark" aria-hidden="true" />
      </div>

      <div className="floatingCallUtilities">
        {selfViewHidden && (
          <button
            className="floatingShowSelf"
            aria-label="Show my preview"
            title="Show my preview"
            onClick={onToggleSelfView}
          >
            Show self
          </button>
        )}
        <button
          aria-label="Minimize call"
          title="Minimize call"
          onClick={() => setMinimized(true)}
        >
          &minus;
        </button>
      </div>

      {visibleParticipants.length > 0 ? (
        <div
          className="floatingCallGrid"
          data-count={visibleParticipants.length}
        >
          {visibleParticipants.map((participant) => (
            <CallTile
              key={participant.identity}
              participant={participant}
              onLeave={participant.isLocal ? leaveCall : undefined}
              onHideSelf={participant.isLocal ? onToggleSelfView : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="callSelfHiddenState floating">
          <strong>Self preview hidden</strong>
          <span>Call media remains connected.</span>
        </div>
      )}

      {!floating.mobile && (
        <>
          <div
            className="floatingCallResizeHandle bottomLeft"
            role="separator"
            tabIndex={-1}
            aria-label="Resize call window from bottom left"
            title="Resize call window"
            onPointerDown={(event) => floating.startResize(event, "bottom-left")}
            onLostPointerCapture={floating.cancelOperation}
          />
          <div
            className="floatingCallResizeHandle bottomRight"
            role="separator"
            tabIndex={0}
            aria-label="Resize call window"
            title="Resize call window"
            onPointerDown={(event) => floating.startResize(event, "bottom-right")}
            onLostPointerCapture={floating.cancelOperation}
            onKeyDown={handleResizeKeyDown}
          />
        </>
      )}
    </section>
  );
}
