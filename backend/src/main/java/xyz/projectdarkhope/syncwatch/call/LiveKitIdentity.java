package xyz.projectdarkhope.syncwatch.call;

import xyz.projectdarkhope.syncwatch.room.Room;

public final class LiveKitIdentity {
    private static final String ROOM_PREFIX = "syncwatch-";

    private LiveKitIdentity() {}

    public static String roomName(Room room) {
        return ROOM_PREFIX + room.getId();
    }

    public static String participant(String roomId, String clientId) {
        return "syncwatch:" + roomId + ":" + clientId;
    }

    public static String roomId(String liveKitRoomName) {
        if (liveKitRoomName == null || !liveKitRoomName.startsWith(ROOM_PREFIX)) {
            return null;
        }
        String roomId = liveKitRoomName.substring(ROOM_PREFIX.length());
        return roomId.matches("[A-Z0-9]{6}") ? roomId : null;
    }

    public static String clientId(String roomId, String identity) {
        String prefix = "syncwatch:" + roomId + ":";
        if (identity == null || !identity.startsWith(prefix)) {
            return null;
        }
        String clientId = identity.substring(prefix.length());
        return clientId.isBlank() || clientId.length() > 128 ? null : clientId;
    }
}
