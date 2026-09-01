package xyz.projectdarkhope.syncwatch.google;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import xyz.projectdarkhope.syncwatch.auth.AuthService;

import java.util.Map;

@RestController
@RequestMapping("/api/google")
public class GoogleDriveOAuthController {
    private final GoogleDriveOAuthService googleOAuth;
    private final AuthService authService;

    public GoogleDriveOAuthController(
            GoogleDriveOAuthService googleOAuth,
            AuthService authService
    ) {
        this.googleOAuth = googleOAuth;
        this.authService = authService;
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
        String userId = currentUserId(request);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }
        try {
            GoogleDriveOAuthService.Credentials credentials = googleOAuth.exchangeAuthorizationCode(
                    userId,
                    codeRequest == null ? null : codeRequest.code(),
                    codeRequest == null ? null : codeRequest.redirectUri()
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
        String userId = currentUserId(request);
        if (userId == null) {
            return ResponseEntity.status(401).body(GoogleConnectionResponse.disconnected());
        }
        try {
            GoogleDriveOAuthService.Credentials credentials = googleOAuth.refreshConnection(userId);
            return ResponseEntity.ok(
                    new GoogleConnectionResponse(true, credentials.accessToken(), credentials.expiresAt())
            );
        } catch (GoogleOAuthException error) {
            return ResponseEntity.ok(GoogleConnectionResponse.disconnected());
        }
    }

    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect(HttpServletRequest request) {
        String userId = currentUserId(request);
        if (userId == null) {
            return ResponseEntity.status(401).build();
        }
        googleOAuth.disconnect(userId);
        return ResponseEntity.noContent().build();
    }

    private String currentUserId(HttpServletRequest request) {
        return authService.sessionUserId(request.getSession(false)).orElse(null);
    }
}
