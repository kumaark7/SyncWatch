package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/session")
    public AuthSessionResponse session(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null || !Boolean.TRUE.equals(session.getAttribute(AuthService.SESSION_AUTHENTICATED))) {
            return new AuthSessionResponse(false, null);
        }

        Object username = session.getAttribute(AuthService.SESSION_USERNAME);
        return new AuthSessionResponse(true, username instanceof String ? (String) username : authService.sessionUsername());
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest loginRequest,
            HttpServletRequest request
    ) {
        if (loginRequest == null
                || !authService.validCredentials(loginRequest.username(), loginRequest.password())) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid username or password"));
        }

        HttpSession session = request.getSession(true);
        session.setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        session.setAttribute(AuthService.SESSION_USERNAME, loginRequest.username());

        return ResponseEntity.ok(new AuthSessionResponse(true, loginRequest.username()));
    }

    @PostMapping("/logout")
    public AuthSessionResponse logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        return new AuthSessionResponse(false, null);
    }
}
