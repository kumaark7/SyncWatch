package xyz.projectdarkhope.syncwatch.auth;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Duration;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class SmtpPasswordResetMailSenderTest {
    @Test
    void buildsTheExpectedProfessionalMessageWithoutLoggingSensitiveFields(CapturedOutput output)
            throws Exception {
        JavaMailSender transport = mock(JavaMailSender.class);
        MimeMessage message = new MimeMessage(Session.getInstance(new Properties()));
        when(transport.createMimeMessage()).thenReturn(message);
        var sender = new SmtpPasswordResetMailSender(
                transport,
                "https://play.projectdarkhope.xyz/",
                "security@example.test",
                "SyncWatch"
        );
        String token = "private-reset-token";

        sender.sendPasswordReset(
                "user@example.test",
                "Kishore",
                token,
                Duration.ofMinutes(30)
        );

        verify(transport).send(message);
        assertThat(message.getSubject()).isEqualTo("Reset your SyncWatch password");
        assertThat(message.getRecipients(Message.RecipientType.TO)[0].toString())
                .isEqualTo("user@example.test");
        assertThat(message.getContent().toString())
                .contains("https://play.projectdarkhope.xyz/reset-password#token=" + token)
                .doesNotContain("/reset-password?token=")
                .contains("expires in 30 minutes")
                .contains("ignore this email");
        assertThat(output).doesNotContain(token).doesNotContain("user@example.test");
    }
}
