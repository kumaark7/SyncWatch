package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpSession;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class AuthService {
    public static final String SESSION_AUTHENTICATED = "syncwatchAuthenticated";
    public static final String SESSION_USER_ID = "syncwatchUserId";
    public static final String SESSION_USERNAME = "syncwatchUsername";
    public static final String SESSION_EMAIL = "syncwatchEmail";
    public static final String SESSION_ROLE = "syncwatchRole";
    public static final String SESSION_GUEST_ID = "syncwatchGuestId";
    public static final String SESSION_GUEST_ROOM = "syncwatchGuestRoom";
    public static final String SESSION_DISPLAY_NAME = "syncwatchDisplayName";
    public static final String SESSION_CLIENT_ID = "syncwatchClientId";
    public static final String ROLE_USER = "USER";
    public static final String ROLE_GUEST = "GUEST";

    private static final Pattern USERNAME_PATTERN = Pattern.compile("[A-Za-z0-9._-]+");
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
            Pattern.CASE_INSENSITIVE
    );

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    public UserAccount register(SignUpRequest request) {
        if (request == null) {
            throw validation("All sign-up fields are required");
        }

        String username = clean(request.username());
        String email = clean(request.email()).toLowerCase(Locale.ROOT);
        String password = request.password() == null ? "" : request.password();
        String confirmation = request.confirmPassword() == null ? "" : request.confirmPassword();

        int usernameLength = username.codePointCount(0, username.length());
        if (usernameLength < 3 || usernameLength > 32 || !USERNAME_PATTERN.matcher(username).matches()) {
            throw validation("Username must be 3 to 32 letters, numbers, dots, underscores or hyphens");
        }
        if (email.length() > 254 || !EMAIL_PATTERN.matcher(email).matches()) {
            throw validation("Enter a valid email address");
        }
        int passwordLength = password.codePointCount(0, password.length());
        if (passwordLength < 8 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw validation("Password must be at least 8 characters and no more than 72 UTF-8 bytes");
        }
        if (!password.equals(confirmation)) {
            throw validation("Passwords do not match");
        }
        if (users.usernameExists(username)) {
            throw conflict("Username is already taken");
        }
        if (users.emailExists(email)) {
            throw conflict("Email is already registered");
        }

        UserAccount user = new UserAccount(
                UUID.randomUUID().toString(),
                username,
                email,
                passwordEncoder.encode(password),
                Instant.now()
        );
        try {
            users.create(user);
        } catch (DuplicateKeyException duplicate) {
            if (users.usernameExists(username)) {
                throw conflict("Username is already taken");
            }
            if (users.emailExists(email)) {
                throw conflict("Email is already registered");
            }
            throw duplicate;
        }
        return user;
    }

    public UserAccount authenticate(LoginRequest request) {
        String identifier = request == null ? "" : clean(request.identifier());
        String password = request == null || request.password() == null ? "" : request.password();
        Optional<UserAccount> user = users.findByUsernameOrEmail(identifier);
        if (identifier.isBlank() || password.isBlank()
                || user.isEmpty()
                || !passwordEncoder.matches(password, user.get().passwordHash())) {
            throw new AuthException(HttpStatus.UNAUTHORIZED, "Invalid email, username, or password");
        }
        return user.get();
    }

    public Optional<UserAccount> sessionUser(HttpSession session) {
        if (!isAuthenticated(session)) {
            return Optional.empty();
        }
        return users.findById((String) session.getAttribute(SESSION_USER_ID));
    }

    public Optional<String> sessionUserId(HttpSession session) {
        return sessionUser(session).map(UserAccount::id);
    }

    public boolean isAuthenticated(HttpSession session) {
        return session != null
                && Boolean.TRUE.equals(session.getAttribute(SESSION_AUTHENTICATED))
                && ROLE_USER.equals(session.getAttribute(SESSION_ROLE))
                && session.getAttribute(SESSION_USER_ID) instanceof String;
    }

    public boolean isGuestAuthenticated(HttpSession session) {
        return session != null
                && Boolean.TRUE.equals(session.getAttribute(SESSION_AUTHENTICATED))
                && ROLE_GUEST.equals(session.getAttribute(SESSION_ROLE))
                && session.getAttribute(SESSION_GUEST_ID) instanceof String
                && session.getAttribute(SESSION_GUEST_ROOM) instanceof String
                && session.getAttribute(SESSION_DISPLAY_NAME) instanceof String
                && session.getAttribute(SESSION_CLIENT_ID) instanceof String;
    }

    public Optional<String> participantOwnerId(
            HttpSession session,
            String roomId,
            String clientId
    ) {
        Optional<String> userId = sessionUserId(session);
        if (userId.isPresent()) {
            return userId;
        }
        if (roomId == null
                || clientId == null
                || !isGuestAuthenticated(session)
                || !roomId.equalsIgnoreCase((String) session.getAttribute(SESSION_GUEST_ROOM))
                || !clientId.equals(session.getAttribute(SESSION_CLIENT_ID))) {
            return Optional.empty();
        }
        return Optional.of((String) session.getAttribute(SESSION_GUEST_ID));
    }

    private AuthException validation(String message) {
        return new AuthException(HttpStatus.BAD_REQUEST, message);
    }

    private AuthException conflict(String message) {
        return new AuthException(HttpStatus.CONFLICT, message);
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
