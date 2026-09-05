package xyz.projectdarkhope.syncwatch.call;

import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanPublishData;
import io.livekit.server.CanPublishSources;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import xyz.projectdarkhope.syncwatch.room.Room;

import java.time.Duration;
import java.util.List;

@Service
public class LiveKitTokenService {
    private static final long TOKEN_TTL_MS = Duration.ofHours(1).toMillis();

    private final String serverUrl;
    private final String apiKey;
    private final String apiSecret;

    public LiveKitTokenService(
            @Value("${LIVEKIT_URL:}") String serverUrl,
            @Value("${LIVEKIT_API_KEY:}") String apiKey,
            @Value("${LIVEKIT_API_SECRET:}") String apiSecret
    ) {
        this.serverUrl = serverUrl == null ? "" : serverUrl.trim();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.apiSecret = apiSecret == null ? "" : apiSecret.trim();
    }

    public CallTokenResponse createToken(Room room, String clientId, String displayName) {
        if (serverUrl.isBlank() || apiKey.isBlank() || apiSecret.isBlank()) {
            throw new IllegalStateException("LiveKit is not configured");
        }

        String liveKitRoomName = "syncwatch-" + room.getId();
        String identity = "syncwatch:" + room.getId() + ":" + clientId;

        AccessToken accessToken = new AccessToken(apiKey, apiSecret);
        accessToken.setIdentity(identity);
        accessToken.setName(displayName);
        accessToken.setTtl(TOKEN_TTL_MS);
        accessToken.addGrants(
                new RoomJoin(true),
                new RoomName(liveKitRoomName),
                new CanPublish(true),
                new CanPublishSources(List.of(
                        "camera",
                        "microphone",
                        "screen_share",
                        "screen_share_audio"
                )),
                new CanSubscribe(true),
                new CanPublishData(true)
        );

        return new CallTokenResponse(serverUrl, accessToken.toJwt());
    }
}
