package xyz.projectdarkhope.syncwatch.google;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import xyz.projectdarkhope.syncwatch.auth.UserAccount;
import xyz.projectdarkhope.syncwatch.auth.UserRepository;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class GoogleDriveConnectionRepositoryTest {
    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private GoogleDriveConnectionRepository connections;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:schema.sql")
                .build();
        jdbc = new JdbcTemplate(database);
        connections = new GoogleDriveConnectionRepository(jdbc);
        createUser("user-a", "Alpha", "alpha@example.com");
        createUser("user-b", "Beta", "beta@example.com");
    }

    @AfterEach
    void tearDown() {
        database.shutdown();
    }

    @Test
    void sameUserCanRestoreConnectionWithANewRepositoryInstance() {
        connections.save("user-a", "encrypted-alpha-token");

        GoogleDriveConnectionRepository afterLogin = new GoogleDriveConnectionRepository(jdbc);

        assertThat(afterLogin.findEncryptedRefreshToken("user-a"))
                .contains("encrypted-alpha-token");
    }

    @Test
    void differentUsersCannotReadEachOthersConnection() {
        connections.save("user-a", "encrypted-alpha-token");

        assertThat(connections.findEncryptedRefreshToken("user-b")).isEmpty();
    }

    @Test
    void disconnectDeletesOnlyTheCurrentUsersConnection() {
        connections.save("user-a", "encrypted-alpha-token");
        connections.save("user-b", "encrypted-beta-token");

        connections.delete("user-a");

        assertThat(connections.findEncryptedRefreshToken("user-a")).isEmpty();
        assertThat(connections.findEncryptedRefreshToken("user-b"))
                .contains("encrypted-beta-token");
    }

    private void createUser(String id, String username, String email) {
        new UserRepository(jdbc).create(new UserAccount(
                id,
                username,
                email,
                "$2a$12$test-hash",
                Instant.now()
        ));
    }
}
