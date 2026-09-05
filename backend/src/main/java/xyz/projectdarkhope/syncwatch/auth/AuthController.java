package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final RememberMeService rememberMe;
    private final GoogleDriveOAuthService googleOAuth;

    public AuthController(
            AuthService authService,
            RememberMeService rememberMe,
            GoogleDriveOAuthService googleOAuth
    ) {
        this.authService = authService;
        this.rememberMe = rememberMe;
        this.googleOAuth = googleOAuth;
    }

    @GetMapping("/session")
    public AuthSessionResponse session(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        HttpSession session = request.getSession(false);
        UserAccount currentUser = authService.sessionUser(session).orElse(null);
        if (currentUser != null) {
            return AuthSessionResponse.authenticated(currentUser);
        }
        if (authService.isGuestAuthenticated(session)) {
            return AuthSessionResponse.guest(session);
        }

        UserAccount rememberedUser = rememberMe.restore(request, response).orElse(null);
        if (rememberedUser != null) {
            establishSession(request, rememberedUser);
            return AuthSessionResponse.authenticated(rememberedUser);
        }

        if (session != null) {
            session.invalidate();
        }
        return AuthSessionResponse.signedOut();
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signUp(
            @RequestBody SignUpRequest signUpRequest,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        try {
            UserAccount user = authService.register(signUpRequest);
            establishSession(request, user);
            if (signUpRequest.rememberMe()) {
                rememberMe.issue(user.id(), request, response);
            } else {
                rememberMe.revoke(request, response);
            }
            return ResponseEntity.ok(AuthSessionResponse.authenticated(user));
        } catch (AuthException error) {
            return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest loginRequest,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        try {
            UserAccount user = authService.authenticate(loginRequest);
            establishSession(request, user);
            if (loginRequest.rememberMe()) {
                rememberMe.issue(user.id(), request, response);
            } else {
                rememberMe.revoke(request, response);
            }
            return ResponseEntity.ok(AuthSessionResponse.authenticated(user));
        } catch (AuthException error) {
            return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
        }
    }

    @PostMapping("/logout")
    public AuthSessionResponse logout(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        rememberMe.revoke(request, response);
        HttpSession session = request.getSession(false);
        if (session != null) {
            if (session.getAttribute(AuthService.SESSION_GUEST_ID) instanceof String guestId) {
                googleOAuth.forgetTemporaryConnection(guestId);
            }
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
