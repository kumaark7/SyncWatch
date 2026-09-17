import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const menu = readFileSync(
  new URL("../src/components/RoomActionsMenu.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const topBar = app.match(/<header className="topBar">[\s\S]*?<\/header>/)?.[0] ?? "";

test("desktop room actions use one compact overflow menu", () => {
  assert.match(topBar, /<RoomActionsMenu/);
  assert.doesNotMatch(topBar, /headerLeaveRoom|headerCloseVideo|headerCloseRoom/);
  assert.match(topBar, /showCloseVideo=\{Boolean\(room\?\.isHost && room\.hasFile\)\}/);
  assert.match(topBar, /showCloseRoom=\{Boolean\(room\?\.isHost && !guestSession\)\}/);
});

test("overflow menu preserves all existing room actions and permissions", () => {
  assert.match(menu, /Leave room/);
  assert.match(menu, /props\.showCloseVideo &&/);
  assert.match(menu, /props\.showCloseRoom &&/);
  assert.match(menu, /props\.onLeaveRoom/);
  assert.match(menu, /props\.onCloseVideo/);
  assert.match(menu, /props\.onCloseRoom/);
  assert.match(menu, /disabled=\{props\.closingVideo\}/);
});

test("overflow menu exposes accessible menu and keyboard behavior", () => {
  assert.match(menu, /aria-label="Room actions"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /"ArrowDown", "ArrowUp", "Home", "End"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(styles, /\.roomActionsMenuTrigger\s*\{[\s\S]*?width: 36px;[\s\S]*?height: 36px;/);
});
