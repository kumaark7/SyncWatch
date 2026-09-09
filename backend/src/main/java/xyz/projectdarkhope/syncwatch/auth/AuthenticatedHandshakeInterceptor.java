package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

import java.util.Map;

public class AuthenticatedHandshakeInterceptor extends HttpSessionHandshakeInterceptor {
    static final String LIVE_SESSION = "syncwatchLiveHttpSession";

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler handler, Map<String, Object> attributes) throws Exception {
        if (!(request instanceof ServletServerHttpRequest servlet)) return false;
        var session = servlet.getServletRequest().getSession(false);
        if (session == null) return false;
        if (!super.beforeHandshake(request, response, handler, attributes)) return false;
        // Copied authentication attributes alone remain valid after logout/session expiry.
        attributes.put(LIVE_SESSION, session);
        return true;
    }
}
