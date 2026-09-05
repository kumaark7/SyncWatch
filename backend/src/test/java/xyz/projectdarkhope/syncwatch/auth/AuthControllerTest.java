package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final RememberMeService rememberMe = mock(RememberMeService.class);
    private final AuthController controller = new AuthController(auth, rememberMe);
    private final UserAccount user = new UserAccount(
            "3d5d6b1a-7aa0-49d0-9b08-16a277179d20",
            "Kishore",
            "kishore@example.com",
            "$2a$12$not-returned",
            Instant.now()
    );

    @Test
    void signUpEstablishesUserIdSessionAndReturnsOnlySafeIdentity() {
        when(auth.register(any(SignUpRequest.class))).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        ResponseEntity<?> response = controller.signUp(
                new SignUpRequest("Kishore", "kishore@example.com", "strong-pass", "strong-pass"),
                request,
                servletResponse
        );

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(request.getSession(false).getAttribute(AuthService.SESSION_USER_ID))
                .isEqualTo(user.id());
        assertThat(response.getBody()).isInstanceOfSatisfying(AuthSessionResponse.class, body -> {
            assertThat(body.userId()).isEqualTo(user.id());
            assertThat(body.username()).isEqualTo(user.username());
            assertThat(body.email()).isEqualTo(user.email());
            assertThat(body.toString()).doesNotContain(user.passwordHash());
        });
    }

    @Test
    void sessionUsesStableUserIdAndLogoutInvalidatesIt() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.getSession(true).setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        request.getSession().setAttribute(AuthService.SESSION_ROLE, AuthService.ROLE_USER);
        request.getSession().setAttribute(AuthService.SESSION_USER_ID, user.id());
        when(auth.sessionUser(request.getSession(false))).thenReturn(Optional.of(user));

        assertThat(controller.session(request, response).userId()).isEqualTo(user.id());
        assertThat(controller.logout(request, response).authenticated()).isFalse();
        assertThat(request.getSession(false)).isNull();
        verify(rememberMe).revoke(request, response);
    }

    @Test
    void rememberedLoginRestoresAUserSession() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(rememberMe.restore(request, response)).thenReturn(Optional.of(user));

        AuthSessionResponse restored = controller.session(request, response);

        assertThat(restored.authenticated()).isTrue();
        assertThat(restored.userId()).isEqualTo(user.id());
        assertThat(request.getSession(false).getAttribute(AuthService.SESSION_USER_ID))
                .isEqualTo(user.id());
    }

    @Test
    void loginWithRememberMeIssuesPersistentToken() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        LoginRequest login = new LoginRequest("Kishore", "strong-pass", true);
        when(auth.authenticate(login)).thenReturn(user);

        ResponseEntity<?> result = controller.login(login, request, response);

        assertThat(result.getStatusCode().is2xxSuccessful()).isTrue();
        verify(rememberMe).issue(user.id(), request, response);
    }
}
