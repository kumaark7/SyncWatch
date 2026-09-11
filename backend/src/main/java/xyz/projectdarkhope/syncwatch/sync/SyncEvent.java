package xyz.projectdarkhope.syncwatch.sync;

import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomParticipant;

import java.util.List;

public record SyncEvent(
        String type,
        double time,
        boolean playing,
        String fileName,
        boolean hasFile,
        long serverTime,
        long mediaVersion,
        long playbackRevision,
        String senderClientId,
        String hostClientId,
        Long seekId,
        List<RoomParticipant> participants,
        String screenSharerClientId,
        String screenSharerName,
        boolean guestScreenSharingAllowed
) {
    public static SyncEvent state(Room room) {
        synchronized (room) {
            return new SyncEvent(
                "STATE",
                room.getCurrentTime(),
                room.isPlaying(),
                room.getFileName(),
                room.hasFile(),
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                null,
                room.getHostClientId(),
                room.getSeekVersion(),
                null,
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
            );
        }
    }

    public static SyncEvent control(String type, Room room, String senderClientId) {
        synchronized (room) {
            return new SyncEvent(
                type,
                room.getCurrentTime(),
                room.isPlaying(),
                room.getFileName(),
                room.hasFile(),
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null,
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
            );
        }
    }

    public static SyncEvent fileSelected(Room room, String senderClientId) {
        synchronized (room) {
            return new SyncEvent(
                "FILE_SELECTED",
                0,
                false,
                room.getFileName(),
                room.hasFile(),
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null,
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
            );
        }
    }

    public static SyncEvent fileCleared(Room room, String senderClientId) {
        synchronized (room) {
            return new SyncEvent(
                "FILE_CLEARED",
                0,
                false,
                null,
                false,
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null,
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
            );
        }
    }

    public static SyncEvent participants(Room room) {
        return new SyncEvent(
                "PARTICIPANTS",
                0,
                false,
                null,
                room.hasFile(),
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                null,
                room.getHostClientId(),
                room.getSeekVersion(),
                room.getParticipants(),
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
        );
    }

    public static SyncEvent roomClosed(Room room, String senderClientId) {
        return new SyncEvent(
                "ROOM_CLOSED",
                room.getCurrentTime(),
                false,
                room.getFileName(),
                room.hasFile(),
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null,
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
        );
    }

    public static SyncEvent screenShare(Room room, String senderClientId) {
        return new SyncEvent(
                "SCREEN_SHARE",
                room.getCurrentTime(),
                room.isPlaying(),
                room.getFileName(),
                room.hasFile(),
                System.currentTimeMillis(),
                room.getMediaVersion(),
                room.getPlaybackRevision(),
                senderClientId,
                room.getHostClientId(),
                room.getSeekVersion(),
                null,
                room.getScreenSharerClientId(),
                room.getParticipantName(room.getScreenSharerClientId()),
                room.isGuestScreenSharingAllowed()
        );
    }

}
