package xyz.projectdarkhope.syncwatch.sync;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.chat.ChatMessage;
import xyz.projectdarkhope.syncwatch.chat.ChatMessageType;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.Map;

@Controller
public class SyncController {

    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;
    private final ChatService chatService;
    private final RoomPresenceService presence;

    public SyncController(
            RoomStore rooms,
            SimpMessagingTemplate messaging,
            ChatService chatService,
            RoomPresenceService presence
    ) {
        this.rooms = rooms;
        this.messaging = messaging;
        this.chatService = chatService;
        this.presence = presence;
    }

    @MessageMapping("/room/{roomId}/control")
    public void control(
            @DestinationVariable String roomId,
            SyncMessage message,
            @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String sessionId,
            @Header(name = "simpSessionAttributes", required = false)
            Map<String, Object> sessionAttributes
    ) {
        Room room = rooms.find(roomId).orElse(null);

        if (room == null || message == null || message.type() == null) {
            return;
        }

        String type = message.type().trim().toUpperCase();

        if (type.isBlank()) {
            return;
        }

        String effectiveClientId = message.clientId();
        String participantName = message.nameTag();
        String userId = sessionAttributes == null
                ? null
                : sessionAttributes.get(AuthService.SESSION_USER_ID) instanceof String value
                        ? value
                        : null;
        if (userId == null || userId.isBlank()) {
            return;
        }

        if ("JOIN".equals(type)) {
            Room.ParticipantRegistration registration = presence.registerParticipant(
                    room,
                    effectiveClientId,
                    userId,
                    participantName,
                    sessionId
            );
            if (!registration.accepted()) {
                return;
            }

            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.state(room)
            );
            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.participants(room)
            );
            if (registration.joined()) {
                ChatMessage joinMessage = chatService.createPresenceMessage(
                        room,
                        registration.participant(),
                        ChatMessageType.SYSTEM_JOIN
                );
                messaging.convertAndSend(
                        "/topic/rooms/" + room.getId() + "/chat",
                        joinMessage
                );
            }
            return;
        }

        if (!"PLAY".equals(type)
                && !"PAUSE".equals(type)
                && !"SEEK".equals(type)) {
            return;
        }

        if (effectiveClientId == null || effectiveClientId.isBlank()) {
            return;
        }

        if (!room.isParticipantOwnedBy(effectiveClientId, userId)) {
            return;
        }

        if (!Double.isFinite(message.time()) || message.time() < 0) {
            return;
        }

        boolean playing = switch (type) {
            case "PLAY" -> true;
            case "PAUSE" -> false;
            case "SEEK" -> room.isPlaying();
            default -> room.isPlaying();
        };

        if ("SEEK".equals(type)) {
            room.updateSeek(message.time(), playing);
        } else {
            room.updatePlayback(message.time(), playing);
        }

        messaging.convertAndSend(
                "/topic/room/" + room.getId(),
                SyncEvent.control(type, room, effectiveClientId)
        );
    }
}
