import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/playbackSync.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const playback = {};
runInNewContext(source, { exports: playback });

test("PLAY, PAUSE and STATE cannot replace an established position with zero", () => {
  for (const type of ["PLAY", "PAUSE", "STATE"]) {
    assert.equal(playback.protectedAuthoritativeTime(type, 0, 300, true), 300);
    assert.equal(playback.shouldApplyAuthoritativeTime(type, 300, 0, 300, false, 0.1), false);
  }
});

test("an explicit SEEK or a new media selection may use zero", () => {
  assert.equal(playback.protectedAuthoritativeTime("SEEK", 0, 300, true), 0);
  assert.equal(playback.protectedAuthoritativeTime("STATE", 0, 300, false), 0);
  assert.equal(playback.shouldApplyAuthoritativeTime("SEEK", 300, 0, 300, true, 0.1), true);
});

test("an advanced authoritative seek keeps subsequent state at explicit zero", () => {
  assert.equal(playback.protectedAuthoritativeTime("STATE", 0, 300, true, true), 0);
  assert.equal(playback.shouldApplyAuthoritativeTime("STATE", 300, 0, 300, false, 0.1, true), true);
  assert.equal(playback.protectedAuthoritativeTime("PLAY", 0, 0, true), 0);
  assert.equal(playback.protectedAuthoritativeTime("PAUSE", 0, 0, true), 0);
});

test("media failure cannot emit a synthetic zero control", () => {
  assert.equal(playback.safeLocalControlTime(0, 300, true, 0), null);
  assert.equal(playback.safeLocalControlTime(0, 300, false, 0), null);
  assert.equal(playback.safeLocalControlTime(300, 300, true, 0), 300);
  assert.equal(playback.safeLocalControlTime(300, 300, false, 3), 300);
});

test("ordinary corrections wait for seek recovery but a newer SEEK still applies", () => {
  assert.equal(playback.shouldApplyAuthoritativeTime("STATE", 295, 300, 295, true, 0.25), false);
  assert.equal(playback.shouldApplyAuthoritativeTime("PLAY", 295, 300, 295, true, 0.25), false);
  assert.equal(playback.shouldApplyAuthoritativeTime("SEEK", 295, 400, 295, true, 0.25), true);
});

test("seek ordering rejects duplicate and stale seek events", () => {
  assert.equal(playback.isNewSeekEvent(10, 9), true);
  assert.equal(playback.isNewSeekEvent(10, 10), false);
  assert.equal(playback.isNewSeekEvent(9, 10), false);
  assert.equal(playback.isStaleAgainstSeek(9, 10), true);
  assert.equal(playback.isStaleAgainstSeek(10, 10), false);
});

test("late native seek completion is matched only to the latest remote target", () => {
  assert.equal(playback.isExpectedRemoteSeek(500, 500), true);
  assert.equal(playback.isExpectedRemoteSeek(500.4, 500), true);
  assert.equal(playback.isExpectedRemoteSeek(101, 500), false);
  assert.equal(playback.isExpectedRemoteSeek(500, null), false);
});

test("media source identity changes only when room media generation changes", () => {
  assert.equal(playback.mediaSourceIdentity("ROOM", 4), "ROOM:4");
  assert.equal(playback.mediaSourceIdentity("ROOM", 4), playback.mediaSourceIdentity("ROOM", 4));
  assert.notEqual(playback.mediaSourceIdentity("ROOM", 4), playback.mediaSourceIdentity("ROOM", 5));
});

