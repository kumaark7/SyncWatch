package xyz.projectdarkhope.syncwatch.sync;

import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomParticipant;

import java.util.List;

public record SyncEvent(
        String type,
        double time,
        boolean playing,
        String fileName,
        long serverTime,
        String senderClientId,
        String hostClientId,
        Long seekId,
        List<RoomParticipant> participants
) {
    public static SyncEvent state(Room room) {
        return new SyncEvent(
                "STATE",
                room.getCurrentTime(),
                room.isPlaying(),
                room.getFileName(),
                System.currentTimeMillis(),
                null,
                room.getHostClientId(),
                room.getSeekVersion(),
                null
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
                room.getHostClientId(),
                room.getSeekVersion(),
                null
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
                room.getHostClientId(),
                room.getSeekVersion(),
                null
        );
    }

    public static SyncEvent fileCleared(Room room, String senderClientId) {
        return new SyncEvent(
                "FILE_CLEARED",
                0,
                false,
                null,
                System.currentTimeMillis(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null
        );
    }

    public static SyncEvent participants(Room room) {
        return new SyncEvent(
                "PARTICIPANTS",
                0,
                false,
                null,
                System.currentTimeMillis(),
                null,
                room.getHostClientId(),
                room.getSeekVersion(),
                room.getParticipants()
        );
    }

    public static SyncEvent roomClosed(Room room, String senderClientId) {
        return new SyncEvent(
                "ROOM_CLOSED",
                room.getCurrentTime(),
                false,
                room.getFileName(),
                System.currentTimeMillis(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null
        );
    }
}
