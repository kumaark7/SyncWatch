export type TimedSyncEventType = "PLAY" | "PAUSE" | "SEEK" | "STATE";
export type PlaybackOrderEventType = TimedSyncEventType | "MEDIA";

export type PlaybackOrder = {
  mediaVersion: number;
  playbackRevision: number;
  serverTime: number;
};

export type PlaybackMediaState = {
  mediaVersion: number;
  hasFile: boolean;
  fileName: string | null;
};

export type PlaybackRoomSnapshot = PlaybackMediaState & {
  playing: boolean;
  currentTime: number;
  serverTime: number;
  seekId: number;
  playbackRevision: number;
};

export type PlayRejectionKind = "policy-blocked" | "transient" | "other";

export type AuthoritativePlayRecoveryState = {
  retryPending: boolean;
  policyBlocked: boolean;
};

export type AuthoritativePlayRecoveryEvent =
  | "transient-rejection"
  | "policy-rejection"
  | "other-rejection"
  | "retry-started"
  | "play-succeeded"
  | "authoritative-pause"
  | "media-reset";

const ZERO_TIME_THRESHOLD = 0.05;
const ESTABLISHED_TIME_THRESHOLD = 1;

export function shouldAcceptPlaybackOrder(
  current: PlaybackOrder | null,
  incoming: PlaybackOrder,
  type: PlaybackOrderEventType
) {
  if (!current) return true;
  if (incoming.mediaVersion !== current.mediaVersion) {
    return incoming.mediaVersion > current.mediaVersion;
  }
  if (incoming.playbackRevision !== current.playbackRevision) {
    return incoming.playbackRevision > current.playbackRevision;
  }

  return type === "STATE" && incoming.serverTime > current.serverTime;
}

export function resolvePlaybackMediaState(
  current: PlaybackMediaState,
  incoming: PlaybackMediaState
): PlaybackMediaState {
  if (incoming.mediaVersion === current.mediaVersion) {
    return current;
  }

  return {
    mediaVersion: incoming.mediaVersion,
    hasFile: incoming.hasFile,
    fileName: incoming.hasFile ? incoming.fileName : null
  };
}

export function mergePlaybackRoomSnapshot<T extends PlaybackRoomSnapshot>(
  current: T,
  snapshot: PlaybackRoomSnapshot
): T {
  return {
    ...current,
    hasFile: snapshot.hasFile,
    fileName: snapshot.fileName,
    playing: snapshot.playing,
    currentTime: snapshot.currentTime,
    serverTime: snapshot.serverTime,
    seekId: snapshot.seekId,
    mediaVersion: snapshot.mediaVersion,
    playbackRevision: snapshot.playbackRevision
  };
}

export function classifyPlayRejection(error: unknown): PlayRejectionKind {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name)
    : "";

  if (name === "NotAllowedError") return "policy-blocked";
  if (name === "AbortError") return "transient";
  return "other";
}

export function nextAuthoritativePlayRecoveryState(
  _current: AuthoritativePlayRecoveryState,
  event: AuthoritativePlayRecoveryEvent
): AuthoritativePlayRecoveryState {
  if (event === "transient-rejection") {
    return { retryPending: true, policyBlocked: false };
  }
  if (event === "policy-rejection") {
    return { retryPending: false, policyBlocked: true };
  }
  return { retryPending: false, policyBlocked: false };
}

export function isTimedSyncEventType(type: string): type is TimedSyncEventType {
  return type === "PLAY" || type === "PAUSE" || type === "SEEK" || type === "STATE";
}

export function protectedAuthoritativeTime(
  type: TimedSyncEventType,
  incomingTime: number,
  previousTime: number,
  hasFile: boolean,
  authoritativeSeekAdvanced = false
) {
  if (!Number.isFinite(incomingTime) || incomingTime < 0) {
    return previousTime;
  }

  const target = Math.max(0, incomingTime);
  if (
    hasFile &&
    type !== "SEEK" &&
    !authoritativeSeekAdvanced &&
    target <= ZERO_TIME_THRESHOLD &&
    previousTime > ESTABLISHED_TIME_THRESHOLD
  ) {
    return previousTime;
  }

  return target;
}

export function safeLocalControlTime(
  currentTime: number,
  lastStableTime: number,
  mediaUnavailable: boolean,
  readyState: number
) {
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return null;
  }

  if (
    currentTime <= ZERO_TIME_THRESHOLD &&
    lastStableTime > ESTABLISHED_TIME_THRESHOLD &&
    (mediaUnavailable || readyState === 0)
  ) {
    return null;
  }

  return Math.max(0, currentTime);
}

export function shouldApplyAuthoritativeTime(
  type: TimedSyncEventType,
  currentTime: number,
  targetTime: number,
  lastStableTime: number,
  recovering: boolean,
  minimumDrift: number,
  allowAuthoritativeZero = false
) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(targetTime)) {
    return false;
  }

  if (recovering && type !== "SEEK") {
    return false;
  }

  if (
    type !== "SEEK" &&
    !allowAuthoritativeZero &&
    targetTime <= ZERO_TIME_THRESHOLD &&
    Math.max(currentTime, lastStableTime) > ESTABLISHED_TIME_THRESHOLD
  ) {
    return false;
  }

  return Math.abs(targetTime - currentTime) > minimumDrift;
}

export function isNewSeekEvent(seekId: number | null | undefined, lastAppliedSeekId: number) {
  return typeof seekId !== "number" || seekId > lastAppliedSeekId;
}

export function isStaleAgainstSeek(seekId: number | null | undefined, lastAppliedSeekId: number) {
  return typeof seekId === "number" && seekId < lastAppliedSeekId;
}

export function isExpectedRemoteSeek(currentTime: number, targetTime: number | null) {
  return targetTime !== null &&
    Number.isFinite(currentTime) &&
    Math.abs(currentTime - targetTime) <= 0.5;
}

export function mediaSourceIdentity(roomId: string, mediaVersion: number) {
  return `${roomId}:${mediaVersion}`;
}
