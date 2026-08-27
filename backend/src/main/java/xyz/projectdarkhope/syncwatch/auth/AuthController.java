package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final RoomStore rooms;

    public AuthController(AuthService authService, RoomStore rooms) {
        this.authService = authService;
        this.rooms = rooms;
    }

    @GetMapping("/session")
    public AuthSessionResponse session(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null || !Boolean.TRUE.equals(session.getAttribute(AuthService.SESSION_AUTHENTICATED))) {
            return new AuthSessionResponse(false, null, null, null, null, null);
        }

        Object username = session.getAttribute(AuthService.SESSION_USERNAME);
        Object role = session.getAttribute(AuthService.SESSION_ROLE);
        Object allowedRoom = session.getAttribute(AuthService.SESSION_GUEST_ROOM);
        Object displayName = session.getAttribute(AuthService.SESSION_DISPLAY_NAME);
        Object clientId = session.getAttribute(AuthService.SESSION_CLIENT_ID);
        return new AuthSessionResponse(
                true,
                username instanceof String ? (String) username : authService.sessionUsername(),
                role instanceof String ? (String) role : AuthService.ROLE_ADMIN,
                allowedRoom instanceof String ? (String) allowedRoom : null,
                displayName instanceof String ? (String) displayName : null,
                clientId instanceof String ? (String) clientId : null
        );
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest loginRequest,
            HttpServletRequest request
    ) {
        if (loginRequest == null
                || !authService.validCredentials(loginRequest.username(), loginRequest.password())) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid username or password"));
        }

        HttpSession session = request.getSession(true);
        session.setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        session.setAttribute(AuthService.SESSION_USERNAME, loginRequest.username());
        session.setAttribute(AuthService.SESSION_ROLE, AuthService.ROLE_ADMIN);
        session.removeAttribute(AuthService.SESSION_GUEST_ROOM);
        session.removeAttribute(AuthService.SESSION_DISPLAY_NAME);
        session.removeAttribute(AuthService.SESSION_CLIENT_ID);

        return ResponseEntity.ok(new AuthSessionResponse(
                true,
                loginRequest.username(),
                AuthService.ROLE_ADMIN,
                null,
                null,
                null
        ));
    }

    @GetMapping("/guest-room/{roomId}")
    public ResponseEntity<?> guestRoom(@org.springframework.web.bind.annotation.PathVariable String roomId) {
        return rooms.find(roomId)
                .<ResponseEntity<?>>map(room -> ResponseEntity.ok(Map.of("roomId", room.getId())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/guest")
    public ResponseEntity<?> guest(
            @RequestBody GuestLoginRequest guestRequest,
            HttpServletRequest request
    ) {
        if (guestRequest == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Room and display name are required"));
        }

        Room room = rooms.find(guestRequest.roomId()).orElse(null);
        if (room == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Room not found or no longer available"));
        }

        String displayName = guestRequest.displayName() == null
                ? ""
                : guestRequest.displayName().trim();
        int nameLength = displayName.codePointCount(0, displayName.length());
        if (nameLength < 2 || nameLength > 32) {
            return ResponseEntity.badRequest().body(Map.of("error", "Display name must be 2 to 32 characters"));
        }

        HttpSession session = request.getSession(true);
        session.setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        session.setAttribute(AuthService.SESSION_USERNAME, displayName);
        session.setAttribute(AuthService.SESSION_ROLE, AuthService.ROLE_GUEST);
        session.setAttribute(AuthService.SESSION_GUEST_ROOM, room.getId());
        session.setAttribute(AuthService.SESSION_DISPLAY_NAME, displayName);
        String clientId = UUID.randomUUID().toString();
        session.setAttribute(AuthService.SESSION_CLIENT_ID, clientId);

        return ResponseEntity.ok(new AuthSessionResponse(
                true,
                displayName,
                AuthService.ROLE_GUEST,
                room.getId(),
                displayName,
                clientId
        ));
    }

    @PostMapping("/logout")
    public AuthSessionResponse logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        return new AuthSessionResponse(false, null, null, null, null, null);
    }
}
