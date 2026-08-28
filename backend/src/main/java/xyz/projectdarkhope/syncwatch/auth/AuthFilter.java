package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class AuthFilter extends OncePerRequestFilter {
    private final AuthService authService;

    public AuthFilter(AuthService authService) {
        this.authService = authService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        if (path.startsWith("/api/auth/")) {
            return true;
        }

        if ("/api/health".equals(path)) {
            return true;
        }

        return !path.startsWith("/api/") && !path.startsWith("/ws");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        if (authService.isAdmin(session)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (authService.isAuthenticated(session)) {
            if ("/ws".equals(request.getRequestURI())) {
                filterChain.doFilter(request, response);
                return;
            }

            String roomId = roomIdFromGuestPath(request.getRequestURI(), request.getMethod());
            if (roomId != null && authService.isGuestAllowedInRoom(session, roomId)) {
                filterChain.doFilter(request, response);
                return;
            }

            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Guest access is limited to the invited room\"}");
            return;
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Authentication required\"}");
    }

    private String roomIdFromGuestPath(String path, String method) {
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
            return null;
        }

        String roomsPrefix = "/api/rooms/";
        if (path.startsWith(roomsPrefix)) {
            String remainder = path.substring(roomsPrefix.length());
            String[] parts = remainder.split("/", -1);
            if (parts.length == 1
                    || (parts.length == 2 && "chat".equals(parts[1]))
                    || (parts.length == 3
                    && "call".equals(parts[1])
                    && "token".equals(parts[2]))) {
                return parts[0];
            }
        }

        String streamPrefix = "/api/stream/";
        if (path.startsWith(streamPrefix)) {
            String remainder = path.substring(streamPrefix.length());
            if (!remainder.isBlank() && !remainder.contains("/")) {
                return remainder;
            }
        }

        return null;
    }
}
