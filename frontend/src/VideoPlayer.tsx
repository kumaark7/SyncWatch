import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
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
const CATCH_UP_RATE = 1.08;
const MAX_SOFT_CATCH_UP_DRIFT = 8;

type OverlayMode =
  | "none"
  | "host-sync"
  | "guest-sync"
  | "host-paused"
  | "guest-paused"
  | "buffering";

export default function VideoPlayer(props: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteUntil = useRef(0);
  const applyingRemoteRef = useRef(false);
  const authoritativePlayingRef = useRef(
    props.initialPlaying
  );
  const lastAppliedSeekIdRef = useRef(0);
  const localPausedSeekRef = useRef(false);
  const localPausedSeekTimer = useRef<number | null>(null);
  const remoteApplyTimer = useRef<number | null>(null);
  const rateTimer = useRef<number | null>(null);
  const overlayTimer = useRef<number | null>(null);
  const seekControlsTimer = useRef<number | null>(null);

  const [needsPlaybackStart, setNeedsPlaybackStart] =
    useState(false);

  const [overlayMode, setOverlayMode] =
    useState<OverlayMode>("none");

  const [mediaDuration, setMediaDuration] =
    useState<number | null>(null);

  const [seekControlsVisible, setSeekControlsVisible] =
    useState(false);

  const hasAlignedPlayback = useRef(false);

  const isRemote = () =>
    Date.now() < remoteUntil.current;

  const isApplyingRemote = () =>
    applyingRemoteRef.current || isRemote();

  const beginRemoteApply = (
    durationMs = 2000
  ) => {
    applyingRemoteRef.current = true;
    remoteUntil.current = Math.max(
      remoteUntil.current,
      Date.now() + durationMs
    );

    if (remoteApplyTimer.current !== null) {
      window.clearTimeout(remoteApplyTimer.current);
    }

    remoteApplyTimer.current = window.setTimeout(() => {
      applyingRemoteRef.current = false;
      remoteApplyTimer.current = null;
    }, durationMs);
  };

  const enforceAuthoritativePause = (
    video: HTMLVideoElement
  ) => {
    if (
      authoritativePlayingRef.current ||
      video.paused ||
      video.ended
    ) {
      return;
    }

    beginRemoteApply(1000);
    resetRate(video);
    video.pause();
  };

  const clearLocalPausedSeek = () => {
    if (localPausedSeekTimer.current !== null) {
      window.clearTimeout(localPausedSeekTimer.current);
      localPausedSeekTimer.current = null;
    }

    localPausedSeekRef.current = false;
  };

  const markLocalPausedSeek = () => {
    localPausedSeekRef.current = true;

    if (localPausedSeekTimer.current !== null) {
      window.clearTimeout(localPausedSeekTimer.current);
    }

    localPausedSeekTimer.current = window.setTimeout(() => {
      localPausedSeekRef.current = false;
      localPausedSeekTimer.current = null;
    }, 1500);
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

  const revealSeekControls = () => {
    setSeekControlsVisible(true);

    if (seekControlsTimer.current !== null) {
      window.clearTimeout(seekControlsTimer.current);
    }

    seekControlsTimer.current = window.setTimeout(() => {
      setSeekControlsVisible(false);
      seekControlsTimer.current = null;
    }, 2400);
  };

  const requestSynchronizedSeek = (
    offsetSeconds: number
  ) => {
    const video = videoRef.current;

    if (!video || !Number.isFinite(video.duration)) {
      return;
    }

    const currentTime = Number.isFinite(video.currentTime)
      ? video.currentTime
      : 0;

    const target = Math.min(
      video.duration,
      Math.max(0, currentTime + offsetSeconds)
    );

    if (Math.abs(target - currentTime) < 0.001) {
      return;
    }

    resetRate(video);

    /*
     * Use the native seek lifecycle so onSeeked sends the same
     * authoritative SEEK command as the built-in timeline control.
     */
    video.currentTime = target;
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
      if (remoteApplyTimer.current !== null) {
        window.clearTimeout(remoteApplyTimer.current);
      }

      clearLocalPausedSeek();

      clearRateTimer();
      clearOverlayTimer();

      if (seekControlsTimer.current !== null) {
        window.clearTimeout(seekControlsTimer.current);
      }
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

    const eventWasFromHost =
      Boolean(event.hostClientId) &&
      event.senderClientId === event.hostClientId;

    const target = targetTime(event);
    const drift =
      target - video.currentTime;

    const absDrift =
      Math.abs(drift);

    if (
      event.type === "PLAY" ||
      event.type === "PAUSE" ||
      event.type === "SEEK" ||
      event.type === "STATE"
    ) {
      authoritativePlayingRef.current =
        event.playing;
    }

    if (event.type === "SEEK") {
      if (
        typeof event.seekId === "number" &&
        event.seekId < lastAppliedSeekIdRef.current
      ) {
        return;
      }

      if (typeof event.seekId === "number") {
        lastAppliedSeekIdRef.current = event.seekId;
      }

      beginRemoteApply(2500);

      /*
       * The browser that initiated the seek has already moved
       * its own video. Do not label its echoed event as remote.
       */
      if (!ownEvent) {
        showTimedOverlay(
          eventWasFromHost
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

      hasAlignedPlayback.current = true;

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
      beginRemoteApply(1500);
      resetRate(video);

      if (absDrift > 0.15) {
        video.currentTime = target;
      }

      showTimedOverlay(
        eventWasFromHost
          ? "host-paused"
          : "guest-paused",
        1600
      );

      setNeedsPlaybackStart(false);

      if (!video.paused) {
        video.pause();
      }

      return;
    }

    if (event.type === "PLAY") {
      beginRemoteApply(2000);
      resetRate(video);

      if (absDrift > 0.5) {
        video.currentTime = target;
      }

      hasAlignedPlayback.current = true;

      if (video.paused) {
        void tryRemotePlay(video);
      }

      return;
    }

    if (event.type === "STATE") {
      if (!event.playing) {
        resetRate(video);

        if (absDrift > IGNORE_DRIFT) {
          beginRemoteApply(2000);
          video.currentTime = target;
        }

        setNeedsPlaybackStart(false);

        if (!video.paused) {
          beginRemoteApply(1500);
          video.pause();
        }

        return;
      }

      if (video.paused) {
        beginRemoteApply(2000);
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

      if (
        drift > 0 &&
        hasAlignedPlayback.current &&
        absDrift <= MAX_SOFT_CATCH_UP_DRIFT
      ) {
        video.playbackRate = CATCH_UP_RATE;
        scheduleRateReset(video);
        return;
      }

      resetRate(video);
      beginRemoteApply(2500);
      video.currentTime = target;
      hasAlignedPlayback.current = true;
    }
  }, [
    props.syncEvent,
    props.hasFile,
    props.clientId
  ]);

  useEffect(() => {
    authoritativePlayingRef.current =
      props.initialPlaying;
  }, [
    props.initialPlaying,
    props.fileName
  ]);

  useEffect(() => {
    setMediaDuration(null);

    if (!props.hasFile) {
      setNeedsPlaybackStart(false);
      setOverlayMode("none");
      hasAlignedPlayback.current = false;
      applyingRemoteRef.current = false;
      authoritativePlayingRef.current = false;
      lastAppliedSeekIdRef.current = 0;
      clearLocalPausedSeek();

      if (remoteApplyTimer.current !== null) {
        window.clearTimeout(remoteApplyTimer.current);
        remoteApplyTimer.current = null;
      }
    }
  }, [
    props.hasFile,
    props.fileName
  ]);

  if (!props.hasFile) {
    return (
      <div className="videoPlaceholder">
        {props.isHost
          ? "Choose a Google Drive video."
          : "Waiting for host to choose a video."}
      </div>
    );
  }

  const overlaySrc =
    overlayMode === "host-sync" ||
    overlayMode === "host-paused"
      ? "/sync/host-syncing.gif"
      : "/sync/client-syncing.gif";

  const overlayText =
    overlayMode === "host-sync"
      ? "Host syncing..."
      : overlayMode === "guest-sync"
      ? "Guest syncing..."
      : overlayMode === "host-paused"
      ? "Host paused"
      : overlayMode === "guest-paused"
      ? "Guest paused"
      : "Buffering...";

  return (
    <div
      className={`videoFrame ${seekControlsVisible ? "seekControlsVisible" : ""}`}
      onPointerMove={revealSeekControls}
      onPointerDown={revealSeekControls}
    >
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

          beginRemoteApply(2000);
          resetRate(video);
          setMediaDuration(
            Number.isFinite(video.duration)
              ? video.duration
              : null
          );

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
          } else {
            enforceAuthoritativePause(video);
          }
        }}

        onDurationChange={(event) => {
          const duration = event.currentTarget.duration;
          setMediaDuration(
            Number.isFinite(duration)
              ? duration
              : null
          );
        }}

        onPlay={(event) => {
          if (isApplyingRemote()) return;

          if (localPausedSeekRef.current) {
            const video =
              event.currentTarget;

            beginRemoteApply(1200);
            video.pause();
            return;
          }

          const video =
            event.currentTarget;

          resetRate(video);
          setNeedsPlaybackStart(false);
          clearLocalPausedSeek();
          authoritativePlayingRef.current = true;

          props.onControl(
            "PLAY",
            video.currentTime,
            true
          );
        }}

        onPause={(event) => {
          if (
            isApplyingRemote() ||
            event.currentTarget.ended
          ) {
            return;
          }

          const video =
            event.currentTarget;

          resetRate(video);
          clearLocalPausedSeek();
          authoritativePlayingRef.current = false;

          props.onControl(
            "PAUSE",
            video.currentTime,
            false
          );
        }}

        onSeeking={() => {
          if (isApplyingRemote()) {
            return;
          }

          if (!authoritativePlayingRef.current) {
            markLocalPausedSeek();
          }

          showTimedOverlay(
            props.isHost
              ? "host-sync"
              : "guest-sync",
            1200
          );
        }}

        onSeeked={(event) => {
          if (isApplyingRemote()) return;

          const video =
            event.currentTarget;

          resetRate(video);

          const shouldPlay =
            authoritativePlayingRef.current;

          props.onControl(
            "SEEK",
            video.currentTime,
            shouldPlay
          );

          if (!shouldPlay && !video.paused) {
            beginRemoteApply(1200);
            video.pause();
          }
        }}

        onWaiting={(event) => {
          enforceAuthoritativePause(
            event.currentTarget
          );

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

        onCanPlay={(event) => {
          enforceAuthoritativePause(
            event.currentTarget
          );

          if (
            overlayMode ===
            "buffering"
          ) {
            setOverlayMode(
              "none"
            );
          }
        }}

        onPlaying={(event) => {
          enforceAuthoritativePause(
            event.currentTarget
          );

          if (
            overlayMode ===
            "buffering"
          ) {
            setOverlayMode(
              "none"
            );
          }
        }}

        onTimeUpdate={(event) => {
          enforceAuthoritativePause(
            event.currentTarget
          );
        }}
      />

      <div
        className="seekStepControls"
        aria-label="Synchronized seek controls"
      >
        <button
          type="button"
          className="seekStepButton"
          disabled={mediaDuration === null}
          aria-label="Back 10 seconds"
          title="Back 10 seconds"
          onClick={() => requestSynchronizedSeek(-10)}
        >
          <span className="seekStepIcon" aria-hidden="true">
            <RotateCcw size={24} strokeWidth={2} />
            <span>10</span>
          </span>
        </button>

        <button
          type="button"
          className="seekStepButton"
          disabled={mediaDuration === null}
          aria-label="Forward 10 seconds"
          title="Forward 10 seconds"
          onClick={() => requestSynchronizedSeek(10)}
        >
          <span className="seekStepIcon" aria-hidden="true">
            <RotateCw size={24} strokeWidth={2} />
            <span>10</span>
          </span>
        </button>
      </div>

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

              beginRemoteApply(2000);
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
