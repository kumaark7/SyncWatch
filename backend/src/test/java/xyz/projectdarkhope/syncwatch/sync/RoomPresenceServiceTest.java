package xyz.projectdarkhope.syncwatch.sync;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import xyz.projectdarkhope.syncwatch.chat.ChatMessageType;
import xyz.projectdarkhope.syncwatch.chat.ChatMessage;
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
import static org.mockito.Mockito.times;
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
        claimHost(room, "stable-client");
        Room.ParticipantRegistration initial = register(
                room, "stable-client", "Nova Nila", "old-session"
        );
        register(room, "waiting-client", "Waiting User", "waiting-session");

        presence.scheduleDisconnect("old-session");
        Thread.sleep(20);
        Room.ParticipantRegistration replacement = register(
                room, "stable-client", "Nova Nila", "new-session"
        );

        Thread.sleep(120);
        assertThat(initial.joined()).isTrue();
        assertThat(replacement.joined()).isFalse();
        assertThat(room.hasParticipant("stable-client")).isTrue();
        assertThat(room.getClientIdForSession("old-session")).isNull();
        assertThat(room.getClientIdForSession("new-session")).isEqualTo("stable-client");
        assertThat(room.isHost("stable-client")).isTrue();
        assertThat(room.isHost("waiting-client")).isFalse();
        assertThat(chatService.history(room.getId())).isEmpty();
        verify(messaging, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void disconnectWithoutReconnectRemovesEmptyRoomAfterOneLeave() {
        Room room = rooms.create("Test room");
        claimHost(room, "stable-client");
        register(room, "stable-client", "Nova Nila", "old-session");

        presence.scheduleDisconnect("old-session");
        presence.scheduleDisconnect("old-session");

        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(room.hasParticipant("stable-client")).isFalse();
            assertThat(rooms.find(room.getId())).isEmpty();
        });

        assertThat(chatService.history(room.getId())).isEmpty();
        verify(messaging).convertAndSend(
                eq("/topic/rooms/" + room.getId() + "/chat"),
                argThat((ChatMessage message) -> message.type() == ChatMessageType.SYSTEM_LEAVE)
        );
        verify(messaging, never()).convertAndSend(
                eq("/topic/room/" + room.getId()),
                any(SyncEvent.class)
        );
    }

    @Test
    void hostDeparturePromotesOldestRemainingParticipantAfterGrace() {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");
        register(room, "oldest-client", "Zulu", "oldest-session");
        register(room, "newer-client", "Alpha", "newer-session");

        presence.scheduleDisconnect("host-session");

        assertThat(room.isHost("host-client")).isTrue();
        assertThat(room.isHost("oldest-client")).isFalse();

        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(room.hasParticipant("host-client")).isFalse();
            assertThat(room.isHost("oldest-client")).isTrue();
            assertThat(room.isHost("newer-client")).isFalse();
        });

        assertThat(rooms.find(room.getId())).contains(room);
        verify(messaging).convertAndSend(
                eq("/topic/room/" + room.getId()),
                argThat((SyncEvent event) -> "PARTICIPANTS".equals(event.type())
                        && "oldest-client".equals(event.hostClientId())
                        && event.participants().stream().anyMatch(participant ->
                        participant.clientId().equals("oldest-client") && participant.host()))
        );
    }

    @Test
    void deliberateHostLeaveImmediatelyPromotesOldestRemainingParticipant() {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");
        register(room, "oldest-client", "Zulu", "oldest-session");
        register(room, "newer-client", "Alpha", "newer-session");

        assertThat(presence.leaveImmediately(room.getId(), userFor("host-client"), "host-client"))
                .isEqualTo(RoomPresenceService.LeaveRoomResult.LEFT);

        assertThat(room.hasParticipant("host-client")).isFalse();
        assertThat(room.isHost("oldest-client")).isTrue();
        assertThat(room.isHost("newer-client")).isFalse();
        verify(messaging).convertAndSend(
                eq("/topic/room/" + room.getId()),
                argThat((SyncEvent event) -> "PARTICIPANTS".equals(event.type())
                        && "oldest-client".equals(event.hostClientId()))
        );

        Room.ParticipantRegistration rejoin = register(
                room,
                "host-client",
                "Host",
                "host-rejoin-session"
        );
        assertThat(rejoin.participant().host()).isFalse();
        assertThat(room.isHost("oldest-client")).isTrue();
    }

    @Test
    void deliberateLastParticipantLeaveRemovesRoom() {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");

        assertThat(presence.leaveImmediately(room.getId(), userFor("host-client"), "host-client"))
                .isEqualTo(RoomPresenceService.LeaveRoomResult.LEFT);

        assertThat(rooms.find(room.getId())).isEmpty();
        verify(messaging, never()).convertAndSend(
                eq("/topic/room/" + room.getId()),
                any(SyncEvent.class)
        );
    }

    @Test
    void currentHostCanCloseRoomWithoutPromotingAnotherParticipant() {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");
        register(room, "oldest-client", "Oldest", "oldest-session");

        assertThat(presence.closeRoom(room.getId(), userFor("host-client"), "host-client"))
                .isEqualTo(RoomPresenceService.CloseRoomResult.CLOSED);

        assertThat(rooms.find(room.getId())).isEmpty();
        assertThat(room.isHost("host-client")).isTrue();
        assertThat(room.isHost("oldest-client")).isFalse();
        assertThat(register(
                room,
                "late-client",
                "Late Join",
                "late-session"
        ).accepted()).isFalse();
        verify(messaging).convertAndSend(
                eq("/topic/room/" + room.getId()),
                argThat((SyncEvent event) -> "ROOM_CLOSED".equals(event.type())
                        && "host-client".equals(event.senderClientId()))
        );
        verify(messaging, never()).convertAndSend(
                eq("/topic/room/" + room.getId()),
                argThat((SyncEvent event) -> "PARTICIPANTS".equals(event.type()))
        );
    }

    @Test
    void nonHostCannotCloseRoom() {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");
        register(room, "guest-client", "Guest", "guest-session");

        assertThat(presence.closeRoom(room.getId(), userFor("guest-client"), "guest-client"))
                .isEqualTo(RoomPresenceService.CloseRoomResult.FORBIDDEN);
        assertThat(rooms.find(room.getId())).contains(room);
        assertThat(room.isHost("host-client")).isTrue();
        verify(messaging, never()).convertAndSend(
                eq("/topic/room/" + room.getId()),
                any(SyncEvent.class)
        );
    }

    @Test
    void closeCancelsPendingReconnectGraceWithoutLaterHostTransfer() throws Exception {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");
        register(room, "guest-client", "Guest", "guest-session");
        presence.scheduleDisconnect("host-session");

        assertThat(presence.closeRoom(room.getId(), userFor("host-client"), "host-client"))
                .isEqualTo(RoomPresenceService.CloseRoomResult.CLOSED);
        Thread.sleep(120);

        assertThat(rooms.find(room.getId())).isEmpty();
        verify(messaging, times(1)).convertAndSend(
                eq("/topic/room/" + room.getId()),
                any(SyncEvent.class)
        );
    }

    @Test
    void spoofedClientIdCannotLeaveOrCloseAnotherUsersParticipant() {
        Room room = rooms.create("Test room");
        claimHost(room, "host-client");
        register(room, "host-client", "Host", "host-session");
        register(room, "guest-client", "Guest", "guest-session");

        assertThat(presence.leaveImmediately(room.getId(), "attacker-user", "host-client"))
                .isEqualTo(RoomPresenceService.LeaveRoomResult.FORBIDDEN);
        assertThat(presence.closeRoom(room.getId(), "attacker-user", "host-client"))
                .isEqualTo(RoomPresenceService.CloseRoomResult.FORBIDDEN);
        assertThat(room.isHost("host-client")).isTrue();
        assertThat(room.hasParticipant("host-client")).isTrue();
        assertThat(rooms.find(room.getId())).contains(room);
    }

    @Test
    void reconnectCannotTakeOverAnotherUsersStableClientId() {
        presence = new RoomPresenceService(
        rooms,
        messaging,
        chatService,
        scheduler,
        Duration.ofSeconds(2)
        );
        Room room = rooms.create("Test room");
        claimHost(room, "stable-client");
        register(room, "stable-client", "Owner", "old-session");
        presence.scheduleDisconnect("old-session");

        Room.ParticipantRegistration spoofed = presence.registerParticipant(
                room,
                "stable-client",
                "attacker-user",
                "Attacker",
                "new-session"
        );

        assertThat(spoofed.accepted()).isFalse();
        assertThat(room.getParticipantName("stable-client")).isEqualTo("Owner");
        assertThat(room.getClientIdForSession("new-session")).isNull();
    }

    private void claimHost(Room room, String clientId) {
        room.claimHost(clientId, userFor(clientId));
    }

    private Room.ParticipantRegistration register(
            Room room,
            String clientId,
            String nameTag,
            String sessionId
    ) {
        return presence.registerParticipant(room, clientId, userFor(clientId), nameTag, sessionId);
    }

    private String userFor(String clientId) {
        return clientId + "-user";
    }
}
