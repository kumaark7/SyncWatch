package xyz.projectdarkhope.syncwatch.call;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.Map;

@RestController
@RequestMapping("/api/rooms/{roomId}/call")
public class CallController {
    private final RoomStore rooms;
    private final AuthService authService;
    private final LiveKitTokenService tokenService;

    public CallController(
            RoomStore rooms,
            AuthService authService,
            LiveKitTokenService tokenService
    ) {
        this.rooms = rooms;
        this.authService = authService;
        this.tokenService = tokenService;
    }

    @GetMapping("/token")
    public ResponseEntity<?> token(
            @PathVariable String roomId,
            @RequestParam String clientId,
            HttpServletRequest request
    ) {
        HttpSession session = request.getSession(false);
        if (!authService.isAuthenticated(session)) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }

        String authoritativeClientId = resolveAuthorizedClientId(session, room, clientId);
        if (authoritativeClientId == null) {
            return ResponseEntity.status(403).body(Map.of("error", "Not authorized for this room call"));
        }

        String displayName = room.getParticipantName(authoritativeClientId);
        if (displayName == null || displayName.isBlank()) {
            return ResponseEntity.status(403).body(Map.of("error", "Join the watch room before joining its call"));
        }

        try {
            return ResponseEntity.ok(tokenService.createToken(room, authoritativeClientId, displayName));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(503).body(Map.of("error", "Room call is unavailable"));
        }
    }

    private String resolveAuthorizedClientId(HttpSession session, Room room, String requestedClientId) {
        if (requestedClientId == null || requestedClientId.isBlank()) {
            return null;
        }

        return authService.sessionUserId(session)
                .filter(userId -> room.isParticipantOwnedBy(requestedClientId, userId))
                .map(ignored -> requestedClientId)
                .orElse(null);
    }
}
