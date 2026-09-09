# SyncWatch v0.9 Security Review

Date: 2026-09-09. Scope: current `v0.9-reliability` source, focused regression tests, and the documented production LiveKit screen-share authorization integration test.
Production configuration outside that targeted LiveKit test was not inspected. This is not a security certification.

## A. Confirmed Security Issues Fixed

### High (CLOSED / RESOLVED): LiveKit screen-share policy was enforced only by the application client/API

Call JWTs granted `screen_share` and `screen_share_audio` to every participant. A modified client could bypass the SyncWatch lease and Host-controlled guest policy by publishing directly to LiveKit.

Fix: join JWTs now grant only camera and microphone sources. After the authenticated `/screen-share/start` lease succeeds, the backend uses LiveKit `UpdateParticipant` to grant screen sources only to that participant. Stop/block/Host-transfer paths revoke those sources while retaining camera, microphone, subscription and data permissions; LiveKit removes tracks whose sources are no longer permitted. Signed `participant_joined` and screen `track_published` webhooks reconcile stale-token reconnects and modified-client attempts. Departed participants and closed rooms are removed from LiveKit on a best-effort basis.

Tests: token source assertions, grant/revoke permission assertions, active revocation, re-enable, registered/guest behavior, reconnect reconciliation, modified-client publication, Host transfer, signed webhook verification, spoofed identity and cross-room token tests.

Production integration verification: LiveKit join JWTs contained only `CAMERA` and `MICROPHONE` by default; signed webhooks reached `/api/livekit/webhook` and returned 200; and `RoomService.UpdateParticipant` successfully added `SCREEN_SHARE` and `SCREEN_SHARE_AUDIO` only during an authorized share. Revoking permission while a share was active caused LiveKit to unpublish the screen-share track immediately, and granting permission again allowed sharing to resume. A direct LiveKit client using a blocked guest's otherwise valid token called `setScreenShareEnabled(true)` without using SyncWatch's `/screen-share/start` authorization and LiveKit rejected it with `PublishTrackError: failed to publish track, insufficient permissions`. This verifies that the Host policy is enforced by LiveKit rather than only by the SyncWatch UI/API.

### High: registered clients could inject broker events

`WebSocketAuthInterceptor.preSend` previously returned immediately for registered users, permitting arbitrary broker destinations. A modified registered client could publish forged chat/room events to `/topic/...`, bypassing the authenticated application controllers, or subscribe with broker wildcards.

Fix: explicitly allow only client STOMP commands and exact application SEND/topic SUBSCRIBE patterns. Direct broker publication, server-only `MESSAGE` frames, and wildcard subscriptions are rejected. Guest destinations remain restricted to the room recorded in the guest session. Playback handlers and their authorization are unchanged.

Tests: `WebSocketAuthInterceptorTest.registeredUsersCannotPublishForgedBrokerEventsOrSubscribeWildcards`, `guestSubscriptionsCannotCrossRoomsAndChatIsBounded`, and a real embedded-server STOMP handshake/injection test in `HttpSecurityIntegrationTest`.

### High: copied WebSocket authentication survived logout/expiry

The handshake copied authentication attributes without retaining a live session validity check. A client keeping its socket open could continue sending authorized-looking frames after its HTTP session was invalidated. Passive subscriptions could continue receiving traffic.

Fix: `AuthenticatedHandshakeInterceptor` retains the server-side session reference. Inbound frames validate that session and the original owner; outbound room traffic is also checked, including passive sockets. DISCONNECT remains available for cleanup. The normal frontend cleanup, heartbeat values, reconnect policy, and five-second presence grace remain unchanged. Already-authorized in-flight messages cannot be recalled.

Tests: handshake/session-reference test; invalidated-session SEND/heartbeat rejection; passive outbound suppression in `WebSocketAuthInterceptorTest`; existing reconnect lifecycle tests.

### Medium: concurrent Remember Me restoration reused one token

