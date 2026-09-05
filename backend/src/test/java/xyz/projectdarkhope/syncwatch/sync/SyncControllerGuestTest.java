package xyz.projectdarkhope.syncwatch.sync;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SyncControllerGuestTest {
    @Test
    void guestJoinUsesSessionIdentityInsteadOfMessageIdentity() {
        RoomStore rooms = new RoomStore();
        Room room = rooms.create("Test Room");
        SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
        ChatService chat = new ChatService();
        RoomPresenceService presence = new RoomPresenceService(
                rooms,
                messaging,
                chat,
                mock(TaskScheduler.class),
                Duration.ofSeconds(5)
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
                new SyncMessage("JOIN", 0, false, "spoofed-client", "Spoofed Name"),
                "stomp-session",
                session
        );

        assertThat(room.isParticipantOwnedBy("guest-client", "guest:owner")).isTrue();
        assertThat(room.getParticipantName("guest-client")).isEqualTo("Nova");
        assertThat(room.hasParticipant("spoofed-client")).isFalse();
    }
}
