package xyz.projectdarkhope.syncwatch.auth;

public record GuestLoginRequest(
        String roomId,
        String displayName
) {}
