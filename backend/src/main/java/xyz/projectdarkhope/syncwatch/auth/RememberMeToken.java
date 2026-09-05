package xyz.projectdarkhope.syncwatch.auth;

import java.time.Instant;

public record RememberMeToken(
        String tokenHash,
        String userId,
        Instant expiresAt
) {}
