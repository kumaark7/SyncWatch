package xyz.projectdarkhope.syncwatch.call;

import org.junit.jupiter.api.Test;
import xyz.projectdarkhope.syncwatch.room.Room;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class LiveKitTokenServiceTest {
    @Test
    void callTokenAllowsCameraMicrophoneAndScreenShareSources() {
        Room room = new Room("ABC123", "Test Room");
        LiveKitTokenService service = new LiveKitTokenService(
                "ws://localhost:7880",
                "test-key",
                "test-secret-with-enough-length"
        );

        CallTokenResponse response = service.createToken(room, "client-1", "Participant");
        String payload = new String(
                Base64.getUrlDecoder().decode(response.token().split("\\.")[1]),
                StandardCharsets.UTF_8
        );

        assertThat(payload).contains(
                "camera",
                "microphone",
                "screen_share",
                "screen_share_audio"
        );
    }
}
