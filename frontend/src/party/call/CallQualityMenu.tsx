import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useCall } from "./CallProvider";
import type { AudioProcessingSetting, VideoQualityMode } from "./types";

type Props = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const AUDIO_OPTIONS: Array<{ key: AudioProcessingSetting; label: string }> = [
  { key: "noiseSuppression", label: "Noise suppression" },
  { key: "echoCancellation", label: "Echo cancellation" },
  { key: "autoGainControl", label: "Auto gain control" }
];

const VIDEO_OPTIONS: Array<{ value: VideoQualityMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "360p", label: "360p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" }
];

export default function CallQualityMenu({ anchorRef, onClose }: Props) {
  const {
    qualitySettings,
    supportedAudioProcessing,
    adaptiveStreamEnabled,
    adaptiveStreamRuntimeConfigurable,
    setAudioProcessing,
    setVideoQuality
  } = useCall();
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [busySetting, setBusySetting] = useState<string | null>(null);

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(292, viewportWidth - 16);
      const maxHeight = Math.min(390, viewportHeight - 16);
      const expectedHeight = Math.min(350, maxHeight);
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

  const portalTarget = document.fullscreenElement ?? document.body;

  return createPortal(
    <div
      className="callQualityMenu"
      role="dialog"
      aria-label="Call quality settings"
      style={position ?? undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <strong>Quality</strong>
      <section className="callQualitySection" aria-labelledby="call-quality-audio">
        <h3 id="call-quality-audio">Audio</h3>
        {AUDIO_OPTIONS.map(({ key, label }) => {
          const supported = supportedAudioProcessing[key];
          const enabled = qualitySettings.audio[key];
          return (
            <div className="callQualityRow" key={key}>
              <span>{label}</span>
              <button
                className="callQualitySwitch"
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={!supported || busySetting !== null}
                title={supported ? `${label}: ${enabled ? "On" : "Off"}` : "Not supported by this browser"}
                onClick={async () => {
                  setBusySetting(key);
                  try {
                    await setAudioProcessing(key, !enabled);
                  } finally {
                    setBusySetting(null);
                  }
                }}
              >
                <span>{supported ? (enabled ? "ON" : "OFF") : "N/A"}</span>
              </button>
            </div>
          );
        })}
      </section>

      <section className="callQualitySection" aria-labelledby="call-quality-video">
        <h3 id="call-quality-video">Video</h3>
        <span className="callQualityLabel">Video Quality</span>
        <div className="callQualitySegments" aria-label="Video quality">
          {VIDEO_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={qualitySettings.videoQuality === value}
              className={qualitySettings.videoQuality === value ? "selected" : ""}
              disabled={busySetting !== null}
              onClick={async () => {
                setBusySetting("videoQuality");
                try {
                  await setVideoQuality(value);
                } finally {
                  setBusySetting(null);
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="callQualityRow">
          <span>Adaptive Stream</span>
          <button
            className="callQualitySwitch"
            type="button"
            role="switch"
            aria-checked={adaptiveStreamEnabled}
            disabled={!adaptiveStreamRuntimeConfigurable}
            title="Enabled for this call; LiveKit does not support changing it without reconnecting"
          >
            <span>{adaptiveStreamEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>
      </section>
    </div>,
    portalTarget
  );
}
