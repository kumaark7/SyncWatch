package xyz.projectdarkhope.syncwatch.auth;

public record AuthSessionResponse(
        boolean authenticated,
        String username,
        String role,
        String allowedRoomId,
        String displayName,
        String clientId
) {}
