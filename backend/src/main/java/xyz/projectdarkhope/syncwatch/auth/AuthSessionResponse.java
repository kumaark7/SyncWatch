package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpSession;

public record AuthSessionResponse(
        boolean authenticated,
        String userId,
        String username,
        String email,
        String role,
        String allowedRoomId,
        String displayName,
        String clientId
) {
    public static AuthSessionResponse signedOut() {
        return new AuthSessionResponse(false, null, null, null, null, null, null, null);
    }

    public static AuthSessionResponse authenticated(UserAccount user) {
        return new AuthSessionResponse(
                true,
                user.id(),
                user.username(),
                user.email(),
                AuthService.ROLE_USER,
                null,
                null,
                null
        );
    }

    public static AuthSessionResponse guest(HttpSession session) {
        return new AuthSessionResponse(
                true,
                null,
                null,
                null,
                AuthService.ROLE_GUEST,
                (String) session.getAttribute(AuthService.SESSION_GUEST_ROOM),
                (String) session.getAttribute(AuthService.SESSION_DISPLAY_NAME),
                (String) session.getAttribute(AuthService.SESSION_CLIENT_ID)
        );
    }
}
