package xyz.projectdarkhope.syncwatch.stream;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.List;

@RestController
public class StreamController {
    private final RoomStore rooms;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private static final List<String> COPY_HEADERS = List.of(
            "content-type","content-length","content-range",
            "accept-ranges","etag","last-modified"
    );

    public StreamController(RoomStore rooms) { this.rooms = rooms; }

    @GetMapping("/api/stream/{roomId}")
    public void stream(
            @PathVariable String roomId,
            HttpServletRequest browserRequest,
            HttpServletResponse browserResponse
    ) throws Exception {
        Room room = rooms.find(roomId).orElse(null);

        if (room == null || !room.hasFile()
                || room.getAccessToken() == null || room.getAccessToken().isBlank()) {
            browserResponse.sendError(404);
            return;
        }

        URI uri = URI.create(
                "https://www.googleapis.com/drive/v3/files/"
                        + room.getFileId()
                        + "?alt=media"
        );

        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .GET()
                .header("Authorization", "Bearer " + room.getAccessToken())
                .timeout(Duration.ofMinutes(30));

        String range = browserRequest.getHeader("Range");
        if (range != null && !range.isBlank()) builder.header("Range", range);

        HttpResponse<InputStream> drive =
                http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());

        int status = drive.statusCode();
        if (status < 200 || status >= 300) {
            drive.body().close();
            browserResponse.sendError(status);
            return;
        }

        browserResponse.setStatus(status);

        for (String h : COPY_HEADERS) {
            drive.headers().firstValue(h).ifPresent(v ->
                    browserResponse.setHeader(headerName(h), v));
        }

        if (browserResponse.getHeader("Accept-Ranges") == null) {
            browserResponse.setHeader("Accept-Ranges", "bytes");
        }

        try (InputStream in = drive.body();
             OutputStream out = browserResponse.getOutputStream()) {
            in.transferTo(out);
        }
    }

    private String headerName(String h) {
        return switch (h) {
            case "content-type" -> "Content-Type";
            case "content-length" -> "Content-Length";
            case "content-range" -> "Content-Range";
            case "accept-ranges" -> "Accept-Ranges";
            case "etag" -> "ETag";
            case "last-modified" -> "Last-Modified";
            default -> h;
        };
    }
}
