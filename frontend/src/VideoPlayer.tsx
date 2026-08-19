import { useEffect, useRef, useState } from "react";
import { API_URL } from "./api";
import type { SyncEvent } from "./types";

type Props = {
  roomId: string;
  hasFile: boolean;
  fileName: string | null;
  initialTime: number;
  initialPlaying: boolean;
  syncEvent: SyncEvent | null;
  onControl: (
    type: "PLAY" | "PAUSE" | "SEEK",
    time: number,
    playing: boolean
  ) => void;
  clientId: string;
  isHost: boolean;
};

const IGNORE_DRIFT = 0.25;
const HARD_SEEK_DRIFT = 1.5;
const FAST_RATE = 1.03;
const SLOW_RATE = 0.97;

type OverlayMode =
  | "none"
  | "host-sync"
  | "guest-sync"
  | "buffering";

export default function VideoPlayer(props: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteUntil = useRef(0);
  const rateTimer = useRef<number | null>(null);
  const overlayTimer = useRef<number | null>(null);

  const [needsPlaybackStart, setNeedsPlaybackStart] =
    useState(false);

  const [overlayMode, setOverlayMode] =
    useState<OverlayMode>("none");

  const isRemote = () =>
    Date.now() < remoteUntil.current;

  const markRemote = () => {
    remoteUntil.current = Date.now() + 700;
  };

  const clearRateTimer = () => {
    if (rateTimer.current !== null) {
      window.clearTimeout(rateTimer.current);
      rateTimer.current = null;
    }
  };

  const clearOverlayTimer = () => {
    if (overlayTimer.current !== null) {
      window.clearTimeout(overlayTimer.current);
      overlayTimer.current = null;
    }
  };

  const showTimedOverlay = (
    mode: OverlayMode,
    durationMs = 1000
  ) => {
    clearOverlayTimer();
    setOverlayMode(mode);

    overlayTimer.current = window.setTimeout(() => {
      setOverlayMode("none");
      overlayTimer.current = null;
    }, durationMs);
  };

  const resetRate = (video: HTMLVideoElement) => {
    clearRateTimer();

    if (video.playbackRate !== 1) {
      video.playbackRate = 1;
    }
  };

  const scheduleRateReset = (
    video: HTMLVideoElement
  ) => {
    clearRateTimer();

    rateTimer.current = window.setTimeout(() => {
      if (videoRef.current === video) {
        video.playbackRate = 1;
      }

      rateTimer.current = null;
    }, 2500);
  };

  const targetTime = (event: SyncEvent) => {
    if (!event.playing) {
      return Math.max(0, event.time);
    }

    const transportDelay =
      Math.max(
        0,
        Date.now() - event.serverTime
      ) / 1000;

    return Math.max(
      0,
      event.time + transportDelay
    );
  };

  const tryRemotePlay = async (
    video: HTMLVideoElement
  ) => {
    try {
      await video.play();
      setNeedsPlaybackStart(false);
    } catch {
      setNeedsPlaybackStart(true);
      console.warn(
        "Autoplay blocked. Waiting for user gesture."
      );
    }
  };

  useEffect(() => {
    return () => {
      clearRateTimer();
      clearOverlayTimer();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const event = props.syncEvent;

    if (
      !video ||
      !event ||
      !props.hasFile ||
      event.type === "FILE_SELECTED"
    ) {
      return;
    }

    const ownEvent =
      Boolean(event.senderClientId) &&
      event.senderClientId === props.clientId;

    markRemote();

    const target = targetTime(event);
    const drift =
      target - video.currentTime;

    const absDrift =
      Math.abs(drift);

    if (event.type === "SEEK") {
      /*
       * The browser that initiated the seek has already moved
       * its own video. Do not label its echoed event as remote.
       */
      if (!ownEvent) {
        const seekWasFromHost =
          Boolean(event.hostClientId) &&
          event.senderClientId ===
            event.hostClientId;

        showTimedOverlay(
          seekWasFromHost
            ? "host-sync"
            : "guest-sync",
          1100
        );
      }

      resetRate(video);

      /*
       * Receiver: always follow the authoritative seek.
       * Sender: only adjust if the echoed server time is meaningfully
       * different from where the browser already landed.
       */
      if (
        !ownEvent ||
        absDrift > 0.5
      ) {
        video.currentTime = target;
      }

      if (event.playing) {
        if (video.paused) {
          void tryRemotePlay(video);
        }
      } else {
        setNeedsPlaybackStart(false);

        if (!video.paused) {
          video.pause();
        }
      }

      return;
    }

    if (event.type === "PAUSE") {
      resetRate(video);

      if (absDrift > 0.15) {
        video.currentTime = target;
      }

      setNeedsPlaybackStart(false);

      if (!video.paused) {
        video.pause();
      }

      return;
    }

    if (event.type === "PLAY") {
      resetRate(video);

      if (absDrift > 0.5) {
        video.currentTime = target;
      }

      if (video.paused) {
        void tryRemotePlay(video);
      }

      return;
    }

    if (event.type === "STATE") {
      if (!event.playing) {
        resetRate(video);

        if (absDrift > IGNORE_DRIFT) {
          video.currentTime = target;
        }

        setNeedsPlaybackStart(false);

        if (!video.paused) {
          video.pause();
        }

        return;
      }

      if (video.paused) {
        resetRate(video);
        void tryRemotePlay(video);
        return;
      }

      if (absDrift <= IGNORE_DRIFT) {
        resetRate(video);
        return;
      }

      if (absDrift <= HARD_SEEK_DRIFT) {
        video.playbackRate =
          drift > 0
            ? FAST_RATE
            : SLOW_RATE;

        scheduleRateReset(video);
        return;
      }

      resetRate(video);
      video.currentTime = target;
    }
  }, [
    props.syncEvent,
    props.hasFile,
    props.clientId
  ]);

  useEffect(() => {
    if (!props.hasFile) {
      setNeedsPlaybackStart(false);
      setOverlayMode("none");
    }
  }, [
    props.hasFile,
    props.fileName
  ]);

  if (!props.hasFile) {
    return (
      <div className="videoPlaceholder">
        Choose a Google Drive video.
      </div>
    );
  }

  const overlaySrc =
    overlayMode === "host-sync"
      ? "/sync/host-syncing.gif"
      : "/sync/client-syncing.gif";

  const overlayText =
    overlayMode === "host-sync"
      ? "Host syncing..."
      : overlayMode === "guest-sync"
      ? "Guest syncing..."
      : "Buffering...";

  return (
    <div className="videoFrame">
      <video
        key={`${props.roomId}:${props.fileName ?? ""}`}
        ref={videoRef}
        className="video"
        src={`${API_URL}/api/stream/${props.roomId}`}
        controls
        playsInline
        preload="auto"

        onLoadedMetadata={(event) => {
          const video =
            event.currentTarget;

          markRemote();
          resetRate(video);

          if (
            props.initialTime > 0
          ) {
            video.currentTime =
              props.initialTime;
          }

          if (
            props.initialPlaying
          ) {
            void tryRemotePlay(
              video
            );
          }
        }}

        onPlay={(event) => {
          if (isRemote()) return;

          const video =
            event.currentTarget;

          resetRate(video);
          setNeedsPlaybackStart(false);

          props.onControl(
            "PLAY",
            video.currentTime,
            true
          );
        }}

        onPause={(event) => {
          if (
            isRemote() ||
            event.currentTarget.ended
          ) {
            return;
          }

          const video =
            event.currentTarget;

          resetRate(video);

          props.onControl(
            "PAUSE",
            video.currentTime,
            false
          );
        }}

        onSeeking={() => {
          if (isRemote()) {
            return;
          }

          showTimedOverlay(
            props.isHost
              ? "host-sync"
              : "guest-sync",
            1200
          );
        }}

        onSeeked={(event) => {
          if (isRemote()) return;

          const video =
            event.currentTarget;

          resetRate(video);

          props.onControl(
            "SEEK",
            video.currentTime,
            !video.paused
          );
        }}

        onWaiting={() => {
          clearOverlayTimer();
          setOverlayMode(
            "buffering"
          );
        }}

        onStalled={() => {
          clearOverlayTimer();
          setOverlayMode(
            "buffering"
          );
        }}

        onCanPlay={() => {
          if (
            overlayMode ===
            "buffering"
          ) {
            setOverlayMode(
              "none"
            );
          }
        }}

        onPlaying={() => {
          if (
            overlayMode ===
            "buffering"
          ) {
            setOverlayMode(
              "none"
            );
          }
        }}
      />

      {overlayMode !== "none" && (
        <div className="syncStatusOverlay">
          <img
            src={overlaySrc}
            alt=""
            className="syncStatusGif"
          />

          <div className="syncStatusText">
            {overlayText}
          </div>
        </div>
      )}

      {needsPlaybackStart && (
        <div className="playbackOverlay">
          <button
            className="startSyncButton"
            onClick={async () => {
              const video =
                videoRef.current;

              if (!video) return;

              markRemote();
              resetRate(video);

              if (
                props.syncEvent
              ) {
                const target =
                  targetTime(
                    props.syncEvent
                  );

                if (
                  Math.abs(
                    video.currentTime -
                      target
                  ) >
                  IGNORE_DRIFT
                ) {
                  video.currentTime =
                    target;
                }
              } else if (
                props.initialTime > 0
              ) {
                video.currentTime =
                  props.initialTime;
              }

              try {
                await video.play();
                setNeedsPlaybackStart(
                  false
                );
              } catch (error) {
                console.warn(
                  "Playback still blocked after user gesture.",
                  error
                );
              }
            }}
          >
            ▶ Start synced playback
          </button>

          <div className="playbackOverlayText">
            Your browser blocked
            automatic playback.
          </div>
        </div>
      )}
    </div>
  );
}
