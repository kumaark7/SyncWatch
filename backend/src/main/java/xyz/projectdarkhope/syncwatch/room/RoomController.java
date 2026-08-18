package xyz.projectdarkhope.syncwatch.room;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class RoomController {
    private final RoomStore rooms;

    public RoomController(RoomStore rooms) { this.rooms = rooms; }

    @GetMapping("/health")
    public Map<String,Object> health() {
        return Map.of("ok", true, "backend", "java-spring-boot", "version", "0.1");
    }

    @PostMapping("/rooms")
    public RoomResponse createRoom() {
        return RoomResponse.from(rooms.create());
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<RoomResponse> getRoom(@PathVariable String roomId) {
        return rooms.find(roomId)
                .map(RoomResponse::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/rooms/{roomId}/file")
    public ResponseEntity<?> selectFile(
            @PathVariable String roomId,
            @RequestBody FileSelectionRequest request
    ) {
        if (request.fileId() == null || request.fileId().isBlank()
                || request.accessToken() == null || request.accessToken().isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "fileId and accessToken are required")
            );
        }

        return rooms.find(roomId).<ResponseEntity<?>>map(room -> {
            room.setFileId(request.fileId());
            room.setFileName(
                    request.fileName() == null || request.fileName().isBlank()
                            ? "Google Drive video" : request.fileName()
            );
            room.setAccessToken(request.accessToken());
            return ResponseEntity.ok(Map.of("ok", true));
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
