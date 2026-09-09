package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;

import java.util.HashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AuthenticatedHandshakeInterceptorTest {
    @Test
    void handshakeRetainsLiveSessionAndDoesNotCreateAnonymousSession() throws Exception {
        var interceptor = new AuthenticatedHandshakeInterceptor();
        var request = new MockHttpServletRequest();
        var attributes = new HashMap<String, Object>();
        var response = new ServletServerHttpResponse(new MockHttpServletResponse());
        assertThat(interceptor.beforeHandshake(new ServletServerHttpRequest(request), response, null, attributes)).isFalse();
        assertThat(request.getSession(false)).isNull();
        var session = request.getSession();
        session.setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        assertThat(interceptor.beforeHandshake(new ServletServerHttpRequest(request), response, null, attributes)).isTrue();
        assertThat(attributes.get(AuthenticatedHandshakeInterceptor.LIVE_SESSION)).isSameAs(session);
    }

    @Test
    void destroyedGuestSessionForgetsOnlyItsTemporaryCredentials() {
        var google = mock(GoogleDriveOAuthService.class);
        var session = new org.springframework.mock.web.MockHttpSession();
        session.setAttribute(AuthService.SESSION_GUEST_ID, "guest:expired");
        new GuestSessionCleanup(google).sessionDestroyed(new jakarta.servlet.http.HttpSessionEvent(session));
        verify(google).forgetTemporaryConnection("guest:expired");
        verifyNoMoreInteractions(google);
    }
}
