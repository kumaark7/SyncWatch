package xyz.projectdarkhope.syncwatch.sync;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.call.LiveKitScreenShareAuthorizer;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class SyncControllerGuestTest {
    @Test
    void guestJoinUsesSessionIdentityAndNeverBroadcastsPlaybackState() {
        RoomStore rooms = new RoomStore();
        Room room = rooms.create("Test Room");
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
        SyncController controller = new SyncController(rooms, messaging, chat, presence);
        Map<String, Object> session = new HashMap<>();
        session.put(AuthService.SESSION_ROLE, AuthService.ROLE_GUEST);
        session.put(AuthService.SESSION_GUEST_ID, "guest:owner");
        session.put(AuthService.SESSION_GUEST_ROOM, room.getId());
        session.put(AuthService.SESSION_DISPLAY_NAME, "Nova");
        session.put(AuthService.SESSION_CLIENT_ID, "guest-client");

        controller.control(
                room.getId(),
                new SyncMessage("JOIN", 0, false, "spoofed-client", "Spoofed Name", true),
                "stomp-session",
                session
        );

        assertThat(room.isParticipantOwnedBy("guest-client", "guest:owner")).isTrue();
        assertThat(room.getParticipantName("guest-client")).isEqualTo("Nova");
        assertThat(room.hasParticipant("spoofed-client")).isFalse();

        controller.control(
                room.getId(),
                new SyncMessage("JOIN", 0, false, "spoofed-client", "Spoofed Name", true),
                "replacement-stomp-session",
                session
        );

        ArgumentCaptor<SyncEvent> roomEvents = ArgumentCaptor.forClass(SyncEvent.class);
        verify(messaging, times(2)).convertAndSend(
                eq("/topic/room/" + room.getId()),
                roomEvents.capture()
        );
        assertThat(roomEvents.getAllValues())
                .allSatisfy(event -> assertThat(event.type()).isEqualTo("PARTICIPANTS"));
        assertThat(chat.history(room.getId()))
                .singleElement()
                .satisfies(message -> assertThat(message.type().name()).isEqualTo("SYSTEM_JOIN"));
    }

    @Test
    void legacyJoinWithoutSnapshotCapabilityStillReceivesPlaybackState() {
        RoomStore rooms = new RoomStore();
        Room room = rooms.create("Test Room");
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
        SyncController controller = new SyncController(rooms, messaging, chat, presence);
        Map<String, Object> session = new HashMap<>();
        session.put(AuthService.SESSION_ROLE, AuthService.ROLE_GUEST);
        session.put(AuthService.SESSION_GUEST_ID, "guest:owner");
        session.put(AuthService.SESSION_GUEST_ROOM, room.getId());
        session.put(AuthService.SESSION_DISPLAY_NAME, "Nova");
        session.put(AuthService.SESSION_CLIENT_ID, "guest-client");

        controller.control(
                room.getId(),
                new SyncMessage("JOIN", 0, false, "guest-client", "Nova"),
                "legacy-stomp-session",
                session
        );

        ArgumentCaptor<SyncEvent> roomEvents = ArgumentCaptor.forClass(SyncEvent.class);
        verify(messaging, times(2)).convertAndSend(
                eq("/topic/room/" + room.getId()),
                roomEvents.capture()
        );
        assertThat(roomEvents.getAllValues())
                .extracting(SyncEvent::type)
                .containsExactly("STATE", "PARTICIPANTS");
    }
}
