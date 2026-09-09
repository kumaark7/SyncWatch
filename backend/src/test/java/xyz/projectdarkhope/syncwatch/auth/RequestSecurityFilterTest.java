package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RequestSecurityFilterTest {
    private final RequestSecurityFilter filter = new RequestSecurityFilter("https://watch.example");

    @Test
    void mutationsRequireTrustedOriginAndCustomHeaderIncludingLoginAndLogout() throws Exception {
        for (String path : new String[]{"/api/auth/login", "/api/auth/signup", "/api/auth/guest",
                "/api/auth/logout", "/api/google/code", "/api/google/connection", "/api/rooms"}) {
            for (String method : new String[]{"POST", "PUT", "DELETE"}) {
                assertThat(request(method, path, "https://evil.example", true)).isEqualTo(403);
                assertThat(request(method, path, "null", true)).isEqualTo(403);
                assertThat(request(method, path, null, true)).isEqualTo(403);
                assertThat(request(method, path, "https://watch.example", false)).isEqualTo(403);
                assertThat(request(method, path, "https://watch.example", true)).isEqualTo(204);
            }
        }
    }

    @Test
    void websocketOriginIsRequiredAndRangeRequestsNeedNoCustomHeader() throws Exception {
        assertThat(request("GET", "/ws", null, false)).isEqualTo(403);
        assertThat(request("GET", "/ws", "https://watch.example.evil.test", false)).isEqualTo(403);
        assertThat(request("GET", "/ws", "https://watch.example", false)).isEqualTo(204);
        assertThat(request("GET", "/api/stream/ABC123", null, false)).isEqualTo(204);
        assertThat(request("OPTIONS", "/api/auth/login", "https://watch.example", false)).isEqualTo(204);
    }

    @Test
    void privateResponsesAreNotCacheable() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/google/connection"), response, (req, res) -> {});
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
    }

    @Test
    void invalidOriginConfigurationFailsClosed() {
        for (String origin : new String[]{"*", "null", "https://watch.example/path", "https://user@watch.example"}) {
            assertThatThrownBy(() -> new RequestSecurityFilter(origin)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    private int request(String method, String path, String origin, boolean header) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        if (origin != null) request.addHeader("Origin", origin);
        if (header) request.addHeader("X-Requested-With", "XmlHttpRequest");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(204));
        return response.getStatus();
    }
}
