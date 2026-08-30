package xyz.projectdarkhope.syncwatch.google;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/google")
public class GoogleDriveOAuthController {
    private final GoogleDriveOAuthService googleOAuth;

    public GoogleDriveOAuthController(GoogleDriveOAuthService googleOAuth) {
        this.googleOAuth = googleOAuth;
    }

    @PostMapping("/code")
    public ResponseEntity<?> exchangeCode(
            @RequestBody GoogleAuthorizationCodeRequest codeRequest,
            @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
            HttpServletResponse response
    ) {
        if (!"XmlHttpRequest".equals(requestedWith)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid authorization request"));
        }
        try {
            GoogleDriveOAuthService.Credentials credentials = googleOAuth.exchangeAuthorizationCode(
                    codeRequest == null ? null : codeRequest.code(),
                    codeRequest == null ? null : codeRequest.redirectUri()
            );
            googleOAuth.setConnectionCookie(response, credentials.refreshToken());
            return ResponseEntity.ok(new GoogleConnectionResponse(
                    true, credentials.accessToken(), credentials.expiresAt()
            ));
        } catch (GoogleOAuthException error) {
            return ResponseEntity.badRequest().body(Map.of("error", error.getMessage()));
        }
    }

    @GetMapping("/connection")
    public GoogleConnectionResponse connection(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        try {
            GoogleDriveOAuthService.Credentials credentials = googleOAuth.refreshConnection(request);
            googleOAuth.setConnectionCookie(response, credentials.refreshToken());
            return new GoogleConnectionResponse(true, credentials.accessToken(), credentials.expiresAt());
        } catch (GoogleOAuthException error) {
            googleOAuth.clearConnectionCookie(response);
            return GoogleConnectionResponse.disconnected();
        }
    }

    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        googleOAuth.revoke(request);
        googleOAuth.clearConnectionCookie(response);
        return ResponseEntity.noContent().build();
    }
}
