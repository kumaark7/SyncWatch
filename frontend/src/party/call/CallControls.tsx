import { useLocalParticipant } from "@livekit/components-react";
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  SlidersHorizontal,
  Video,
  VideoOff
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CallDeviceMenu from "./CallDeviceMenu";
import CallQualityMenu from "./CallQualityMenu";
import { useCall } from "./CallProvider";
import { usePushToTalk } from "./PushToTalkProvider";

type Props = {
  onLeave: () => Promise<void>;
  onHideSelf: () => void;
  onInteract: () => void;
};

export default function CallControls({ onLeave, onHideSelf, onInteract }: Props) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled
  } = useLocalParticipant();
  const {
    setCameraEnabled,
    switchInputDevice
  } = useCall();
  const {
    enabled: pushToTalkEnabled,
    active: pushToTalkActive,
    error: pushToTalkError,
    toggleMicrophone,
    togglePushToTalk,
    clearError: clearPushToTalkError
  } = usePushToTalk();
  const [busyControl, setBusyControl] = useState<"mic" | "camera" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"audioinput" | "videoinput" | "quality" | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const microphoneMenuButtonRef = useRef<HTMLButtonElement>(null);
  const cameraMenuButtonRef = useRef<HTMLButtonElement>(null);
  const qualityMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !controlsRef.current?.contains(target) &&
        !(target instanceof Element && target.closest(".callDeviceMenu, .callQualityMenu"))
      ) {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [openMenu]);

  async function toggleMicrophoneControl() {
    setBusyControl("mic");
    setError(null);
    clearPushToTalkError();
    try {
      await toggleMicrophone();
    } catch {
      // The shared Push-to-Talk state exposes the user-facing error.
    } finally {
      setBusyControl(null);
    }
  }

  async function togglePushToTalkControl() {
    setBusyControl("mic");
    setError(null);
    clearPushToTalkError();
    try {
      await togglePushToTalk();
    } catch {
      // The shared Push-to-Talk state exposes the user-facing error.
    } finally {
      setBusyControl(null);
    }
  }

  async function toggleCamera() {
    setBusyControl("camera");
    setError(null);
    try {
      await setCameraEnabled(!isCameraEnabled);
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
    <div className={`callControlsWrap ${error || pushToTalkError ? "hasError" : ""}`}>
      {(error || pushToTalkError) && (
        <p className="callError" role="alert">{error || pushToTalkError}</p>
      )}
      <div ref={controlsRef} className="callControls" aria-label="Call controls">
        <div className="callControlCluster">
          <button
            className={`callControlIcon callControlMain ${isMicrophoneEnabled ? "active" : "muted"}`}
            disabled={busyControl !== null}
            aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={isMicrophoneEnabled}
            title={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
            onFocus={onInteract}
            onPointerDown={onInteract}
            onClick={() => void toggleMicrophoneControl()}
          >
            {isMicrophoneEnabled
              ? <Mic size={17} strokeWidth={2.2} aria-hidden="true" />
              : <MicOff size={17} strokeWidth={2.2} aria-hidden="true" />}
          </button>
          <button
            ref={microphoneMenuButtonRef}
            className="callDeviceMenuTrigger"
            aria-label="Microphone and audio settings"
            title="Microphone and audio settings"
            aria-haspopup="menu"
            aria-expanded={openMenu === "audioinput"}
            onFocus={onInteract}
            onPointerDown={onInteract}
            onClick={() => setOpenMenu((current) => (
              current === "audioinput" ? null : "audioinput"
            ))}
          >
            {openMenu === "audioinput"
              ? <ChevronUp size={14} strokeWidth={2.6} aria-hidden="true" />
              : <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />}
          </button>
          {openMenu === "audioinput" && (
            <CallDeviceMenu
              kind="audioinput"
              anchorRef={microphoneMenuButtonRef}
              onSelectDevice={switchInputDevice}
              onClose={() => setOpenMenu(null)}
              onError={setError}
            />
          )}
        </div>
        <button
          className={`callControlIcon callPushToTalkButton ${pushToTalkEnabled ? "active" : ""} ${pushToTalkActive ? "holding" : ""}`}
          disabled={busyControl !== null}
          aria-label={`Push to Talk (T), ${pushToTalkEnabled ? "enabled" : "disabled"}`}
          aria-pressed={pushToTalkEnabled}
          title={`Push to Talk (T) - ${pushToTalkEnabled ? "enabled" : "disabled"}`}
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={() => void togglePushToTalkControl()}
        >
          <Radio size={17} strokeWidth={2.2} aria-hidden="true" />
          {pushToTalkEnabled && <span className="callControlStateDot" aria-hidden="true" />}
        </button>
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
            aria-expanded={openMenu === "videoinput"}
            onFocus={onInteract}
            onPointerDown={onInteract}
            onClick={() => setOpenMenu((current) => (
              current === "videoinput" ? null : "videoinput"
            ))}
          >
            {openMenu === "videoinput"
              ? <ChevronUp size={14} strokeWidth={2.6} aria-hidden="true" />
              : <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />}
          </button>
          {openMenu === "videoinput" && (
            <CallDeviceMenu
              kind="videoinput"
              anchorRef={cameraMenuButtonRef}
              onSelectDevice={switchInputDevice}
              onClose={() => setOpenMenu(null)}
              onError={setError}
            />
          )}
        </div>
        <button
          ref={qualityMenuButtonRef}
          className={`callControlIcon ${openMenu === "quality" ? "active" : ""}`}
          aria-label="Call quality settings"
          title="Call quality settings"
          aria-haspopup="dialog"
          aria-expanded={openMenu === "quality"}
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={() => setOpenMenu((current) => (
            current === "quality" ? null : "quality"
          ))}
        >
          <SlidersHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {openMenu === "quality" && (
          <CallQualityMenu
            anchorRef={qualityMenuButtonRef}
            onClose={() => setOpenMenu(null)}
          />
        )}
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
