package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/** Bounded single-instance windows, using monotonic time and no cleanup thread. */
@Component
public class RequestRateLimiter {
    private static final int MAX_BUCKETS = 10_000;
    private final Map<String, Window> windows = new HashMap<>();
    private final LongSupplier clock;
    private long nextCleanup;

    public RequestRateLimiter() {
        this(System::nanoTime);
    }

    RequestRateLimiter(LongSupplier clock) {
        this.clock = clock;
        this.nextCleanup = clock.getAsLong();
    }

    public synchronized boolean allow(String key, int limit, Duration duration) {
        long now = clock.getAsLong();
        if (now >= nextCleanup) {
            windows.values().removeIf(window -> now >= window.expires);
            nextCleanup = now + Duration.ofMinutes(1).toNanos();
        }
        Window window = windows.get(key);
        if (window == null || now >= window.expires) {
            if (window == null && windows.size() >= MAX_BUCKETS) return false;
            window = new Window(now + duration.toNanos());
            windows.put(key, window);
        }
        if (window.count >= limit) return false;
        window.count++;
        return true;
    }

    private static final class Window {
        private final long expires;
        private int count;

        private Window(long expires) { this.expires = expires; }
    }
}
