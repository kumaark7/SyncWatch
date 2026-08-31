import { useLocalParticipant } from "@livekit/components-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useCall } from "./CallProvider";

const PUSH_TO_TALK_MANUAL_OFF_KEY = "syncwatch.call.push-to-talk-manual-off.v1";

type PushToTalkContextValue = {
  enabled: boolean;
  active: boolean;
  error: string | null;
  toggleMicrophone: () => Promise<void>;
  togglePushToTalk: () => Promise<void>;
  clearError: () => void;
};

const PushToTalkContext = createContext<PushToTalkContextValue | null>(null);

function loadManualOff() {
  try {
    return window.sessionStorage.getItem(PUSH_TO_TALK_MANUAL_OFF_KEY) === "true";
  } catch {
    return false;
  }
}

function storeManualOff(manuallyDisabled: boolean) {
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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.matches("input, textarea, select, [contenteditable='true']")
    || target.isContentEditable
    || Boolean(target.closest("[contenteditable='true'], [role='textbox']"));
}

export default function PushToTalkProvider({ children }: { children: ReactNode }) {
  const { isMicrophoneEnabled } = useLocalParticipant();
  const { status, setMicrophoneEnabled } = useCall();
  const [manuallyDisabled, setManuallyDisabled] = useState(loadManualOff);
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(false);
  const activeRef = useRef(false);
  const setMicrophoneEnabledRef = useRef(setMicrophoneEnabled);
  const microphoneOperationRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setMicrophoneEnabledRef.current = setMicrophoneEnabled;
  }, [setMicrophoneEnabled]);

  const queueMicrophoneState = useCallback((nextEnabled: boolean) => {
    const operation = microphoneOperationRef.current
      .catch(() => undefined)
      .then(() => setMicrophoneEnabledRef.current(nextEnabled));
    microphoneOperationRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const setMode = useCallback((nextEnabled: boolean) => {
    enabledRef.current = nextEnabled;
    activeRef.current = false;
    setEnabled(nextEnabled);
    setActive(false);
  }, []);

  useEffect(() => {
    if (!isMicrophoneEnabled && !manuallyDisabled && !enabledRef.current) {
      setMode(true);
    }
  }, [isMicrophoneEnabled, manuallyDisabled, setMode]);

  const releasePushToTalk = useCallback(() => {
    if (!activeRef.current) {
      return;
    }

    activeRef.current = false;
    setActive(false);
    void queueMicrophoneState(false).catch(() => {
      setError("Could not mute the microphone");
    });
  }, [queueMicrophoneState]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "t"
        || event.repeat
        || event.ctrlKey
        || event.altKey
        || event.metaKey
        || isEditableTarget(event.target)
        || !enabledRef.current
        || (status !== "connected" && status !== "reconnecting")
      ) {
        return;
      }

      event.preventDefault();
      activeRef.current = true;
      setActive(true);
      setError(null);
      void queueMicrophoneState(true).catch(() => {
        activeRef.current = false;
        setActive(false);
        setError("Could not enable the microphone");
      });
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "t" || !activeRef.current) {
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
  }, [queueMicrophoneState, releasePushToTalk, status]);

  const toggleMicrophone = useCallback(async () => {
    setError(null);
    const nextEnabled = !isMicrophoneEnabled;
    if (nextEnabled) {
      setMode(false);
    }

    try {
      await queueMicrophoneState(nextEnabled);
    } catch (cause) {
      if (!manuallyDisabled) {
        setMode(true);
      }
      setError("Microphone permission was not available");
      throw cause;
    }
  }, [isMicrophoneEnabled, manuallyDisabled, queueMicrophoneState, setMode]);

  const togglePushToTalk = useCallback(async () => {
    setError(null);
    const nextEnabled = !enabledRef.current;
    const nextManuallyDisabled = !nextEnabled;
    setManuallyDisabled(nextManuallyDisabled);
    storeManualOff(nextManuallyDisabled);
    setMode(nextEnabled);

    try {
      await queueMicrophoneState(false);
    } catch (cause) {
      setMode(false);
      setError("Could not enable Push to Talk");
      throw cause;
    }
  }, [queueMicrophoneState, setMode]);

  return (
    <PushToTalkContext.Provider value={{
      enabled,
      active,
      error,
      toggleMicrophone,
      togglePushToTalk,
      clearError: () => setError(null)
    }}>
      {children}
    </PushToTalkContext.Provider>
  );
}

export function usePushToTalk() {
  const context = useContext(PushToTalkContext);
  if (!context) {
    throw new Error("usePushToTalk must be used inside PushToTalkProvider");
  }
  return context;
}
