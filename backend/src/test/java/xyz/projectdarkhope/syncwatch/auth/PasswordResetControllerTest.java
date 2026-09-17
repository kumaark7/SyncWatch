package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class PasswordResetControllerTest {
    private final PasswordResetService service = mock(PasswordResetService.class);
    private final PasswordResetController controller = new PasswordResetController(service);

    @Test
    void forgotPasswordAlwaysUsesOneGenericPublicResponse() {
        var known = controller.forgotPassword(new ForgotPasswordRequest("known@example.com"));
        var unknown = controller.forgotPassword(new ForgotPasswordRequest("missing@example.com"));

        assertThat(known.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(known.getBody()).isEqualTo(unknown.getBody());
        assertThat(known.getBody().toString()).contains(PasswordResetService.FORGOT_RESPONSE);
        assertThat(known.getBody().toString()).doesNotContain("known@example.com");
        verify(service).requestReset(new ForgotPasswordRequest("known@example.com"));
        verify(service).requestReset(new ForgotPasswordRequest("missing@example.com"));
    }

    @Test
    void invalidExpiredAndUsedTokensShareOnePublicError() {
        ResetPasswordRequest request = new ResetPasswordRequest("invalid", "strong-pass", "strong-pass");
        doThrow(new AuthException(HttpStatus.BAD_REQUEST, PasswordResetService.INVALID_RESET_RESPONSE))
                .when(service).resetPassword(request);

        var response = controller.resetPassword(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().toString()).contains(PasswordResetService.INVALID_RESET_RESPONSE);
    }

    @Test
    void successfulResetDoesNotCreateOrReturnAnAuthenticatedSession() {
        ResetPasswordRequest request = new ResetPasswordRequest("token", "strong-pass", "strong-pass");

        var response = controller.resetPassword(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().toString()).contains("Please sign in");
        assertThat(response.getBody().toString()).doesNotContain("authenticated");
    }
}
