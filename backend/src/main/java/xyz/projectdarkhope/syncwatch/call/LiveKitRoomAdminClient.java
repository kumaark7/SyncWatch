package xyz.projectdarkhope.syncwatch.call;

import io.livekit.server.RoomServiceClient;
import livekit.LivekitModels;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import retrofit2.Response;

import java.io.IOException;

@Component
public class LiveKitRoomAdminClient {
    private final RoomServiceClient rooms;

    @Autowired
    public LiveKitRoomAdminClient(
            @Value("${LIVEKIT_URL:}") String serverUrl,
            @Value("${LIVEKIT_API_KEY:}") String apiKey,
            @Value("${LIVEKIT_API_SECRET:}") String apiSecret
    ) {
        String url = serverUrl == null ? "" : serverUrl.trim();
        String key = apiKey == null ? "" : apiKey.trim();
        String secret = apiSecret == null ? "" : apiSecret.trim();
        rooms = url.isBlank() || key.isBlank() || secret.isBlank()
                ? null
                : RoomServiceClient.createClient(url, key, secret);
    }

    LiveKitRoomAdminClient(RoomServiceClient rooms) {
        this.rooms = rooms;
    }

    public boolean updateParticipantPermission(
            String roomName,
            String identity,
            LivekitModels.ParticipantPermission permission
    ) {
        ensureConfigured();
        try {
            Response<LivekitModels.ParticipantInfo> response = rooms.updateParticipant(
                    roomName,
                    identity,
                    null,
                    null,
                    permission
            ).execute();
            if (response.isSuccessful()) {
                return true;
            }
            if (response.code() == 404) {
                return false;
            }
            throw new LiveKitAdminException("LiveKit rejected the participant permission update");
        } catch (IOException error) {
            throw new LiveKitAdminException("Could not update LiveKit participant permissions", error);
        }
    }

    public void removeParticipant(String roomName, String identity) {
        ensureConfigured();
        try {
            Response<Void> response = rooms.removeParticipant(roomName, identity).execute();
            if (!response.isSuccessful() && response.code() != 404) {
                throw new LiveKitAdminException("LiveKit rejected the participant removal");
            }
        } catch (IOException error) {
            throw new LiveKitAdminException("Could not remove the LiveKit participant", error);
        }
    }

    public void deleteRoom(String roomName) {
        ensureConfigured();
        try {
            Response<Void> response = rooms.deleteRoom(roomName).execute();
            if (!response.isSuccessful() && response.code() != 404) {
                throw new LiveKitAdminException("LiveKit rejected the room deletion");
            }
        } catch (IOException error) {
            throw new LiveKitAdminException("Could not delete the LiveKit room", error);
        }
    }

    private void ensureConfigured() {
        if (rooms == null) {
            throw new LiveKitAdminException("LiveKit is not configured");
        }
    }
}