Two requests could both read the same valid hashed token, delete it without checking whether deletion won, and each create a replacement session/token. Concurrent replay could bypass intended single-use rotation.

Fix: `RememberMeTokenRepository.consume` performs conditional deletion of an unexpired token and requires exactly one affected row before issuing a replacement. No schema change. A losing concurrent response does not overwrite the winning response's cookie.

Tests: `RememberMeServiceTest.concurrentRestoresConsumeOneTokenExactlyOnce` uses a barrier to force both requests to read the same token before consumption, and asserts one success and one replacement row. Frontend session reads share an in-flight request and use Web Locks where available to serialize restoration across tabs. Tests cover coalescing, fresh subsequent checks and lock use; browsers without Web Locks retain same-page coordination only.

### Medium: in-flight Drive refresh could restore discarded credentials

A refresh could read credentials, wait for Google, then save them after disconnect or guest departure had deleted them. Guest credentials could return to memory after departure; registered credentials could be reinserted after local disconnect.

Fix: refresh now conditionally replaces the exact encrypted credential it originally read. Deletion or replacement wins over stale work. Fixed lock stripes preserve serialization without indefinitely retaining one lock per owner. Guest session destruction also discards temporary credentials. OAuth controller responses recheck ownership after slow exchange/refresh; late guest exchanges that lose authorization discard temporary credentials instead of returning tokens.

Tests: repository conditional-write/deletion/owner-isolation regression, mocked in-flight guest refresh/departure, guest departure during code exchange, and session-destruction cleanup. Existing host-transfer/Drive ownership tests remain passing.

### Low: login timing revealed missing accounts

Unknown identifiers skipped BCrypt while known identifiers with incorrect passwords performed BCrypt. Responses already used the same generic login error, but computation differed substantially. Signup intentionally retains useful duplicate-account validation, so enumeration is not eliminated globally.

Fix: missing-account login verifies against a per-service dummy BCrypt hash using the same configured encoder. Oversized passwords are rejected without triggering BCrypt length exceptions; identifier input is bounded before database lookup. This reduces the obvious timing difference, not a constant-time guarantee across the whole HTTP/database stack.

Test: `AuthServiceTest.unknownAndKnownUsersBothPerformPasswordVerificationWithSameError` verifies both paths perform password verification and return the same unauthorized error.

## B. Defense-in-Depth Improvements

- `RequestSecurityFilter` requires the exact configured Origin and `X-Requested-With: XmlHttpRequest` for HTTP mutations, including login/signup/guest/logout. WebSocket handshakes require that Origin. API responses carrying identity/tokens are `no-store`; responses have `nosniff`. Existing Spring CORS already rejected foreign origins, so absence of a traditional CSRF token alone is NOT classified as a demonstrated CSRF exploit.
- The shared frontend request helper preserves request method/body/headers and includes cookies and the custom header. No POST/DELETE retry or UI change was added. Trusted CORS preflights remain available.
- Single-instance synchronized, bounded in-memory rate windows use server-derived account/guest identity or container-reported peer address. Caller-supplied forwarding headers are ignored. Expired entries are cleaned on requests, not by polling. Each limiter holds at most 10,000 buckets.
- LiveKit join JWT lifetime is reduced from one hour to ten minutes. Join grants contain camera/microphone only; screen-source permissions are temporary server-side participant permissions tied to the active room lease.
- A socket cannot register multiple client identities in the same room. Name/client-ID lengths are bounded. Existing stable-ID reconnect and multi-tab behavior remain supported.
- Google upstream error descriptions are replaced with generic errors. Room invitation codes were removed from application presence/chat diagnostics; no bodies or credentials are added to logs.
- Environment-file variants and H2 database artifacts are ignored regardless of directory/name. A placeholder `.env.example` may still be tracked intentionally.

### Rate budgets

