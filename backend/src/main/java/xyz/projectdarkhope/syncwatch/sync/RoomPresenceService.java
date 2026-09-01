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

    public enum CloseRoomResult {
        CLOSED,
        FORBIDDEN,
        NOT_FOUND
    }

    public enum LeaveRoomResult {
        LEFT,
        FORBIDDEN,
        NOT_FOUND
    }

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
            String userId,
            String nameTag,
            String sessionId
    ) {
        synchronized (pendingLock) {
            if (rooms.find(room.getId()).orElse(null) != room) {
                return new Room.ParticipantRegistration(false, false, null);
            }

            Room.ParticipantRegistration registration = room.registerParticipant(
                    clientId,
                    userId,
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

    public LeaveRoomResult leaveImmediately(String roomId, String userId, String clientId) {
        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return LeaveRoomResult.NOT_FOUND;
        }
        if (!room.isParticipantOwnedBy(clientId, userId)) {
            return LeaveRoomResult.FORBIDDEN;
        }

        synchronized (pendingLock) {
            if (rooms.find(room.getId()).orElse(null) != room) {
                return LeaveRoomResult.NOT_FOUND;
            }

            PresenceKey key = new PresenceKey(room.getId(), clientId);
            PendingDeparture pending = pendingDepartures.remove(key);
            if (pending != null && pending.future != null) {
                pending.future.cancel(false);
            }
            RoomParticipant departure = room.removeParticipant(clientId);
            if (departure == null) {
                return LeaveRoomResult.NOT_FOUND;
            }

            completeDepartures(room, List.of(departure), "deliberate room leave");
            return LeaveRoomResult.LEFT;
        }
    }

    public CloseRoomResult closeRoom(String roomId, String userId, String clientId) {
        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return CloseRoomResult.NOT_FOUND;
        }

        synchronized (pendingLock) {
            synchronized (room) {
                if (!room.isHostOwnedBy(clientId, userId)) {
                    return CloseRoomResult.FORBIDDEN;
                }
                if (!rooms.remove(room.getId(), room)) {
                    return CloseRoomResult.NOT_FOUND;
                }
            }

            pendingDepartures.entrySet().removeIf(entry -> {
                if (!entry.getKey().roomId().equals(room.getId())) {
                    return false;
                }
                if (entry.getValue().future != null) {
                    entry.getValue().future.cancel(false);
                }
                return true;
            });
        }

        messaging.convertAndSend(
                "/topic/room/" + room.getId(),
                SyncEvent.roomClosed(room, clientId)
        );
        chatService.removeRoom(room.getId());
        log.info("Room {} was explicitly closed by its host", room.getId());
        return CloseRoomResult.CLOSED;
    }

    private void expireDeparture(PresenceKey key, PendingDeparture pending) {
        Room room = rooms.find(key.roomId()).orElse(null);
        if (room == null) {
            synchronized (pendingLock) {
                pendingDepartures.remove(key, pending);
            }
            return;
        }

        synchronized (pendingLock) {
            if (!pendingDepartures.remove(key, pending)) {
                return;
            }
            List<RoomParticipant> departures = new ArrayList<>();
            for (String sessionId : pending.sessionIds) {
                departures.addAll(room.removeSession(sessionId));
            }

            if (departures.isEmpty()) {
                return;
            }

            log.info("Presence grace period expired for room {}", room.getId());
            completeDepartures(room, departures, "reconnect grace expiration");
        }
    }

    private void completeDepartures(
            Room room,
            List<RoomParticipant> departures,
            String reason
    ) {
        String previousHostClientId = room.getHostClientId();
        String currentHostClientId = room.promoteOldestParticipantIfNeeded();
        boolean roomHasParticipants = room.hasParticipants();

        if (roomHasParticipants) {
            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.participants(room)
            );
            if (previousHostClientId != null
                    && !previousHostClientId.equals(currentHostClientId)) {
                log.info("Room {} transferred host after {}", room.getId(), reason);
            }
        }

        for (RoomParticipant participant : departures) {
            publishDeparture(room, participant);
        }

        if (!roomHasParticipants && rooms.remove(room.getId(), room)) {
            chatService.removeRoom(room.getId());
            log.info("Removed empty room {} after {}", room.getId(), reason);
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
