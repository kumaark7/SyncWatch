package xyz.projectdarkhope.syncwatch.auth;

public record LoginRequest(
        String identifier,
        String password,
        boolean rememberMe
) {
    public LoginRequest(String identifier, String password) {
        this(identifier, password, false);
    }
}
