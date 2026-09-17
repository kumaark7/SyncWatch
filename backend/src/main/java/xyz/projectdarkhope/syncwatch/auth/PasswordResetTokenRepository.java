package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public class PasswordResetTokenRepository {
    private final JdbcTemplate jdbc;

    public PasswordResetTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void replaceForUser(String userId, String tokenHash, Instant expiresAt, Instant createdAt) {
        deleteByUserId(userId);
        jdbc.update(
                """
                INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                tokenHash,
                userId,
                expiresAt,
                createdAt
        );
    }

    public Optional<PasswordResetToken> findForUpdate(String tokenHash) {
        return jdbc.query(
                """
                SELECT token_hash, user_id, expires_at, created_at
                FROM password_reset_tokens
                WHERE token_hash = ?
                FOR UPDATE
                """,
                (result, rowNumber) -> new PasswordResetToken(
                        result.getString("token_hash"),
                        result.getString("user_id"),
                        result.getTimestamp("expires_at").toInstant(),
                        result.getTimestamp("created_at").toInstant()
                ),
                tokenHash
        ).stream().findFirst();
    }

    public void delete(String tokenHash) {
        jdbc.update("DELETE FROM password_reset_tokens WHERE token_hash = ?", tokenHash);
    }

    public void deleteByUserId(String userId) {
        jdbc.update("DELETE FROM password_reset_tokens WHERE user_id = ?", userId);
    }
}
