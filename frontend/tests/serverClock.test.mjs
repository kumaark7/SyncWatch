import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/serverClock.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const clock = {};
runInNewContext(source, { exports: clock, performance: { now: () => 0 } });

test("clock estimate ignores positive and negative device wall-clock skew", () => {
  const estimate = {
    serverTimeAtAnchor: 1_000_050,
    performanceAnchor: 100,
    rtt: 100
  };

  for (const deviceClockSkew of [5 * 60_000, -5 * 60_000]) {
    const incorrectRawWallClockAge = (1_000_000 + deviceClockSkew) - 1_000_000;
    assert.notEqual(incorrectRawWallClockAge, 100);
    assert.equal(
      clock.authoritativePlaybackTarget(10, 1_000_000, true, estimate, 150),
      10.1
    );
  }
  assert.doesNotMatch(source, /Date\.now/);
});

test("RTT midpoint compensation anchors server time at response completion", () => {
  const sample = clock.createServerClockSample({}, 1_000, 100, 300);
  const estimate = clock.estimateFromSample(sample);

  assert.equal(estimate.serverTimeAtAnchor, 1_100);
  assert.equal(clock.estimatedServerNow(estimate, 400), 1_200);
});

test("calibration selects the lowest RTT sample and returns the latest snapshot", async () => {
  const times = [0, 100, 200, 220, 300, 350];
  const responses = [
    { serverTime: 1_000, revision: 1 },
    { serverTime: 2_000, revision: 2 },
    { serverTime: 3_000, revision: 3 }
  ];
  const result = await clock.calibrateServerClock(
    async () => responses.shift(),
    3,
    () => times.shift()
  );

  assert.equal(result.estimate.rtt, 20);
  assert.equal(result.estimate.serverTimeAtAnchor, 2_010);
  assert.equal(result.latestValue.revision, 3);
});

test("estimated server time advances monotonically from performance time", () => {
  const estimate = {
    serverTimeAtAnchor: 5_000,
    performanceAnchor: 1_000,
    rtt: 10
  };

  assert.equal(clock.estimatedServerNow(estimate, 1_100), 5_100);
  assert.equal(clock.estimatedServerNow(estimate, 1_250), 5_250);
});

test("failed calibration leaves playback on the bounded no-age fallback", async () => {
  const result = await clock.calibrateServerClock(
    async () => { throw new Error("offline"); },
    3,
    () => 0
  );

  assert.equal(result, null);
  assert.equal(clock.authoritativePlaybackTarget(300, 1, true, null, 999_999), 300);
});

test("negative transport age is clamped without moving playback backward", () => {
  const estimate = {
    serverTimeAtAnchor: 9_000,
    performanceAnchor: 1_000,
    rtt: 10
  };

  assert.equal(
    clock.authoritativePlaybackTarget(300, 10_000, true, estimate, 1_100),
    300
  );
});

test("foreground refresh requires a meaningful background interval", () => {
  assert.equal(clock.shouldRefreshClockAfterForeground(null, 50_000), false);
  assert.equal(clock.shouldRefreshClockAfterForeground(1_000, 20_000), false);
  assert.equal(clock.shouldRefreshClockAfterForeground(1_000, 31_000), true);
});

test("room generations gate reconnect snapshots and foreground refresh is clock-only", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /connectedRoomId !== roomId/);
  assert.match(app, /shouldRefreshClockAfterForeground[\s\S]*void refreshClock\(\)/);
  assert.match(app, /snapshotRefreshSequenceRef/);
  const refreshClockStart = app.indexOf("const refreshClock = useCallback");
  const refreshClockEnd = app.indexOf("const showToast", refreshClockStart);
  assert.doesNotMatch(app.slice(refreshClockStart, refreshClockEnd), /applyRoomSnapshot\(/);
});
