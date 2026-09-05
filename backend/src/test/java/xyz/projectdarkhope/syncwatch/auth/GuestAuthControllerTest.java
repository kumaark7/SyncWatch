package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import static org.assertj.core.api.Assertions.assertThat;

class GuestAuthControllerTest {
    private final RoomStore rooms = new RoomStore();
    private final GuestAuthController controller = new GuestAuthController(rooms);

    @Test
    void inviteGuestReceivesServerOwnedRoomIdentity() {
        Room room = rooms.create("Friday Movies");
        MockHttpServletRequest request = new MockHttpServletRequest();

        ResponseEntity<?> response = controller.join(
                new GuestLoginRequest(room.getId().toLowerCase(), "  Nova  "),
                request
        );

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isInstanceOfSatisfying(
                AuthSessionResponse.class,
                session -> {
                    assertThat(session.authenticated()).isTrue();
                    assertThat(session.role()).isEqualTo(AuthService.ROLE_GUEST);
                    assertThat(session.allowedRoomId()).isEqualTo(room.getId());
                    assertThat(session.displayName()).isEqualTo("Nova");
                    assertThat(session.clientId()).isNotBlank();
                    assertThat(session.userId()).isNull();
                }
        );
        assertThat(request.getSession(false).getAttribute(AuthService.SESSION_GUEST_ID))
                .asString()
                .startsWith("guest:");
    }

    @Test
    void missingRoomCannotCreateGuestSession() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        ResponseEntity<?> response = controller.join(
                new GuestLoginRequest("ABC123", "Nova"),
                request
        );

        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(request.getSession(false)).isNull();
    }
}
