package xyz.projectdarkhope.syncwatch.google;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public class GoogleDriveConnectionRepository {
    private final JdbcTemplate jdbc;

    public GoogleDriveConnectionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> findEncryptedRefreshToken(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        return jdbc.query(
                "SELECT encrypted_refresh_token FROM google_drive_connections WHERE user_id = ?",
                (result, rowNumber) -> result.getString("encrypted_refresh_token"),
                userId
        ).stream().findFirst();
    }

    public void save(String userId, String encryptedRefreshToken) {
        int updated = jdbc.update(
                "UPDATE google_drive_connections SET encrypted_refresh_token = ?, updated_at = ? WHERE user_id = ?",
                encryptedRefreshToken,
                Instant.now(),
                userId
        );
        if (updated > 0) {
            return;
        }

        try {
            jdbc.update(
                    "INSERT INTO google_drive_connections (user_id, encrypted_refresh_token, updated_at) VALUES (?, ?, ?)",
                    userId,
                    encryptedRefreshToken,
                    Instant.now()
            );
        } catch (DuplicateKeyException concurrentInsert) {
            jdbc.update(
                    "UPDATE google_drive_connections SET encrypted_refresh_token = ?, updated_at = ? WHERE user_id = ?",
                    encryptedRefreshToken,
                    Instant.now(),
                    userId
            );
        }
    }

    public void delete(String userId) {
        if (userId != null && !userId.isBlank()) {
            jdbc.update("DELETE FROM google_drive_connections WHERE user_id = ?", userId);
        }
    }
}
