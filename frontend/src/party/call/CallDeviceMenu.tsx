import { useMediaDeviceSelect } from "@livekit/components-react";
import { Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject
} from "react";
import { createPortal } from "react-dom";

type Props = {
  kind: "audioinput" | "videoinput";
  anchorRef: RefObject<HTMLButtonElement | null>;
  onSelectDevice: (kind: Props["kind"], deviceId: string) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function fallbackDeviceName(
  kind: Props["kind"],
  device: MediaDeviceInfo,
  index: number
) {
  if (device.deviceId === "default") {
    return kind === "audioinput" ? "Default microphone" : "Default camera";
  }

  return `${kind === "audioinput" ? "Microphone" : "Camera"} ${index + 1}`;
}

export default function CallDeviceMenu({
  kind,
  anchorRef,
  onSelectDevice,
  onClose,
  onError
}: Props) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [switchingDeviceId, setSwitchingDeviceId] = useState<string | null>(null);
  const handleDeviceError = useCallback(() => {
    onError(
      kind === "audioinput"
        ? "Microphone devices were not available"
        : "Camera devices were not available"
    );
  }, [kind, onError]);
  const {
    devices,
    activeDeviceId
  } = useMediaDeviceSelect({
    kind,
    requestPermissions: true,
    onError: handleDeviceError
  });

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const callTile = anchor.closest<HTMLElement>(".callTile");
      const floatingWindow = anchor.closest<HTMLElement>(".floatingCallWindow");
      const callBounds = floatingWindow?.getBoundingClientRect()
        ?? callTile?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const callWidth = callBounds?.width ?? 320;
      const callHeight = callBounds?.height ?? 300;
      const width = Math.min(
        220,
        viewportWidth - 16,
        Math.max(160, callWidth * 0.68)
      );
      const maxHeight = Math.min(
        viewportHeight - 16,
        Math.max(112, Math.min(220, callHeight * 0.72))
      );
      const rowHeight = width < 190 ? 28 : 32;
      const expectedHeight = Math.min(
        maxHeight,
        38 + Math.max(devices.length, 1) * rowHeight
      );
      const placeAbove = rect.top >= expectedHeight + 12;
      const top = placeAbove
        ? rect.top - expectedHeight - 6
        : Math.min(rect.bottom + 6, viewportHeight - expectedHeight - 8);

      setPosition({
        top: Math.max(8, top),
        left: Math.min(
          Math.max(8, rect.right - width),
          Math.max(8, viewportWidth - width - 8)
        ),
        width,
        maxHeight
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, devices.length]);

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

  const portalTarget = document.fullscreenElement ?? document.body;
  const title = kind === "audioinput" ? "Microphone" : "Camera";

  return createPortal(
    <div
      className={`callDeviceMenu ${position && position.width < 190 ? "compact" : ""}`}
      role="menu"
      aria-label={`${title} devices`}
      style={position ?? undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <strong>{title}</strong>
      <div className="callDeviceOptions">
        {devices.length === 0 ? (
          <span className="callDeviceEmpty">Loading devices...</span>
        ) : devices.map((device, index) => {
          const selected = device.deviceId === activeDeviceId;
          const label = device.label.trim() || fallbackDeviceName(kind, device, index);

          return (
            <button
              key={device.deviceId || `${kind}-${index}`}
              role="menuitemradio"
              aria-checked={selected}
              disabled={switchingDeviceId !== null}
              title={label}
              onClick={async () => {
                setSwitchingDeviceId(device.deviceId);
                try {
                  await onSelectDevice(kind, device.deviceId);
                  onClose();
                  anchorRef.current?.focus();
                } catch {
                  onError(`Could not switch ${title.toLowerCase()}`);
                } finally {
                  setSwitchingDeviceId(null);
                }
              }}
            >
              <Check
                size={14}
                strokeWidth={2.2}
                aria-hidden="true"
                className={selected ? "selected" : ""}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    portalTarget
  );
}
