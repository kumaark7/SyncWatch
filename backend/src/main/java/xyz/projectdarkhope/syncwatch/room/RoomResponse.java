package xyz.projectdarkhope.syncwatch.room;

public record RoomResponse(String roomId, String fileName, boolean hasFile) {
    public static RoomResponse from(Room room) {
        return new RoomResponse(room.getId(), room.getFileName(), room.hasFile());
    }
}
