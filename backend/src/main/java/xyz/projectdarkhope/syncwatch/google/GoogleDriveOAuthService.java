package xyz.projectdarkhope.syncwatch.google;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import xyz.projectdarkhope.syncwatch.room.Room;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;

@Service
public class GoogleDriveOAuthService {
    public record Credentials(String accessToken, long expiresAt, String refreshToken) {}

    private static final String CONNECTION_COOKIE = "syncwatch_google_drive";
    private static final URI TOKEN_ENDPOINT = URI.create("https://oauth2.googleapis.com/token");
    private static final URI REVOKE_ENDPOINT = URI.create("https://oauth2.googleapis.com/revoke");
    private static final long EXPIRY_SKEW_MILLIS = 60_000;
    private static final Duration COOKIE_LIFETIME = Duration.ofDays(3650);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();
    private final ObjectMapper objectMapper;
    private final String clientId;
    private final String clientSecret;
    private final String frontendOrigin;
    private final boolean secureCookie;

    public GoogleDriveOAuthService(
            ObjectMapper objectMapper,
            @Value("${syncwatch.google.client-id:}") String clientId,
            @Value("${syncwatch.google.client-secret:}") String clientSecret,
            @Value("${syncwatch.frontend-origin:http://localhost:5173}") String frontendOrigin,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie
    ) {
        this.objectMapper = objectMapper;
        this.clientId = clientId.trim();
        this.clientSecret = clientSecret.trim();
        this.frontendOrigin = frontendOrigin.replaceAll("/+$", "");
        this.secureCookie = secureCookie;
    }

    public Credentials exchangeAuthorizationCode(String code, String redirectUri) {
        requireConfigured();
        if (code == null || code.isBlank()) {
            throw new GoogleOAuthException("Google authorization code is required");
        }
        if (!frontendOrigin.equals(normalizeOrigin(redirectUri))) {
            throw new GoogleOAuthException("Google authorization origin is not allowed");
        }

        JsonNode response = requestToken(form(
                "code", code,
                "client_id", clientId,
                "client_secret", clientSecret,
                "redirect_uri", frontendOrigin,
                "grant_type", "authorization_code"
        ));
        String refreshToken = text(response, "refresh_token");
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new GoogleOAuthException(
                    "Google did not return persistent Drive access. Revoke SyncWatch in your Google Account permissions, then connect again."
            );
        }
        return credentials(response, refreshToken);
    }

    public Credentials refreshConnection(HttpServletRequest request) {
        return refresh(readRefreshToken(request));
    }

    public String readRefreshToken(HttpServletRequest request) {
        String encrypted = cookieValue(request);
        if (encrypted == null) {
            throw new GoogleOAuthException("Google Drive is not connected");
        }
        return decrypt(encrypted);
    }

    public String accessTokenFor(Room room) {
        synchronized (room) {
            if (room.getAccessToken() != null
                    && !room.getAccessToken().isBlank()
                    && room.getAccessTokenExpiresAt() > System.currentTimeMillis()) {
                return room.getAccessToken();
            }
            String refreshToken = room.getDriveRefreshToken();
            if (refreshToken == null || refreshToken.isBlank()) {
                throw new GoogleOAuthException("Google Drive authorization expired");
            }
            Credentials refreshed = refresh(refreshToken);
            room.setDriveCredentials(
                    refreshed.accessToken(),
                    refreshed.expiresAt(),
                    refreshed.refreshToken()
            );
            return refreshed.accessToken();
        }
    }

    public void setConnectionCookie(HttpServletResponse response, String refreshToken) {
        ResponseCookie cookie = ResponseCookie.from(CONNECTION_COOKIE, encrypt(refreshToken))
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Lax")
                .path("/")
                .maxAge(COOKIE_LIFETIME)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public void clearConnectionCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(CONNECTION_COOKIE, "")
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public void revoke(HttpServletRequest request) {
        String refreshToken;
        try {
            refreshToken = readRefreshToken(request);
        } catch (GoogleOAuthException ignored) {
            return;
        }

        try {
            HttpRequest revokeRequest = HttpRequest.newBuilder(REVOKE_ENDPOINT)
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form("token", refreshToken)))
                    .build();
            http.send(revokeRequest, HttpResponse.BodyHandlers.discarding());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } catch (Exception ignored) {
            // Always remove the local connection, even when Google is temporarily unavailable.
        }
    }

    private Credentials refresh(String refreshToken) {
        requireConfigured();
        JsonNode response = requestToken(form(
                "client_id", clientId,
                "client_secret", clientSecret,
                "refresh_token", refreshToken,
                "grant_type", "refresh_token"
        ));
        String rotatedRefreshToken = text(response, "refresh_token");
        return credentials(response, rotatedRefreshToken == null ? refreshToken : rotatedRefreshToken);
    }

    private JsonNode requestToken(String body) {
        try {
            HttpRequest request = HttpRequest.newBuilder(TOKEN_ENDPOINT)
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode json = objectMapper.readTree(response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String description = text(json, "error_description");
                throw new GoogleOAuthException(
                        description == null ? "Google Drive authorization failed" : description
                );
            }
            return json;
        } catch (GoogleOAuthException error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new GoogleOAuthException("Google authorization was interrupted", error);
        } catch (Exception error) {
            throw new GoogleOAuthException("Could not contact Google authorization", error);
        }
    }

    private Credentials credentials(JsonNode response, String refreshToken) {
        String accessToken = text(response, "access_token");
        if (accessToken == null || accessToken.isBlank()) {
            throw new GoogleOAuthException("Google did not return a Drive access token");
        }
        long expiresInSeconds = response.path("expires_in").asLong(3600);
        long expiresAt = System.currentTimeMillis()
                + Math.max(1, expiresInSeconds) * 1000
                - EXPIRY_SKEW_MILLIS;
        return new Credentials(accessToken, expiresAt, refreshToken);
    }

    private String cookieValue(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        return Arrays.stream(cookies)
                .filter(cookie -> CONNECTION_COOKIE.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private String encrypt(String value) {
        try {
            byte[] iv = new byte[12];
            SECURE_RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
        } catch (Exception error) {
            throw new GoogleOAuthException("Could not secure Google Drive authorization", error);
        }
    }

    private String decrypt(String value) {
        try {
            byte[] payload = Base64.getUrlDecoder().decode(value);
            if (payload.length <= 28) throw new IllegalArgumentException("Invalid encrypted cookie");
            byte[] iv = Arrays.copyOfRange(payload, 0, 12);
            byte[] encrypted = Arrays.copyOfRange(payload, 12, payload.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception error) {
            throw new GoogleOAuthException("Saved Google Drive authorization is invalid", error);
        }
    }

    private SecretKeySpec encryptionKey() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        digest.update("syncwatch-google-drive-cookie:".getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(digest.digest(clientSecret.getBytes(StandardCharsets.UTF_8)), "AES");
    }

    private void requireConfigured() {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new GoogleOAuthException("Google Drive server authorization is not configured");
        }
    }

    private String normalizeOrigin(String value) {
        return value == null ? "" : value.trim().replaceAll("/+$", "");
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private String form(String... values) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < values.length; index += 2) {
            if (!result.isEmpty()) result.append('&');
            result.append(encode(values[index])).append('=').append(encode(values[index + 1]));
        }
        return result.toString();
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
