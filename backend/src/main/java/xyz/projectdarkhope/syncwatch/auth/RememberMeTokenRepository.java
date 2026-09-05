package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public class RememberMeTokenRepository {
    private final JdbcTemplate jdbc;

    public RememberMeTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void save(String tokenHash, String userId, Instant expiresAt) {
        jdbc.update(
                """
                INSERT INTO remember_me_tokens (token_hash, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                tokenHash,
                userId,
                expiresAt,
                Instant.now()
        );
    }

    public Optional<RememberMeToken> find(String tokenHash) {
        return jdbc.query(
                """
                SELECT token_hash, user_id, expires_at
                FROM remember_me_tokens
                WHERE token_hash = ?
                """,
                (result, rowNumber) -> new RememberMeToken(
                        result.getString("token_hash"),
                        result.getString("user_id"),
                        result.getTimestamp("expires_at").toInstant()
                ),
                tokenHash
        ).stream().findFirst();
    }

    public void delete(String tokenHash) {
        jdbc.update("DELETE FROM remember_me_tokens WHERE token_hash = ?", tokenHash);
    }

    public void deleteExpired(Instant now) {
        jdbc.update("DELETE FROM remember_me_tokens WHERE expires_at <= ?", now);
    }
}
