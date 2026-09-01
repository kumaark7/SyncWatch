package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Optional;

@Repository
public class UserRepository {
    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void create(UserAccount user) {
        jdbc.update(
                """
                INSERT INTO syncwatch_users (
                    id, username, username_normalized, email, email_normalized,
                    password_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                user.id(),
                user.username(),
                normalize(user.username()),
                user.email(),
                normalize(user.email()),
                user.passwordHash(),
                user.createdAt()
        );
    }

    public Optional<UserAccount> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return jdbc.query(
                "SELECT id, username, email, password_hash, created_at FROM syncwatch_users WHERE id = ?",
                this::mapUser,
                id
        ).stream().findFirst();
    }

    public Optional<UserAccount> findByUsernameOrEmail(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return Optional.empty();
        }
        String normalized = normalize(identifier);
        return jdbc.query(
                """
                SELECT id, username, email, password_hash, created_at
                FROM syncwatch_users
                WHERE username_normalized = ? OR email_normalized = ?
                """,
                this::mapUser,
                normalized,
                normalized
        ).stream().findFirst();
    }

    public boolean usernameExists(String username) {
        return count("username_normalized", normalize(username)) > 0;
    }

    public boolean emailExists(String email) {
        return count("email_normalized", normalize(email)) > 0;
    }

    private long count(String column, String value) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM syncwatch_users WHERE " + column + " = ?",
                Long.class,
                value
        );
        return count == null ? 0 : count;
    }

    private UserAccount mapUser(ResultSet result, int rowNumber) throws SQLException {
        return new UserAccount(
                result.getString("id"),
                result.getString("username"),
                result.getString("email"),
                result.getString("password_hash"),
                result.getTimestamp("created_at").toInstant()
        );
    }

    private String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
