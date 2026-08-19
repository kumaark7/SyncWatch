package xyz.projectdarkhope.syncwatch.sync;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

@Controller
public class SyncController {

    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;

    public SyncController(RoomStore rooms, SimpMessagingTemplate messaging) {
        this.rooms = rooms;
        this.messaging = messaging;
    }

    @MessageMapping("/room/{roomId}/control")
    public void control(
            @DestinationVariable String roomId,
            SyncMessage message
    ) {
        Room room = rooms.find(roomId).orElse(null);

        if (room == null || message.type() == null) {
            return;
        }

        String type = message.type().toUpperCase();

        if ("JOIN".equals(type)) {
            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.state(room)
            );
            return;
        }

        if (!"PLAY".equals(type)
                && !"PAUSE".equals(type)
                && !"SEEK".equals(type)) {
            return;
        }

        boolean playing = switch (type) {
            case "PLAY" -> true;
            case "PAUSE" -> false;
            case "SEEK" -> room.isPlaying();
            default -> room.isPlaying();
        };

        room.updatePlayback(message.time(), playing);

        messaging.convertAndSend(
                "/topic/room/" + room.getId(),
                SyncEvent.control(type, room, message.clientId())
        );
    }
}
