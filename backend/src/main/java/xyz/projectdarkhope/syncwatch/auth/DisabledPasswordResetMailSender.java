package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@ConditionalOnProperty(name = "syncwatch.mail.enabled", havingValue = "false", matchIfMissing = true)
public class DisabledPasswordResetMailSender implements PasswordResetMailSender {
    @Override
    public boolean enabled() {
        return false;
    }

    @Override
    public void sendPasswordReset(
            String recipientEmail,
            String username,
            String token,
            Duration expiresIn
    ) {
        // Password reset remains unavailable until a mail provider is configured.
    }
}