| Operation | Budget | Key |
| --- | --- | --- |
| Login | 30 / 5 minutes | Peer address |
| Signup | 10 / hour | Peer address |
| Guest auth/invite lookup | 60 / 5 minutes | Peer address |
| Session check/Remember Me restore | 60 / minute | Owner, otherwise address |
| Google OAuth/connection operations | 30 / minute | Owner, otherwise address |
| WebSocket handshake | 30 / minute | Owner, otherwise address |
| LiveKit token | 20 / minute | Owner, otherwise address |
| Create Room | 10 / 10 minutes | Owner, otherwise address |
| Other room HTTP mutations | 90 / minute | Owner, otherwise address |
| Room HTTP reads | 120 / minute | Owner, otherwise address |
| STOMP chat/call notices | 30 / minute | Owner |
| STOMP room controls, including JOIN | 600 / minute | Owner |
| STOMP subscriptions | 120 / minute | Owner |

HTTP limits return 429 and a conservative `Retry-After`. Excess STOMP sends are dropped rather than disconnecting otherwise valid playback; excess subscriptions are rejected. Streaming GET/HEAD Range requests and CORS OPTIONS are not rate limited. Fixed windows permit boundary bursts; these limits are not a DDoS defense or distributed quota system.

## C. Reviewed and Already Safe Within the Checked Boundaries

