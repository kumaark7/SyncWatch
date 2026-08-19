package xyz.projectdarkhope.syncwatch.room;

public record FileSelectionRequest(
        String fileId,
        String fileName,
        String accessToken,
        String clientId
) {}
