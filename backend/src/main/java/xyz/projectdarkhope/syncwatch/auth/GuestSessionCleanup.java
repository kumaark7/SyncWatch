package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;
import org.springframework.stereotype.Component;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;

@Component
public class GuestSessionCleanup implements HttpSessionListener {
    private final GoogleDriveOAuthService googleOAuth;

    public GuestSessionCleanup(GoogleDriveOAuthService googleOAuth) { this.googleOAuth = googleOAuth; }

    @Override
    public void sessionDestroyed(HttpSessionEvent event) {
        if (event.getSession().getAttribute(AuthService.SESSION_GUEST_ID) instanceof String guestId) {
            googleOAuth.forgetTemporaryConnection(guestId);
        }
    }
}
