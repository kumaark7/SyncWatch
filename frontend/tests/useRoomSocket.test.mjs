import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Schedule delayed transport callbacks across effect cleanup without a browser.
const source = ts.transpileModule(
  readFileSync(new URL("../src/useRoomSocket.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;

function harness() {
  const slots = [], clients = [], logs = [];
  const storage = new Map();
  let monotonicTime = 12345;
  const listeners = new Map();
  const browserDocument = {
    visibilityState: "visible",
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event, callback) => {
      if (listeners.get(event) === callback) listeners.delete(event);
    }
  };
  let cursor = 0, pending = [];
  const same = (a, b) => a && b && a.length === b.length
    && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
      }];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) pending.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    }
  };
  class Client {
    active = true;
    connected = false;
    subscriptions = [];
    published = [];
    deactivations = 0;
    constructor(config) { Object.assign(this, config); clients.push(this); }
    activate() {}
    deactivate() { this.deactivations++; return Promise.resolve(); }
    subscribe(destination, callback) { this.subscriptions.push({ destination, callback }); }
    publish(frame) { this.published.push(frame); }
    connect() {
      this.connected = true;
      this.subscriptions = [];
      this.onConnect({ headers: { "heart-beat": "10000,10000" } });
    }
    close() {
      this.connected = false;
      this.onWebSocketClose({ code: 1006, wasClean: false });
    }
  }
  const exports = {};
  runInNewContext(source, {
    exports,
    require: name => {
      if (name === "react") return react;
      if (name === "@stomp/stompjs") return { Client, TickerStrategy: { Worker: "worker" } };
      if (name === "./api") return { API_URL: "http://localhost:8080" };
      throw new Error(name);
    },
    sessionStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    document: browserDocument,
    performance: { now: () => monotonicTime },
    navigator: { onLine: true },
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) }
  });
  return {
    clients, logs, listeners, browserDocument,
    advanceTime(milliseconds) { monotonicTime += milliseconds; },
    render(room = "ROOM", name = "Name", acceptEvent) {
      cursor = 0;
      const result = exports.useRoomSocket(room, name, "stable-client", acceptEvent);
      const effects = pending;
      pending = [];
      effects.forEach(effect => effect());
      return result;
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); }
  };
}

test("no room has no connection; ordinary rerenders keep a single client", () => {
  const h = harness();
  h.render("");
  assert.equal(h.clients.length, 0);
  h.render();
  h.clients[0].connect();
  assert.equal(h.render().connected, true);
  h.render();
  assert.equal(h.clients.length, 1);
  assert.equal(h.clients[0].deactivations, 0);
});

test("transient reconnect re-subscribes and JOINs with the same identity", () => {
  const h = harness();
  h.render();
  const client = h.clients[0];
  client.connect();
  assert.equal(h.render().connectionVersion, 1);
  assert.equal(h.render().connectedRoomId, "ROOM");
  assert.equal(
    h.render().connectedConnectionGeneration,
    h.render().requestedConnectionGeneration
  );
  client.subscriptions[0].callback({ body: JSON.stringify({
    type: "STATE", time: 150, playing: true
  }) });
  client.close();
  assert.equal(h.render().connected, false);
  assert.equal(h.render().lastEvent.time, 150);
  client.connect();
  assert.equal(h.render().connectionVersion, 2);
  assert.equal(h.render().connectedRoomId, "ROOM");
  assert.equal(client.subscriptions.length, 2);
  assert.equal(client.published.length, 2);
  assert.equal(h.render().lastEvent.time, 150);
  for (const frame of client.published) {
    assert.equal(JSON.parse(frame.body).type, "JOIN");
    assert.equal(JSON.parse(frame.body).clientId, "stable-client");
    assert.equal(JSON.parse(frame.body).clientSnapshotSupported, true);
  }
  client.subscriptions[0].callback({ body: JSON.stringify({
    type: "PARTICIPANTS", participants: [{ clientId: "stable-client" }]
  }) });
  assert.equal(h.render().chatReady, true);
});

test("leaving and re-entering the same room waits for the replacement socket", () => {
  const h = harness();
  h.render();
  h.clients[0].connect();
  const firstConnection = h.render();
  assert.equal(firstConnection.connected, true);
  assert.equal(
    firstConnection.connectedConnectionGeneration,
    firstConnection.requestedConnectionGeneration
  );

  h.render("");
  const reentered = h.render("ROOM");
  assert.equal(reentered.connected, false);
  assert.equal(reentered.connectedRoomId, "ROOM");
  assert.notEqual(
    reentered.connectedConnectionGeneration,
    reentered.requestedConnectionGeneration
  );

  h.clients[1].connect();
  const replacement = h.render();
  assert.equal(replacement.connected, true);
  assert.equal(
    replacement.connectedConnectionGeneration,
    replacement.requestedConnectionGeneration
  );
});

