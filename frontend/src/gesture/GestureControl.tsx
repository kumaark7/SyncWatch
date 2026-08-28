import { Hand } from "lucide-react";
import { useState } from "react";
import useGesturePlaybackControl, {
  type GesturePlaybackAction
} from "./useGesturePlaybackControl";

type Props = {
  onAction: (action: GesturePlaybackAction) => void;
};

export default function GestureControl({ onAction }: Props) {
  const [enabled, setEnabled] = useState(false);
  const { cameraAvailable, status, lastAction } =
    useGesturePlaybackControl({ enabled, onAction });

  const statusLabel = !enabled
    ? "Off"
    : status === "loading"
    ? "Loading"
    : status === "waiting-camera"
    ? "Camera unavailable"
    : status === "error"
    ? "Unavailable"
    : lastAction === "pause"
    ? "Pause detected"
    : lastAction === "play"
    ? "Play detected"
    : "On";

  const title = cameraAvailable || enabled
    ? "Open palm pauses. Thumbs up plays."
    : "Join the call and turn on your camera to use gesture control.";

  return (
    <button
      type="button"
      className={`gestureControl ${enabled ? "isEnabled" : ""}`}
      role="switch"
      aria-checked={enabled}
      aria-label={`Gesture Control ${statusLabel}`}
      title={title}
      disabled={!cameraAvailable && !enabled}
      onClick={() => setEnabled((current) => !current)}
    >
      <Hand size={17} strokeWidth={2} aria-hidden="true" />
      <span className="gestureControlLabel">Gesture Control</span>
      <span className="gestureControlState">{statusLabel}</span>
    </button>
  );
}
