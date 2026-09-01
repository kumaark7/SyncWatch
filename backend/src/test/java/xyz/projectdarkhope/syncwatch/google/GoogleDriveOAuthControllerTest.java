package xyz.projectdarkhope.syncwatch.google;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import xyz.projectdarkhope.syncwatch.auth.AuthService;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GoogleDriveOAuthControllerTest {
    private final GoogleDriveOAuthService googleOAuth = mock(GoogleDriveOAuthService.class);
    private final AuthService auth = mock(AuthService.class);
    private final GoogleDriveOAuthController controller = new GoogleDriveOAuthController(
            googleOAuth,
            auth
    );

    @Test
    void authorizationCodeExchangeIsBoundToTheAuthenticatedUserId() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        GoogleAuthorizationCodeRequest code = new GoogleAuthorizationCodeRequest(
                "authorization-code",
                "http://localhost:5173"
        );
        when(auth.sessionUserId(any())).thenReturn(Optional.of("user-a"));
        when(googleOAuth.exchangeAuthorizationCode(
                "user-a",
                "authorization-code",
                "http://localhost:5173"
        )).thenReturn(new GoogleDriveOAuthService.Credentials("access-a", 1234, "refresh-a"));

        ResponseEntity<?> response = controller.exchangeCode(code, "XmlHttpRequest", request);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        verify(googleOAuth).exchangeAuthorizationCode(
                "user-a",
                "authorization-code",
                "http://localhost:5173"
        );
    }

    @Test
    void connectionRestorationUsesOnlyTheAuthenticatedUserId() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.sessionUserId(any())).thenReturn(Optional.of("user-a"));
        when(googleOAuth.refreshConnection("user-a")).thenReturn(
                new GoogleDriveOAuthService.Credentials("access-a", 1234, "refresh-a")
        );

        ResponseEntity<GoogleConnectionResponse> response = controller.connection(request);

        assertThat(response.getBody()).isEqualTo(new GoogleConnectionResponse(true, "access-a", 1234));
        verify(googleOAuth).refreshConnection("user-a");
    }

    @Test
    void disconnectTargetsOnlyTheAuthenticatedUserId() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.sessionUserId(any())).thenReturn(Optional.of("user-b"));

        assertThat(controller.disconnect(request).getStatusCode().value()).isEqualTo(204);

        verify(googleOAuth).disconnect("user-b");
    }
}
