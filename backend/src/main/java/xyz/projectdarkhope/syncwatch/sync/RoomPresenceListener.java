package xyz.projectdarkhope.syncwatch.sync;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

@Component
public class RoomPresenceListener {
    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;

    public RoomPresenceListener(RoomStore rooms, SimpMessagingTemplate messaging) {
        this.rooms = rooms;
        this.messaging = messaging;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();

        for (Room room : rooms.all()) {
            if (!room.removeSession(sessionId)) {
                continue;
            }

            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.participants(room)
            );
        }
    }
}
