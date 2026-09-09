package xyz.projectdarkhope.syncwatch.call;

import io.livekit.server.AccessToken;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LiveKitWebhookVerifierTest {
    private static final String KEY = "test-key";
    private static final String SECRET = "test-secret-with-enough-length";

    @Test
    void verifiesIssuerSignatureAndExactRawBodyHash() throws Exception {
        String body = "{\"event\":\"participant_joined\"}";
        AccessToken token = new AccessToken(KEY, SECRET);
        token.setSha256(Base64.getEncoder().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8))
        ));
        LiveKitWebhookVerifier verifier = new LiveKitWebhookVerifier(KEY, SECRET);

        assertThat(verifier.verify(body, token.toJwt()).getEvent())
                .isEqualTo("participant_joined");
        assertThatThrownBy(() -> verifier.verify(body + " ", token.toJwt()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
