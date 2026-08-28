package xyz.projectdarkhope.syncwatch.sync;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import xyz.projectdarkhope.syncwatch.chat.ChatMessage;
import xyz.projectdarkhope.syncwatch.chat.ChatMessageType;
import xyz.projectdarkhope.syncwatch.chat.ChatService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomParticipant;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.List;

@Component
public class RoomPresenceListener {
    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;
    private final ChatService chatService;

    public RoomPresenceListener(RoomStore rooms, SimpMessagingTemplate messaging, ChatService chatService) {
        this.rooms = rooms;
        this.messaging = messaging;
        this.chatService = chatService;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();

        for (Room room : rooms.all()) {
            List<RoomParticipant> departures = room.removeSession(sessionId);
            if (departures.isEmpty()) {
                continue;
            }

            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.participants(room)
            );
            for (RoomParticipant participant : departures) {
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
    }
}
