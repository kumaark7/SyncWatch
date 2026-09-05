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
        if (authService.isAuthenticated(session)) {
            filterChain.doFilter(request, response);
            return;
        }
        if (authService.isGuestAuthenticated(session) && guestRequestAllowed(request, session)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Authentication required\"}");
    }

    private boolean guestRequestAllowed(HttpServletRequest request, HttpSession session) {
        String roomId = (String) session.getAttribute(AuthService.SESSION_GUEST_ROOM);
        String path = request.getRequestURI();
        String method = request.getMethod();
        if ("/ws".equals(path)) {
            return true;
        }
        if (("GET".equals(method) || "HEAD".equals(method))
                && path.equals("/api/stream/" + roomId)) {
            return true;
        }
        if (path.equals("/api/google/connection")) {
            return "GET".equals(method) || "DELETE".equals(method);
        }
        if (path.equals("/api/google/code")) {
            return "POST".equals(method);
        }

        String roomPath = "/api/rooms/" + roomId;
        if ("GET".equals(method)) {
            return path.equals(roomPath)
                    || path.equals(roomPath + "/chat")
                    || path.equals(roomPath + "/call/token");
        }
        if ("POST".equals(method)) {
            return path.equals(roomPath + "/leave")
                    || path.equals(roomPath + "/file")
                    || path.equals(roomPath + "/screen-share/start")
                    || path.equals(roomPath + "/screen-share/stop");
        }
        if ("PUT".equals(method)) {
            return path.equals(roomPath + "/drive-token")
                    || path.equals(roomPath + "/screen-share/guest-access");
        }
        return "DELETE".equals(method) && path.equals(roomPath + "/file");
    }
}
