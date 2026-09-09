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
  assert.match(app, /lastEvent\?\.type === "PARTICIPANTS"[\s\S]*"SCREEN_SHARE" \? null : lastEvent/);
});

test("paused-seek suppression ends at media lifecycle recovery boundaries", () => {
  const videoPlayer = readFileSync(new URL("../src/VideoPlayer.tsx", import.meta.url), "utf8");
  assert.match(videoPlayer, /const finishRecovery[\s\S]*clearLocalPausedSeek\(\)/);
  assert.match(videoPlayer, /const shouldPlay =[\s\S]*clearLocalPausedSeek\(\)[\s\S]*localControlTime\(video, "SEEK"\)/);
});
