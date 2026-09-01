package xyz.projectdarkhope.syncwatch.auth;

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
}
