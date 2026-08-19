package xyz.projectdarkhope.syncwatch.room;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import xyz.projectdarkhope.syncwatch.sync.SyncEvent;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class RoomController {

    private final RoomStore rooms;
    private final SimpMessagingTemplate messaging;

    public RoomController(RoomStore rooms, SimpMessagingTemplate messaging) {
        this.rooms = rooms;
        this.messaging = messaging;
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
            @RequestParam(required = false) String clientId
    ) {
        Room room = rooms.create();

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
            @RequestBody FileSelectionRequest request
    ) {
        if (request.fileId() == null || request.fileId().isBlank()
                || request.accessToken() == null || request.accessToken().isBlank()
                || request.clientId() == null || request.clientId().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "fileId, accessToken and clientId are required")
            );
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
            room.setAccessToken(request.accessToken());
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
