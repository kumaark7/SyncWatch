package xyz.projectdarkhope.syncwatch.room;

public record HostTransferRequest(
        String currentHostClientId,
        String targetClientId
) {}
