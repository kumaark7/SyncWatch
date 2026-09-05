package xyz.projectdarkhope.syncwatch.room;

public record ScreenShareStateResponse(
        String activeClientId,
        String activeDisplayName,
        boolean guestScreenSharingAllowed
) {
    public static ScreenShareStateResponse from(Room room) {
        String activeClientId = room.getScreenSharerClientId();
        return new ScreenShareStateResponse(
                activeClientId,
                room.getParticipantName(activeClientId),
                room.isGuestScreenSharingAllowed()
        );
    }
}
