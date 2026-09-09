package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RememberMeServiceTest {
    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private RememberMeService rememberMe;
    private UserAccount user;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:schema.sql")
                .build();
        jdbc = new JdbcTemplate(database);
        UserRepository users = new UserRepository(jdbc);
        RememberMeTokenRepository tokens = new RememberMeTokenRepository(jdbc);
        rememberMe = new RememberMeService(tokens, users, Duration.ofDays(30), true);
        user = new UserAccount(
                "3d5d6b1a-7aa0-49d0-9b08-16a277179d20",
                "Kishore",
                "kishore@example.com",
                "$2a$12$hash",
                Instant.now()
        );
        users.create(user);
    }

    @AfterEach
    void tearDown() {
        database.shutdown();
    }

    @Test
    void tokenIsHashedRestoresSessionAndRotates() {
        MockHttpServletResponse issueResponse = new MockHttpServletResponse();
        rememberMe.issue(user.id(), new MockHttpServletRequest(), issueResponse);
        Cookie issuedCookie = issueResponse.getCookie(RememberMeService.COOKIE_NAME);

        assertThat(issuedCookie).isNotNull();
        assertThat(issuedCookie.isHttpOnly()).isTrue();
        assertThat(issuedCookie.getSecure()).isTrue();
        assertThat(issuedCookie.getMaxAge()).isPositive();
        String storedHash = jdbc.queryForObject(
                "SELECT token_hash FROM remember_me_tokens",
                String.class
        );
        assertThat(storedHash).hasSize(64).isNotEqualTo(issuedCookie.getValue());

        MockHttpServletRequest restoreRequest = new MockHttpServletRequest();
        restoreRequest.setCookies(issuedCookie);
        MockHttpServletResponse restoreResponse = new MockHttpServletResponse();

        assertThat(rememberMe.restore(restoreRequest, restoreResponse))
                .hasValueSatisfying(restored -> assertThat(restored.id()).isEqualTo(user.id()));
        Cookie rotatedCookie = restoreResponse.getCookie(RememberMeService.COOKIE_NAME);
        assertThat(rotatedCookie).isNotNull();
        assertThat(rotatedCookie.getValue()).isNotEqualTo(issuedCookie.getValue());
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM remember_me_tokens",
                Long.class
        )).isEqualTo(1L);
    }

    @Test
    void logoutRevokesStoredTokenAndExpiresCookie() {
        MockHttpServletResponse issueResponse = new MockHttpServletResponse();
        rememberMe.issue(user.id(), new MockHttpServletRequest(), issueResponse);
        MockHttpServletRequest logoutRequest = new MockHttpServletRequest();
        logoutRequest.setCookies(issueResponse.getCookie(RememberMeService.COOKIE_NAME));
        MockHttpServletResponse logoutResponse = new MockHttpServletResponse();

        rememberMe.revoke(logoutRequest, logoutResponse);

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM remember_me_tokens",
                Long.class
        )).isZero();
        assertThat(logoutResponse.getCookie(RememberMeService.COOKIE_NAME).getMaxAge()).isZero();
    }

    @Test
    void expiredTokensCannotRestoreAUser() {
        RememberMeTokenRepository tokens = new RememberMeTokenRepository(jdbc);
        MockHttpServletResponse issueResponse = new MockHttpServletResponse();
        rememberMe.issue(user.id(), new MockHttpServletRequest(), issueResponse);
        Cookie cookie = issueResponse.getCookie(RememberMeService.COOKIE_NAME);
        jdbc.update(
                "UPDATE remember_me_tokens SET expires_at = ?",
                Instant.now().minusSeconds(1)
        );
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(cookie);
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(rememberMe.restore(request, response)).isEmpty();
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM remember_me_tokens",
                Long.class
        )).isZero();
        assertThat(response.getCookie(RememberMeService.COOKIE_NAME).getMaxAge()).isZero();
    }

    @Test
    void concurrentRestoresConsumeOneTokenExactlyOnce() throws Exception {
        MockHttpServletResponse issued = new MockHttpServletResponse();
        rememberMe.issue(user.id(), new MockHttpServletRequest(), issued);
        Cookie cookie = issued.getCookie(RememberMeService.COOKIE_NAME);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        var repository = new RememberMeTokenRepository(jdbc) {
            @Override
            public java.util.Optional<RememberMeToken> find(String hash) {
                var token = super.find(hash);
                try { barrier.await(5, java.util.concurrent.TimeUnit.SECONDS); }
                catch (Exception error) { throw new AssertionError(error); }
                return token;
            }
        };
        var service = new RememberMeService(repository, new UserRepository(jdbc), Duration.ofDays(30), true);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> restore = () -> {
                MockHttpServletRequest request = new MockHttpServletRequest();
                request.setCookies(cookie);
                return service.restore(request, new MockHttpServletResponse()).isPresent();
            };
            var first = executor.submit(restore);
            var second = executor.submit(restore);
            assertThat(java.util.List.of(first.get(), second.get())).containsExactlyInAnyOrder(true, false);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM remember_me_tokens", Integer.class)).isEqualTo(1);
    }
}
