package xyz.projectdarkhope.syncwatch.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import xyz.projectdarkhope.syncwatch.chat.ChatMessage;
import xyz.projectdarkhope.syncwatch.chat.ChatMessageType;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomParticipant;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledFuture;

@Service
public class RoomPresenceService {
    private static final Logger log = LoggerFactory.getLogger(RoomPresenceService.class);

    private record PresenceKey(String roomId, String clientId) {}

    private static final class PendingDeparture {
        private final Set<String> sessionIds = new HashSet<>();
        private ScheduledFuture<?> future;
    }

    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;
    private final ChatService chatService;
    private final TaskScheduler scheduler;
    private final Duration gracePeriod;
    private final Object pendingLock = new Object();
    private final Map<PresenceKey, PendingDeparture> pendingDepartures = new HashMap<>();

    public RoomPresenceService(
            RoomStore rooms,
            SimpMessagingTemplate messaging,
            ChatService chatService,
            @Qualifier("webSocketTaskScheduler") TaskScheduler scheduler,
            @Value("${syncwatch.websocket.presence-grace:5s}") Duration gracePeriod
    ) {
        this.rooms = rooms;
        this.messaging = messaging;
        this.chatService = chatService;
        this.scheduler = scheduler;
        this.gracePeriod = gracePeriod;
    }

    public Room.ParticipantRegistration registerParticipant(
            Room room,
            String clientId,
            String nameTag,
            String sessionId
    ) {
        synchronized (pendingLock) {
            Room.ParticipantRegistration registration = room.registerParticipant(
                    clientId,
                    nameTag,
                    sessionId
            );
            if (!registration.accepted()) {
                return registration;
            }

            PresenceKey key = new PresenceKey(room.getId(), clientId);
            PendingDeparture pending = pendingDepartures.remove(key);
            if (pending == null) {
                return registration;
            }

            if (pending.future != null) {
                pending.future.cancel(false);
            }
            for (String oldSessionId : pending.sessionIds) {
                room.removeSession(oldSessionId);
            }
            log.info("STOMP reconnect replaced a pending room departure for room {}", room.getId());
            return registration;
        }
    }

    public void scheduleDisconnect(String sessionId) {
        for (Room room : rooms.all()) {
            String clientId = room.getClientIdForSession(sessionId);
            if (clientId == null) {
                continue;
            }

            PresenceKey key = new PresenceKey(room.getId(), clientId);
            synchronized (pendingLock) {
                PendingDeparture existing = pendingDepartures.get(key);
                if (existing != null) {
                    existing.sessionIds.add(sessionId);
                    continue;
                }

                PendingDeparture pending = new PendingDeparture();
                pending.sessionIds.add(sessionId);
                pendingDepartures.put(key, pending);
                pending.future = scheduler.schedule(
                        () -> expireDeparture(key, pending),
                        Instant.now().plus(gracePeriod)
                );
                log.info("STOMP disconnect scheduled a presence grace period for room {}", room.getId());
            }
        }
    }

    private void expireDeparture(PresenceKey key, PendingDeparture pending) {
        Room room = rooms.find(key.roomId()).orElse(null);
        if (room == null) {
            synchronized (pendingLock) {
                pendingDepartures.remove(key, pending);
            }
            return;
        }

        List<RoomParticipant> departures = new ArrayList<>();
        synchronized (pendingLock) {
            if (!pendingDepartures.remove(key, pending)) {
                return;
            }
            for (String sessionId : pending.sessionIds) {
                departures.addAll(room.removeSession(sessionId));
            }
        }

        if (departures.isEmpty()) {
            return;
        }

        log.info("Presence grace period expired for room {}", room.getId());
        messaging.convertAndSend(
                "/topic/room/" + room.getId(),
                SyncEvent.participants(room)
        );
        for (RoomParticipant participant : departures) {
            publishDeparture(room, participant);
        }
    }

    private void publishDeparture(Room room, RoomParticipant participant) {
        ChatMessage callLeaveMessage = chatService.createCallLeaveMessage(
                room,
                participant.clientId(),
                participant.nameTag()
        );
        if (callLeaveMessage != null) {
            messaging.convertAndSend(
                    "/topic/rooms/" + room.getId() + "/chat",
                    callLeaveMessage
            );
        }

        ChatMessage leaveMessage = chatService.createPresenceMessage(
                room,
                participant,
                ChatMessageType.SYSTEM_LEAVE
        );
        messaging.convertAndSend(
                "/topic/rooms/" + room.getId() + "/chat",
                leaveMessage
        );
    }
}
