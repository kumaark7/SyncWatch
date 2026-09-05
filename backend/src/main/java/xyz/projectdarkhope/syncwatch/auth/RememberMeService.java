package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class RememberMeService {
    static final String COOKIE_NAME = "SYNCWATCH_REMEMBER";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RememberMeTokenRepository tokens;
    private final UserRepository users;
    private final Duration duration;
    private final boolean secureCookie;

    public RememberMeService(
            RememberMeTokenRepository tokens,
            UserRepository users,
            @Value("${syncwatch.remember-me.duration:30d}") Duration duration,
            @Value("${syncwatch.remember-me.cookie-secure:false}") boolean secureCookie
    ) {
        this.tokens = tokens;
        this.users = users;
        this.duration = duration;
        this.secureCookie = secureCookie;
    }

    public void issue(String userId, HttpServletRequest request, HttpServletResponse response) {
        tokens.deleteExpired(Instant.now());
        revokeToken(request);
        issueNewToken(userId, response);
    }

    public Optional<UserAccount> restore(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        String rawToken = readToken(request);
        if (rawToken == null) {
            return Optional.empty();
        }

        Instant now = Instant.now();
        String tokenHash = hash(rawToken);
        RememberMeToken remembered = tokens.find(tokenHash).orElse(null);
        if (remembered == null) {
            tokens.deleteExpired(now);
            return Optional.empty();
        }
        if (!remembered.expiresAt().isAfter(now)) {
            tokens.delete(tokenHash);
            tokens.deleteExpired(now);
            clearCookie(response);
            return Optional.empty();
        }
        tokens.deleteExpired(now);

        UserAccount user = users.findById(remembered.userId()).orElse(null);
        if (user == null) {
            tokens.delete(tokenHash);
            clearCookie(response);
            return Optional.empty();
        }

        tokens.delete(tokenHash);
        issueNewToken(user.id(), response);
        return Optional.of(user);
    }

    public void revoke(HttpServletRequest request, HttpServletResponse response) {
        revokeToken(request);
        clearCookie(response);
    }

    private void revokeToken(HttpServletRequest request) {
        String rawToken = readToken(request);
        if (rawToken != null) {
            tokens.delete(hash(rawToken));
        }
    }

    private void issueNewToken(String userId, HttpServletResponse response) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.save(hash(rawToken), userId, Instant.now().plus(duration));
        addCookie(response, rawToken, duration);
    }

    private String readToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                String value = cookie.getValue();
                return value == null || value.isBlank() || value.length() > 256 ? null : value;
            }
        }
        return null;
    }

    private void clearCookie(HttpServletResponse response) {
        addCookie(response, "", Duration.ZERO);
    }

    private void addCookie(HttpServletResponse response, String value, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(rawToken.getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
