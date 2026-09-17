import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const helperSource = ts.transpileModule(
  readFileSync(new URL("../src/volumeFeedback.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;
const helperExports = {};
runInNewContext(helperSource, { exports: helperExports, Number, Math });

const shortcuts = readFileSync(
  new URL("../src/RoomKeyboardShortcuts.tsx", import.meta.url),
  "utf8"
);
const player = readFileSync(
  new URL("../src/VideoPlayer.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../src/style.css", import.meta.url),
  "utf8"
);

test("volume feedback converts and clamps media volume safely", () => {
  assert.equal(helperExports.volumePercentage(0), 0);
  assert.equal(helperExports.volumePercentage(0.55), 55);
  assert.equal(helperExports.volumePercentage(1), 100);
  assert.equal(helperExports.volumePercentage(-0.2), 0);
  assert.equal(helperExports.volumePercentage(1.2), 100);
  assert.equal(helperExports.volumePercentage(Number.NaN), 0);
});

test("arrow volume shortcuts show an accessible transient HUD", () => {
  assert.match(player, /changeVolumeBy: \(offset: number\) => number \| null/);
  assert.match(player, /if \(!video\) \{\s*return null;/);
  assert.match(player, /return video\.volume/);
  assert.match(shortcuts, /const nextVolume = playerRef\.current\?\.changeVolumeBy/);
  assert.match(shortcuts, /showVolumeFeedback\(nextVolume\)/);
  assert.match(shortcuts, /className="volumeShortcutHud"/);
  assert.match(shortcuts, /role="status"/);
  assert.match(shortcuts, /aria-live="polite"/);
  assert.match(shortcuts, /VOLUME_FEEDBACK_DURATION_MS = 1400/);
});

test("volume HUD is responsive, safe-area aware, and motion optional", () => {
  assert.match(styles, /\.volumeShortcutHud\s*\{[\s\S]*?width: min\(320px, calc\(100vw - 32px\)\)/);
  assert.match(styles, /\.volumeShortcutFill\s*\{[\s\S]*?transform-origin: left center/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?\.volumeShortcutHud\s*\{[\s\S]*?env\(safe-area-inset-bottom, 0px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.volumeShortcutHud/);
});
