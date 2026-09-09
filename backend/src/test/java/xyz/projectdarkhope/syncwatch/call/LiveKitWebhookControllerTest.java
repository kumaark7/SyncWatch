package xyz.projectdarkhope.syncwatch.call;

import livekit.LivekitModels;
import livekit.LivekitWebhook;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitWebhookControllerTest {
    private final LiveKitWebhookVerifier verifier = mock(LiveKitWebhookVerifier.class);
    private final LiveKitScreenShareAuthorizer authorizer = mock(LiveKitScreenShareAuthorizer.class);
    private final LiveKitWebhookController controller =
            new LiveKitWebhookController(verifier, authorizer);

    @Test
    void participantReconnectReconcilesServerSidePermissions() {
        LivekitWebhook.WebhookEvent event = event("participant_joined", null);
        when(verifier.verify("body", "signed")).thenReturn(event);

        assertThat(controller.receive("body", "signed").getStatusCode().value()).isEqualTo(200);

        verify(authorizer).enforceParticipant("syncwatch-ABC123", "syncwatch:ABC123:client");
    }

    @Test
    void modifiedClientScreenPublicationIsImmediatelyReconciled() {
        LivekitWebhook.WebhookEvent event = event(
                "track_published",
                LivekitModels.TrackSource.SCREEN_SHARE
        );
        when(verifier.verify("body", "signed")).thenReturn(event);

        assertThat(controller.receive("body", "signed").getStatusCode().value()).isEqualTo(200);

        verify(authorizer).enforceParticipant("syncwatch-ABC123", "syncwatch:ABC123:client");
    }

    @Test
    void cameraPublicationDoesNotRewritePermissions() {
        LivekitWebhook.WebhookEvent event = event(
                "track_published",
                LivekitModels.TrackSource.CAMERA
        );
        when(verifier.verify("body", "signed")).thenReturn(event);

        assertThat(controller.receive("body", "signed").getStatusCode().value()).isEqualTo(200);

        verify(authorizer, never()).enforceParticipant(
                "syncwatch-ABC123",
                "syncwatch:ABC123:client"
        );
    }

    @Test
    void invalidSignatureIsRejectedWithoutEnforcement() {
        when(verifier.verify("body", "invalid")).thenThrow(new IllegalArgumentException());

        assertThat(controller.receive("body", "invalid").getStatusCode().value()).isEqualTo(401);

        verify(authorizer, never()).enforceParticipant(
                "syncwatch-ABC123",
                "syncwatch:ABC123:client"
        );
    }

    private LivekitWebhook.WebhookEvent event(
            String type,
            LivekitModels.TrackSource source
    ) {
        LivekitWebhook.WebhookEvent.Builder event = LivekitWebhook.WebhookEvent.newBuilder()
                .setEvent(type)
                .setRoom(LivekitModels.Room.newBuilder().setName("syncwatch-ABC123"))
                .setParticipant(LivekitModels.ParticipantInfo.newBuilder()
                        .setIdentity("syncwatch:ABC123:client"));
        if (source != null) {
            event.setTrack(LivekitModels.TrackInfo.newBuilder().setSource(source));
        }
        return event.build();
    }
}
