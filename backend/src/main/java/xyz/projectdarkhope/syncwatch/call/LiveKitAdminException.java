package xyz.projectdarkhope.syncwatch.call;

public class LiveKitAdminException extends RuntimeException {
    public LiveKitAdminException(String message) {
        super(message);
    }

    public LiveKitAdminException(String message, Throwable cause) {
        super(message, cause);
    }
}
