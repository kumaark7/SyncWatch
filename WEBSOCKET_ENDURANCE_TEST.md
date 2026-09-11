# WebSocket Endurance Test

This is the current v1.0.0 manual reliability checklist. Use two browsers/participants on the same build. Record the commit/build, browser versions, operating systems, start/end UTC, and scenario locally. Keep test devices awake. Do not change heartbeat, reconnect, presence-grace, or proxy timeout settings during a baseline run.

## Current Baseline

- STOMP reconnect delay: 2,000 ms.
- Client incoming heartbeat: 10,000 ms.
- Client outgoing heartbeat: 10,000 ms.
- Spring simple-broker heartbeat: 10,000 ms in each direction.
- Unexpected-disconnect presence grace: 30 seconds by default.
- Authoritative room STATE: every five seconds while playing with a selected file.

## Capture

- Enable Console Preserve log and filter on `[SyncWatch STOMP]` in each browser.
- Use local labels A/B. Connection numbers are browser-local diagnostics, not participant IDs.
- Events include UTC timestamp, connection number, attempt, established time, monotonic uptime, visibility, online hint, reconnect delay, and negotiated heartbeat values.
- `transport-closed` records the close code, clean flag, and next attempt when active. The 2,000 ms delay does not include browser suspension, network recovery, or handshake time.
- Close reasons are allowlisted/redacted. Diagnostics do not record raw STOMP bodies, room IDs, names, cookies, tokens, or credentials.
- `heartbeat-lost` means the client detected missing server traffic; it does not by itself identify Nginx, Spring, browser throttling, or the network as the cause.

## Scenarios

1. **Foreground, 45-60 minutes:** keep the room visible and the movie playing. Send occasional chat messages and recorded seeks. Existing participants should not duplicate, leave/join, or change Host because of session revalidation.
2. **Background tab, 10-15 minutes:** background A while B observes, then return A to the foreground. Record visibility, clock recalibration, heartbeat, and close events. Returning should not reload media, reconnect STOMP solely for clock calibration, or emit playback controls.
3. **Short interruption, 2-3 seconds:** interrupt A's real network, then restore it. DevTools Offline may not close an established socket, so confirm whether transport closure actually occurred. Reconnection within grace should preserve participant identity, Host, LiveKit call, guest Drive state, and chat presence without SYSTEM_LEAVE/SYSTEM_JOIN.
4. **Medium interruption, 7-10 seconds:** repeat while B remains connected. This remains inside the 30-second grace once Spring detects disconnect; expect the same logical participant and no Host transfer or LiveKit removal.
5. **Grace-expiry interruption, more than 30 seconds after server detection:** keep A disconnected long enough for Spring's grace timer to expire. Expect exactly one departure. If A was Host, expect deterministic Host transfer; if the room becomes empty, expect room cleanup. A later connection is a genuine join.
6. **Playback and chat active:** include ordinary playback, explicit seeks including zero, and chat. Recovery must use authoritative revision ordering and must not publish a zero-time reset or duplicate PLAY/PAUSE/SEEK.
7. **Screen sharing and call:** share during part of the run. Verify sharing pauses the movie, occupies the player, and stopping leaves the movie paused. A short STOMP interruption must not remove the LiveKit participant while presence grace is active.
8. **Correlate logs:** compare browser UTC timestamps with Spring STOMP/presence logs and the same interval in Nginx logs. Check clock/timezone differences before correlating events.

## Server Evidence

For an existing systemd deployment, substitute the actual time window and configured log paths:

```sh
date -u
journalctl -u syncwatch.service --utc --since "YYYY-MM-DD HH:MM:SS" --until "YYYY-MM-DD HH:MM:SS" --no-pager
tail -n 200 /var/log/nginx/error.log
tail -n 200 /var/log/nginx/syncwatch-access.log
```

Do not share raw logs, HAR files, cookies, request headers, WebSocket frames, OAuth codes, or invite URLs. Sanitize addresses and identifiers. The safe SyncWatch access-log format omits query strings and Referer.

## Interpretation

- `effect-cleanup` before closure: investigate room/auth/unmount changes. React StrictMode may cause one development setup/cleanup cycle, not recurring production reconnects.
- `heartbeat-lost` before closure: correlate browser visibility, Spring traffic, and proxy/network evidence. It does not prove the failing component.
- `transport-error` or `stomp-error`: record ordering and the sanitized close code; do not copy raw error bodies.
- `transport-closed` alone: insufficient evidence to assign a cause.
- Presence grace starts when Spring detects STOMP disconnect, not when the device first loses connectivity.
- A reconnect inside 30 seconds should replace the obsolete STOMP session association. Grace expiry is intentionally a genuine departure.

Record scenario, participant label, UTC interval, attempt/uptime, visibility, close code, participant count, Host continuity, playback revision/time, recovery outcome, and matching sanitized server evidence. Do not declare a recurring production cause confirmed from a passing unit test or one unexplained close.
