package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
public class AuthService {
    public static final String SESSION_AUTHENTICATED = "syncwatchAuthenticated";
    public static final String SESSION_USERNAME = "syncwatchUsername";

    private final String configuredUsername;
    private final String configuredPassword;

    public AuthService(
            @Value("${SYNCWATCH_ADMIN_USERNAME:ADMIN}") String configuredUsername,
            @Value("${SYNCWATCH_ADMIN_PASSWORD:ADMIN}") String configuredPassword
    ) {
        this.configuredUsername = configuredUsername;
        this.configuredPassword = configuredPassword;
    }

    public boolean validCredentials(String username, String password) {
        return Objects.equals(configuredUsername, username)
                && Objects.equals(configuredPassword, password);
    }

    public String sessionUsername() {
        return configuredUsername;
    }
}
