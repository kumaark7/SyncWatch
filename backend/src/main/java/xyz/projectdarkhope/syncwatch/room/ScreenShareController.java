package xyz.projectdarkhope.syncwatch.room;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.sync.SyncEvent;

import java.util.Map;

@RestController
@RequestMapping("/api/rooms/{roomId}/screen-share")
public class ScreenShareController {
    public record ParticipantRequest(String clientId) {}
    public record GuestAccessRequest(String clientId, boolean allowed) {}

    private final RoomStore rooms;
    private final AuthService authService;
    private final SimpMessagingTemplate messaging;

    public ScreenShareController(
            RoomStore rooms,
            AuthService authService,
            SimpMessagingTemplate messaging
    ) {
        this.rooms = rooms;
        this.authService = authService;
        this.messaging = messaging;
    }

    @PostMapping("/start")
    public ResponseEntity<?> start(
            @PathVariable String roomId,
            @RequestBody ParticipantRequest request,
            HttpServletRequest browserRequest
    ) {
        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        String clientId = request == null ? null : request.clientId();
        if (authorizedOwner(browserRequest, room, clientId) == null) {
            return ResponseEntity.status(403).body(Map.of("error", "Not authorized for this room"));
        }
        synchronized (room) {
            if (!room.canStartScreenShare(clientId)) {
                return ResponseEntity.status(403).body(Map.of(
                        "error", "The Host has disabled guest screen sharing"
                ));
            }
            if (!room.startScreenShare(clientId)) {
                return ResponseEntity.status(409).body(Map.of(
                        "error", "Another participant is already sharing"
                ));
            }
        }
        publishState(room, clientId);
        return ResponseEntity.ok(ScreenShareStateResponse.from(room));
    }

    @PostMapping("/stop")
    public ResponseEntity<?> stop(
            @PathVariable String roomId,
            @RequestBody ParticipantRequest request,
            HttpServletRequest browserRequest
    ) {
        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        String clientId = request == null ? null : request.clientId();
        if (authorizedOwner(browserRequest, room, clientId) == null) {
            return ResponseEntity.status(403).body(Map.of("error", "Not authorized for this room"));
        }
        if (room.stopScreenShare(clientId)) {
            publishState(room, clientId);
        }
        return ResponseEntity.ok(ScreenShareStateResponse.from(room));
    }

    @PutMapping("/guest-access")
    public ResponseEntity<?> setGuestAccess(
            @PathVariable String roomId,
            @RequestBody GuestAccessRequest request,
            HttpServletRequest browserRequest
    ) {
        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        String clientId = request == null ? null : request.clientId();
        String ownerId = authorizedOwner(browserRequest, room, clientId);
        if (ownerId == null || !room.isHostOwnedBy(clientId, ownerId)) {
            return ResponseEntity.status(403).body(Map.of(
                    "error", "Only the Host can change screen sharing access"
            ));
        }
        room.setGuestScreenSharingAllowed(request.allowed());
        publishState(room, clientId);
        return ResponseEntity.ok(ScreenShareStateResponse.from(room));
    }

    private String authorizedOwner(
            HttpServletRequest request,
            Room room,
            String clientId
    ) {
        if (clientId == null || clientId.isBlank()) {
            return null;
        }
        return authService.participantOwnerId(
                request.getSession(false),
                room.getId(),
                clientId
        ).filter(ownerId -> room.isParticipantOwnedBy(clientId, ownerId)).orElse(null);
    }

    private void publishState(Room room, String senderClientId) {
        messaging.convertAndSend(
                "/topic/room/" + room.getId(),
                SyncEvent.screenShare(room, senderClientId)
        );
    }
}
