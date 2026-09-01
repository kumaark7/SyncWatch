package xyz.projectdarkhope.syncwatch.room;

import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;
import xyz.projectdarkhope.syncwatch.google.GoogleOAuthException;
import xyz.projectdarkhope.syncwatch.sync.SyncEvent;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class RoomController {

    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;
    private final GoogleDriveOAuthService googleOAuth;
    private final AuthService authService;

    public RoomController(
            RoomStore rooms,
            SimpMessagingTemplate messaging,
            GoogleDriveOAuthService googleOAuth,
            AuthService authService
    ) {
        this.rooms = rooms;
        this.messaging = messaging;
        this.googleOAuth = googleOAuth;
        this.authService = authService;
    }

    @GetMapping("/health")
    public Map<String,Object> health() {
        return Map.of(
                "ok", true,
                "backend", "java-spring-boot",
                "version", "0.3"
        );
    }

    @PostMapping("/rooms")
    public RoomResponse createRoom(
            @RequestParam(required = false) String clientId,
            @RequestParam String roomName,
            HttpServletRequest browserRequest
    ) {
        String userId = currentUserId(browserRequest);
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        String cleanedRoomName = roomName == null ? "" : roomName.trim();
        int roomNameLength = cleanedRoomName.codePointCount(0, cleanedRoomName.length());
        if (roomNameLength < 2 || roomNameLength > 48) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Room name must be 2 to 48 characters"
            );
        }

        Room room = rooms.create(cleanedRoomName);

        if (clientId != null && !clientId.isBlank()) {
            room.claimHost(clientId, userId);
        }

        return RoomResponse.from(room, clientId);
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<RoomResponse> getRoom(
            @PathVariable String roomId,
            @RequestParam(required = false) String clientId
    ) {
        return rooms.find(roomId)
                .map(room -> RoomResponse.from(room, clientId))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/rooms/{roomId}/host")
    public ResponseEntity<?> transferHost(
            @PathVariable String roomId,
            @RequestBody HostTransferRequest request,
            HttpServletRequest browserRequest
    ) {
        if (request == null
                || request.currentHostClientId() == null
                || request.currentHostClientId().isBlank()
                || request.targetClientId() == null
                || request.targetClientId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "Current host and target participant are required")
            );
        }

        String userId = currentUserId(browserRequest);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            if (!room.isHostOwnedBy(request.currentHostClientId(), userId)) {
                return ResponseEntity.status(403).body(
                        Map.of("error", "Only the current host can transfer the room")
                );
            }
            if (!room.hasParticipant(request.targetClientId())) {
                return ResponseEntity.status(409).body(
                        Map.of("error", "The selected participant is no longer in the room")
                );
            }
            if (!room.transferHost(request.currentHostClientId(), request.targetClientId())) {
                return ResponseEntity.status(409).body(
                        Map.of("error", "The room host changed before the transfer completed")
                );
            }

            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.participants(room)
            );
            return ResponseEntity.ok(RoomResponse.from(room, request.currentHostClientId()));
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/rooms/{roomId}/file")
    public ResponseEntity<?> selectFile(
            @PathVariable String roomId,
            @RequestBody FileSelectionRequest request,
            HttpServletRequest browserRequest
    ) {
        if (request.fileId() == null || request.fileId().isBlank()
                || request.clientId() == null || request.clientId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "fileId and clientId are required")
            );
        }

        String userId = currentUserId(browserRequest);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        if (!room.isHostOwnedBy(request.clientId(), userId)) {
            return ResponseEntity.status(403).body(
                    Map.of("error", "Only the room host can change the Drive file")
            );
        }

        GoogleDriveOAuthService.Credentials credentials;
        try {
            credentials = googleOAuth.refreshConnection(userId);
        } catch (GoogleOAuthException error) {
            return ResponseEntity.status(401).body(Map.of("error", error.getMessage()));
        }

        room.setFileId(request.fileId());
        room.setFileName(
                request.fileName() == null || request.fileName().isBlank()
                        ? "Google Drive video"
                        : request.fileName()
        );
        room.setDriveCredentials(userId, credentials.accessToken(), credentials.expiresAt());
        room.resetPlayback();

        messaging.convertAndSend(
                "/topic/room/" + room.getId(),
                SyncEvent.fileSelected(room, request.clientId())
        );

        return ResponseEntity.ok(RoomResponse.from(room, request.clientId()));
    }

    @PutMapping("/rooms/{roomId}/drive-token")
    public ResponseEntity<?> refreshDriveToken(
            @PathVariable String roomId,
            @RequestBody DriveTokenRequest request,
            HttpServletRequest browserRequest
    ) {
        if (request.clientId() == null || request.clientId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "clientId is required")
            );
        }

        String userId = currentUserId(browserRequest);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        Room room = rooms.find(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        if (!room.isHostOwnedBy(request.clientId(), userId)) {
            return ResponseEntity.status(403).body(
                    Map.of("error", "Only the room host can refresh Drive access")
            );
        }

        if (!room.hasFile()) {
            return ResponseEntity.status(409).body(
                    Map.of("error", "No Drive file is selected")
            );
        }
        if (!userId.equals(room.getDriveOwnerUserId())) {
            return ResponseEntity.status(403).body(
                    Map.of("error", "The selected Drive file belongs to another SyncWatch user")
            );
        }

        GoogleDriveOAuthService.Credentials credentials;
        try {
            credentials = googleOAuth.refreshConnection(userId);
        } catch (GoogleOAuthException error) {
            return ResponseEntity.status(401).body(Map.of("error", error.getMessage()));
        }

        room.setDriveCredentials(userId, credentials.accessToken(), credentials.expiresAt());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/rooms/{roomId}/file")
    public ResponseEntity<?> clearFile(
            @PathVariable String roomId,
            @RequestParam String clientId,
            HttpServletRequest browserRequest
    ) {
        if (clientId == null || clientId.isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "clientId is required")
            );
        }

        String userId = currentUserId(browserRequest);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
        }

        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            if (!room.isHostOwnedBy(clientId, userId)) {
                return ResponseEntity.status(403).body(
                        Map.of("error", "Only the room host can disconnect Google Drive")
                );
            }

            room.clearFile();

            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.fileCleared(room, clientId)
            );

            return ResponseEntity.ok(
                    RoomResponse.from(room, clientId)
            );
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    private String currentUserId(HttpServletRequest request) {
        return authService.sessionUserId(request.getSession(false)).orElse(null);
    }
}
