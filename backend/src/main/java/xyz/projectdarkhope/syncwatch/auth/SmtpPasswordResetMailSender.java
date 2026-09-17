package xyz.projectdarkhope.syncwatch.auth;

import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
@ConditionalOnProperty(name = "syncwatch.mail.enabled", havingValue = "true")
public class SmtpPasswordResetMailSender implements PasswordResetMailSender {
    private static final Logger LOGGER = LoggerFactory.getLogger(SmtpPasswordResetMailSender.class);

    private final JavaMailSender mailSender;
    private final String publicUrl;
    private final String fromAddress;
    private final String fromName;

    public SmtpPasswordResetMailSender(
            JavaMailSender mailSender,
            @Value("${syncwatch.public-url}") String publicUrl,
            @Value("${syncwatch.mail.from:}") String fromAddress,
            @Value("${syncwatch.mail.from-name:SyncWatch}") String fromName
    ) {
        this.mailSender = mailSender;
        this.publicUrl = publicUrl.replaceAll("/+$", "");
        this.fromAddress = fromAddress;
        this.fromName = fromName;
    }

    @Override
    public boolean enabled() {
        return !fromAddress.isBlank();
    }

    @Override
    @Async("passwordResetMailExecutor")
    public void sendPasswordReset(
            String recipientEmail,
            String username,
            String token,
            Duration expiresIn
    ) {
        if (!enabled()) {
            return;
        }
        try {
            String resetLink = publicUrl + "/reset-password#token=" + token;
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(
                    message,
                    false,
                    StandardCharsets.UTF_8.name()
            );
            helper.setFrom(new InternetAddress(fromAddress, fromName, StandardCharsets.UTF_8.name()));
            helper.setTo(recipientEmail);
            helper.setSubject("Reset your SyncWatch password");
            helper.setText("""
                    Hello %s,

                    We received a request to reset your SyncWatch password.

                    Use this link to choose a new password:
                    %s

                    This link expires in %d minutes and can be used only once.
                    If you did not request this change, you can ignore this email.

                    SyncWatch
                    """.formatted(username, resetLink, expiresIn.toMinutes()));
            mailSender.send(message);
        } catch (Exception deliveryFailure) {
            // Keep recipient details, reset links and provider errors out of logs.
            LOGGER.warn("Password reset email delivery failed");
        }
    }
}
