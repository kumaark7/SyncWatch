import { useLocalParticipant } from "@livekit/components-react";
import { X } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { useCall } from "./party/call/CallProvider";
import { usePushToTalk } from "./party/call/PushToTalkProvider";
import type { VideoPlayerHandle } from "./VideoPlayer";

type Props = {
  playerRef: RefObject<VideoPlayerHandle | null>;
  onToggleChat: () => void;
  onToggleFullscreen: () => void;
  onError: (message: string) => void;
};

const SHORTCUTS = [
  ["Space / P", "Play or pause for everyone"],
  ["Left / Right", "Seek 10 seconds for everyone"],
  ["Up / Down", "Adjust local volume by 5%"],
  ["M", "Mute or unmute microphone"],
  ["V", "Turn camera on or off"],
  ["C", "Show or hide chat"],
  ["Hold T", "Push to Talk"],
  ["F", "Toggle fullscreen"],
  ["?", "Show or hide this help"]
] as const;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.matches("input, textarea, select, [contenteditable='true']")
    || target.isContentEditable
    || Boolean(target.closest("[contenteditable='true'], [role='textbox']"));
}

export default function RoomKeyboardShortcuts({
  playerRef,
  onToggleChat,
  onToggleFullscreen,
  onError
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { isCameraEnabled } = useLocalParticipant();
  const { status, setCameraEnabled } = useCall();
  const { toggleMicrophone } = usePushToTalk();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.repeat
        || event.ctrlKey
        || event.altKey
        || event.metaKey
        || isEditableTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (helpOpen) {
        if (event.key === "?" || event.key === "Escape") {
          event.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (event.key === " " || key === "p") {
        event.preventDefault();
        playerRef.current?.togglePlayback();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        playerRef.current?.seekBy(event.key === "ArrowLeft" ? -10 : 10);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        playerRef.current?.changeVolumeBy(event.key === "ArrowUp" ? 0.05 : -0.05);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        onToggleChat();
        return;
      }

      if (key === "f") {
        event.preventDefault();
        onToggleFullscreen();
        return;
      }

      if (status !== "connected" && status !== "reconnecting") {
        return;
      }

      if (key === "m") {
        event.preventDefault();
        void toggleMicrophone().catch(() => {
          onError("Could not change the microphone");
        });
      } else if (key === "v") {
        event.preventDefault();
        void setCameraEnabled(!isCameraEnabled).catch(() => {
          onError("Could not change the camera");
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    helpOpen,
    isCameraEnabled,
    onError,
    onToggleChat,
    onToggleFullscreen,
    playerRef,
    setCameraEnabled,
    toggleMicrophone,
    status
  ]);

  return helpOpen ? (
    <div
      className="shortcutHelpBackdrop"
      role="presentation"
      onPointerDown={() => setHelpOpen(false)}
    >
      <section
        className="shortcutHelpDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="shortcutHelpHeader">
          <h2 id="shortcut-help-title">Keyboard Shortcuts</h2>
          <button
            type="button"
            className="shortcutHelpClose"
            aria-label="Close keyboard shortcuts"
            title="Close"
            autoFocus
            onClick={() => setHelpOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <dl className="shortcutHelpList">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <dt><kbd>{keys}</kbd></dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  ) : null;
}
