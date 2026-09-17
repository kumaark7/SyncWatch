package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;

@Service
public class PasswordResetService {
    public static final String FORGOT_RESPONSE =
            "If an account exists for this email, a reset link has been sent.";
    public static final String INVALID_RESET_RESPONSE =
            "The reset link is invalid or has expired.";

    private static final int TOKEN_BYTES = 32;
    private static final int FORGOT_EMAIL_LIMIT = 3;
    private static final Duration FORGOT_EMAIL_WINDOW = Duration.ofHours(1);
    private static final int RESET_TOKEN_LIMIT = 5;
    private static final Duration RESET_TOKEN_WINDOW = Duration.ofMinutes(15);

    private final UserRepository users;
    private final PasswordResetTokenRepository resetTokens;
    private final RememberMeTokenRepository rememberMeTokens;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailSender mailSender;
    private final RequestRateLimiter rateLimiter;
    private final TransactionTemplate transactions;
    private final Duration tokenDuration;
    private final SecureRandom secureRandom;
    private final Clock clock;

    @Autowired
    public PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository resetTokens,
            RememberMeTokenRepository rememberMeTokens,
            PasswordEncoder passwordEncoder,
            PasswordResetMailSender mailSender,
            RequestRateLimiter rateLimiter,
            PlatformTransactionManager transactionManager,
            @Value("${syncwatch.password-reset.duration:30m}") Duration tokenDuration
    ) {
        this(
                users,
                resetTokens,
                rememberMeTokens,
                passwordEncoder,
                mailSender,
                rateLimiter,
                transactionManager,
                tokenDuration,
                new SecureRandom(),
                Clock.systemUTC()
        );
    }

    PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository resetTokens,
            RememberMeTokenRepository rememberMeTokens,
            PasswordEncoder passwordEncoder,
            PasswordResetMailSender mailSender,
            RequestRateLimiter rateLimiter,
            PlatformTransactionManager transactionManager,
            Duration tokenDuration,
            SecureRandom secureRandom,
            Clock clock
    ) {
        if (tokenDuration.isZero() || tokenDuration.isNegative() || tokenDuration.compareTo(Duration.ofHours(24)) > 0) {
            throw new IllegalArgumentException("Password reset duration must be between 1 second and 24 hours");
        }
        this.users = users;
        this.resetTokens = resetTokens;
        this.rememberMeTokens = rememberMeTokens;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.rateLimiter = rateLimiter;
        this.transactions = new TransactionTemplate(transactionManager);
        this.tokenDuration = tokenDuration;
        this.secureRandom = secureRandom;
        this.clock = clock;
    }

    public void requestReset(ForgotPasswordRequest request) {
        String email = normalizeEmail(request == null ? null : request.email());
        byte[] randomBytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(randomBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        String tokenHash = hash(rawToken);

        if (!rateLimiter.allow(
                "password-reset-email:" + hash(email),
                FORGOT_EMAIL_LIMIT,
                FORGOT_EMAIL_WINDOW
        )) {
            return;
        }

        Optional<UserAccount> user = email.length() > 254
                ? Optional.empty()
                : users.findByEmail(email);
        if (user.isEmpty() || !mailSender.enabled()) {
            return;
        }

        UserAccount account = user.get();
        Instant createdAt = clock.instant();
        transactions.executeWithoutResult(status -> resetTokens.replaceForUser(
                account.id(),
                tokenHash,
                createdAt.plus(tokenDuration),
                createdAt
        ));

        try {
            mailSender.sendPasswordReset(
                    account.email(),
                    account.username(),
                    rawToken,
                    tokenDuration
            );
        } catch (RuntimeException schedulingFailure) {
            transactions.executeWithoutResult(status -> resetTokens.delete(tokenHash));
        }
    }

    public void resetPassword(ResetPasswordRequest request) {
        String rawToken = request == null || request.token() == null ? "" : request.token();
        String submittedHash = hash(rawToken);
        if (!rateLimiter.allow(
                "password-reset-token:" + submittedHash,
                RESET_TOKEN_LIMIT,
                RESET_TOKEN_WINDOW
        )) {
            throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Please try again later.");
        }
        if (!hasValidTokenShape(rawToken)) {
            throw invalidReset();
        }

        transactions.executeWithoutResult(status -> resetInTransaction(request, submittedHash));
    }

    private void resetInTransaction(ResetPasswordRequest request, String submittedHash) {
        PasswordResetToken resetToken = resetTokens.findForUpdate(submittedHash)
                .orElseThrow(this::invalidReset);
        if (!MessageDigest.isEqual(
                resetToken.tokenHash().getBytes(StandardCharsets.US_ASCII),
                submittedHash.getBytes(StandardCharsets.US_ASCII)
        ) || !resetToken.expiresAt().isAfter(clock.instant())) {
            resetTokens.delete(resetToken.tokenHash());
            throw invalidReset();
        }

        PasswordPolicy.validate(request.password(), request.confirmPassword());
        String passwordHash = passwordEncoder.encode(request.password());
        if (!users.updatePasswordHash(resetToken.userId(), passwordHash)) {
            throw invalidReset();
        }
        resetTokens.deleteByUserId(resetToken.userId());
        rememberMeTokens.deleteByUserId(resetToken.userId());
    }

    static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private boolean hasValidTokenShape(String token) {
        if (token.isBlank() || token.length() > 128) {
            return false;
        }
        try {
            return Base64.getUrlDecoder().decode(token).length == TOKEN_BYTES;
        } catch (IllegalArgumentException malformed) {
            return false;
        }
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private AuthException invalidReset() {
        return new AuthException(HttpStatus.BAD_REQUEST, INVALID_RESET_RESPONSE);
    }
}
