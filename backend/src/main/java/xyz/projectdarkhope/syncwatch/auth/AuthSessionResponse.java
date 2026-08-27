package xyz.projectdarkhope.syncwatch.auth;

public record AuthSessionResponse(
        boolean authenticated,
        String username
) {}
