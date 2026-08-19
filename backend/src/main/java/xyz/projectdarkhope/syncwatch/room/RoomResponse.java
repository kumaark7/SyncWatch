package xyz.projectdarkhope.syncwatch.room;

public record RoomResponse(
        String roomId,
        String fileName,
        boolean hasFile,
        boolean playing,
        double currentTime,
        long serverTime,
        boolean hostAssigned,
        boolean isHost
) {
    public static RoomResponse from(Room room, String clientId) {
        return new RoomResponse(
                room.getId(),
                room.getFileName(),
                room.hasFile(),
                room.isPlaying(),
                room.getCurrentTime(),
                System.currentTimeMillis(),
                room.hasHost(),
                room.isHost(clientId)
        );
    }
}
