export const SERVER_CLOCK_SAMPLE_COUNT = 3;
export const FOREGROUND_CLOCK_REFRESH_AFTER_MS = 30_000;

export type ServerClockEstimate = {
  serverTimeAtAnchor: number;
  performanceAnchor: number;
  rtt: number;
};

export type ServerClockSample<T> = {
  value: T;
  startedAt: number;
  completedAt: number;
  serverTime: number;
  rtt: number;
};

export function createServerClockSample<T>(
  value: T,
  serverTime: number,
  startedAt: number,
  completedAt: number
): ServerClockSample<T> | null {
  if (
    !Number.isFinite(serverTime) ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    serverTime <= 0 ||
    completedAt < startedAt
  ) {
    return null;
  }

  return {
    value,
    startedAt,
    completedAt,
    serverTime,
    rtt: completedAt - startedAt
  };
}

export function selectLowestRttSample<T>(samples: ServerClockSample<T>[]) {
  return samples.reduce<ServerClockSample<T> | null>(
    (best, sample) => best === null || sample.rtt < best.rtt ? sample : best,
    null
  );
}

export function estimateFromSample<T>(sample: ServerClockSample<T>): ServerClockEstimate {
  return {
    serverTimeAtAnchor: sample.serverTime + sample.rtt / 2,
    performanceAnchor: sample.completedAt,
    rtt: sample.rtt
  };
}

export function estimatedServerNow(
  estimate: ServerClockEstimate | null,
  performanceTime: number
) {
  if (!estimate || !Number.isFinite(performanceTime)) {
    return null;
  }

  return estimate.serverTimeAtAnchor + Math.max(
    0,
    performanceTime - estimate.performanceAnchor
  );
}

export function authoritativePlaybackTarget(
  eventTime: number,
  eventServerTime: number,
  playing: boolean,
  estimate: ServerClockEstimate | null,
  performanceTime: number
) {
  if (!playing) {
    return Math.max(0, eventTime);
  }

  const serverNow = estimatedServerNow(estimate, performanceTime);
  const transportAge = serverNow === null
    ? 0
    : Math.max(0, serverNow - eventServerTime) / 1000;

  return Math.max(0, eventTime + transportAge);
}

export async function calibrateServerClock<T extends { serverTime: number }>(
  loadSample: () => Promise<T>,
  sampleCount = SERVER_CLOCK_SAMPLE_COUNT,
  performanceNow: () => number = () => performance.now()
) {
  const samples: ServerClockSample<T>[] = [];

  for (let index = 0; index < sampleCount; index++) {
    const startedAt = performanceNow();
    try {
      const value = await loadSample();
      const completedAt = performanceNow();
      const sample = createServerClockSample(
        value,
        value.serverTime,
        startedAt,
        completedAt
      );
      if (sample) samples.push(sample);
    } catch {
      // A failed sample must not prevent the room from operating.
    }
  }

  const best = selectLowestRttSample(samples);
  if (!best) return null;

  const latest = samples.reduce((current, sample) =>
    sample.completedAt > current.completedAt ? sample : current
  );

  return {
    estimate: estimateFromSample(best),
    latestValue: latest.value
  };
}

export function shouldRefreshClockAfterForeground(
  hiddenAt: number | null,
  visibleAt: number,
  minimumBackgroundMs = FOREGROUND_CLOCK_REFRESH_AFTER_MS
) {
  return hiddenAt !== null &&
    Number.isFinite(hiddenAt) &&
    Number.isFinite(visibleAt) &&
    visibleAt - hiddenAt >= minimumBackgroundMs;
}
