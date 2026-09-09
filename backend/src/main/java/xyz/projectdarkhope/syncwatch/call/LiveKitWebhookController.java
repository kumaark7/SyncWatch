package xyz.projectdarkhope.syncwatch.call;

import livekit.LivekitModels;
import livekit.LivekitWebhook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LiveKitWebhookController {
    private static final Logger log = LoggerFactory.getLogger(LiveKitWebhookController.class);
    private static final String WEBHOOK_MEDIA_TYPE = "application/webhook+json";

    private final LiveKitWebhookVerifier verifier;
    private final LiveKitScreenShareAuthorizer screenShare;

    public LiveKitWebhookController(
            LiveKitWebhookVerifier verifier,
            LiveKitScreenShareAuthorizer screenShare
    ) {
        this.verifier = verifier;
        this.screenShare = screenShare;
    }

    @PostMapping(
            path = "/api/livekit/webhook",
            consumes = {WEBHOOK_MEDIA_TYPE, MediaType.APPLICATION_JSON_VALUE}
    )
    public ResponseEntity<Void> receive(
            @RequestBody String body,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        LivekitWebhook.WebhookEvent event;
        try {
            event = verifier.verify(body, authorization);
        } catch (IllegalArgumentException error) {
            log.warn("Rejected an invalid LiveKit webhook");
            return ResponseEntity.status(401).build();
        } catch (LiveKitAdminException error) {
            return ResponseEntity.status(503).build();
        }

        try {
            if ("participant_joined".equals(event.getEvent())
                    && event.hasRoom() && event.hasParticipant()) {
                screenShare.enforceParticipant(
                        event.getRoom().getName(),
                        event.getParticipant().getIdentity()
                );
            } else if ("track_published".equals(event.getEvent())
                    && event.hasRoom() && event.hasParticipant() && event.hasTrack()
                    && isScreenSource(event.getTrack().getSource())) {
                screenShare.enforceParticipant(
                        event.getRoom().getName(),
                        event.getParticipant().getIdentity()
                );
            }
        } catch (LiveKitAdminException error) {
            log.warn("Could not enforce LiveKit screen-share permissions for a signed event");
            return ResponseEntity.status(503).build();
        }
        return ResponseEntity.ok().build();
    }

    private boolean isScreenSource(LivekitModels.TrackSource source) {
        return source == LivekitModels.TrackSource.SCREEN_SHARE
                || source == LivekitModels.TrackSource.SCREEN_SHARE_AUDIO;
    }
}
