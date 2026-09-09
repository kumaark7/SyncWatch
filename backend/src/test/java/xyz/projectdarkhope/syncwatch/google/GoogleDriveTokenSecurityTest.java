package xyz.projectdarkhope.syncwatch.google;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;

import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.Base64;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GoogleDriveTokenSecurityTest {
    private final GoogleDriveConnectionRepository connections = mock(GoogleDriveConnectionRepository.class);
    private final GoogleDriveOAuthService service = new GoogleDriveOAuthService(new ObjectMapper(), connections,
            "test-client", "not-a-real-secret", "https://watch.example");

    @Test
    void encryptionUsesUniqueNoncesAndRejectsTamperingOrWrongKey() {
        String first = ReflectionTestUtils.invokeMethod(service, "encrypt", "test-refresh-token");
        String second = ReflectionTestUtils.invokeMethod(service, "encrypt", "test-refresh-token");
        assertThat(first).isNotEqualTo(second).doesNotContain("test-refresh-token");
        String decrypted = ReflectionTestUtils.invokeMethod(service, "decrypt", first);
        assertThat(decrypted).isEqualTo("test-refresh-token");
        byte[] bytes = Base64.getUrlDecoder().decode(first);
        bytes[bytes.length - 1] ^= 1;
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(service, "decrypt",
                Base64.getUrlEncoder().encodeToString(bytes))).isInstanceOf(GoogleOAuthException.class);
        var otherKey = new GoogleDriveOAuthService(new ObjectMapper(), connections,
                "test-client", "different-test-secret", "https://watch.example");
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(otherKey, "decrypt", first))
                .isInstanceOf(GoogleOAuthException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void guestDepartureDuringRefreshDoesNotRestoreMemoryCredentials() throws Exception {
        HttpClient http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"access_token\":\"test-access\",\"expires_in\":3600}");
        ReflectionTestUtils.setField(service, "http", http);
        ReflectionTestUtils.invokeMethod(service, "saveRefreshToken", "guest:one", "test-refresh", true);
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            service.forgetTemporaryConnection("guest:one");
            return response;
        });
        assertThatThrownBy(() -> service.refreshConnection("guest:one")).isInstanceOf(GoogleOAuthException.class);
        assertThatThrownBy(() -> service.refreshConnection("guest:one")).isInstanceOf(GoogleOAuthException.class);
        verifyNoInteractions(connections);
        verify(http, times(1)).send(any(), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void redirectOriginMismatchCannotExchangeCode() {
        assertThatThrownBy(() -> service.exchangeAuthorizationCode("user-a", "code", "https://evil.example"))
                .isInstanceOf(GoogleOAuthException.class);
        verifyNoInteractions(connections);
    }
}
