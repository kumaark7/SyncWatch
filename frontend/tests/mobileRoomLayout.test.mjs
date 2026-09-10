import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const partyPanel = readFileSync(new URL("../src/party/PartyPanel.tsx", import.meta.url), "utf8");
const bottomNav = readFileSync(new URL("../src/mobile/MobileBottomNav.tsx", import.meta.url), "utf8");
const roomSections = readFileSync(new URL("../src/mobile/MobileRoomSections.tsx", import.meta.url), "utf8");
const roomHeader = readFileSync(new URL("../src/mobile/MobileRoomHeader.tsx", import.meta.url), "utf8");
const guestJoinPage = readFileSync(new URL("../src/auth/GuestJoinPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

function count(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

test("mobile tabs are presentation state above one player, socket and LiveKit provider", () => {
  assert.match(app, /useState<MobileTab>\("room"\)/);
  assert.match(app, /className="watchLayout" data-mobile-tab=\{mobileTab\}/);
  assert.equal(count(app, /<VideoPlayer\b/g), 1);
  assert.equal(count(app, /useRoomSocket\(/g), 1);
  assert.equal(count(app, /<CallProvider\b/g), 1);
  assert.doesNotMatch(app, /key=\{mobileTab\}/);
});

test("People, Chat and Call panes stay mounted and share their existing state", () => {
  assert.equal(count(partyPanel, /<ParticipantsPanel\b/g), 1);
  assert.equal(count(partyPanel, /<ChatPanel\b/g), 1);
  assert.equal(count(partyPanel, /<CallPanel\b/g), 1);
  assert.match(partyPanel, /data-mobile-tab=\{props\.mobileTab\}/);
  assert.equal(count(partyPanel, /className="partyPanelPane /g), 3);
});

test("bottom navigation has exactly three active-state destinations and no playback action", () => {
  assert.match(bottomNav, /id: "room", label: "Room \+ Chat"/);
  assert.match(bottomNav, /id: "chat", label: "Chat"/);
  assert.match(bottomNav, /id: "call", label: "Call"/);
  assert.equal(count(bottomNav, /id: "/g), 3);
  assert.match(bottomNav, /activeTab === id \? "active"/);
  assert.doesNotMatch(bottomNav, /sendControl|onControl|PLAY|PAUSE|SEEK/);
});

test("mobile UI uses real participant state and keeps destructive actions host-only", () => {
  assert.match(app, /participantCount=\{participants\.length\}/);
  assert.match(roomSections, /<Expand[\s\S]*?Fullscreen/);
  assert.match(roomSections, /<DoorOpen[\s\S]*?Leave room/);
  assert.doesNotMatch(roomSections, /Invite|Logout|LogOut|<Link/);
  assert.match(roomSections, /props\.isHost && props\.hasFile/);
  assert.match(roomSections, /props\.isHost && props\.canCloseRoom/);
  assert.doesNotMatch(app + partyPanel + roomSections, /YouTube|Direct URL|Local File/);
});

test("room code is in the mobile header and sync state shares the compact room row", () => {
  assert.match(app, /<MobileRoomHeader[\s\S]*?roomId=\{roomId\}/);
  assert.match(roomHeader, /className="mobileHeaderRoom"[\s\S]*?props\.roomId/);
  assert.match(roomHeader, /aria-label="Copy room code"/);
  assert.match(roomSections, /className="mobileRoomStatusGroup"[\s\S]*?<MobileSyncStatus/);
  assert.doesNotMatch(roomSections, /mobileRoomCode|mobileRoomSummary/);
  assert.doesNotMatch(styles, /data-mobile-tab="(?:chat|call)"\] \.mobileSyncStatus/);
});

test("Chat and Call replace only the lower panel while the upper room area stays mounted", () => {
  assert.doesNotMatch(styles, /\.watchLayout\[data-mobile-tab="(?:chat|call)"\] \.watchColumn/);
  assert.match(styles, /\.watchLayout\[data-mobile-tab="chat"\] \.mediaInfo/);
  assert.match(styles, /\.partyPanel\[data-mobile-tab="chat"\] \.partyChatPane/);
  assert.match(styles, /\.partyPanel\[data-mobile-tab="call"\] \.partyCallPane/);
});

test("public guest join keeps a navigation-only Home link outside the form", () => {
  assert.match(guestJoinPage, /<a className="guestHomeLink" href="\/" aria-label="Home">/);
  assert.match(guestJoinPage, /<Home size=\{19\}/);
  assert.doesNotMatch(guestJoinPage, /guestHomeLink[\s\S]{0,100}(onJoin|onSubmit|fetch)/);
});

test("mobile breakpoint reserves safe-area space for compact fixed navigation", () => {
  assert.match(styles, /@media \(max-width: 768px\)/);
  assert.match(styles, /\.mobileBottomNav\s*\{[\s\S]*?position: fixed/);
  assert.match(styles, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(styles, /--mobile-nav-height: 62px/);
});
