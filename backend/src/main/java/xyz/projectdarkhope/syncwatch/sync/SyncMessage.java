package xyz.projectdarkhope.syncwatch.sync;

public record SyncMessage(
        String type,
        double time,
        boolean playing,
        String clientId
) {}
