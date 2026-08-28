package xyz.projectdarkhope.syncwatch.chat;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.List;
import java.util.Map;

@Controller
public class ChatController {
    private static final System.Logger LOGGER = System.getLogger(ChatController.class.getName());
    private final RoomStore rooms;
    private final ChatService chatService;
    private final SimpMessagingTemplate messaging;

    public ChatController(RoomStore rooms, ChatService chatService, SimpMessagingTemplate messaging) {
        this.rooms = rooms;
        this.chatService = chatService;
        this.messaging = messaging;
    }

    @MessageMapping("/rooms/{roomId}/chat")
    public void send(
            @DestinationVariable String roomId,
            ChatRequest request,
            @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String sessionId
    ) {
        Room room = rooms.find(roomId).orElse(null);
        if (room == null || request == null || sessionId == null || sessionId.isBlank()) {
            return;
        }

        String senderId = room.getClientIdForSession(sessionId);
        if (senderId == null) {
            LOGGER.log(
                    System.Logger.Level.DEBUG,
                    "Ignored chat message before participant JOIN for room {0}",
                    room.getId()
            );
            return;
        }

        String senderName = room.getParticipantName(senderId);
        if (senderName == null) {
            return;
        }

        ChatMessage message = chatService.createMessage(room, senderId, senderName, request.text());
        if (message == null) {
            return;
        }

        messaging.convertAndSend("/topic/rooms/" + room.getId() + "/chat", message);
    }

    @GetMapping("/api/rooms/{roomId}/chat")
    @ResponseBody
    public ResponseEntity<?> history(
            @PathVariable String roomId,
            @RequestParam String clientId
    ) {
        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            if (clientId == null || clientId.isBlank() || !room.hasParticipant(clientId)) {
                return ResponseEntity.status(403).body(Map.of("error", "Join the room before reading chat"));
            }

            List<ChatMessage> messages = chatService.history(room.getId());
            return ResponseEntity.ok(messages);
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
