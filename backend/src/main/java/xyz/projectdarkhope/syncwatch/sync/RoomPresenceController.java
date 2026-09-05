package xyz.projectdarkhope.syncwatch.sync;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.projectdarkhope.syncwatch.auth.AuthService;

import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
public class RoomPresenceController {
    private final RoomPresenceService presence;
    private final AuthService authService;

    public RoomPresenceController(RoomPresenceService presence, AuthService authService) {
        this.presence = presence;
        this.authService = authService;
    }

    @PostMapping("/{roomId}/leave")
    public ResponseEntity<Void> leaveRoom(
            @PathVariable String roomId,
            @RequestParam String clientId,
            HttpServletRequest request
    ) {
        String ownerId = authService.participantOwnerId(
                request.getSession(false),
                roomId,
                clientId
        ).orElse(null);
        if (ownerId == null) {
            return ResponseEntity.status(403).build();
        }
        return switch (presence.leaveImmediately(roomId, ownerId, clientId)) {
            case LEFT -> ResponseEntity.noContent().build();
            case FORBIDDEN -> ResponseEntity.status(403).build();
            case NOT_FOUND -> ResponseEntity.notFound().build();
        };
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<?> closeRoom(
            @PathVariable String roomId,
            @RequestParam String clientId,
            HttpServletRequest request
    ) {
        String userId = currentUserId(request);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }
        return switch (presence.closeRoom(roomId, userId, clientId)) {
            case CLOSED -> ResponseEntity.noContent().build();
            case FORBIDDEN -> ResponseEntity.status(403).body(
                    Map.of("error", "Only the current host can close the room")
            );
            case NOT_FOUND -> ResponseEntity.notFound().build();
        };
    }

    private String currentUserId(HttpServletRequest request) {
        return authService.sessionUserId(request.getSession(false)).orElse(null);
    }
}
