package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class PasswordResetController {
    private final PasswordResetService passwordReset;

    public PasswordResetController(PasswordResetService passwordReset) {
        this.passwordReset = passwordReset;
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody(required = false) ForgotPasswordRequest request) {
        passwordReset.requestReset(request);
        return ResponseEntity.accepted().body(Map.of("message", PasswordResetService.FORGOT_RESPONSE));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody(required = false) ResetPasswordRequest request) {
        try {
            passwordReset.resetPassword(request);
            return ResponseEntity.ok(Map.of("message", "Your password has been reset. Please sign in."));
        } catch (AuthException error) {
            return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
        }
    }
}
