package xyz.projectdarkhope.syncwatch.google;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.Map;

@RestController
@RequestMapping("/api/google")
public class GoogleDriveOAuthController {
    private final GoogleDriveOAuthService googleOAuth;
    private final AuthService authService;
    private final RoomStore rooms;

    public GoogleDriveOAuthController(
            GoogleDriveOAuthService googleOAuth,
            AuthService authService,
            RoomStore rooms
    ) {
        this.googleOAuth = googleOAuth;
        this.authService = authService;
        this.rooms = rooms;
    }

    @PostMapping("/code")
    public ResponseEntity<?> exchangeCode(
            @RequestBody GoogleAuthorizationCodeRequest codeRequest,
            @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
            HttpServletRequest request
    ) {
        if (!"XmlHttpRequest".equals(requestedWith)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid authorization request"));
        }
        DrivePrincipal principal = currentPrincipal(request);
        if (principal == null) {
            return unauthorized(request);
        }
        try {
            String code = codeRequest == null ? null : codeRequest.code();
            String redirectUri = codeRequest == null ? null : codeRequest.redirectUri();
            GoogleDriveOAuthService.Credentials credentials = principal.temporary()
                    ? googleOAuth.exchangeTemporaryAuthorizationCode(
                            principal.ownerId(), code, redirectUri
                    )
                    : googleOAuth.exchangeAuthorizationCode(
                            principal.ownerId(), code, redirectUri
                    );
            return ResponseEntity.ok(new GoogleConnectionResponse(
                    true, credentials.accessToken(), credentials.expiresAt()
            ));
        } catch (GoogleOAuthException error) {
            return ResponseEntity.badRequest().body(Map.of("error", error.getMessage()));
        }
    }

    @GetMapping("/connection")
    public ResponseEntity<GoogleConnectionResponse> connection(HttpServletRequest request) {
        DrivePrincipal principal = currentPrincipal(request);
        if (principal == null) {
            return ResponseEntity.status(authService.isGuestAuthenticated(request.getSession(false))
                    ? 403 : 401).body(GoogleConnectionResponse.disconnected());
        }
        try {
            GoogleDriveOAuthService.Credentials credentials = googleOAuth.refreshConnection(
                    principal.ownerId()
            );
            return ResponseEntity.ok(
                    new GoogleConnectionResponse(true, credentials.accessToken(), credentials.expiresAt())
            );
        } catch (GoogleOAuthException error) {
            return ResponseEntity.ok(GoogleConnectionResponse.disconnected());
        }
    }

    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect(HttpServletRequest request) {
        DrivePrincipal principal = currentPrincipal(request);
        if (principal == null) {
            return ResponseEntity.status(authService.isGuestAuthenticated(request.getSession(false))
                    ? 403 : 401).build();
        }
        googleOAuth.disconnect(principal.ownerId());
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<?> unauthorized(HttpServletRequest request) {
        int status = authService.isGuestAuthenticated(request.getSession(false)) ? 403 : 401;
        return ResponseEntity.status(status).body(Map.of(
                "error",
                status == 403 ? "Only the current host can manage Google Drive" : "Authentication required"
        ));
    }

    private DrivePrincipal currentPrincipal(HttpServletRequest request) {
        var session = request.getSession(false);
        String userId = authService.sessionUserId(session).orElse(null);
        if (userId != null) {
            return new DrivePrincipal(userId, false);
        }
        if (!authService.isGuestAuthenticated(session)) {
            return null;
        }

        String roomId = (String) session.getAttribute(AuthService.SESSION_GUEST_ROOM);
        String clientId = (String) session.getAttribute(AuthService.SESSION_CLIENT_ID);
        String guestId = (String) session.getAttribute(AuthService.SESSION_GUEST_ID);
        Room room = rooms.find(roomId).orElse(null);
        return room != null && room.isHostOwnedBy(clientId, guestId)
                ? new DrivePrincipal(guestId, true)
                : null;
    }

    private record DrivePrincipal(String ownerId, boolean temporary) {}
}
