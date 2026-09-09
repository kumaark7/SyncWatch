package xyz.projectdarkhope.syncwatch.call;

import livekit.LivekitModels;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitScreenShareAuthorizerTest {
    private final RoomStore rooms = new RoomStore();
    private final LiveKitRoomAdminClient liveKit = mock(LiveKitRoomAdminClient.class);
    private final LiveKitScreenShareAuthorizer authorizer =
            new LiveKitScreenShareAuthorizer(rooms, liveKit);

    @Test
    void grantAddsOnlyCameraMicrophoneAndScreenSources() {
        Room room = roomWithParticipants();
        when(liveKit.updateParticipantPermission(any(), any(), any())).thenReturn(true);

        assertThat(authorizer.grant(room, "guest"))
                .isEqualTo(LiveKitScreenShareAuthorizer.Result.APPLIED);

        LivekitModels.ParticipantPermission permission = capturedPermission(room, "guest");
        assertThat(permission.getCanPublishSourcesList()).containsExactly(
                LivekitModels.TrackSource.CAMERA,
                LivekitModels.TrackSource.MICROPHONE,
                LivekitModels.TrackSource.SCREEN_SHARE,
                LivekitModels.TrackSource.SCREEN_SHARE_AUDIO
        );
        assertThat(permission.getCanPublish()).isTrue();
        assertThat(permission.getCanSubscribe()).isTrue();
        assertThat(permission.getCanPublishData()).isTrue();
    }

    @Test
    void revokePreservesCameraMicrophoneAndData() {
        Room room = roomWithParticipants();
        when(liveKit.updateParticipantPermission(any(), any(), any())).thenReturn(true);

        authorizer.revoke(room, "guest");

        LivekitModels.ParticipantPermission permission = capturedPermission(room, "guest");
        assertThat(permission.getCanPublishSourcesList()).containsExactly(
                LivekitModels.TrackSource.CAMERA,
                LivekitModels.TrackSource.MICROPHONE
        );
        assertThat(permission.getCanPublish()).isTrue();
        assertThat(permission.getCanPublishData()).isTrue();
    }

    @Test
    void reconnectReconcilesToCurrentRoomLeaseInsteadOfStaleTokenPermission() {
        Room room = roomWithParticipants();
        when(liveKit.updateParticipantPermission(any(), any(), any())).thenReturn(true);

        authorizer.enforceParticipant(
                LiveKitIdentity.roomName(room),
                LiveKitIdentity.participant(room.getId(), "guest")
        );

        assertThat(capturedPermission(room, "guest").getCanPublishSourcesList())
                .containsExactly(LivekitModels.TrackSource.CAMERA, LivekitModels.TrackSource.MICROPHONE);
    }

    @Test
    void activeAuthorizedShareIsRestoredAcrossReconnect() {
        Room room = roomWithParticipants();
        assertThat(room.startScreenShare("guest")).isTrue();
        when(liveKit.updateParticipantPermission(any(), any(), any())).thenReturn(true);

        authorizer.enforceParticipant(
                LiveKitIdentity.roomName(room),
                LiveKitIdentity.participant(room.getId(), "guest")
        );

        assertThat(capturedPermission(room, "guest").getCanPublishSourcesList())
                .contains(LivekitModels.TrackSource.SCREEN_SHARE, LivekitModels.TrackSource.SCREEN_SHARE_AUDIO);
    }

    @Test
    void participantOutsideWatchRoomIsRemovedFromLiveKit() {
        Room room = roomWithParticipants();

        authorizer.enforceParticipant(
                LiveKitIdentity.roomName(room),
                LiveKitIdentity.participant(room.getId(), "departed")
        );

        verify(liveKit).removeParticipant(
                LiveKitIdentity.roomName(room),
                LiveKitIdentity.participant(room.getId(), "departed")
        );
    }

    @Test
    void hostTransferRevokesBlockedGuestWhoIsStillSharing() {
        Room room = rooms.create("Test");
        room.claimHost("guest-host", "guest:host");
        room.registerParticipant("guest-host", "guest:host", "Guest Host", "session-1");
        room.registerParticipant("next-host", "user:next", "Next", "session-2");
        room.setGuestScreenSharingAllowed(false);
        assertThat(room.startScreenShare("guest-host")).isTrue();
        assertThat(room.transferHost("guest-host", "next-host")).isTrue();
        when(liveKit.updateParticipantPermission(any(), any(), any())).thenReturn(true);

        assertThat(authorizer.revokeCurrentShareIfUnauthorized(room)).isTrue();

        assertThat(room.getScreenSharerClientId()).isNull();
        assertThat(capturedPermission(room, "guest-host").getCanPublishSourcesList())
                .containsExactly(LivekitModels.TrackSource.CAMERA, LivekitModels.TrackSource.MICROPHONE);
    }

    private LivekitModels.ParticipantPermission capturedPermission(Room room, String clientId) {
        ArgumentCaptor<LivekitModels.ParticipantPermission> permission =
                ArgumentCaptor.forClass(LivekitModels.ParticipantPermission.class);
        verify(liveKit).updateParticipantPermission(
                eq(LiveKitIdentity.roomName(room)),
                eq(LiveKitIdentity.participant(room.getId(), clientId)),
                permission.capture()
        );
        return permission.getValue();
    }

    private Room roomWithParticipants() {
        Room room = rooms.create("Test");
        room.claimHost("host", "user:host");
        room.registerParticipant("host", "user:host", "Host", "session-1");
        room.registerParticipant("guest", "guest:one", "Guest", "session-2");
        return room;
    }
}
