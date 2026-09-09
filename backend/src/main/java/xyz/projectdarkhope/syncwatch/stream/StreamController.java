package xyz.projectdarkhope.syncwatch.stream;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;
import xyz.projectdarkhope.syncwatch.google.GoogleOAuthException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@RestController
public class StreamController {
    private static final Logger logger = LoggerFactory.getLogger(StreamController.class);
    private static final AtomicLong REQUEST_SEQUENCE = new AtomicLong();
    private final RoomStore rooms;
    private final GoogleDriveOAuthService googleOAuth;
    private final HttpClient http;

    private static final List<String> COPY_HEADERS = List.of(
            "content-type","content-length","content-range",
            "accept-ranges","etag","last-modified"
    );

    @Autowired
    public StreamController(RoomStore rooms, GoogleDriveOAuthService googleOAuth) {
        this(rooms, googleOAuth, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build());
    }

    StreamController(RoomStore rooms, GoogleDriveOAuthService googleOAuth, HttpClient http) {
        this.rooms = rooms;
        this.googleOAuth = googleOAuth;
        this.http = http;
    }

    @GetMapping("/api/stream/{roomId}")
    public void stream(
            @PathVariable String roomId,
            HttpServletRequest browserRequest,
            HttpServletResponse browserResponse
    ) throws IOException {
        Room room = rooms.find(roomId).orElse(null);

        if (room == null || !room.hasFile()) {
            browserResponse.sendError(404);
            return;
        }

        long requestId = REQUEST_SEQUENCE.incrementAndGet();
        String range = browserRequest.getHeader("Range");
        String ifRange = browserRequest.getHeader("If-Range");
        String diagnosticRange = safeRange(range);
        String accessToken;
        try {
            accessToken = googleOAuth.accessTokenFor(room);
        } catch (GoogleOAuthException error) {
            browserResponse.sendError(401, "Google Drive authorization expired");
            return;
        }

        URI uri = URI.create(
                "https://www.googleapis.com/drive/v3/files/"
                        + room.getFileId()
                        + "?alt=media"
        );

        logger.debug("Opening Drive media range; streamRequest={}; range={}", requestId, diagnosticRange);

        HttpResponse<InputStream> drive;
        boolean retriedAfterUnauthorized = false;
        try {
            drive = openDrive(uri, accessToken, range, ifRange);
            if (drive.statusCode() == HttpServletResponse.SC_UNAUTHORIZED) {
                closeQuietly(drive.body());
                accessToken = googleOAuth.refreshAccessTokenAfterRejection(room, accessToken);
                retriedAfterUnauthorized = true;
                logger.info("Retrying Drive media range after token refresh; streamRequest={}; range={}",
                        requestId, diagnosticRange);
                drive = openDrive(uri, accessToken, range, ifRange);
            }
        } catch (GoogleOAuthException error) {
            browserResponse.sendError(HttpServletResponse.SC_UNAUTHORIZED,
                    "Google Drive authorization expired");
            return;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            browserResponse.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            return;
        } catch (IOException error) {
            logger.warn("Could not open Drive media range; streamRequest={}; range={}",
                    requestId, diagnosticRange, error);
            browserResponse.sendError(HttpServletResponse.SC_BAD_GATEWAY);
            return;
        }

        int status = drive.statusCode();
        logger.info("Drive media range opened; streamRequest={}; range={}; status={}; retried={}",
                requestId, diagnosticRange, status, retriedAfterUnauthorized);
        if (status < 200 || status >= 300) {
            if (status == HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE) {
                browserResponse.setStatus(status);
                drive.headers().firstValue("content-range").ifPresent(value ->
                        browserResponse.setHeader("Content-Range", value));
                drive.headers().firstValue("accept-ranges").ifPresent(value ->
                        browserResponse.setHeader("Accept-Ranges", value));
            } else {
                browserResponse.sendError(status);
            }
            closeQuietly(drive.body());
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
        } catch (IOException error) {
            if (isClientAbort(error)) {
                logger.info("Browser abandoned Drive media range; streamRequest={}; range={}",
                        requestId, diagnosticRange);
                return;
            }
            logger.warn("Drive media range failed during transfer; streamRequest={}; range={}",
                    requestId, diagnosticRange, error);
            throw error;
        }
    }

    private HttpResponse<InputStream> openDrive(
            URI uri,
            String accessToken,
            String range,
            String ifRange
    ) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .GET()
                .header("Authorization", "Bearer " + accessToken)
                .timeout(Duration.ofMinutes(30));

        if (range != null && !range.isBlank()) {
            builder.header("Range", range);
            if (ifRange != null && !ifRange.isBlank()) {
                builder.header("If-Range", ifRange);
            }
        }

        return http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    private boolean isClientAbort(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current instanceof ClientAbortException) {
                return true;
            }
        }
        return false;
    }

    private void closeQuietly(InputStream input) {
        if (input == null) {
            return;
        }
        try {
            input.close();
        } catch (IOException ignored) {
            // The response is already obsolete or rejected; there is nothing else to send.
        }
    }

    private String safeRange(String range) {
        if (range == null || range.isBlank()) {
            return "none";
        }
        String singleLine = range.replace('\r', ' ').replace('\n', ' ').trim();
        return singleLine.length() <= 128 ? singleLine : singleLine.substring(0, 128) + "...";
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
