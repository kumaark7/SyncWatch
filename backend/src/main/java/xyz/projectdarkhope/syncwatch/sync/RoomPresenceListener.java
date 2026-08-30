package xyz.projectdarkhope.syncwatch.sync;

import org.springframework.context.event.EventListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class RoomPresenceListener {
    private static final Logger log = LoggerFactory.getLogger(RoomPresenceListener.class);
    private final RoomPresenceService presence;

    public RoomPresenceListener(RoomPresenceService presence) {
        this.presence = presence;
    }

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        log.info("STOMP connection established");
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        log.info("STOMP connection disconnected; starting presence evaluation");
        presence.scheduleDisconnect(event.getSessionId());
    }
}