test("video source is generation-stable and participant events never reach playback", () => {
  const videoPlayer = readFileSync(new URL("../src/VideoPlayer.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(videoPlayer, /key=\{sourceIdentity\}/);
  assert.match(videoPlayer, /\?media=\$\{props\.mediaVersion\}/);
  assert.match(videoPlayer, /event\.mediaVersion !== mediaVersionRef\.current/);
  assert.match(app, /syncEvent=\{acceptedPlaybackEvent\}/);
});

test("playback revision rejects stale controls across event types", () => {
  const play20 = { mediaVersion: 4, playbackRevision: 20, serverTime: 2_000 };
  assert.equal(playback.shouldAcceptPlaybackOrder(null, play20, "PLAY"), true);
  assert.equal(playback.shouldAcceptPlaybackOrder(
    play20,
    { ...play20, playbackRevision: 19, serverTime: 2_100 },
    "PAUSE"
  ), false);
  assert.equal(playback.shouldAcceptPlaybackOrder(
    { ...play20, playbackRevision: 44 },
    { ...play20, playbackRevision: 43, serverTime: 3_000 },
    "STATE"
  ), false);
});

test("newer pause, seek and explicit zero remain authoritative", () => {
  const current = { mediaVersion: 2, playbackRevision: 30, serverTime: 1_000 };
  const pause = { ...current, playbackRevision: 31, serverTime: 1_100 };
  const seekZero = { ...current, playbackRevision: 32, serverTime: 1_200 };

  assert.equal(playback.shouldAcceptPlaybackOrder(current, pause, "PAUSE"), true);
  assert.equal(playback.shouldAcceptPlaybackOrder(pause, current, "PLAY"), false);
  assert.equal(playback.shouldAcceptPlaybackOrder(pause, seekZero, "SEEK"), true);
  assert.equal(playback.protectedAuthoritativeTime("SEEK", 0, 300, true), 0);
});

test("media generations reset ordering and equal revision accepts only fresher state", () => {
  const oldMedia = { mediaVersion: 8, playbackRevision: 99, serverTime: 5_000 };
  const newMedia = { mediaVersion: 9, playbackRevision: 1, serverTime: 5_100 };
  assert.equal(playback.shouldAcceptPlaybackOrder(oldMedia, newMedia, "STATE"), true);
  assert.equal(playback.shouldAcceptPlaybackOrder(newMedia, oldMedia, "STATE"), false);
  assert.equal(playback.shouldAcceptPlaybackOrder(
    newMedia,
    { ...newMedia, serverTime: 5_200 },
    "STATE"
  ), true);
  assert.equal(playback.shouldAcceptPlaybackOrder(newMedia, newMedia, "PLAY"), false);
  assert.equal(playback.shouldAcceptPlaybackOrder(
    { ...newMedia, serverTime: 5_200 },
    { ...newMedia, serverTime: 5_150 },
    "STATE"
  ), false);
  assert.equal(playback.shouldAcceptPlaybackOrder(newMedia, newMedia, "PAUSE"), false);
});

test("a newer playback envelope explicitly establishes its media generation", () => {
  const oldMedia = { mediaVersion: 4, hasFile: true, fileName: "Old movie" };
  const overtakingPlay = { mediaVersion: 5, hasFile: true, fileName: "New movie" };
  const clearedMedia = { mediaVersion: 6, hasFile: false, fileName: "Ignored stale name" };

  const selected = playback.resolvePlaybackMediaState(oldMedia, overtakingPlay);
  assert.equal(selected.mediaVersion, 5);
  assert.equal(selected.hasFile, true);
  assert.equal(selected.fileName, "New movie");

  const cleared = playback.resolvePlaybackMediaState(overtakingPlay, clearedMedia);
  assert.equal(cleared.mediaVersion, 6);
  assert.equal(cleared.hasFile, false);
  assert.equal(cleared.fileName, null);
});

test("reconnect playback snapshots preserve newer non-playback room state", () => {
  const current = {
    roomId: "ROOM",
    roomName: "Current room",
    hostAssigned: true,
    isHost: false,
    screenSharerClientId: "new-sharer",
    screenSharerName: "New sharer",
    guestScreenSharingAllowed: false,
    hasFile: true,
    fileName: "Old movie",
    playing: false,
    currentTime: 100,
    serverTime: 1_000,
    seekId: 4,
    mediaVersion: 2,
    playbackRevision: 8
  };
  const staleNonPlaybackSnapshot = {
    ...current,
    roomName: "Stale room name",
    isHost: true,
    screenSharerClientId: "old-sharer",
    screenSharerName: "Old sharer",
    guestScreenSharingAllowed: true,
    fileName: "New movie",
    playing: true,
    currentTime: 200,
    serverTime: 2_000,
    seekId: 5,
    mediaVersion: 3,
    playbackRevision: 9
  };

  const merged = playback.mergePlaybackRoomSnapshot(current, staleNonPlaybackSnapshot);
  assert.equal(merged.roomName, "Current room");
  assert.equal(merged.isHost, false);
  assert.equal(merged.screenSharerClientId, "new-sharer");
  assert.equal(merged.screenSharerName, "New sharer");
  assert.equal(merged.guestScreenSharingAllowed, false);
  assert.equal(merged.fileName, "New movie");
  assert.equal(merged.playing, true);
  assert.equal(merged.currentTime, 200);
  assert.equal(merged.playbackRevision, 9);
});

test("delayed reconnect snapshots cannot overwrite newer realtime events", () => {
  const realtime = { mediaVersion: 3, playbackRevision: 51, serverTime: 2_000 };
  const delayedSnapshot = { mediaVersion: 3, playbackRevision: 50, serverTime: 2_100 };
  const newerSnapshot = { mediaVersion: 3, playbackRevision: 52, serverTime: 2_200 };

  assert.equal(playback.shouldAcceptPlaybackOrder(realtime, delayedSnapshot, "STATE"), false);
  assert.equal(playback.shouldAcceptPlaybackOrder(realtime, newerSnapshot, "STATE"), true);
});

test("paused-seek suppression ends at media lifecycle recovery boundaries", () => {
  const videoPlayer = readFileSync(new URL("../src/VideoPlayer.tsx", import.meta.url), "utf8");
  assert.match(videoPlayer, /const finishRecovery[\s\S]*clearLocalPausedSeek\(\)/);
  assert.match(videoPlayer, /const shouldPlay =[\s\S]*clearLocalPausedSeek\(\)[\s\S]*localControlTime\(video, "SEEK"\)/);
});

test("play rejection classification distinguishes policy and transient failures", () => {
  assert.equal(playback.classifyPlayRejection({ name: "NotAllowedError" }), "policy-blocked");
  assert.equal(playback.classifyPlayRejection({ name: "AbortError" }), "transient");
  assert.equal(playback.classifyPlayRejection({ name: "NotSupportedError" }), "other");
  assert.equal(playback.classifyPlayRejection(new Error("media failed")), "other");
});

test("authoritative play recovery is canceled by pause and cleared by success", () => {
  const idle = { retryPending: false, policyBlocked: false };
  const pending = playback.nextAuthoritativePlayRecoveryState(idle, "transient-rejection");
  assert.equal(pending.retryPending, true);
  assert.equal(pending.policyBlocked, false);
  const paused = playback.nextAuthoritativePlayRecoveryState(
    pending,
    "authoritative-pause"
  );
  assert.equal(paused.retryPending, false);
  assert.equal(paused.policyBlocked, false);
  const succeeded = playback.nextAuthoritativePlayRecoveryState(
    pending,
    "play-succeeded"
  );
  assert.equal(succeeded.retryPending, false);
  assert.equal(succeeded.policyBlocked, false);
});

test("policy blocking is the only recovery state that requests the playback overlay", () => {
  const idle = { retryPending: false, policyBlocked: false };
  const blocked = playback.nextAuthoritativePlayRecoveryState(idle, "policy-rejection");
  assert.equal(blocked.retryPending, false);
  assert.equal(blocked.policyBlocked, true);
  const unrelated = playback.nextAuthoritativePlayRecoveryState(idle, "other-rejection");
  assert.equal(unrelated.retryPending, false);
  assert.equal(unrelated.policyBlocked, false);
});

test("transient authoritative play recovery remains remote and is bounded", () => {
  const videoPlayer = readFileSync(new URL("../src/VideoPlayer.tsx", import.meta.url), "utf8");
  assert.match(videoPlayer, /beginRemoteApply\(2000\);\s*void tryRemotePlay\(video, "recovery"\)/);
  assert.match(videoPlayer, /kind === "transient" && attemptKind !== "recovery"/);
  assert.match(videoPlayer, /policyBlocked && attemptKind !== "user"/);
  assert.match(videoPlayer, /authoritativePlayInFlightRef\.current/);
  assert.match(videoPlayer, /cancelAuthoritativePlayRecovery\("authoritative-pause"\)/);
});
