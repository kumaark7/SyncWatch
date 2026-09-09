package xyz.projectdarkhope.syncwatch.call;

import io.livekit.server.WebhookReceiver;
import livekit.LivekitWebhook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class LiveKitWebhookVerifier {
    private final WebhookReceiver receiver;

    public LiveKitWebhookVerifier(
            @Value("${LIVEKIT_API_KEY:}") String apiKey,
            @Value("${LIVEKIT_API_SECRET:}") String apiSecret
    ) {
        String key = apiKey == null ? "" : apiKey.trim();
        String secret = apiSecret == null ? "" : apiSecret.trim();
        receiver = key.isBlank() || secret.isBlank() ? null : new WebhookReceiver(key, secret);
    }

    public LivekitWebhook.WebhookEvent verify(String body, String authorization) {
        if (receiver == null) {
            throw new LiveKitAdminException("LiveKit is not configured");
        }
        try {
            return receiver.receive(body, authorization);
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("Invalid LiveKit webhook", error);
        }
    }
}
