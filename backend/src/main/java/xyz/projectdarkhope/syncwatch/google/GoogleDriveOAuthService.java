package xyz.projectdarkhope.syncwatch.google;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GoogleDriveOAuthService {
    public record Credentials(String accessToken, long expiresAt, String refreshToken) {}

    private static final URI TOKEN_ENDPOINT = URI.create("https://oauth2.googleapis.com/token");
    private static final URI REVOKE_ENDPOINT = URI.create("https://oauth2.googleapis.com/revoke");
    private static final long EXPIRY_SKEW_MILLIS = 60_000;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();
    private final ObjectMapper objectMapper;
    private final GoogleDriveConnectionRepository connections;
    private final ConcurrentHashMap<String, Object> refreshLocks = new ConcurrentHashMap<>();
    private final String clientId;
    private final String clientSecret;
    private final String frontendOrigin;

    public GoogleDriveOAuthService(
            ObjectMapper objectMapper,
            GoogleDriveConnectionRepository connections,
            @Value("${syncwatch.google.client-id:}") String clientId,
            @Value("${syncwatch.google.client-secret:}") String clientSecret,
            @Value("${syncwatch.frontend-origin:http://localhost:5173}") String frontendOrigin
    ) {
        this.objectMapper = objectMapper;
        this.connections = connections;
        this.clientId = clientId.trim();
        this.clientSecret = clientSecret.trim();
        this.frontendOrigin = frontendOrigin.replaceAll("/+$", "");
    }

    public Credentials exchangeAuthorizationCode(String userId, String code, String redirectUri) {
        requireUserId(userId);
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
        Credentials credentials = credentials(response, refreshToken);
        saveRefreshToken(userId, credentials.refreshToken());
        return credentials;
    }

    public Credentials refreshConnection(String userId) {
        requireUserId(userId);
        return refreshForUser(userId);
    }

    public String accessTokenFor(Room room) {
        synchronized (room) {
            String ownerUserId = room.getDriveOwnerUserId();
            requireUserId(ownerUserId);
            storedRefreshToken(ownerUserId);
            if (room.getAccessToken() != null
                    && !room.getAccessToken().isBlank()
                    && room.getAccessTokenExpiresAt() > System.currentTimeMillis()) {
                return room.getAccessToken();
            }
            Credentials refreshed = refreshForUser(ownerUserId);
            room.setDriveCredentials(
                    ownerUserId,
                    refreshed.accessToken(),
                    refreshed.expiresAt()
            );
            return refreshed.accessToken();
        }
    }

    public void disconnect(String userId) {
        requireUserId(userId);
        String encryptedRefreshToken = connections.findEncryptedRefreshToken(userId).orElse(null);
        if (encryptedRefreshToken == null) {
            return;
        }

        try {
            String refreshToken = decrypt(encryptedRefreshToken);
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
        } finally {
            connections.delete(userId);
        }
    }

    private Credentials refreshForUser(String userId) {
        synchronized (refreshLocks.computeIfAbsent(userId, ignored -> new Object())) {
            Credentials refreshed = refresh(storedRefreshToken(userId));
            saveRefreshToken(userId, refreshed.refreshToken());
            return refreshed;
        }
    }

    private String storedRefreshToken(String userId) {
        return connections.findEncryptedRefreshToken(userId)
                .map(this::decrypt)
                .orElseThrow(() -> new GoogleOAuthException("Google Drive is not connected"));
    }

    private void saveRefreshToken(String userId, String refreshToken) {
        connections.save(userId, encrypt(refreshToken));
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
            if (payload.length <= 28) throw new IllegalArgumentException("Invalid encrypted connection");
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

    private void requireUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new GoogleOAuthException("Authenticated SyncWatch user is required");
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
