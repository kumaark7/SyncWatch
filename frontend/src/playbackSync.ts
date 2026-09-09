export type TimedSyncEventType = "PLAY" | "PAUSE" | "SEEK" | "STATE";

const ZERO_TIME_THRESHOLD = 0.05;
const ESTABLISHED_TIME_THRESHOLD = 1;

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
