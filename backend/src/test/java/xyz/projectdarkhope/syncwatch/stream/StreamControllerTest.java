package xyz.projectdarkhope.syncwatch.stream;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.BiPredicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StreamControllerTest {
    private static final byte[] BODY = "media".getBytes(StandardCharsets.UTF_8);

    @ParameterizedTest
    @ValueSource(strings = {
            "bytes=0-",
            "bytes=1048576-",
            "bytes=2147483648-",
            "bytes=3221225472-"
    })
    void forwardsRangesAndPreservesPartialResponseMetadata(String range) throws Exception {
        CapturingHttpClient http = new CapturingHttpClient(response(
                206,
                new ByteArrayInputStream(BODY),
                Map.of(
                        "content-range", List.of("bytes 3221225472-4294967295/4294967296"),
                        "content-length", List.of("1073741824"),
                        "content-type", List.of("video/mp4"),
                        "accept-ranges", List.of("bytes"),
                        "etag", List.of("drive-etag"),
                        "last-modified", List.of("Wed, 10 Sep 2025 10:00:00 GMT")
                )
        ));
        Setup setup = setup(http, "access-token");
        MockHttpServletRequest request = request(setup.room());
        request.addHeader("Range", range);
        request.addHeader("If-Range", "drive-etag");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        setup.controller().stream(setup.room().getId(), request, browserResponse);

        assertThat(http.requests).singleElement().satisfies(upstream -> {
            assertThat(upstream.headers().firstValue("Range")).contains(range);
            assertThat(upstream.headers().firstValue("If-Range")).contains("drive-etag");
        });
        assertThat(browserResponse.getStatus()).isEqualTo(206);
        assertThat(browserResponse.getHeader("Content-Range"))
                .isEqualTo("bytes 3221225472-4294967295/4294967296");
        assertThat(browserResponse.getHeader("Content-Length")).isEqualTo("1073741824");
        assertThat(browserResponse.getHeader("Content-Type")).isEqualTo("video/mp4");
        assertThat(browserResponse.getHeader("Accept-Ranges")).isEqualTo("bytes");
        assertThat(browserResponse.getHeader("ETag")).isEqualTo("drive-etag");
        assertThat(browserResponse.getHeader("Last-Modified"))
                .isEqualTo("Wed, 10 Sep 2025 10:00:00 GMT");
        assertThat(browserResponse.getContentAsByteArray()).isEqualTo(BODY);
    }

    @Test
    void missingRangePreservesFullResponseWithoutInventingRangeHeader() throws Exception {
        CapturingHttpClient http = new CapturingHttpClient(response(
                200,
                new ByteArrayInputStream(BODY),
                Map.of("content-length", List.of(Integer.toString(BODY.length)))
        ));
        Setup setup = setup(http, "access-token");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        setup.controller().stream(setup.room().getId(), request(setup.room()), browserResponse);

        assertThat(http.requests).singleElement().satisfies(upstream ->
                assertThat(upstream.headers().firstValue("Range")).isEmpty());
        assertThat(browserResponse.getStatus()).isEqualTo(200);
        assertThat(browserResponse.getHeader("Accept-Ranges")).isEqualTo("bytes");
        assertThat(browserResponse.getContentAsByteArray()).isEqualTo(BODY);
    }

    @Test
    void refreshesOnceAfterUnauthorizedAndRetriesTheExactRange() throws Exception {
        TrackingInputStream rejectedBody = new TrackingInputStream(
                "must-not-reach-browser".getBytes(StandardCharsets.UTF_8));
        CapturingHttpClient http = new CapturingHttpClient(
                response(401, rejectedBody, Map.of()),
                response(206, new ByteArrayInputStream(BODY), Map.of(
                        "content-range", List.of("bytes 3221225472-3221225476/4294967296")
                ))
        );
        RoomStore rooms = new RoomStore();
        Room room = room(rooms);
        GoogleDriveOAuthService google = mock(GoogleDriveOAuthService.class);
        when(google.accessTokenFor(room)).thenReturn("expired-token");
        when(google.refreshAccessTokenAfterRejection(room, "expired-token")).thenReturn("fresh-token");
        StreamController controller = new StreamController(rooms, google, http);
        MockHttpServletRequest request = request(room);
        request.addHeader("Range", "bytes=3221225472-");
        request.addHeader("If-Range", "drive-etag");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        controller.stream(room.getId(), request, browserResponse);

        assertThat(http.requests).hasSize(2).allSatisfy(upstream -> {
            assertThat(upstream.headers().firstValue("Range")).contains("bytes=3221225472-");
            assertThat(upstream.headers().firstValue("If-Range")).contains("drive-etag");
        });
        assertThat(http.requests.get(0).headers().firstValue("Authorization"))
                .contains("Bearer expired-token");
        assertThat(http.requests.get(1).headers().firstValue("Authorization"))
                .contains("Bearer fresh-token");
        assertThat(rejectedBody.closed).isTrue();
        assertThat(browserResponse.getStatus()).isEqualTo(206);
        assertThat(browserResponse.getContentAsByteArray()).isEqualTo(BODY);
        verify(google, times(1)).refreshAccessTokenAfterRejection(room, "expired-token");
    }

    @Test
    void secondUnauthorizedIsReturnedWithoutAnInfiniteRetry() throws Exception {
        CapturingHttpClient http = new CapturingHttpClient(
                response(401, new ByteArrayInputStream(new byte[0]), Map.of()),
                response(401, new ByteArrayInputStream(new byte[0]), Map.of())
        );
        RoomStore rooms = new RoomStore();
        Room room = room(rooms);
        GoogleDriveOAuthService google = mock(GoogleDriveOAuthService.class);
        when(google.accessTokenFor(room)).thenReturn("expired-token");
        when(google.refreshAccessTokenAfterRejection(room, "expired-token")).thenReturn("fresh-token");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        new StreamController(rooms, google, http).stream(room.getId(), request(room), browserResponse);

        assertThat(http.requests).hasSize(2);
        assertThat(browserResponse.getStatus()).isEqualTo(401);
        verify(google, times(1)).refreshAccessTokenAfterRejection(room, "expired-token");
    }

    @Test
    void preservesUnsatisfiedRangeMetadata() throws Exception {
        CapturingHttpClient http = new CapturingHttpClient(response(
                416,
                new ByteArrayInputStream(new byte[0]),
                Map.of("content-range", List.of("bytes */4294967296"))
        ));
        Setup setup = setup(http, "access-token");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        setup.controller().stream(setup.room().getId(), request(setup.room()), browserResponse);

        assertThat(browserResponse.getStatus()).isEqualTo(416);
        assertThat(browserResponse.getHeader("Content-Range")).isEqualTo("bytes */4294967296");
    }

    @Test
    void malformedRangeFailureIsReturnedWithoutRetryingFromZero() throws Exception {
        CapturingHttpClient http = new CapturingHttpClient(response(
                400,
                new ByteArrayInputStream(new byte[0]),
                Map.of()
        ));
        Setup setup = setup(http, "access-token");
        MockHttpServletRequest request = request(setup.room());
        request.addHeader("Range", "bytes=not-a-range");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        setup.controller().stream(setup.room().getId(), request, browserResponse);

        assertThat(http.requests).singleElement().satisfies(upstream ->
                assertThat(upstream.headers().firstValue("Range")).contains("bytes=not-a-range"));
        assertThat(browserResponse.getStatus()).isEqualTo(400);
    }

    @Test
    void downstreamAbortClosesUpstreamWithoutRetryOrException() throws Exception {
        TrackingInputStream body = new TrackingInputStream(BODY);
        CapturingHttpClient http = new CapturingHttpClient(response(206, body, Map.of()));
        Setup setup = setup(http, "access-token");

        assertThatCode(() -> setup.controller().stream(
                setup.room().getId(),
                request(setup.room()),
                new AbortingResponse()
        )).doesNotThrowAnyException();

        assertThat(body.closed).isTrue();
        assertThat(http.requests).hasSize(1);
    }

    @Test
    void upstreamOpenFailureReturnsBadGateway() throws Exception {
        CapturingHttpClient http = new CapturingHttpClient(new IOException("upstream failed"));
        Setup setup = setup(http, "access-token");
        MockHttpServletResponse browserResponse = new MockHttpServletResponse();

        setup.controller().stream(setup.room().getId(), request(setup.room()), browserResponse);

        assertThat(browserResponse.getStatus()).isEqualTo(502);
    }

    @Test
    void upstreamTransferFailureClosesBodyAndRemainsVisible() {
        FailingInputStream body = new FailingInputStream();
        CapturingHttpClient http = new CapturingHttpClient(response(206, body, Map.of()));
        Setup setup = setup(http, "access-token");

        assertThatThrownBy(() -> setup.controller().stream(
                setup.room().getId(),
                request(setup.room()),
                new MockHttpServletResponse()
        )).isInstanceOf(IOException.class)
                .hasMessageContaining("upstream transfer failed");

        assertThat(body.closed).isTrue();
        assertThat(http.requests).hasSize(1);
    }

    private Setup setup(HttpClient http, String token) {
        RoomStore rooms = new RoomStore();
        Room room = room(rooms);
        GoogleDriveOAuthService google = mock(GoogleDriveOAuthService.class);
        when(google.accessTokenFor(room)).thenReturn(token);
        return new Setup(new StreamController(rooms, google, http), room);
    }

    private Room room(RoomStore rooms) {
        Room room = rooms.create("Test Room");
        room.setFileId("drive-file");
        return room;
    }

    private MockHttpServletRequest request(Room room) {
        return new MockHttpServletRequest("GET", "/api/stream/" + room.getId());
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<InputStream> response(
            int status,
            InputStream body,
            Map<String, List<String>> headers
    ) {
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        BiPredicate<String, String> acceptAll = (name, value) -> true;
        when(response.headers()).thenReturn(HttpHeaders.of(headers, acceptAll));
        return response;
    }

    private record Setup(StreamController controller, Room room) {
    }

    private static final class TrackingInputStream extends ByteArrayInputStream {
        private boolean closed;

        private TrackingInputStream(byte[] bytes) {
            super(bytes);
        }

        @Override
        public void close() throws IOException {
            closed = true;
            super.close();
        }
    }

    private static final class FailingInputStream extends InputStream {
        private boolean closed;

        @Override
        public int read() throws IOException {
            throw new IOException("upstream transfer failed");
        }

        @Override
        public void close() {
            closed = true;
        }
    }

    private static final class AbortingResponse extends MockHttpServletResponse {
        @Override
        public ServletOutputStream getOutputStream() {
            return new ServletOutputStream() {
                @Override public boolean isReady() { return true; }
                @Override public void setWriteListener(WriteListener writeListener) { }
                @Override public void write(int value) throws IOException {
                    throw new ClientAbortException("browser closed range");
                }
            };
        }
    }

    private static final class CapturingHttpClient extends HttpClient {
        private final List<HttpResponse<InputStream>> responses;
        private final IOException failure;
        private final ArrayList<HttpRequest> requests = new ArrayList<>();
        private int responseIndex;

        @SafeVarargs
        private CapturingHttpClient(HttpResponse<InputStream>... responses) {
            this.responses = List.of(responses);
            this.failure = null;
        }

        private CapturingHttpClient(IOException failure) {
            this.responses = List.of();
            this.failure = failure;
        }

        @Override
        @SuppressWarnings("unchecked")
        public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> bodyHandler)
                throws IOException {
            requests.add(request);
            if (failure != null) throw failure;
            return (HttpResponse<T>) responses.get(responseIndex++);
        }

        @Override
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(
                HttpRequest request,
                HttpResponse.BodyHandler<T> bodyHandler
        ) {
            throw new UnsupportedOperationException();
        }

        @Override
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(
                HttpRequest request,
                HttpResponse.BodyHandler<T> bodyHandler,
                HttpResponse.PushPromiseHandler<T> pushPromiseHandler
        ) {
            throw new UnsupportedOperationException();
        }

        @Override public Optional<CookieHandler> cookieHandler() { return Optional.empty(); }
        @Override public Optional<Duration> connectTimeout() { return Optional.empty(); }
        @Override public Redirect followRedirects() { return Redirect.NEVER; }
        @Override public Optional<ProxySelector> proxy() { return Optional.empty(); }
        @Override public SSLContext sslContext() { return null; }
        @Override public SSLParameters sslParameters() { return new SSLParameters(); }
        @Override public Optional<Authenticator> authenticator() { return Optional.empty(); }
        @Override public Version version() { return Version.HTTP_1_1; }
        @Override public Optional<Executor> executor() { return Optional.empty(); }
    }
}
