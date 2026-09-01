package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthServiceTest {
    private EmbeddedDatabase database;
    private UserRepository users;
    private AuthService auth;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:schema.sql")
                .build();
        users = new UserRepository(new JdbcTemplate(database));
        auth = new AuthService(users, new BCryptPasswordEncoder(4));
    }

    @AfterEach
    void tearDown() {
        database.shutdown();
    }

    @Test
    void registrationStoresBcryptHashAndStableUserId() {
        UserAccount registered = register("Kishore", "kishore@example.com");
        UserAccount stored = users.findById(registered.id()).orElseThrow();

        assertThat(stored.id()).isEqualTo(registered.id());
        assertThat(stored.passwordHash()).startsWith("$2");
        assertThat(stored.passwordHash()).doesNotContain("strong-pass");
        assertThat(auth.authenticate(new LoginRequest("kishore", "strong-pass")))
                .extracting(UserAccount::id)
                .isEqualTo(registered.id());
        assertThat(auth.authenticate(new LoginRequest("KISHORE@EXAMPLE.COM", "strong-pass")))
                .extracting(UserAccount::id)
                .isEqualTo(registered.id());
    }

    @Test
    void duplicateUsernameAndEmailReturnClearConflicts() {
        register("Kishore", "kishore@example.com");

        assertAuthError(
                () -> register("kishore", "other@example.com"),
                HttpStatus.CONFLICT,
                "Username is already taken"
        );
        assertAuthError(
                () -> register("Other", "KISHORE@example.com"),
                HttpStatus.CONFLICT,
                "Email is already registered"
        );
    }

    @Test
    void invalidLoginAndRegistrationAreRejected() {
        register("Kishore", "kishore@example.com");

        assertAuthError(
                () -> auth.authenticate(new LoginRequest("Kishore", "wrong-pass")),
                HttpStatus.UNAUTHORIZED,
                "Invalid email, username, or password"
        );
        assertAuthError(
                () -> auth.register(new SignUpRequest(
                        "bad name",
                        "not-an-email",
                        "short",
                        "different"
                )),
                HttpStatus.BAD_REQUEST,
                "Username must be"
        );
    }

    @Test
    void passwordLongerThanBcryptByteLimitIsRejected() {
        String oversizedPassword = "\u00e9".repeat(40);

        assertAuthError(
                () -> auth.register(new SignUpRequest(
                        "Kishore",
                        "kishore@example.com",
                        oversizedPassword,
                        oversizedPassword
                )),
                HttpStatus.BAD_REQUEST,
                "72 UTF-8 bytes"
        );
    }

    private UserAccount register(String username, String email) {
        return auth.register(new SignUpRequest(
                username,
                email,
                "strong-pass",
                "strong-pass"
        ));
    }

    private void assertAuthError(
            Runnable action,
            HttpStatus status,
            String message
    ) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(AuthException.class, error -> {
                    assertThat(error.status()).isEqualTo(status);
                    assertThat(error.getMessage()).contains(message);
                });
    }
}
