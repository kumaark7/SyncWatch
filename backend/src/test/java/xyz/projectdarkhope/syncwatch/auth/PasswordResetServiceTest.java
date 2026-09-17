package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(OutputCaptureExtension.class)
class PasswordResetServiceTest {
    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private UserRepository users;
    private RememberMeTokenRepository rememberMeTokens;
    private AuthService auth;
    private PasswordResetService passwordReset;
    private FakeMailSender mail;
    private MutableClock clock;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:schema.sql")
                .build();
        jdbc = new JdbcTemplate(database);
        users = new UserRepository(jdbc);
        rememberMeTokens = new RememberMeTokenRepository(jdbc);
        var encoder = new BCryptPasswordEncoder(4);
        auth = new AuthService(users, encoder);
        mail = new FakeMailSender();
        clock = new MutableClock(Instant.parse("2026-09-17T10:00:00Z"));
        passwordReset = new PasswordResetService(
                users,
                new PasswordResetTokenRepository(jdbc),
                rememberMeTokens,
                encoder,
                mail,
                new RequestRateLimiter(),
                new DataSourceTransactionManager(database),
                Duration.ofMinutes(30),
                new SecureRandom(),
                clock
        );
    }

    @AfterEach
    void tearDown() {
        database.shutdown();
    }

    @Test
    void existingAccountStoresOnlyHashAndUnknownEmailHasNoObservableDelivery(CapturedOutput output) {
        register();

        passwordReset.requestReset(new ForgotPasswordRequest("  KISHORE@example.com "));
        String rawToken = mail.only().token();
        SentMail sent = mail.only();
        String storedHash = jdbc.queryForObject(
                "SELECT token_hash FROM password_reset_tokens",
                String.class
        );
        Instant createdAt = jdbc.queryForObject(
                "SELECT created_at FROM password_reset_tokens",
                (result, row) -> result.getTimestamp(1).toInstant()
        );
        Instant expiresAt = jdbc.queryForObject(
                "SELECT expires_at FROM password_reset_tokens",
                (result, row) -> result.getTimestamp(1).toInstant()
        );

        assertThat(Base64.getUrlDecoder().decode(rawToken)).hasSize(32);
        assertThat(storedHash).isEqualTo(PasswordResetService.hash(rawToken));
        assertThat(storedHash).doesNotContain(rawToken);
        assertThat(sent.email()).isEqualTo("kishore@example.com");
        assertThat(sent.username()).isEqualTo("Kishore");
        assertThat(sent.duration()).isEqualTo(Duration.ofMinutes(30));
        assertThat(Duration.between(createdAt, expiresAt)).isEqualTo(Duration.ofMinutes(30));
        assertThat(output).doesNotContain(rawToken).doesNotContain("kishore@example.com");

        mail.sent.clear();
        passwordReset.requestReset(new ForgotPasswordRequest("missing@example.com"));
        assertThat(mail.sent).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens", Long.class))
                .isEqualTo(1L);
    }

    @Test
    void newestRequestInvalidatesThePreviousToken() {
        register();
        passwordReset.requestReset(new ForgotPasswordRequest("kishore@example.com"));
        String first = mail.only().token();
        passwordReset.requestReset(new ForgotPasswordRequest("kishore@example.com"));
        String second = mail.sent.get(1).token();

        assertInvalid(() -> passwordReset.resetPassword(
                new ResetPasswordRequest(first, "new-password", "new-password")
        ));
        passwordReset.resetPassword(new ResetPasswordRequest(second, "new-password", "new-password"));
    }

    @Test
    void expiredMalformedAndConsumedTokensUseTheSameError() {
        register();
        assertInvalid(() -> passwordReset.resetPassword(
                new ResetPasswordRequest("not-a-token", "new-password", "new-password")
        ));

        passwordReset.requestReset(new ForgotPasswordRequest("kishore@example.com"));
        String expired = mail.only().token();
        clock.advance(Duration.ofMinutes(31));
        assertInvalid(() -> passwordReset.resetPassword(
                new ResetPasswordRequest(expired, "new-password", "new-password")
        ));

        clock.advance(Duration.ofMinutes(-31));
        passwordReset.requestReset(new ForgotPasswordRequest("kishore@example.com"));
        String consumed = mail.sent.get(1).token();
        passwordReset.resetPassword(new ResetPasswordRequest(consumed, "new-password", "new-password"));
        assertInvalid(() -> passwordReset.resetPassword(
                new ResetPasswordRequest(consumed, "another-password", "another-password")
        ));
    }

    @Test
    void successfulResetChangesCredentialsAndRevokesEveryRememberMeToken() {
        UserAccount user = register();
        rememberMeTokens.save("a".repeat(64), user.id(), clock.instant().plus(Duration.ofDays(1)));
        rememberMeTokens.save("b".repeat(64), user.id(), clock.instant().plus(Duration.ofDays(1)));
        passwordReset.requestReset(new ForgotPasswordRequest(user.email()));

        passwordReset.resetPassword(new ResetPasswordRequest(
                mail.only().token(),
                "replacement-pass",
                "replacement-pass"
        ));

        assertThatThrownBy(() -> auth.authenticate(new LoginRequest(user.email(), "strong-pass")))
                .isInstanceOf(AuthException.class);
        assertThat(auth.authenticate(new LoginRequest(user.email(), "replacement-pass")).id())
                .isEqualTo(user.id());
        assertThat(rememberMeTokens.find("a".repeat(64))).isEmpty();
        assertThat(rememberMeTokens.find("b".repeat(64))).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens", Long.class))
                .isZero();
    }

    @Test
    void signupAndResetUseTheSamePasswordPolicy() {
        register();
        passwordReset.requestReset(new ForgotPasswordRequest("kishore@example.com"));
        String token = mail.only().token();

        assertValidationMessage(
                () -> auth.register(new SignUpRequest("Other", "other@example.com", "short", "short")),
                "at least 8 characters"
        );
        assertValidationMessage(
                () -> passwordReset.resetPassword(new ResetPasswordRequest(token, "short", "short")),
                "at least 8 characters"
        );
        assertValidationMessage(
                () -> passwordReset.resetPassword(new ResetPasswordRequest(token, "new-password", "different")),
                "Passwords do not match"
        );
    }

    @Test
    void secondaryEmailAndTokenLimitsUseHashedKeys() {
        register();
        for (int request = 0; request < 4; request++) {
            passwordReset.requestReset(new ForgotPasswordRequest("kishore@example.com"));
        }
        assertThat(mail.sent).hasSize(3);

        byte[] invalidBytes = new byte[32];
        String invalidToken = Base64.getUrlEncoder().withoutPadding().encodeToString(invalidBytes);
        for (int attempt = 0; attempt < 5; attempt++) {
            assertInvalid(() -> passwordReset.resetPassword(
                    new ResetPasswordRequest(invalidToken, "new-password", "new-password")
            ));
        }
        assertThatThrownBy(() -> passwordReset.resetPassword(
                new ResetPasswordRequest(invalidToken, "new-password", "new-password")
        )).isInstanceOfSatisfying(AuthException.class, error ->
                assertThat(error.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    void oneTokenCannotSucceedTwiceUnderConcurrentUse() throws Exception {
        UserAccount user = register();
        passwordReset.requestReset(new ForgotPasswordRequest(user.email()));
        String token = mail.only().token();
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> attempts = new ArrayList<>();

        try (var executor = Executors.newFixedThreadPool(2)) {
            for (int index = 0; index < 2; index++) {
                String password = "concurrent-pass-" + index;
                attempts.add(executor.submit(() -> {
                    start.await();
                    try {
                        passwordReset.resetPassword(new ResetPasswordRequest(token, password, password));
                        return true;
                    } catch (AuthException rejected) {
                        return false;
                    }
                }));
            }
            start.countDown();
            assertThat(attempts.get(0).get() || attempts.get(1).get()).isTrue();
            assertThat(attempts.get(0).get() && attempts.get(1).get()).isFalse();
        }

        boolean firstWorks = authenticates(user.email(), "concurrent-pass-0");
        boolean secondWorks = authenticates(user.email(), "concurrent-pass-1");
        assertThat(firstWorks ^ secondWorks).isTrue();
    }

    private UserAccount register() {
        return auth.register(new SignUpRequest(
                "Kishore",
                "kishore@example.com",
                "strong-pass",
                "strong-pass"
        ));
    }

    private boolean authenticates(String email, String password) {
        try {
            auth.authenticate(new LoginRequest(email, password));
            return true;
        } catch (AuthException rejected) {
            return false;
        }
    }

    private void assertInvalid(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(AuthException.class, error -> {
                    assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(error.getMessage()).isEqualTo(PasswordResetService.INVALID_RESET_RESPONSE);
                });
    }

    private void assertValidationMessage(Runnable action, String message) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(AuthException.class, error -> {
                    assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(error.getMessage()).contains(message);
                });
    }

    private record SentMail(String email, String username, String token, Duration duration) {}

    private static final class FakeMailSender implements PasswordResetMailSender {
        private final List<SentMail> sent = new CopyOnWriteArrayList<>();

        @Override
        public boolean enabled() {
            return true;
        }

        @Override
        public void sendPasswordReset(String email, String username, String token, Duration expiresIn) {
            sent.add(new SentMail(email, username, token, expiresIn));
        }

        private SentMail only() {
            assertThat(sent).hasSize(1);
            return sent.getFirst();
        }
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) {
            this.now = now;
        }

        private void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
