import { useLocalParticipant } from "@livekit/components-react";
import { EyeOff, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useState } from "react";

type Props = {
  onLeave: () => Promise<void>;
  onHideSelf: () => void;
  onInteract: () => void;
};

export default function CallControls({ onLeave, onHideSelf, onInteract }: Props) {
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled
  } = useLocalParticipant();
  const [busyControl, setBusyControl] = useState<"mic" | "camera" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleMicrophone() {
    setBusyControl("mic");
    setError(null);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setError("Microphone permission was not available");
    } finally {
      setBusyControl(null);
    }
  }

  async function toggleCamera() {
    setBusyControl("camera");
    setError(null);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      setError("Camera permission was not available");
    } finally {
      setBusyControl(null);
    }
  }

  async function leave() {
    setBusyControl("leave");
    setError(null);
    try {
      await onLeave();
    } finally {
      setBusyControl(null);
    }
  }

  return (
    <div className={`callControlsWrap ${error ? "hasError" : ""}`}>
      {error && <p className="callError" role="alert">{error}</p>}
      <div className="callControls" aria-label="Call controls">
        <button
          className={`callControlIcon ${isMicrophoneEnabled ? "active" : ""}`}
          disabled={busyControl !== null}
          aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
          aria-pressed={isMicrophoneEnabled}
          title={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={() => void toggleMicrophone()}
        >
          {isMicrophoneEnabled
            ? <Mic size={17} strokeWidth={2.2} aria-hidden="true" />
            : <MicOff size={17} strokeWidth={2.2} aria-hidden="true" />}
        </button>
        <button
          className={`callControlIcon ${isCameraEnabled ? "active" : ""}`}
          disabled={busyControl !== null}
          aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          aria-pressed={isCameraEnabled}
          title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={() => void toggleCamera()}
        >
          {isCameraEnabled
            ? <Video size={17} strokeWidth={2.2} aria-hidden="true" />
            : <VideoOff size={17} strokeWidth={2.2} aria-hidden="true" />}
        </button>
        <button
          className="callControlIcon"
          aria-label="Hide my preview"
          title="Hide my preview"
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={onHideSelf}
        >
          <EyeOff size={17} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          className="callControlIcon callLeaveButton"
          disabled={busyControl !== null}
          aria-label="Leave call"
          title="Leave call"
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={() => void leave()}
        >
          <PhoneOff size={17} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
