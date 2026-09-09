package xyz.projectdarkhope.syncwatch.call;

import livekit.LivekitModels;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.List;

@Service
public class LiveKitScreenShareAuthorizer {
    public enum Result {
        APPLIED,
        PARTICIPANT_NOT_CONNECTED
    }

    private static final Logger log = LoggerFactory.getLogger(LiveKitScreenShareAuthorizer.class);
    private static final List<LivekitModels.TrackSource> BASE_SOURCES = List.of(
            LivekitModels.TrackSource.CAMERA,
            LivekitModels.TrackSource.MICROPHONE
    );
    private static final List<LivekitModels.TrackSource> SCREEN_SOURCES = List.of(
            LivekitModels.TrackSource.CAMERA,
            LivekitModels.TrackSource.MICROPHONE,
            LivekitModels.TrackSource.SCREEN_SHARE,
            LivekitModels.TrackSource.SCREEN_SHARE_AUDIO
    );

    private final RoomStore roomStore;
    private final LiveKitRoomAdminClient liveKit;

    public LiveKitScreenShareAuthorizer(RoomStore roomStore, LiveKitRoomAdminClient liveKit) {
        this.roomStore = roomStore;
        this.liveKit = liveKit;
    }

    public Result grant(Room room, String clientId) {
        return apply(room, clientId, true);
    }

    public Result revoke(Room room, String clientId) {
        return apply(room, clientId, false);
    }

    public boolean revokeCurrentShareIfUnauthorized(Room room) {
        synchronized (room) {
            String clientId = room.getScreenSharerClientId();
            if (clientId == null || room.canStartScreenShare(clientId)) {
                return false;
            }
            revoke(room, clientId);
            room.stopScreenShare(clientId);
            return true;
        }
    }

    public void removeParticipant(Room room, String clientId) {
        liveKit.removeParticipant(
                LiveKitIdentity.roomName(room),
                LiveKitIdentity.participant(room.getId(), clientId)
        );
    }

    public void closeRoom(Room room) {
        liveKit.deleteRoom(LiveKitIdentity.roomName(room));
    }

    public void enforceParticipant(String liveKitRoomName, String identity) {
        String roomId = LiveKitIdentity.roomId(liveKitRoomName);
        String clientId = LiveKitIdentity.clientId(roomId, identity);
        if (roomId == null || clientId == null) {
            return;
        }

        Room room = roomStore.find(roomId).orElse(null);
        if (room == null || !room.hasParticipant(clientId)) {
            liveKit.removeParticipant(liveKitRoomName, identity);
            log.warn("Removed a LiveKit participant without an active watch-room identity");
            return;
        }

        boolean allowed = clientId.equals(room.getScreenSharerClientId())
                && room.canStartScreenShare(clientId);
        if (apply(room, clientId, allowed) == Result.PARTICIPANT_NOT_CONNECTED) {
            throw new LiveKitAdminException("LiveKit participant was not available for reconciliation");
        }
    }

    private Result apply(Room room, String clientId, boolean screenShareAllowed) {
        LivekitModels.ParticipantPermission permission = LivekitModels.ParticipantPermission
                .newBuilder()
                .setCanSubscribe(true)
                .setCanPublish(true)
                .setCanPublishData(true)
                .addAllCanPublishSources(screenShareAllowed ? SCREEN_SOURCES : BASE_SOURCES)
                .build();
        boolean applied = liveKit.updateParticipantPermission(
                LiveKitIdentity.roomName(room),
                LiveKitIdentity.participant(room.getId(), clientId),
                permission
        );
        return applied ? Result.APPLIED : Result.PARTICIPANT_NOT_CONNECTED;
    }
}
