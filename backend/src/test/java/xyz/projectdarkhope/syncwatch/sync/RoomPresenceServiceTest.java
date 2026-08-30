package xyz.projectdarkhope.syncwatch.sync;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import xyz.projectdarkhope.syncwatch.chat.ChatMessageType;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class RoomPresenceServiceTest {
    private ThreadPoolTaskScheduler scheduler;
    private SimpMessagingTemplate messaging;
    private ChatService chatService;
    private RoomStore rooms;
    private RoomPresenceService presence;

    @BeforeEach
    void setUp() {
        scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.initialize();
        messaging = mock(SimpMessagingTemplate.class);
        chatService = new ChatService();
        rooms = new RoomStore();
        presence = new RoomPresenceService(
                rooms,
                messaging,
                chatService,
                scheduler,
                Duration.ofMillis(80)
        );
    }

    @AfterEach
    void tearDown() {
        scheduler.shutdown();
    }

    @Test
    void reconnectWithinGraceKeepsLogicalParticipantWithoutDuplicateJoin() throws Exception {
        Room room = rooms.create("Test room");
        Room.ParticipantRegistration initial = presence.registerParticipant(
                room, "stable-client", "Nova Nila", "old-session"
        );

        presence.scheduleDisconnect("old-session");
        Thread.sleep(20);
        Room.ParticipantRegistration replacement = presence.registerParticipant(
                room, "stable-client", "Nova Nila", "new-session"
        );

        Thread.sleep(120);
        assertThat(initial.joined()).isTrue();
        assertThat(replacement.joined()).isFalse();
        assertThat(room.hasParticipant("stable-client")).isTrue();
        assertThat(room.getClientIdForSession("old-session")).isNull();
        assertThat(room.getClientIdForSession("new-session")).isEqualTo("stable-client");
        assertThat(chatService.history(room.getId())).isEmpty();
        verify(messaging, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void disconnectWithoutReconnectPublishesExactlyOneLeaveAfterGrace() {
        Room room = rooms.create("Test room");
        presence.registerParticipant(room, "stable-client", "Nova Nila", "old-session");

        presence.scheduleDisconnect("old-session");
        presence.scheduleDisconnect("old-session");

        await().atMost(Duration.ofSeconds(2))
                .untilAsserted(() -> assertThat(room.hasParticipant("stable-client")).isFalse());

        assertThat(chatService.history(room.getId()))
                .filteredOn(message -> message.type() == ChatMessageType.SYSTEM_LEAVE)
                .hasSize(1);
        verify(messaging).convertAndSend(
                eq("/topic/room/" + room.getId()),
                argThat((SyncEvent event) -> "PARTICIPANTS".equals(event.type())
                        && event.participants().isEmpty())
        );
    }
}
