package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final AuthController controller = new AuthController(auth);
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

        ResponseEntity<?> response = controller.signUp(
                new SignUpRequest("Kishore", "kishore@example.com", "strong-pass", "strong-pass"),
                request
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
        request.getSession(true).setAttribute(AuthService.SESSION_AUTHENTICATED, true);
        request.getSession().setAttribute(AuthService.SESSION_ROLE, AuthService.ROLE_USER);
        request.getSession().setAttribute(AuthService.SESSION_USER_ID, user.id());
        when(auth.sessionUser(request.getSession(false))).thenReturn(Optional.of(user));

        assertThat(controller.session(request).userId()).isEqualTo(user.id());
        assertThat(controller.logout(request).authenticated()).isFalse();
        assertThat(request.getSession(false)).isNull();
    }
}
