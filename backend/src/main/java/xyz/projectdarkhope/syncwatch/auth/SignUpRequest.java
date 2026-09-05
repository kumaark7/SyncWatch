package xyz.projectdarkhope.syncwatch.auth;

public record SignUpRequest(
        String username,
        String email,
        String password,
        String confirmPassword,
        boolean rememberMe
) {
    public SignUpRequest(
            String username,
            String email,
            String password,
            String confirmPassword
    ) {
        this(username, email, password, confirmPassword, false);
    }
}
