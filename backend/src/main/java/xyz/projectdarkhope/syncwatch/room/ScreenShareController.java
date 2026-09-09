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
import xyz.projectdarkhope.syncwatch.call.LiveKitAdminException;
import xyz.projectdarkhope.syncwatch.call.LiveKitScreenShareAuthorizer;
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
    private final LiveKitScreenShareAuthorizer liveKitScreenShare;

    public ScreenShareController(
            RoomStore rooms,
            AuthService authService,
            SimpMessagingTemplate messaging,
            LiveKitScreenShareAuthorizer liveKitScreenShare
    ) {
        this.rooms = rooms;
        this.authService = authService;
        this.messaging = messaging;
        this.liveKitScreenShare = liveKitScreenShare;
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
            try {
                if (liveKitScreenShare.grant(room, clientId)
                        == LiveKitScreenShareAuthorizer.Result.PARTICIPANT_NOT_CONNECTED) {
                    room.stopScreenShare(clientId);
                    return ResponseEntity.status(409).body(Map.of(
                            "error", "Join the call before sharing your screen"
                    ));
                }
            } catch (LiveKitAdminException error) {
                room.stopScreenShare(clientId);
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Screen sharing is temporarily unavailable"
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
        synchronized (room) {
            if (clientId.equals(room.getScreenSharerClientId())) {
                try {
                    liveKitScreenShare.revoke(room, clientId);
                } catch (LiveKitAdminException error) {
                    return ResponseEntity.status(503).body(Map.of(
                            "error", "Could not stop screen sharing"
                    ));
                }
                room.stopScreenShare(clientId);
                publishState(room, clientId);
            }
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
        synchronized (room) {
            String activeClientId = room.getScreenSharerClientId();
            boolean revokesActiveGuest = !request.allowed()
                    && activeClientId != null
                    && !room.isHost(activeClientId)
                    && room.getParticipantOwnerId(activeClientId) != null
                    && room.getParticipantOwnerId(activeClientId).startsWith("guest:");
            if (revokesActiveGuest) {
                try {
                    liveKitScreenShare.revoke(room, activeClientId);
                } catch (LiveKitAdminException error) {
                    return ResponseEntity.status(503).body(Map.of(
                            "error", "Could not update screen sharing access"
                    ));
                }
            }
            room.setGuestScreenSharingAllowed(request.allowed());
        }
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
