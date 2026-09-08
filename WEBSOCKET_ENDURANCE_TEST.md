# WebSocket Endurance Test

Use two browsers/participants on the same build. Record the commit/build, browser
versions, operating systems, test start/end UTC, and scenario locally. Keep machines
awake. Do not change server/proxy timeouts or the five-second presence grace.

## Capture

- Enable Console Preserve log and filter on "[SyncWatch STOMP]" on each browser.
  Use separate local labels A/B; connection numbers are browser-local, not shared IDs.
- Each event has UTC timestamp, connection number, attempt, establishedAt,
  monotonic uptimeMs, visibility, online hint, reconnectDelayMs, and the server's
  negotiated STOMP heartbeat values. Connecting resets establishedAt to null.
- transport-closed records code, clean, and nextAttempt when the client is active.
  Delay is the configured 2000 ms, not a guarantee: suspension/network/handshake
  time can delay the next connecting event.
- Close reason is an exact generic allowlist match, "not-provided", or "redacted".
  No raw server reason, STOMP error body, credentials, room IDs, or names are captured
  by these browser diagnostics. A 1006 close commonly supplies no reason.
- visibility-changed is event-driven. There is no diagnostic polling or per-heartbeat
  console spam. heartbeat-lost means the client detected missing server traffic;
  it does not prove which network/proxy/browser component caused it.

## Scenarios

1. **Foreground, 45-60 minutes:** keep the room visible and movie playing.
   Record any unsolicited reconnect and its timestamp. Expect no cleanup/recreation
   solely because of session revalidation. Send occasional chat messages and seek
   at recorded times; verify both clients converge without duplicate participants.
2. **Background tab, 10-15 minutes:** move A to a background tab while B observes.
   Return A to the foreground. Record visibility events, heartbeat-loss/close events,
   participant count and restored playback. Workers reduce timer throttling but
   do not prevent browser freezing, discarded tabs, device sleep, or network loss.
3. **Network interruption, 2-3 seconds:** interrupt A's real network, then restore.
   Browser DevTools Offline may not interrupt an existing WebSocket; verify the
   transport actually closes, or record "no transport close". If reconnection
   reaches Spring within grace, expect the same participant/Host and no leave/join.
4. **Network interruption, 7-10 seconds:** repeat with B remaining connected.
   Record when Spring detects disconnect, when grace expires, and when A reconnects.
   Grace starts at server disconnect detection, not when the network is disabled.
   This outage may not trigger a close before restoration. If grace does expire,
   one departure and subsequent join/Host transfer are current expected behavior;
   repeated notices or duplicate simultaneous participants are failures.
5. **Playback + chat active:** include several minutes of ordinary playback and
   chat in each applicable scenario. Confirm reconnect restores authoritative
   room state rather than publishing a zero-time playback reset.
6. **Screen sharing:** share during part of the foreground/background test.
   Verify the movie pauses for everyone, sharing occupies the player, and stopping
   leaves the movie paused. Record whether a STOMP drop also affected sharing/call
   media; do not assume the two separate transports failed together.
7. **Correlate logs:** compare browser UTC timestamp/establishedAt with Spring's
   STOMP timestamp and the same interval in existing Nginx logs. Check system clocks
   and Nginx timezone offsets first. Record the first error preceding each close.

For an existing systemd deployment, a read-only example (substitute actual unit,
time window, and configured log paths):

```sh
date -u
journalctl -u syncwatch.service --utc --since "YYYY-MM-DD HH:MM:SS" --until "YYYY-MM-DD HH:MM:SS" --no-pager
tail -n 200 /var/log/nginx/error.log
```

Inspect the applicable access log locally too. A 101 entry may be written only
when the upgraded connection ends; an ordinary access log may not identify why it
closed. Existing server/proxy logs may contain IPs, room IDs or other private data:
share only sanitized event/timestamp/code excerpts, not raw logs, HAR files,
cookies, headers, or WebSocket frames.

## Interpret and Record

- effect-cleanup before closure: investigate room/auth/unmount changes. React
  StrictMode may produce an initial setup/cleanup in development, not every few minutes.
- heartbeat-lost before closure: client heartbeat watchdog fired; correlate server
  traffic, visibility and server/proxy errors. Server-detected missing client
  heartbeats may close the socket without a browser heartbeat-lost event.
- transport-error / stomp-error: record their order and server close code; raw
  error bodies are intentionally excluded.
- transport-closed alone: insufficient to assign cause to Nginx or the browser.
- On each failure record scenario, A/B, UTC interval, attempt/uptime, visibility,
  close code/sanitized reason, notices/count, Host continuity, recovery result,
  and corresponding sanitized server evidence.

Do not declare the recurring production cause confirmed from a passing unit test
or one unexplained close. Preserve the evidence from both clients and server.
