package xyz.projectdarkhope.syncwatch.auth;

public record LoginRequest(
        String identifier,
        String password
) {}
