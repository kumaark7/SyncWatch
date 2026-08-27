package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
public class AuthService {
    public static final String SESSION_AUTHENTICATED = "syncwatchAuthenticated";
    public static final String SESSION_USERNAME = "syncwatchUsername";
    public static final String SESSION_ROLE = "syncwatchRole";
    public static final String SESSION_GUEST_ROOM = "syncwatchGuestRoom";
    public static final String SESSION_DISPLAY_NAME = "syncwatchDisplayName";
    public static final String SESSION_CLIENT_ID = "syncwatchClientId";
    public static final String ROLE_ADMIN = "ADMIN";
    public static final String ROLE_GUEST = "GUEST";

    private final String configuredUsername;
    private final String configuredPassword;

    public AuthService(
            @Value("${SYNCWATCH_ADMIN_USERNAME:ADMIN}") String configuredUsername,
            @Value("${SYNCWATCH_ADMIN_PASSWORD:ADMIN}") String configuredPassword
    ) {
        this.configuredUsername = configuredUsername;
        this.configuredPassword = configuredPassword;
    }

    public boolean validCredentials(String username, String password) {
        return Objects.equals(configuredUsername, username)
                && Objects.equals(configuredPassword, password);
    }

    public String sessionUsername() {
        return configuredUsername;
    }

    public boolean isAuthenticated(jakarta.servlet.http.HttpSession session) {
        return session != null
                && Boolean.TRUE.equals(session.getAttribute(SESSION_AUTHENTICATED));
    }

    public boolean isAdmin(jakarta.servlet.http.HttpSession session) {
        if (!isAuthenticated(session)) {
            return false;
        }

        Object role = session.getAttribute(SESSION_ROLE);
        return role == null || ROLE_ADMIN.equals(role);
    }

    public boolean isGuestAllowedInRoom(jakarta.servlet.http.HttpSession session, String roomId) {
        if (!isAuthenticated(session) || !ROLE_GUEST.equals(session.getAttribute(SESSION_ROLE))) {
            return false;
        }

        Object allowedRoom = session.getAttribute(SESSION_GUEST_ROOM);
        return allowedRoom instanceof String value
                && roomId != null
                && value.equalsIgnoreCase(roomId.trim());
    }
}
