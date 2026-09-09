package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:http-security;DB_CLOSE_DELAY=-1",
        "syncwatch.frontend-origin=https://watch.example",
        "server.servlet.session.cookie.secure=false",
        "syncwatch.remember-me.cookie-secure=false",
        "LIVEKIT_URL=ws://localhost:7880", "LIVEKIT_API_KEY=test-key",
        "LIVEKIT_API_SECRET=test-only-not-production"
})
class HttpSecurityIntegrationTest {
    @Value("${local.server.port}") private int port;
    @Autowired private RoomStore rooms;
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void realFilterChainEnforcesCsrfGuestScopeAndCallIdentity() throws Exception {
        HttpClient account = client();
        var signup = send(account, "POST", "/api/auth/signup", """
                {"username":"SecurityTest","email":"security@example.test","password":"test-password",
                 "confirmPassword":"test-password","rememberMe":false}
                """, true);
        assertThat(signup.statusCode()).isEqualTo(200);
        String userId = json.readTree(signup.body()).get("userId").asString();
        Room room = rooms.create("Security test");
        Room other = rooms.create("Other room");
        room.registerParticipant("owner-client", userId, "Owner", "owner-socket");
        room.claimHost("owner-client", userId);

        assertThat(send(account, "POST", "/api/auth/logout", "", false).statusCode()).isEqualTo(403);
        assertThat(send(account, "GET", "/api/auth/session", null, true).body()).contains("\"authenticated\":true");

        HttpClient guest = client();
        var joined = send(guest, "POST", "/api/auth/guest",
                "{\"roomId\":\"" + room.getId() + "\",\"displayName\":\"Guest\"}", true);
        assertThat(joined.statusCode()).isEqualTo(200);
        String guestClient = json.readTree(joined.body()).get("clientId").asString();
        assertThat(send(guest, "POST", "/api/rooms?roomName=Forbidden", "", true).statusCode()).isEqualTo(401);
        assertThat(send(guest, "GET", "/api/rooms/" + other.getId(), null, true).statusCode()).isEqualTo(401);
        assertThat(send(guest, "GET", "/api/stream/" + other.getId(), null, true).statusCode()).isEqualTo(401);
        assertThat(send(guest, "GET", "/api/google/connection", null, true).statusCode()).isEqualTo(403);
        assertThat(send(guest, "GET", "/api/rooms/" + room.getId() + "/call/token?clientId=owner-client", null, true).statusCode()).isEqualTo(403);
        assertThat(send(account, "GET", "/api/rooms/" + room.getId() + "/call/token?clientId=" + guestClient, null, true).statusCode()).isEqualTo(403);
        var token = send(account, "GET", "/api/rooms/" + room.getId() + "/call/token?clientId=owner-client", null, true);
        assertThat(token.statusCode()).isEqualTo(200);
        assertThat(token.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(send(account, "POST", "/api/auth/logout", "", true).statusCode()).isEqualTo(200);
        assertThat(send(account, "GET", "/api/rooms/" + room.getId(), null, true).statusCode()).isEqualTo(401);
    }

    private HttpClient client() {
        return HttpClient.newBuilder().cookieHandler(new CookieManager()).connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Test
    void realWebsocketNegotiatesHeartbeatsButRejectsBrokerInjection() throws Exception {
        HttpClient account = client();
        assertThat(send(account, "POST", "/api/auth/signup", """
                {"username":"SocketSecurity","email":"socket@example.test","password":"test-password",
                 "confirmPassword":"test-password","rememberMe":false}
                """, true).statusCode()).isEqualTo(200);
        var frames = new java.util.concurrent.LinkedBlockingQueue<String>();
        var socket = account.newWebSocketBuilder().header("Origin", "https://watch.example")
                .buildAsync(URI.create("ws://localhost:" + port + "/ws"), new java.net.http.WebSocket.Listener() {
                    private final StringBuilder incoming = new StringBuilder();
                    @Override
                    public java.util.concurrent.CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence data, boolean last) {
                        incoming.append(data);
                        if (last) { frames.add(incoming.toString()); incoming.setLength(0); }
                        ws.request(1);
                        return null;
                    }
                }).get(10, java.util.concurrent.TimeUnit.SECONDS);
        try {
            socket.sendText("CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\u0000", true).join();
            assertThat(frames.poll(5, java.util.concurrent.TimeUnit.SECONDS))
                    .contains("CONNECTED", "heart-beat:10000,10000");
            socket.sendText("SEND\ndestination:/topic/room/ABC123\n\nforged\u0000", true).join();
            assertThat(frames.poll(5, java.util.concurrent.TimeUnit.SECONDS)).contains("ERROR");
        } finally {
            socket.abort();
        }
    }

    private HttpResponse<String> send(HttpClient client, String method, String path, String body, boolean trusted) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(10)).header("Origin", trusted ? "https://watch.example" : "https://evil.example")
                .header("X-Requested-With", "XmlHttpRequest").header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
