import { useLocalParticipant } from "@livekit/components-react";
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CallDeviceMenu from "./CallDeviceMenu";

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
  const [deviceMenu, setDeviceMenu] = useState<"audioinput" | "videoinput" | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const microphoneMenuButtonRef = useRef<HTMLButtonElement>(null);
  const cameraMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!deviceMenu) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !controlsRef.current?.contains(target) &&
        !(target instanceof Element && target.closest(".callDeviceMenu"))
      ) {
        setDeviceMenu(null);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [deviceMenu]);

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
      <div ref={controlsRef} className="callControls" aria-label="Call controls">
        <div className="callControlCluster">
          <button
            className={`callControlIcon callControlMain ${isMicrophoneEnabled ? "active" : ""}`}
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
            ref={microphoneMenuButtonRef}
            className="callDeviceMenuTrigger"
            aria-label="Choose microphone"
            title="Choose microphone"
            aria-haspopup="menu"
            aria-expanded={deviceMenu === "audioinput"}
            onFocus={onInteract}
            onPointerDown={onInteract}
            onClick={() => setDeviceMenu((current) => (
              current === "audioinput" ? null : "audioinput"
            ))}
          >
            {deviceMenu === "audioinput"
              ? <ChevronUp size={14} strokeWidth={2.6} aria-hidden="true" />
              : <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />}
          </button>
          {deviceMenu === "audioinput" && (
            <CallDeviceMenu
              kind="audioinput"
              anchorRef={microphoneMenuButtonRef}
              onClose={() => setDeviceMenu(null)}
              onError={setError}
            />
          )}
        </div>
        <div className="callControlCluster">
          <button
            className={`callControlIcon callControlMain ${isCameraEnabled ? "active" : ""}`}
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
            ref={cameraMenuButtonRef}
            className="callDeviceMenuTrigger"
            aria-label="Choose camera"
            title="Choose camera"
            aria-haspopup="menu"
            aria-expanded={deviceMenu === "videoinput"}
            onFocus={onInteract}
            onPointerDown={onInteract}
            onClick={() => setDeviceMenu((current) => (
              current === "videoinput" ? null : "videoinput"
            ))}
          >
            {deviceMenu === "videoinput"
              ? <ChevronUp size={14} strokeWidth={2.6} aria-hidden="true" />
              : <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />}
          </button>
          {deviceMenu === "videoinput" && (
            <CallDeviceMenu
              kind="videoinput"
              anchorRef={cameraMenuButtonRef}
              onClose={() => setDeviceMenu(null)}
              onError={setError}
            />
          )}
        </div>
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
