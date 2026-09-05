import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { useCall } from "./CallProvider";

type Props = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

export default function CallScreenShareMenu({ anchorRef, onClose }: Props) {
  const {
    guestScreenSharingAllowed,
    setGuestScreenSharingAllowed
  } = useCall();
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(220, window.innerWidth - 16);
      const height = 104;
      setPosition({
        top: Math.max(8, rect.top >= height + 12 ? rect.top - height - 6 : rect.bottom + 6),
        left: Math.min(
          Math.max(8, rect.right - width),
          Math.max(8, window.innerWidth - width - 8)
        ),
        width
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      className="callScreenShareMenu"
      role="dialog"
      aria-label="Screen sharing permissions"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <strong>Screen sharing</strong>
      <div className="callQualityRow">
        <span>Allow guests</span>
        <button
          className="callQualitySwitch"
          role="switch"
          aria-checked={guestScreenSharingAllowed}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setGuestScreenSharingAllowed(!guestScreenSharingAllowed);
            } finally {
              setBusy(false);
            }
          }}
        >
          {guestScreenSharingAllowed ? "ON" : "OFF"}
        </button>
      </div>
    </div>,
    document.fullscreenElement ?? document.body
  );
}
