package xyz.projectdarkhope.syncwatch.auth;

import java.time.Instant;

public record PasswordResetToken(
        String tokenHash,
        String userId,
        Instant expiresAt,
        Instant createdAt
) {}
