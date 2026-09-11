package xyz.projectdarkhope.syncwatch.room;

public record RoomResponse(
        String roomId,
        String roomName,
        String fileName,
        boolean hasFile,
        boolean playing,
        double currentTime,
        long serverTime,
        long seekId,
        long mediaVersion,
        long playbackRevision,
        boolean hostAssigned,
        boolean isHost,
        String screenSharerClientId,
        String screenSharerName,
        boolean guestScreenSharingAllowed
) {
    public static RoomResponse from(Room room, String clientId) {
        synchronized (room) {
            return new RoomResponse(
                    room.getId(),
                    room.getName(),
                    room.getFileName(),
                    room.hasFile(),
                    room.isPlaying(),
                    room.getCurrentTime(),
                    System.currentTimeMillis(),
                    room.getSeekVersion(),
                    room.getMediaVersion(),
                    room.getPlaybackRevision(),
                    room.hasHost(),
                    room.isHost(clientId),
                    room.getScreenSharerClientId(),
                    room.getParticipantName(room.getScreenSharerClientId()),
                    room.isGuestScreenSharingAllowed()
            );
        }
    }
}
