package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class RequestRateLimiterTest {
    @Test
    void windowsExpireAndPrincipalsAreIsolated() {
        AtomicLong now = new AtomicLong();
        RequestRateLimiter limiter = new RequestRateLimiter(now::get);
        assertThat(limiter.allow("one", 1, Duration.ofSeconds(10))).isTrue();
        assertThat(limiter.allow("one", 1, Duration.ofSeconds(10))).isFalse();
        assertThat(limiter.allow("two", 1, Duration.ofSeconds(10))).isTrue();
        now.set(Duration.ofSeconds(10).toNanos());
        assertThat(limiter.allow("one", 1, Duration.ofSeconds(10))).isTrue();
    }

    @Test
    void concurrentRequestsCannotExceedBudget() {
        RequestRateLimiter limiter = new RequestRateLimiter();
        AtomicInteger accepted = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(8)) {
            for (int i = 0; i < 100; i++) executor.submit(() -> {
                if (limiter.allow("same", 10, Duration.ofMinutes(1))) accepted.incrementAndGet();
            });
        }
        assertThat(accepted.get()).isEqualTo(10);
    }

    @Test
    void attackerCannotGrowUnlimitedBuckets() {
        RequestRateLimiter limiter = new RequestRateLimiter(() -> 0L);
        for (int i = 0; i < 10_000; i++) assertThat(limiter.allow("key" + i, 1, Duration.ofMinutes(1))).isTrue();
        assertThat(limiter.allow("overflow", 1, Duration.ofMinutes(1))).isFalse();
    }

    @Test
    void loginReturns429AndDoesNotTrustForwardedForOrNewSessions() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(new RequestRateLimiter());
        MockHttpServletResponse response = null;
        for (int i = 0; i < 31; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
            request.setRemoteAddr("192.0.2.1");
            request.addHeader("X-Forwarded-For", "spoof-" + i);
            request.getSession(true);
            response = run(filter, request);
            assertThat(response.getStatus()).isEqualTo(i < 30 ? 204 : 429);
        }
        assertThat(response.getHeader("Retry-After")).isEqualTo("300");
    }

    @Test
    void rangesAreNeverThrottledAndGuestCannotResetBudgetByChangingClientId() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(new RequestRateLimiter());
        for (int i = 0; i < 700; i++) {
            assertThat(run(filter, new MockHttpServletRequest("GET", "/api/stream/ABC123")).getStatus()).isEqualTo(204);
        }
        for (int i = 0; i < 21; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/rooms/ABC123/call/token");
            request.getSession().setAttribute(AuthService.SESSION_GUEST_ID, "guest:one");
            request.addParameter("clientId", "spoof" + i);
            assertThat(run(filter, request).getStatus()).isEqualTo(i < 20 ? 204 : 429);
        }
    }

    private MockHttpServletResponse run(RequestRateLimitFilter filter, MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(204));
        return response;
    }
}
