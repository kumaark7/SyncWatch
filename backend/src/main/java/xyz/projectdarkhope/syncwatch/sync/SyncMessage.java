package xyz.projectdarkhope.syncwatch.sync;

public record SyncMessage(
        String type,
        double time,
        boolean playing,
        String clientId,
        String nameTag,
        Boolean clientSnapshotSupported
) {
    public SyncMessage(
            String type,
            double time,
            boolean playing,
            String clientId,
            String nameTag
    ) {
        this(type, time, playing, clientId, nameTag, null);
    }

    public boolean supportsClientSnapshot() {
        return Boolean.TRUE.equals(clientSnapshotSupported);
    }
}