- Registered users have server-generated account IDs and BCrypt cost-12 password hashes. JDBC values are parameterized; the repository's dynamic column names are internal constants, not user inputs. Login errors are generic; duplicate signup errors deliberately remain helpful. There is no password-reset endpoint.
- Login, signup, guest authentication, and remembered restoration already invalidate/recreate an existing session. Added tests verify new session IDs and removal of old identity attributes. Logout invalidates the HTTP session and removes the current Remember Me token/cookie.
- Remember Me secrets are 32 random bytes; only SHA-256 hashes are stored in H2. Cookies contain opaque tokens, not user records. Remember Me cookies are HttpOnly, SameSite=Lax, Path=/, with a 30-day max-age. The session cookie is HttpOnly, SameSite=Lax, with the existing 30-minute server timeout. Secure is deployment-configured, NOT automatically guaranteed by source defaults.
- HTTP CORS and STOMP origins use one configured frontend origin, not a credentialed wildcard.
- Guest room scope comes from the session, not a caller's URL/client ID. Guests cannot create rooms or use another room's APIs. Host-only file/transfer/share-permission operations verify participant ownership and authoritative Host state. Close Room remains registered-Host-only under the existing policy; no guest permission expansion was made.
- LiveKit token issuance checks actual membership and that the requester owns the participant. Tokens specify one LiveKit room and one identity, without room-admin/create/list grants. Tests cover spoofed identities and cross-room/guest access. Screen-source grants are reconciled through authenticated room actions and signed LiveKit webhooks.
- Registered Drive credentials are keyed by authenticated user ID. Promoted guest Hosts use a separate memory-only store under server-generated guest IDs. Host transfer does not transfer token ownership. Stored refresh tokens are never returned to the browser. The short-lived access token returned to the owner is necessary for Google Picker and stays in frontend memory.
- Drive refresh encryption remains AES-GCM with a random 12-byte nonce and 128-bit authentication tag. Tests verify different ciphertexts for repeated encryption, tamper rejection, wrong-key rejection, and owner isolation. No encryption format/schema migration was introduced.
- Google uses the GIS popup code model, not redirect mode. Header/origin validation is the applicable CSRF mechanism; no missing redirect `state` vulnerability is asserted. See [Google's code-model guidance](https://developers.google.com/identity/oauth2/web/guides/use-code-model).
- Tracked source/config/documentation and common credential signatures were checked without reading ignored environment files or printing secrets. No real hardcoded credential was identified in that scan. This does not prove that all historical commits or deployment files are secret-free.

## D. Remaining Risks / Manual Review

### LiveKit operational dependency

Self-hosted LiveKit does not centrally revoke previously issued JWTs when participant permissions change. SyncWatch therefore starts every join token without screen sources and uses signed `participant_joined` and `track_published` webhooks to reconcile reconnects and unauthorized publications. Production integration testing verified signed webhook delivery, source-specific permission updates, immediate active-track revocation, re-enable behavior, and rejection of a direct blocked-client publication attempt. The previous High severity bypass is closed.

Residual operational risk remains if the LiveKit webhook or RoomService configuration is removed, credentials drift, webhook delivery becomes unavailable, or a future LiveKit upgrade changes permission behavior. Monitor failed webhook/permission operations and repeat the direct-client authorization test after LiveKit or deployment configuration changes. The production test covered the deployed screen-share path; it is not a general certification of LiveKit or SyncWatch security. See [LiveKit token lifecycle](https://docs.livekit.io/frontends/reference/tokens-grants/) and [RoomService permissions](https://docs.livekit.io/reference/other/roomservice-api/).

### Production checks required

1. Verify HTTPS, HTTP-to-HTTPS redirects, TLS, and `SYNCWATCH_COOKIE_SECURE=true` on the actual service. In browser storage/network tools, check Secure/HttpOnly/SameSite/Path for both cookies and logout deletion. Local defaults remain suitable for HTTP development.
2. Verify `SYNCWATCH_FRONTEND_ORIGIN` is the exact public origin without trailing slash/path. Deploy frontend/backend changes together: older bundles lack the new header on some mutations and will receive 403.
3. Verify Nginx forwards Origin and the custom header and handles credentialed OPTIONS. No Nginx files were changed. Non-browser API tooling must explicitly send the trusted Origin/custom header; neither header replaces authentication.
4. Verify trusted proxy/client-address handling. The limiter intentionally does not parse X-Forwarded-For. If Tomcat sees only the loopback proxy address, anonymous login/signup limits are shared across visitors. Do not fix this by trusting arbitrary internet-supplied headers; configure trust only for the actual proxy and keep port 8080 private. Shared NATs still share anonymous budgets.
5. Check H2/backup filesystem permissions and the configured absolute database path. Default local H2 credentials are not a production filesystem-security boundary. No network H2 console/server is configured by this source; verify none is enabled externally.
6. Google token encryption derives its key from the backend Google client secret. Rotating that secret makes existing encrypted tokens unreadable; plan reconnect or an explicit key migration. Backups containing the database plus that secret can decrypt the stored connections. This review did not rotate secrets or redesign key management.
7. Restrict the browser Google API key and OAuth origins in Google Cloud Console. Run real popup/Picker, account-switch, guest promotion/departure, concurrent disconnect, and long-session refresh tests. Automated tests did not exercise real Google authorization. LiveKit screen-share authorization was production integration-tested as recorded above; repeat it after LiveKit server or permission-configuration changes.
8. Room IDs intentionally act as invitation capabilities. A registered user knowing a code can join/read that room; there is no private ACL or approval system. Wildcard subscriptions are now rejected, and guest sessions are room-scoped. Distributed guessing, persistent connection/room quotas, signup abuse and large request bodies remain operational/resource risks beyond these lightweight limits.
9. Review production access logs and HTTP/STOMP wire-debug logging: reverse-proxy paths/query strings may contain invitation codes. Do not log bodies, cookies, authorization headers or OAuth credentials. Historical Git secret scanning and dependency vulnerability auditing were not completed by this targeted source review.
10. Repeat two-person foreground/background/reconnect endurance testing after the live-session guards. The existing scheduler-selection startup notice and build warnings were not changed as unrelated cleanup. Existing five-second reconnect grace and movie algorithms are unchanged.

## E. Files Changed

Backend production paths below are relative to `backend/src/main/java/xyz/projectdarkhope/syncwatch/`:

- `auth/AuthenticatedHandshakeInterceptor.java` (new)
- `auth/AuthService.java`
- `auth/GuestSessionCleanup.java` (new)
- `auth/RememberMeService.java`
- `auth/RememberMeTokenRepository.java`
- `auth/RequestRateLimiter.java` (new)
- `auth/RequestRateLimitFilter.java` (new)
- `auth/RequestSecurityFilter.java` (new)
- `auth/WebSocketAuthInterceptor.java`
- `call/LiveKitAdminException.java` (new)
- `call/LiveKitIdentity.java` (new)
- `call/LiveKitRoomAdminClient.java` (new)
- `call/LiveKitScreenShareAuthorizer.java` (new)
- `call/LiveKitTokenService.java`
- `call/LiveKitWebhookController.java` (new)
- `call/LiveKitWebhookVerifier.java` (new)
- `chat/ChatController.java` (logging only)
- `config/WebSocketConfig.java`
- `google/GoogleDriveConnectionRepository.java`
- `google/GoogleDriveOAuthController.java`
- `google/GoogleDriveOAuthService.java`
- `room/Room.java` (identity registration validation only)
- `room/RoomController.java`
- `room/ScreenShareController.java`
- `sync/RoomPresenceService.java`

Backend test paths below are relative to `backend/src/test/java/xyz/projectdarkhope/syncwatch/`:

- `auth/AuthenticatedHandshakeInterceptorTest.java` (new)
- `auth/AuthFilterTest.java`
- `auth/AuthControllerTest.java`
- `auth/AuthServiceTest.java`
- `auth/GuestAuthControllerTest.java`
- `auth/HttpSecurityIntegrationTest.java` (new)
- `auth/RememberMeServiceTest.java`
- `auth/RequestRateLimiterTest.java` (new)
- `auth/RequestSecurityFilterTest.java` (new)
- `auth/WebSocketAuthInterceptorTest.java`
- `call/LiveKitTokenServiceTest.java`
- `call/LiveKitScreenShareAuthorizerTest.java` (new)
- `call/LiveKitWebhookControllerTest.java` (new)
- `call/LiveKitWebhookVerifierTest.java` (new)
- `google/GoogleDriveConnectionRepositoryTest.java`
- `google/GoogleDriveOAuthControllerTest.java`
- `google/GoogleDriveTokenSecurityTest.java` (new)
- `room/RoomIdentitySecurityTest.java` (new)
- `room/RoomControllerTest.java`
- `room/ScreenShareControllerTest.java`
- `sync/RoomPresenceServiceTest.java`
- `sync/SyncControllerGuestTest.java`

Other files:

- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/auth/authApi.ts`
- `frontend/src/auth/browserRequest.ts` (new)
- `frontend/tests/browserRequest.test.mjs` (new)
- `frontend/tests/authSession.test.mjs` (new)
- `.gitignore`
- `SECURITY_REVIEW.md` (new)

No application UI, playback algorithms, Range proxy, database schema, dependency versions, Nginx, or production environment files were changed.

## F. Validation Results

- Backend: 104 tests passing, zero failures/errors/skips, including LiveKit permission/webhook tests and real local HTTP filters and STOMP negotiation/injection rejection.
- Frontend: 11 tests passing, including session-read coordination, the new request-header/body/no-retry regression and existing reconnect tests.
- Frontend production build: passing (`tsc -b` and Vite). Existing Lucide directive/chunk-size warnings remain.
- `git diff --check`: passing.
- Production LiveKit integration: signed webhook delivery returned 200; `RoomService.UpdateParticipant` grant/revoke succeeded; active screen sharing was immediately unpublished on revoke; re-enable succeeded; and a blocked direct-client publication attempt failed with `PublishTrackError: failed to publish track, insufficient permissions` without invoking `/screen-share/start`.
- Runtime used for backend validation: local JDK 25, compiling to the project's Java 21 target. A JDK 21 production run remains a deployment acceptance check.
- Windows JDK loopback creation initially failed. Validation succeeded using a workspace-local socket path, without modifying application/build configuration:

```powershell
# From backend/
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=target'
mvn test
```

No commits, pushes, tags, or deployments were performed.
