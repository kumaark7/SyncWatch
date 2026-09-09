package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.util.Set;

/** Browser-only API: a custom header plus an exact trusted Origin prevents form CSRF. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestSecurityFilter extends OncePerRequestFilter {
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private final String frontendOrigin;

    public RequestSecurityFilter(
            @Value("${syncwatch.frontend-origin:http://localhost:5173}") String frontendOrigin
    ) {
        URI origin = URI.create(frontendOrigin);
        if (!("http".equals(origin.getScheme()) || "https".equals(origin.getScheme()))
                || origin.getHost() == null || origin.getUserInfo() != null
                || origin.getQuery() != null || origin.getFragment() != null
                || !origin.getPath().isEmpty()) {
            throw new IllegalArgumentException("Configure one exact frontend origin without a path");
        }
        this.frontendOrigin = frontendOrigin;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().equals("/api/livekit/webhook")
                || (!request.getRequestURI().startsWith("/api/")
                && !request.getRequestURI().equals("/ws"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean socket = path.equals("/ws");
        boolean mutation = !SAFE_METHODS.contains(request.getMethod());
        String origin = request.getHeader("Origin");
        if (!path.startsWith("/api/stream/")) {
            response.setHeader("Cache-Control", "no-store");
        }
        response.setHeader("X-Content-Type-Options", "nosniff");
        if ((origin != null && !frontendOrigin.equals(origin))
                || ((mutation || socket) && !frontendOrigin.equals(origin))
                || (mutation && !"XmlHttpRequest".equals(request.getHeader("X-Requested-With")))) {
            response.setStatus(403);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Untrusted browser request\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
