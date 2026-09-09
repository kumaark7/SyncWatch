package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Set;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RequestRateLimitFilter extends OncePerRequestFilter {
    private final RequestRateLimiter limiter;

    public RequestRateLimitFilter(RequestRateLimiter limiter) { this.limiter = limiter; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        Policy policy = policy(request);
        if (policy != null) {
            String owner = policy.byAddress ? "ip:" + request.getRemoteAddr() : owner(request);
            if (!limiter.allow(policy.name + ":" + owner, policy.limit,
                    Duration.ofSeconds(policy.seconds))) {
                response.setStatus(429);
                response.setHeader("Retry-After", Long.toString(policy.seconds));
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"Too many requests. Please try again later.\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private String owner(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            if (session.getAttribute(AuthService.SESSION_USER_ID) instanceof String user) return "user:" + user;
            if (session.getAttribute(AuthService.SESSION_GUEST_ID) instanceof String guest) return guest;
        }
        // Never trust caller-supplied X-Forwarded-For. The container owns proxy trust configuration.
        return "ip:" + request.getRemoteAddr();
    }

    private Policy policy(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if (method.equals("OPTIONS") || path.startsWith("/api/stream/")) return null;
        if (path.equals("/api/auth/login")) return new Policy("login", 30, 300, true);
        if (path.equals("/api/auth/signup")) return new Policy("signup", 10, 3600, true);
        if (path.startsWith("/api/auth/guest")) return new Policy("guest", 60, 300, true);
        if (path.equals("/api/auth/session")) return new Policy("session", 60, 60, false);
        if (path.startsWith("/api/google/")) return new Policy("oauth", 30, 60, false);
        if (path.equals("/ws")) return new Policy("socket", 30, 60, false);
        if (path.endsWith("/call/token")) return new Policy("call", 20, 60, false);
        if (path.equals("/api/rooms") && method.equals("POST")) return new Policy("create", 10, 600, false);
        if (path.startsWith("/api/rooms/") && !Set.of("GET", "HEAD").contains(method)) {
            return new Policy("room-action", 90, 60, false);
        }
        if (path.startsWith("/api/rooms/")) return new Policy("room-read", 120, 60, false);
        return null;
    }

    private record Policy(String name, int limit, long seconds, boolean byAddress) {}
}
