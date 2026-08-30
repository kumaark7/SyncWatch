package xyz.projectdarkhope.syncwatch.google;

public class GoogleOAuthException extends RuntimeException {
    public GoogleOAuthException(String message) {
        super(message);
    }

    public GoogleOAuthException(String message, Throwable cause) {
        super(message, cause);
    }
}
