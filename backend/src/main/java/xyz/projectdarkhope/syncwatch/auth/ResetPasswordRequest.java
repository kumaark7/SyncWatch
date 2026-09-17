package xyz.projectdarkhope.syncwatch.auth;

public record ResetPasswordRequest(
        String token,
        String password,
        String confirmPassword
) {}
