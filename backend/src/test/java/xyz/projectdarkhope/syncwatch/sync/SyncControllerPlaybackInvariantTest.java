package xyz.projectdarkhope.syncwatch.sync;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.call.LiveKitScreenShareAuthorizer;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomResponse;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SyncControllerPlaybackInvariantTest {
    private Room room;
    private SyncController controller;

    @BeforeEach
    void setUp() {
        RoomStore rooms = new RoomStore();
        room = rooms.create("Test Room");
        room.setFileId("drive-file");
        room.registerParticipant("client", "user", "Viewer", "participant-session");
        SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
        ChatService chat = new ChatService();
        RoomPresenceService presence = new RoomPresenceService(
                rooms,
                messaging,
                chat,
                mock(GoogleDriveOAuthService.class),
                mock(TaskScheduler.class),
                Duration.ofSeconds(5),
                mock(LiveKitScreenShareAuthorizer.class)
        );
        controller = new SyncController(rooms, messaging, chat, presence);
    }

    @Test
    void playAtNonzeroPositionCannotCollapseToZero() {
        room.updatePlayback(300, false);

        control("PLAY", 0);

        assertThat(room.isPlaying()).isTrue();
        assertThat(room.getCurrentTime()).isGreaterThanOrEqualTo(300);
    }

    @Test
    void pauseAtNonzeroPositionCannotCollapseToZero() {
        room.updatePlayback(300, true);

        control("PAUSE", 0);

        assertThat(room.isPlaying()).isFalse();
        assertThat(room.getCurrentTime()).isGreaterThanOrEqualTo(300);
    }

    @Test
    void explicitSeekToZeroRemainsAuthoritativeAcrossStatePlayPauseAndReconnect() {
        room.updatePlayback(300, false);

        control("SEEK", 0);

        assertThat(room.getCurrentTime()).isZero();
        assertThat(room.getSeekVersion()).isEqualTo(1);

        SyncEvent stateAtZero = SyncEvent.state(room);
        assertThat(stateAtZero.time()).isZero();
        assertThat(stateAtZero.seekId()).isEqualTo(1);

        RoomResponse reconnectState = RoomResponse.from(room, "client");
        assertThat(reconnectState.currentTime()).isZero();
        assertThat(reconnectState.seekId()).isEqualTo(1);

        control("PLAY", 0);
        assertThat(room.isPlaying()).isTrue();
        assertThat(room.getCurrentTime()).isZero();
        assertThat(room.getSeekVersion()).isEqualTo(1);

        control("PAUSE", 0);
        assertThat(room.isPlaying()).isFalse();
        assertThat(room.getCurrentTime()).isZero();
        assertThat(room.getSeekVersion()).isEqualTo(1);
    }

    @Test
    void mediaGenerationChangesOnlyWhenTheSelectedFileChangesOrClears() {
        long selectedVersion = room.getMediaVersion();

        room.updatePlayback(300, true);
        assertThat(room.getMediaVersion()).isEqualTo(selectedVersion);

        room.setFileId("drive-file");
        assertThat(room.getMediaVersion()).isEqualTo(selectedVersion);

        room.setFileName("Same Movie Name");
        room.setFileId("different-drive-file");
        assertThat(room.getMediaVersion()).isEqualTo(selectedVersion + 1);

        room.clearFile();
        assertThat(room.getMediaVersion()).isEqualTo(selectedVersion + 2);

        room.clearFile();
        assertThat(room.getMediaVersion()).isEqualTo(selectedVersion + 2);
    }

    private void control(String type, double time) {
        controller.control(
                room.getId(),
                new SyncMessage(type, time, room.isPlaying(), "client", "Viewer"),
                "stomp-session",
                Map.of(AuthService.SESSION_USER_ID, "user")
        );
    }
}
