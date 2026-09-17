package xyz.projectdarkhope.syncwatch.auth;

import java.time.Duration;

public interface PasswordResetMailSender {
    boolean enabled();

    void sendPasswordReset(
            String recipientEmail,
            String username,
            String token,
            Duration expiresIn
    );
}
