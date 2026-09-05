package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthFilterTest {
    private final AuthService authService = mock(AuthService.class);
    private final AuthFilter filter = new AuthFilter(authService);

    @Test
    void authenticatedUserCanReachProtectedApi() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/rooms");
        when(authService.isAuthenticated(request.getSession(true))).thenReturn(true);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void anonymousRequestIsRejected() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/rooms");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("Authentication required");
    }

    @Test
    void guestCanReachOnlyTheirInvitedRoomApis() throws Exception {
        MockHttpServletRequest allowed = guestRequest("GET", "/api/rooms/ABC123");
        MockHttpServletResponse allowedResponse = new MockHttpServletResponse();
        filter.doFilter(allowed, allowedResponse, new MockFilterChain());

        MockHttpServletRequest otherRoom = guestRequest("GET", "/api/rooms/OTHER1");
        MockHttpServletResponse otherRoomResponse = new MockHttpServletResponse();
        filter.doFilter(otherRoom, otherRoomResponse, new MockFilterChain());

        MockHttpServletRequest createRoom = guestRequest("POST", "/api/rooms");
        MockHttpServletResponse createRoomResponse = new MockHttpServletResponse();
        filter.doFilter(createRoom, createRoomResponse, new MockFilterChain());

        MockHttpServletRequest google = guestRequest("POST", "/api/google/code");
        MockHttpServletResponse googleResponse = new MockHttpServletResponse();
        filter.doFilter(google, googleResponse, new MockFilterChain());

        MockHttpServletRequest roomFile = guestRequest("POST", "/api/rooms/ABC123/file");
        MockHttpServletResponse roomFileResponse = new MockHttpServletResponse();
        filter.doFilter(roomFile, roomFileResponse, new MockFilterChain());

        MockHttpServletRequest screenShare = guestRequest(
                "POST",
                "/api/rooms/ABC123/screen-share/start"
        );
        MockHttpServletResponse screenShareResponse = new MockHttpServletResponse();
        filter.doFilter(screenShare, screenShareResponse, new MockFilterChain());

        MockHttpServletRequest otherRoomScreenShare = guestRequest(
                "POST",
                "/api/rooms/OTHER1/screen-share/start"
        );
        MockHttpServletResponse otherRoomScreenShareResponse = new MockHttpServletResponse();
        filter.doFilter(
                otherRoomScreenShare,
                otherRoomScreenShareResponse,
                new MockFilterChain()
        );

        assertThat(allowedResponse.getStatus()).isEqualTo(200);
        assertThat(otherRoomResponse.getStatus()).isEqualTo(401);
        assertThat(createRoomResponse.getStatus()).isEqualTo(401);
        assertThat(googleResponse.getStatus()).isEqualTo(200);
        assertThat(roomFileResponse.getStatus()).isEqualTo(200);
        assertThat(screenShareResponse.getStatus()).isEqualTo(200);
        assertThat(otherRoomScreenShareResponse.getStatus()).isEqualTo(401);
    }

    private MockHttpServletRequest guestRequest(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.getSession(true).setAttribute(AuthService.SESSION_GUEST_ROOM, "ABC123");
        when(authService.isGuestAuthenticated(request.getSession(false))).thenReturn(true);
        return request;
    }
}
