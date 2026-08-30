package xyz.projectdarkhope.syncwatch.google;

public record GoogleConnectionResponse(
        boolean connected,
        String accessToken,
        long expiresAt
) {
    public static GoogleConnectionResponse disconnected() {
        return new GoogleConnectionResponse(false, null, 0);
    }
}