test("socket receipt can reject a stale playback envelope before React applies it", () => {
  const h = harness();
  const accepted = [];
  const acceptEvent = event => {
    accepted.push(event.playbackRevision);
    return event.playbackRevision >= 10;
  };
  h.render("ROOM", "Name", acceptEvent);
  const client = h.clients[0];
  client.connect();

  client.subscriptions[0].callback({ body: JSON.stringify({
    type: "STATE", playbackRevision: 9
  }) });
  assert.equal(h.render("ROOM", "Name", acceptEvent).lastEvent, null);

  client.subscriptions[0].callback({ body: JSON.stringify({
    type: "PLAY", playbackRevision: 10
  }) });
  assert.equal(h.render("ROOM", "Name", acceptEvent).lastEvent.playbackRevision, 10);
  assert.deepEqual(accepted, [9, 10]);
});

test("a replaced client's delayed close cannot disconnect its replacement", () => {
  const h = harness();
  h.render();
  const old = h.clients[0];
  old.connect();
  h.render("NEXT");
  h.clients[1].connect();
  old.close();
  assert.equal(h.render("NEXT").connected, true);
  assert.equal(old.deactivations, 1);
});

test("late callbacks after cleanup cannot JOIN or overwrite state", () => {
  const h = harness();
  h.render();
  const old = h.clients[0];
  old.connect();
  const staleMessage = old.subscriptions[0].callback;
  h.render("NEXT");
  h.clients[1].connect();
  old.connect();
  staleMessage({ body: JSON.stringify({ type: "STATE", time: 0 }) });
  assert.equal(old.published.length, 1);
  assert.equal(h.render("NEXT").lastEvent, null);
});

test("leaving clears connected state before the transport close arrives", () => {
  const h = harness();
  h.render();
  h.clients[0].connect();
  h.render("");
  assert.equal(h.render("").connected, false);
});

test("heartbeat diagnostics record lifecycle without exposing frame contents", () => {
  const h = harness();
  h.render();
  const client = h.clients[0];
  assert.equal(client.heartbeatStrategy, "worker");
  assert.equal(client.heartbeatIncoming, 10000);
  assert.equal(client.heartbeatOutgoing, 10000);
  assert.equal(client.reconnectDelay, 2000);
  client.beforeConnect();
  client.connect();
  client.onHeartbeatLost();
  client.onStompError({ body: "private-data", headers: { message: "private-data" } });
  client.onWebSocketClose({ code: 1006, wasClean: false, reason: "private-data" });
  assert.ok(h.logs.some(([, log]) => log.event === "heartbeat-lost"));
  assert.ok(h.logs.some(([, log]) => log.event === "transport-closed" && log.code === 1006));
  const output = JSON.stringify(h.logs);
  for (const sensitive of ["private-data", "stable-client", "ROOM", "Name"]) {
    assert.equal(output.includes(sensitive), false);
  }
});

test("timestamps, heartbeat values, reconnect attempts and reasons are bounded diagnostics", () => {
  const h = harness();
  h.render();
  const client = h.clients[0];
  client.beforeConnect();
  client.connect();
  const connected = h.logs.at(-1)[1];
  assert.equal(connected.attempt, 1);
  assert.equal(new Date(connected.timestamp).toISOString(), connected.timestamp);
  assert.equal(new Date(connected.establishedAt).toISOString(), connected.establishedAt);
  assert.equal(connected.uptimeMs, 0);
  assert.equal(connected.serverOutgoingMs, 10000);
  assert.equal(connected.serverIncomingMs, 10000);
  assert.equal(connected.reconnectDelayMs, 2000);
  h.advanceTime(2500);
  client.onHeartbeatLost();
  assert.equal(h.logs.at(-1)[1].uptimeMs, 2500);
  for (const [reason, expected] of [
    ["", "not-provided"],
    ["Heartbeat timeout", "Heartbeat timeout"],
    ["Heartbeat timeout: secret", "redacted"],
    ["user=private-data", "redacted"]
  ]) {
    client.onWebSocketClose({ code: 1006, wasClean: false, reason });
    assert.equal(h.logs.at(-1)[1].reason, expected);
    assert.equal(h.logs.at(-1)[1].nextAttempt, 2);
  }
  client.beforeConnect();
  assert.equal(h.logs.at(-1)[1].attempt, 2);
  assert.equal(h.logs.at(-1)[1].establishedAt, null);
});

test("visibility changes log without recreating the socket; cleanup removes listener", () => {
  const h = harness();
  h.render();
  h.browserDocument.visibilityState = "hidden";
  h.listeners.get("visibilitychange")();
  assert.equal(h.logs.at(-1)[1].visibility, "hidden");
  assert.equal(h.logs.at(-1)[1].event, "visibility-changed");
  assert.equal(h.clients.length, 1);
  h.unmount();
  assert.equal(h.listeners.size, 0);
});
