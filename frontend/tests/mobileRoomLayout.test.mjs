import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const partyPanel = readFileSync(new URL("../src/party/PartyPanel.tsx", import.meta.url), "utf8");
const bottomNav = readFileSync(new URL("../src/mobile/MobileBottomNav.tsx", import.meta.url), "utf8");
const roomSections = readFileSync(new URL("../src/mobile/MobileRoomSections.tsx", import.meta.url), "utf8");
const roomHeader = readFileSync(new URL("../src/mobile/MobileRoomHeader.tsx", import.meta.url), "utf8");
const pageHeader = readFileSync(new URL("../src/mobile/MobilePageHeader.tsx", import.meta.url), "utf8");
const loginPage = readFileSync(new URL("../src/auth/LoginPage.tsx", import.meta.url), "utf8");
const guestJoinPage = readFileSync(new URL("../src/auth/GuestJoinPage.tsx", import.meta.url), "utf8");
const chatComposer = readFileSync(new URL("../src/party/chat/ChatComposer.tsx", import.meta.url), "utf8");
const chatMessage = readFileSync(new URL("../src/party/chat/ChatMessage.tsx", import.meta.url), "utf8");
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

test("authentication and guest entry share a mobile brand header", () => {
  assert.match(loginPage, /<MobilePageHeader \/>/);
  assert.match(guestJoinPage, /<MobilePageHeader showHome \/>/);
  assert.match(guestJoinPage, /className="guestHomeLink" href="\/" aria-label="Home"/);
  assert.match(pageHeader, /className="mobilePageHeader"/);
  assert.match(pageHeader, /syncwatch-logo\.png/);
  assert.match(pageHeader, /className="mobilePageHome" href="\/" aria-label="Home"/);
  assert.doesNotMatch(pageHeader, /onJoin|onSubmit|fetch/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.guestHomeLink \{[\s\S]*?display: none/);
});

test("Home and entry-page compaction is mobile-only", () => {
  assert.match(app, /roomId && !hasWatchLayout \? "roomEntryShell"/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.loginShell,[\s\S]*?\.homeShell,[\s\S]*?\.roomEntryShell/);
  assert.match(styles, /\.homeShell > \.topBar,[\s\S]*?\.roomEntryShell > \.topBar/);
  assert.match(styles, /\.loginCard \{[\s\S]*?border: 0;[\s\S]*?background: transparent/);
});

test("mobile breakpoint reserves safe-area space for compact fixed navigation", () => {
  assert.match(styles, /@media \(max-width: 768px\)/);
  assert.match(styles, /\.mobileBottomNav\s*\{[\s\S]*?position: fixed/);
  assert.match(styles, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(styles, /--mobile-nav-height: 62px/);
});

test("mobile navigation and chat retain accessible names and panel relationships", () => {
  assert.match(bottomNav, /aria-pressed=\{activeTab === id\}/);
  assert.match(bottomNav, /aria-controls=\{controls\}/);
  assert.match(partyPanel, /aria-label="Participants"/);
  assert.match(partyPanel, /aria-label="Room chat"/);
  assert.match(partyPanel, /aria-label="Room call"/);
  assert.match(chatComposer, /aria-label="Room message"/);
  assert.match(chatComposer, /aria-describedby="room-chat-status room-chat-limit"/);
  assert.match(chatMessage, /aria-expanded=\{timestampVisible\}/);
  assert.match(chatMessage, /className="srOnly"/);
  assert.doesNotMatch(chatMessage, /aria-label=\{`\$\{timestampVisible \? "Hide" : "Show"\} message timestamp`\}/);
});

test("mobile touch targets and call controls remain reachable without remounting", () => {
  assert.match(styles, /\.mobileHeaderRoom button\s*\{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.match(styles, /\.newMessagesButton\s*\{[\s\S]*?min-height: 44px;/);
  assert.match(styles, /\.partyPanel\[data-mobile-tab="call"\] \.callTile\.local \.callControlsWrap[\s\S]*?pointer-events: auto;/);
  assert.match(styles, /\.partyPanel\[data-mobile-tab="call"\] \.callDeviceOptions button,[\s\S]*?min-height: 44px;/);
  assert.equal(count(app, /<CallProvider\b/g), 1);
});

test("mobile room menu establishes keyboard focus and arrow-key navigation", () => {
  assert.match(roomHeader, /menuButtonRef/);
  assert.match(roomHeader, /querySelector<HTMLButtonElement>\('\[role="menuitem"\]:not\(:disabled\)'\)/);
  assert.match(roomHeader, /"ArrowDown", "ArrowUp", "Home", "End"/);
  assert.match(roomHeader, /menuButtonRef\.current\?\.focus\(\)/);
});
