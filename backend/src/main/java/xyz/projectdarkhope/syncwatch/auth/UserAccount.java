package xyz.projectdarkhope.syncwatch.auth;

import java.time.Instant;

public record UserAccount(
        String id,
        String username,
        String email,
        String passwordHash,
        Instant createdAt
) {}
