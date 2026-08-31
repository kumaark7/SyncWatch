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
import { useCallback, useEffect, useRef, useState } from "react";
import CallDeviceMenu from "./CallDeviceMenu";
import CallQualityMenu from "./CallQualityMenu";
import { useCall } from "./CallProvider";

type Props = {
  onLeave: () => Promise<void>;
  onHideSelf: () => void;
  onInteract: () => void;
};

const PUSH_TO_TALK_MANUAL_OFF_KEY = "syncwatch.call.push-to-talk-manual-off.v1";

function loadPushToTalkManualOff() {
  try {
    return window.sessionStorage.getItem(PUSH_TO_TALK_MANUAL_OFF_KEY) === "true";
  } catch {
    return false;
  }
}

function storePushToTalkManualOff(manuallyDisabled: boolean) {
  try {
    if (manuallyDisabled) {
      window.sessionStorage.setItem(PUSH_TO_TALK_MANUAL_OFF_KEY, "true");
    } else {
      window.sessionStorage.removeItem(PUSH_TO_TALK_MANUAL_OFF_KEY);
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export default function CallControls({ onLeave, onHideSelf, onInteract }: Props) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled
  } = useLocalParticipant();
  const {
    setMicrophoneEnabled,
    setCameraEnabled,
    switchInputDevice
  } = useCall();
  const [busyControl, setBusyControl] = useState<"mic" | "camera" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"audioinput" | "videoinput" | "quality" | null>(null);
  const [pushToTalkManuallyDisabled, setPushToTalkManuallyDisabled] = useState(
    loadPushToTalkManualOff
  );
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const microphoneMenuButtonRef = useRef<HTMLButtonElement>(null);
  const cameraMenuButtonRef = useRef<HTMLButtonElement>(null);
  const qualityMenuButtonRef = useRef<HTMLButtonElement>(null);
  const pushToTalkEnabledRef = useRef(false);
  const pushToTalkActiveRef = useRef(false);
  const setMicrophoneEnabledRef = useRef(setMicrophoneEnabled);
  const microphoneOperationRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setMicrophoneEnabledRef.current = setMicrophoneEnabled;
  }, [setMicrophoneEnabled]);

  const queueMicrophoneState = useCallback((enabled: boolean) => {
    const operation = microphoneOperationRef.current
      .catch(() => undefined)
      .then(() => setMicrophoneEnabledRef.current(enabled));
    microphoneOperationRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const setPushToTalkMode = useCallback((enabled: boolean) => {
    pushToTalkEnabledRef.current = enabled;
    pushToTalkActiveRef.current = false;
    setPushToTalkEnabled(enabled);
    setPushToTalkActive(false);
  }, []);

  useEffect(() => {
    if (
      !isMicrophoneEnabled
      && !pushToTalkManuallyDisabled
      && !pushToTalkEnabledRef.current
    ) {
      setPushToTalkMode(true);
    }
  }, [isMicrophoneEnabled, pushToTalkManuallyDisabled, setPushToTalkMode]);

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

  useEffect(() => {
    if (!pushToTalkEnabled) {
      return;
    }

    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return target.matches("input, textarea, select, [contenteditable='true']")
        || target.isContentEditable
        || Boolean(target.closest("[contenteditable='true'], [role='textbox']"));
    }

    function releasePushToTalk() {
      if (!pushToTalkActiveRef.current) {
        return;
      }

      pushToTalkActiveRef.current = false;
      setPushToTalkActive(false);
      void queueMicrophoneState(false).catch(() => {
        setError("Could not mute the microphone");
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "p"
        || event.repeat
        || event.ctrlKey
        || event.altKey
        || event.metaKey
        || isEditableTarget(event.target)
        || !pushToTalkEnabledRef.current
      ) {
        return;
      }

      event.preventDefault();
      pushToTalkActiveRef.current = true;
      setPushToTalkActive(true);
      setError(null);
      void queueMicrophoneState(true).catch(() => {
        pushToTalkActiveRef.current = false;
        setPushToTalkActive(false);
        setError("Could not enable the microphone");
      });
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "p" || !pushToTalkActiveRef.current) {
        return;
      }

      event.preventDefault();
      releasePushToTalk();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releasePushToTalk);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releasePushToTalk);
      releasePushToTalk();
    };
  }, [pushToTalkEnabled, queueMicrophoneState]);

  async function toggleMicrophone() {
    setBusyControl("mic");
    setError(null);
    const enableMicrophone = !isMicrophoneEnabled;
    if (enableMicrophone) {
      setPushToTalkMode(false);
    }
    try {
      await queueMicrophoneState(enableMicrophone);
    } catch {
      if (!pushToTalkManuallyDisabled) {
        setPushToTalkMode(true);
      }
      setError("Microphone permission was not available");
    } finally {
      setBusyControl(null);
    }
  }

  async function togglePushToTalk() {
    setBusyControl("mic");
    setError(null);
    const enabled = !pushToTalkEnabled;
    const manuallyDisabled = !enabled;
    setPushToTalkManuallyDisabled(manuallyDisabled);
    storePushToTalkManualOff(manuallyDisabled);
    setPushToTalkMode(enabled);

    try {
      await queueMicrophoneState(false);
    } catch {
      setPushToTalkMode(false);
      setError("Could not enable Push to Talk");
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
    <div className={`callControlsWrap ${error ? "hasError" : ""}`}>
      {error && <p className="callError" role="alert">{error}</p>}
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
            onClick={() => void toggleMicrophone()}
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
          aria-label={`Push to Talk (P), ${pushToTalkEnabled ? "enabled" : "disabled"}`}
          aria-pressed={pushToTalkEnabled}
          title={`Push to Talk (P) - ${pushToTalkEnabled ? "enabled" : "disabled"}`}
          onFocus={onInteract}
          onPointerDown={onInteract}
          onClick={() => void togglePushToTalk()}
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
