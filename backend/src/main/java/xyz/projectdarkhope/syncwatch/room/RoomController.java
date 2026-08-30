package xyz.projectdarkhope.syncwatch.room;

import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;
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

    public RoomController(
            RoomStore rooms,
            SimpMessagingTemplate messaging,
            GoogleDriveOAuthService googleOAuth
    ) {
        this.rooms = rooms;
        this.messaging = messaging;
        this.googleOAuth = googleOAuth;
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
            @RequestParam String roomName
    ) {
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
            room.claimHost(clientId);
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

    @PostMapping("/rooms/{roomId}/file")
    public ResponseEntity<?> selectFile(
            @PathVariable String roomId,
            @RequestBody FileSelectionRequest request,
            HttpServletRequest browserRequest
    ) {
        if (request.fileId() == null || request.fileId().isBlank()
                || request.accessToken() == null || request.accessToken().isBlank()
                || request.clientId() == null || request.clientId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "fileId, accessToken and clientId are required")
            );
        }

        GoogleDriveOAuthService.Credentials credentials;
        try {
            credentials = googleOAuth.refreshConnection(browserRequest);
        } catch (GoogleOAuthException error) {
            return ResponseEntity.status(401).body(Map.of("error", error.getMessage()));
        }

        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            if (!room.isHost(request.clientId())) {
                return ResponseEntity.status(403).body(
                        Map.of("error", "Only the room host can change the Drive file")
                );
            }

            room.setFileId(request.fileId());
            room.setFileName(
                    request.fileName() == null || request.fileName().isBlank()
                            ? "Google Drive video"
                            : request.fileName()
            );
            room.setDriveCredentials(
                    credentials.accessToken(),
                    credentials.expiresAt(),
                    credentials.refreshToken()
            );
            room.resetPlayback();

            messaging.convertAndSend(
                    "/topic/room/" + room.getId(),
                    SyncEvent.fileSelected(room, request.clientId())
            );

            return ResponseEntity.ok(
                    RoomResponse.from(room, request.clientId())
            );
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/rooms/{roomId}/drive-token")
    public ResponseEntity<?> refreshDriveToken(
            @PathVariable String roomId,
            @RequestBody DriveTokenRequest request,
            HttpServletRequest browserRequest
    ) {
        if (request.accessToken() == null || request.accessToken().isBlank()
                || request.clientId() == null || request.clientId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "accessToken and clientId are required")
            );
        }

        GoogleDriveOAuthService.Credentials credentials;
        try {
            credentials = googleOAuth.refreshConnection(browserRequest);
        } catch (GoogleOAuthException error) {
            return ResponseEntity.status(401).body(Map.of("error", error.getMessage()));
        }

        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            if (!room.isHost(request.clientId())) {
                return ResponseEntity.status(403).body(
                        Map.of("error", "Only the room host can refresh Drive access")
                );
            }

            if (!room.hasFile()) {
                return ResponseEntity.status(409).body(
                        Map.of("error", "No Drive file is selected")
                );
            }

            room.setDriveCredentials(
                    credentials.accessToken(),
                    credentials.expiresAt(),
                    credentials.refreshToken()
            );
            return ResponseEntity.noContent().build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/rooms/{roomId}/file")
    public ResponseEntity<?> clearFile(
            @PathVariable String roomId,
            @RequestParam String clientId
    ) {
        if (clientId == null || clientId.isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "clientId is required")
            );
        }

        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            if (!room.isHost(clientId)) {
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
}
