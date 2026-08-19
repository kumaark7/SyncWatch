package xyz.projectdarkhope.syncwatch.sync;

import xyz.projectdarkhope.syncwatch.room.Room;

public record SyncEvent(
        String type,
        double time,
        boolean playing,
        String fileName,
        long serverTime,
        String senderClientId,
        String hostClientId
) {
    public static SyncEvent state(Room room) {
        return new SyncEvent(
                "STATE",
                room.getCurrentTime(),
                room.isPlaying(),
                room.getFileName(),
                System.currentTimeMillis(),
                null,
                room.getHostClientId()
        );
    }

    public static SyncEvent control(String type, Room room, String senderClientId) {
        return new SyncEvent(
                type,
                room.getCurrentTime(),
                room.isPlaying(),
                room.getFileName(),
                System.currentTimeMillis(),
                senderClientId,
                room.getHostClientId()
        );
    }

    public static SyncEvent fileSelected(Room room, String senderClientId) {
        return new SyncEvent(
                "FILE_SELECTED",
                0,
                false,
                room.getFileName(),
                System.currentTimeMillis(),
                senderClientId,
                room.getHostClientId()
        );
    }
}
