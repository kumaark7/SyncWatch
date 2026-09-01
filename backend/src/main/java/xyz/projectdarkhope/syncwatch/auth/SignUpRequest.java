package xyz.projectdarkhope.syncwatch.auth;

public record SignUpRequest(
        String username,
        String email,
        String password,
        String confirmPassword
) {}
