package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.http.HttpStatus;

import java.nio.charset.StandardCharsets;

final class PasswordPolicy {
    private PasswordPolicy() {}

    static void validate(String password, String confirmation) {
        String value = password == null ? "" : password;
        String repeated = confirmation == null ? "" : confirmation;
        int length = value.codePointCount(0, value.length());
        if (length < 8 || !withinBcryptLimit(value)) {
            throw new AuthException(
                    HttpStatus.BAD_REQUEST,
                    "Password must be at least 8 characters and no more than 72 UTF-8 bytes"
            );
        }
        if (!value.equals(repeated)) {
            throw new AuthException(HttpStatus.BAD_REQUEST, "Passwords do not match");
        }
    }

    static boolean withinBcryptLimit(String password) {
        return password != null && password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
}
