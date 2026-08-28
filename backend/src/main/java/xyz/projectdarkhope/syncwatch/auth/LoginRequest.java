package xyz.projectdarkhope.syncwatch.auth;

public record LoginRequest(
        String username,
        String password
) {}
