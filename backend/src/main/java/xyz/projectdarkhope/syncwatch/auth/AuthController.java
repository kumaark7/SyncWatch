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
        return authService.sessionUser(session)
                .map(AuthSessionResponse::authenticated)
                .orElseGet(() -> {
                    if (session != null) {
                        session.invalidate();
                    }
                    return AuthSessionResponse.signedOut();
                });
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signUp(
            @RequestBody SignUpRequest signUpRequest,
            HttpServletRequest request
    ) {
        try {
            UserAccount user = authService.register(signUpRequest);
            establishSession(request, user);
            return ResponseEntity.ok(AuthSessionResponse.authenticated(user));
        } catch (AuthException error) {
            return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest loginRequest,
            HttpServletRequest request
    ) {
        try {
            UserAccount user = authService.authenticate(loginRequest);
            establishSession(request, user);
            return ResponseEntity.ok(AuthSessionResponse.authenticated(user));
        } catch (AuthException error) {
            return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
        }
    }

    @PostMapping("/logout")
    public AuthSessionResponse logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return AuthSessionResponse.signedOut();
    }

    private void establishSession(HttpServletRequest request, UserAccount user) {
        HttpSession existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }
        HttpSession session = request.getSession(true);
        session.setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        session.setAttribute(AuthService.SESSION_USER_ID, user.id());
        session.setAttribute(AuthService.SESSION_USERNAME, user.username());
        session.setAttribute(AuthService.SESSION_EMAIL, user.email());
        session.setAttribute(AuthService.SESSION_ROLE, AuthService.ROLE_USER);
    }
}
