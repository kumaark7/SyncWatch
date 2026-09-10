import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { API_URL } from "./api";
import GestureControl from "./gesture/GestureControl";
import type { GesturePlaybackAction } from "./gesture/useGesturePlaybackControl";
import {
  classifyPlayRejection,
  isNewSeekEvent,
  isExpectedRemoteSeek,
  isStaleAgainstSeek,
  mediaSourceIdentity,
  nextAuthoritativePlayRecoveryState,
  safeLocalControlTime,
  shouldApplyAuthoritativeTime
} from "./playbackSync";
import type {
  AuthoritativePlayRecoveryEvent,
  AuthoritativePlayRecoveryState
} from "./playbackSync";
import type { SyncEvent } from "./types";

type Props = {
  roomId: string;
  hasFile: boolean;
  fileName: string | null;
  mediaVersion: number;
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

export type VideoPlayerHandle = {
  togglePlayback: () => void;
  pausePlayback: () => void;
  seekBy: (offsetSeconds: number) => void;
  changeVolumeBy: (offset: number) => void;
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

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  props,
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteUntil = useRef(0);
  const applyingRemoteRef = useRef(false);
  const remoteSeekPendingRef = useRef(false);
  const remoteSeekTargetRef = useRef<number | null>(null);
  const mediaRecoveringRef = useRef(false);
  const mediaUnavailableRef = useRef(false);
  const lastStableTimeRef = useRef(0);
  const pendingSyncEventRef = useRef<SyncEvent | null>(null);
  const authoritativePlayingRef = useRef(
    props.initialPlaying
  );
  const lastAppliedSeekIdRef = useRef(0);
  const authoritativeZeroSeekIdRef = useRef<number | null>(null);
  const localPausedSeekRef = useRef(false);
  const playRecoveryRef = useRef<AuthoritativePlayRecoveryState>({
    retryPending: false,
    policyBlocked: false
  });
  const authoritativePlayInFlightRef = useRef(false);
  const playAttemptIdRef = useRef(0);
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
    remoteSeekPendingRef.current || applyingRemoteRef.current || isRemote();

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

  const endRemoteApply = () => {
    applyingRemoteRef.current = false;
    remoteUntil.current = 0;
    if (remoteApplyTimer.current !== null) {
      window.clearTimeout(remoteApplyTimer.current);
      remoteApplyTimer.current = null;
    }
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
    localPausedSeekRef.current = false;
  };

  const markLocalPausedSeek = () => {
    localPausedSeekRef.current = true;
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

  const mediaDiagnostic = (
    event: string,
    details: Record<string, string | number | boolean | null> = {}
  ) => {
    console.info("[SyncWatch media]", {
      event,
      mediaVersion: props.mediaVersion,
      ...details
    });
  };

  const updatePlayRecovery = (
    event: AuthoritativePlayRecoveryEvent
  ) => {
    const next = nextAuthoritativePlayRecoveryState(
      playRecoveryRef.current,
      event
    );
    playRecoveryRef.current = next;
    setNeedsPlaybackStart(next.policyBlocked);
  };

  const cancelAuthoritativePlayRecovery = (
    event: "authoritative-pause" | "media-reset"
  ) => {
    playAttemptIdRef.current += 1;
    authoritativePlayInFlightRef.current = false;
    updatePlayRecovery(event);
  };

  const localControlTime = (
    video: HTMLVideoElement,
    control: "PLAY" | "PAUSE" | "SEEK"
  ) => {
    const time = safeLocalControlTime(
      video.currentTime,
      lastStableTimeRef.current,
      mediaUnavailableRef.current,
      video.readyState
    );

    if (time === null) {
      mediaDiagnostic("local-control-suppressed", {
        control,
        readyState: video.readyState,
        networkState: video.networkState
      });
    }

    return time;
  };

  const applyRemoteTime = (
    video: HTMLVideoElement,
    target: number,
    reason: string
  ) => {
    remoteSeekPendingRef.current = true;
    remoteSeekTargetRef.current = target;
    mediaRecoveringRef.current = true;
    video.currentTime = target;
    mediaDiagnostic(reason, {
      target: Math.round(target * 1000) / 1000
    });
  };

  const requestSynchronizedSeek = (
    offsetSeconds: number
  ) => {
    const video = videoRef.current;

    if (!video || !Number.isFinite(video.duration)) {
      return;
    }

    if (!Number.isFinite(video.currentTime)) {
      return;
    }

    const currentTime = video.currentTime;

    const target = Math.min(
      video.duration,
      Math.max(0, currentTime + offsetSeconds)
    );

    if (Math.abs(target - currentTime) < 0.001) {
      return;
    }

    resetRate(video);
    mediaDiagnostic("local-seek-request", {
      from: Math.round(currentTime * 1000) / 1000,
      target: Math.round(target * 1000) / 1000
    });

    /*
     * Use the native seek lifecycle so onSeeked sends the same
     * authoritative SEEK command as the built-in timeline control.
     */
    video.currentTime = target;
  };

  const requestGesturePlayback = (
    action: GesturePlaybackAction
  ) => {
    const video = videoRef.current;

    if (!video || isApplyingRemote()) {
      return;
    }

    if (action === "pause") {
      if (!video.paused && !video.ended) {
        video.pause();
      }

      return;
    }

    if (!video.paused || video.ended) {
      return;
    }

    void video.play()
      .then(() => updatePlayRecovery("play-succeeded"))
      .catch((error: unknown) => {
        const kind = classifyPlayRejection(error);
        if (kind === "policy-blocked") {
          updatePlayRecovery("policy-rejection");
          return;
        }

        updatePlayRecovery("other-rejection");
        mediaDiagnostic("local-play-rejected", { kind });
      });
  };

  useImperativeHandle(ref, () => ({
    togglePlayback: () => {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      requestGesturePlayback(video.paused ? "play" : "pause");
    },
    pausePlayback: () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) {
        return;
      }

      // Suppress the native pause callback and send the same authoritative
      // PAUSE command once, even during a recent remote synchronization.
      beginRemoteApply(800);
      resetRate(video);
      video.pause();
      authoritativePlayingRef.current = false;
      cancelAuthoritativePlayRecovery("authoritative-pause");
      const controlTime = safeLocalControlTime(
        video.currentTime,
        lastStableTimeRef.current,
        mediaUnavailableRef.current,
        video.readyState
      );
      if (controlTime !== null) {
        props.onControl("PAUSE", controlTime, false);
      }
    },
    seekBy: requestSynchronizedSeek,
    changeVolumeBy: (offset) => {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      video.volume = Math.min(
        1,
        Math.max(0, Math.round((video.volume + offset) * 100) / 100)
      );
    }
  }));

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
    video: HTMLVideoElement,
    attemptKind: "authoritative" | "recovery" | "user" = "authoritative"
  ) => {
    if (
      !authoritativePlayingRef.current ||
      authoritativePlayInFlightRef.current ||
      (playRecoveryRef.current.retryPending && attemptKind !== "recovery") ||
      (playRecoveryRef.current.policyBlocked && attemptKind !== "user")
    ) {
      return;
    }

    if (attemptKind === "recovery" || attemptKind === "user") {
      updatePlayRecovery("retry-started");
    }

    const attemptId = ++playAttemptIdRef.current;
    authoritativePlayInFlightRef.current = true;
    try {
      await video.play();
      if (videoRef.current !== video) {
        return;
      }

      if (!authoritativePlayingRef.current) {
        enforceAuthoritativePause(video);
        return;
      }

      if (attemptId !== playAttemptIdRef.current) {
        return;
      }

      updatePlayRecovery("play-succeeded");
    } catch (error: unknown) {
      if (
        attemptId !== playAttemptIdRef.current ||
        videoRef.current !== video ||
        !authoritativePlayingRef.current
      ) {
        return;
      }

      const kind = classifyPlayRejection(error);
      if (kind === "policy-blocked") {
        updatePlayRecovery("policy-rejection");
        console.warn("Playback requires a user gesture.");
      } else if (kind === "transient" && attemptKind !== "recovery") {
        updatePlayRecovery("transient-rejection");
        mediaDiagnostic("authoritative-play-interrupted", { kind });
      } else {
        updatePlayRecovery("other-rejection");
        mediaDiagnostic(
          attemptKind === "recovery"
            ? "authoritative-play-recovery-rejected"
            : "authoritative-play-rejected",
          { kind }
        );
      }
    } finally {
      if (attemptId === playAttemptIdRef.current) {
        authoritativePlayInFlightRef.current = false;
      }
    }
  };

  const retryPendingAuthoritativePlay = (
    video: HTMLVideoElement
  ) => {
    if (
      !playRecoveryRef.current.retryPending ||
      !authoritativePlayingRef.current ||
      mediaRecoveringRef.current ||
      video.seeking
    ) {
      return;
    }

    beginRemoteApply(2000);
    void tryRemotePlay(video, "recovery");
  };

  const applyPlaybackEvent = (
    video: HTMLVideoElement,
    event: SyncEvent
  ) => {
    if (
      event.type !== "PLAY" &&
      event.type !== "PAUSE" &&
      event.type !== "SEEK" &&
      event.type !== "STATE"
    ) {
      return;
    }

    if (!Number.isFinite(event.time)) {
      mediaDiagnostic("invalid-sync-time", { type: event.type });
      return;
    }

    const seekAdvanced = typeof event.seekId === "number" &&
      event.seekId > lastAppliedSeekIdRef.current;

    if (event.type === "SEEK") {
      if (!isNewSeekEvent(event.seekId, lastAppliedSeekIdRef.current)) {
        mediaDiagnostic("stale-seek-ignored", {
          seekId: event.seekId ?? -1,
          lastSeekId: lastAppliedSeekIdRef.current
        });
        return;
      }
    } else if (isStaleAgainstSeek(event.seekId, lastAppliedSeekIdRef.current)) {
      mediaDiagnostic("stale-sync-event-ignored", {
        type: event.type,
        seekId: event.seekId ?? -1,
        lastSeekId: lastAppliedSeekIdRef.current
      });
      return;
    }

    if (typeof event.seekId === "number") {
      if (seekAdvanced) {
        authoritativeZeroSeekIdRef.current = event.time <= 0.05
          ? event.seekId
          : null;
      }

      lastAppliedSeekIdRef.current = Math.max(
        lastAppliedSeekIdRef.current,
        event.seekId
      );
    }

    authoritativePlayingRef.current = event.playing;
    if (!event.playing) {
      cancelAuthoritativePlayRecovery("authoritative-pause");
    }
    const ownEvent = Boolean(event.senderClientId) &&
      event.senderClientId === props.clientId;
    const eventWasFromHost = Boolean(event.hostClientId) &&
      event.senderClientId === event.hostClientId;
    const target = targetTime(event);
    const drift = target - video.currentTime;
    const absDrift = Math.abs(drift);
    const allowAuthoritativeZero = event.type === "SEEK" ||
      (typeof event.seekId === "number" &&
        event.seekId === authoritativeZeroSeekIdRef.current);

    if (event.type === "SEEK") {
      pendingSyncEventRef.current = null;
      beginRemoteApply(2500);

      if (!ownEvent) {
        showTimedOverlay(
          eventWasFromHost ? "host-sync" : "guest-sync",
          1100
        );
      }

      resetRate(video);
      const minimumDrift = ownEvent ? 0.5 : 0.05;
      if (shouldApplyAuthoritativeTime(
        "SEEK",
        video.currentTime,
        target,
        lastStableTimeRef.current,
        mediaRecoveringRef.current,
        minimumDrift
      )) {
        applyRemoteTime(video, target, "remote-seek-applied");
      }

      hasAlignedPlayback.current = true;
      if (event.playing) {
        if (video.paused) void tryRemotePlay(video);
      } else {
        setNeedsPlaybackStart(false);
        if (!video.paused) video.pause();
      }
      return;
    }

    if (mediaRecoveringRef.current || video.seeking) {
      pendingSyncEventRef.current = event;
      resetRate(video);
      mediaDiagnostic("sync-correction-deferred", { type: event.type });

      if (!event.playing) {
        setNeedsPlaybackStart(false);
        if (!video.paused) {
          beginRemoteApply(1500);
          video.pause();
        }
      } else if (video.paused) {
        beginRemoteApply(2000);
        void tryRemotePlay(video);
      }
      return;
    }

    pendingSyncEventRef.current = null;

    if (event.type === "PAUSE") {
      beginRemoteApply(1500);
      resetRate(video);
      if (shouldApplyAuthoritativeTime(
        "PAUSE",
        video.currentTime,
        target,
        lastStableTimeRef.current,
        false,
        0.15,
        allowAuthoritativeZero
      )) {
        applyRemoteTime(video, target, "pause-alignment-seek-applied");
      }
      showTimedOverlay(
        eventWasFromHost ? "host-paused" : "guest-paused",
        1600
      );
      setNeedsPlaybackStart(false);
      if (!video.paused) video.pause();
      return;
    }

    if (event.type === "PLAY") {
      beginRemoteApply(2000);
      resetRate(video);
      if (shouldApplyAuthoritativeTime(
        "PLAY",
        video.currentTime,
        target,
        lastStableTimeRef.current,
        false,
        0.5,
        allowAuthoritativeZero
      )) {
        applyRemoteTime(video, target, "play-alignment-seek-applied");
      }
      hasAlignedPlayback.current = true;
      if (video.paused) void tryRemotePlay(video);
      return;
    }

    if (!event.playing) {
      resetRate(video);
      if (shouldApplyAuthoritativeTime(
        "STATE",
        video.currentTime,
        target,
        lastStableTimeRef.current,
        false,
        IGNORE_DRIFT,
        allowAuthoritativeZero
      )) {
        beginRemoteApply(2000);
        applyRemoteTime(video, target, "paused-state-alignment-seek-applied");
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
      video.playbackRate = drift > 0 ? FAST_RATE : SLOW_RATE;
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

    if (shouldApplyAuthoritativeTime(
      "STATE",
      video.currentTime,
      target,
      lastStableTimeRef.current,
      false,
      HARD_SEEK_DRIFT,
      allowAuthoritativeZero
    )) {
      resetRate(video);
      beginRemoteApply(2500);
      applyRemoteTime(video, target, "state-hard-seek-applied");
      hasAlignedPlayback.current = true;
    }
  };

  const reconcilePendingSync = (video: HTMLVideoElement) => {
    if (mediaRecoveringRef.current || video.seeking) return;
    const pending = pendingSyncEventRef.current;
    pendingSyncEventRef.current = null;
    if (pending) applyPlaybackEvent(video, pending);
  };

  useEffect(() => {
    return () => {
      playAttemptIdRef.current += 1;
      authoritativePlayInFlightRef.current = false;
      playRecoveryRef.current = nextAuthoritativePlayRecoveryState(
        playRecoveryRef.current,
        "media-reset"
      );
      if (remoteApplyTimer.current !== null) {
        window.clearTimeout(remoteApplyTimer.current);
      }

      remoteSeekPendingRef.current = false;
      remoteSeekTargetRef.current = null;

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

    applyPlaybackEvent(video, event);
  }, [
    props.syncEvent,
    props.hasFile,
    props.clientId
  ]);

  useEffect(() => {
    authoritativePlayingRef.current =
      props.initialPlaying;
    if (!props.initialPlaying) {
      cancelAuthoritativePlayRecovery("authoritative-pause");
    }
  }, [
    props.initialPlaying,
    props.mediaVersion
  ]);

  useEffect(() => {
    cancelAuthoritativePlayRecovery("media-reset");
    setMediaDuration(null);
    mediaUnavailableRef.current = false;
    mediaRecoveringRef.current = false;
    remoteSeekPendingRef.current = false;
    remoteSeekTargetRef.current = null;
    pendingSyncEventRef.current = null;
    lastStableTimeRef.current = 0;
    hasAlignedPlayback.current = false;
    applyingRemoteRef.current = false;
    remoteUntil.current = 0;
    lastAppliedSeekIdRef.current = 0;
    authoritativeZeroSeekIdRef.current = null;
    clearLocalPausedSeek();

    if (remoteApplyTimer.current !== null) {
      window.clearTimeout(remoteApplyTimer.current);
      remoteApplyTimer.current = null;
    }

    if (!props.hasFile) {
      setOverlayMode("none");
      authoritativePlayingRef.current = false;
    }
  }, [
    props.hasFile,
    props.mediaVersion
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

  const sourceIdentity = mediaSourceIdentity(
    props.roomId,
    props.mediaVersion
  );

  const finishRecovery = (video: HTMLVideoElement) => {
    mediaUnavailableRef.current = false;
    if (video.seeking) return;

    remoteSeekPendingRef.current = false;
    mediaRecoveringRef.current = false;
    clearLocalPausedSeek();
    if (overlayMode === "buffering") {
      setOverlayMode("none");
    }
    reconcilePendingSync(video);
    retryPendingAuthoritativePlay(video);
  };

  return (
    <div
      className={`videoFrame ${seekControlsVisible ? "seekControlsVisible" : ""}`}
      onPointerMove={revealSeekControls}
      onPointerDown={revealSeekControls}
    >
      <video
        key={sourceIdentity}
        ref={videoRef}
        className="video"
        src={`${API_URL}/api/stream/${props.roomId}?media=${props.mediaVersion}`}
        controls
        playsInline
        preload="auto"

        onLoadedMetadata={(event) => {
          const video =
            event.currentTarget;

          mediaUnavailableRef.current = false;
          mediaRecoveringRef.current = false;
          resetRate(video);
          mediaDiagnostic("media-metadata-loaded", {
            duration: Number.isFinite(video.duration)
              ? Math.round(video.duration * 1000) / 1000
              : null
          });
          setMediaDuration(
            Number.isFinite(video.duration)
              ? video.duration
              : null
          );

          if (
            props.initialTime > 0
          ) {
            beginRemoteApply(2500);
            applyRemoteTime(video, props.initialTime, "initial-state-seek-applied");
          }

          if (
            props.initialPlaying
          ) {
            beginRemoteApply(2000);
            void tryRemotePlay(
              video
            );
          } else {
            enforceAuthoritativePause(video);
          }
        }}

        onDurationChange={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) {
            setMediaDuration(duration);
          }
        }}

        onPlay={(event) => {
          if (
            isApplyingRemote() ||
            authoritativePlayInFlightRef.current ||
            playRecoveryRef.current.retryPending
          ) return;

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
          updatePlayRecovery("play-succeeded");
          clearLocalPausedSeek();
          authoritativePlayingRef.current = true;

          const controlTime = localControlTime(video, "PLAY");
          if (controlTime !== null) {
            props.onControl("PLAY", controlTime, true);
          }
        }}

        onPause={(event) => {
          if (
            isApplyingRemote() ||
            authoritativePlayInFlightRef.current ||
            (authoritativePlayingRef.current && playRecoveryRef.current.retryPending) ||
            event.currentTarget.ended
          ) {
            return;
          }

          const video =
            event.currentTarget;

          resetRate(video);
          clearLocalPausedSeek();
          authoritativePlayingRef.current = false;
          cancelAuthoritativePlayRecovery("authoritative-pause");

          const controlTime = localControlTime(video, "PAUSE");
          if (controlTime !== null) {
            props.onControl("PAUSE", controlTime, false);
          }
        }}

        onSeeking={(event) => {
          const video = event.currentTarget;
          const expectedRemoteSeek = isExpectedRemoteSeek(
            video.currentTime,
            remoteSeekTargetRef.current
          );
          mediaRecoveringRef.current = true;
          mediaDiagnostic(
            expectedRemoteSeek ? "remote-seek-buffering" : "local-seek-buffering",
            { target: Math.round(video.currentTime * 1000) / 1000 }
          );

          if (expectedRemoteSeek) {
            return;
          }

          remoteSeekPendingRef.current = false;
          remoteSeekTargetRef.current = null;
          endRemoteApply();

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
          const video =
            event.currentTarget;

          resetRate(video);
          if (Number.isFinite(video.currentTime)) {
            lastStableTimeRef.current = Math.max(0, video.currentTime);
          }

          const completedRemoteSeek = isExpectedRemoteSeek(
            video.currentTime,
            remoteSeekTargetRef.current
          );
          if (completedRemoteSeek) {
            remoteSeekPendingRef.current = false;
            remoteSeekTargetRef.current = null;
            mediaRecoveringRef.current = video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
            mediaDiagnostic("remote-seek-completed", {
              time: Math.round(video.currentTime * 1000) / 1000,
              readyState: video.readyState
            });
            if (!mediaRecoveringRef.current) {
              finishRecovery(video);
            }
            enforceAuthoritativePause(video);
            return;
          }

          remoteSeekPendingRef.current = false;
          remoteSeekTargetRef.current = null;
          if (isApplyingRemote()) return;

          const shouldPlay =
            authoritativePlayingRef.current;
          clearLocalPausedSeek();

          const controlTime = localControlTime(video, "SEEK");
          if (controlTime !== null) {
            props.onControl("SEEK", controlTime, shouldPlay);
            mediaDiagnostic("local-seek-completed", {
              time: Math.round(controlTime * 1000) / 1000
            });
          }

          mediaRecoveringRef.current = video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
          if (!mediaRecoveringRef.current) {
            finishRecovery(video);
          }

          if (!shouldPlay && !video.paused) {
            beginRemoteApply(1200);
            video.pause();
          }
        }}

        onWaiting={(event) => {
          mediaRecoveringRef.current = true;
          mediaDiagnostic("media-waiting", {
            time: Number.isFinite(event.currentTarget.currentTime)
              ? Math.round(event.currentTarget.currentTime * 1000) / 1000
              : null,
            readyState: event.currentTarget.readyState
          });
          enforceAuthoritativePause(
            event.currentTarget
          );

          clearOverlayTimer();
          setOverlayMode(
            "buffering"
          );
        }}

        onStalled={(event) => {
          mediaRecoveringRef.current = true;
          mediaDiagnostic("media-stalled", {
            time: Number.isFinite(event.currentTarget.currentTime)
              ? Math.round(event.currentTarget.currentTime * 1000) / 1000
              : null,
            readyState: event.currentTarget.readyState
          });
          clearOverlayTimer();
          setOverlayMode(
            "buffering"
          );
        }}

        onCanPlay={(event) => {
          enforceAuthoritativePause(
            event.currentTarget
          );
          finishRecovery(event.currentTarget);
        }}

        onPlaying={(event) => {
          enforceAuthoritativePause(
            event.currentTarget
          );
          if (authoritativePlayingRef.current) {
            updatePlayRecovery("play-succeeded");
          }
          finishRecovery(event.currentTarget);
        }}

        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (
            Number.isFinite(video.currentTime) &&
            video.currentTime > 0.05 &&
            video.readyState > HTMLMediaElement.HAVE_NOTHING
          ) {
            lastStableTimeRef.current = video.currentTime;
          }
          enforceAuthoritativePause(video);
        }}

        onLoadStart={() => {
          mediaDiagnostic("media-load-start");
        }}

        onEmptied={(event) => {
          cancelAuthoritativePlayRecovery("media-reset");
          mediaUnavailableRef.current = true;
          mediaRecoveringRef.current = false;
          remoteSeekPendingRef.current = false;
          remoteSeekTargetRef.current = null;
          pendingSyncEventRef.current = null;
          endRemoteApply();
          clearLocalPausedSeek();
          mediaDiagnostic("media-emptied", {
            networkState: event.currentTarget.networkState
          });
        }}

        onError={(event) => {
          const video = event.currentTarget;
          cancelAuthoritativePlayRecovery("media-reset");
          mediaUnavailableRef.current = true;
          mediaRecoveringRef.current = false;
          remoteSeekPendingRef.current = false;
          remoteSeekTargetRef.current = null;
          pendingSyncEventRef.current = null;
          endRemoteApply();
          clearLocalPausedSeek();
          clearOverlayTimer();
          setOverlayMode("buffering");
          mediaDiagnostic("media-error", {
            code: video.error?.code ?? null,
            readyState: video.readyState,
            networkState: video.networkState
          });
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

      <GestureControl onAction={requestGesturePlayback} />

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
            onClick={() => {
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
                  applyRemoteTime(video, target, "autoplay-recovery-seek-applied");
                }
              } else if (
                props.initialTime > 0
              ) {
                applyRemoteTime(video, props.initialTime, "initial-state-seek-applied");
              }

              void tryRemotePlay(video, "user");
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
});

export default VideoPlayer;
