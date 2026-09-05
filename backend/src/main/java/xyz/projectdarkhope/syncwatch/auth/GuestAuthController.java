package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/auth/guest")
public class GuestAuthController {
    private static final Pattern ROOM_ID = Pattern.compile("[A-Z0-9]{6}");

    private final RoomStore rooms;

    public GuestAuthController(RoomStore rooms) {
        this.rooms = rooms;
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<?> room(@PathVariable String roomId) {
        String normalizedRoomId = normalizeRoomId(roomId);
        return rooms.find(normalizedRoomId)
                .<ResponseEntity<?>>map(room -> ResponseEntity.ok(Map.of(
                        "roomId", room.getId(),
                        "roomName", room.getName()
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> join(
            @RequestBody GuestLoginRequest login,
            HttpServletRequest request
    ) {
        String roomId = normalizeRoomId(login == null ? null : login.roomId());
        String displayName = login == null || login.displayName() == null
                ? ""
                : login.displayName().trim();
        int nameLength = displayName.codePointCount(0, displayName.length());
        if (!ROOM_ID.matcher(roomId).matches() || nameLength < 2 || nameLength > 32) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "Enter a valid room ID and a name from 2 to 32 characters")
            );
        }

        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }

        HttpSession existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }
        HttpSession session = request.getSession(true);
        session.setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        session.setAttribute(AuthService.SESSION_ROLE, AuthService.ROLE_GUEST);
        session.setAttribute(AuthService.SESSION_GUEST_ID, "guest:" + UUID.randomUUID());
        session.setAttribute(AuthService.SESSION_GUEST_ROOM, room.getId());
        session.setAttribute(AuthService.SESSION_DISPLAY_NAME, displayName);
        session.setAttribute(AuthService.SESSION_CLIENT_ID, UUID.randomUUID().toString());
        return ResponseEntity.ok(AuthSessionResponse.guest(session));
    }

    private String normalizeRoomId(String roomId) {
        return roomId == null ? "" : roomId.trim().toUpperCase(Locale.ROOT);
    }
}
