package xyz.projectdarkhope.syncwatch.sync;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import xyz.projectdarkhope.syncwatch.room.*;

@Component
public class SyncScheduler {
    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;

    public SyncScheduler(RoomStore rooms,SimpMessagingTemplate messaging) {
        this.rooms=rooms; this.messaging=messaging;
    }

    @Scheduled(fixedRate=5000)
    public void sync() {
        for(Room room:rooms.all()) {
            if(room.isPlaying() && room.hasFile()) {
                messaging.convertAndSend("/topic/room/"+room.getId(),SyncEvent.state(room));
            }
        }
    }
}