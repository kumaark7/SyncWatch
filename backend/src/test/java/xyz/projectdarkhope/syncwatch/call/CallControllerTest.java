package xyz.projectdarkhope.syncwatch.call;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomStore;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallControllerTest {
    private final RoomStore rooms = new RoomStore();
    private final AuthService auth = mock(AuthService.class);
    private final LiveKitTokenService tokens = mock(LiveKitTokenService.class);
    private final CallController controller = new CallController(rooms, auth, tokens);

    @Test
    void participantOwnerCanRequestTheirCallToken() {
        Room room = roomWithParticipant();
        MockHttpServletRequest request = requestFor("owner-user");
        when(tokens.createToken(room, "owner-client", "Owner"))
                .thenReturn(new CallTokenResponse("wss://livekit.example", "token"));

        ResponseEntity<?> response = controller.token(room.getId(), "owner-client", request);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        verify(tokens).createToken(room, "owner-client", "Owner");
    }

    @Test
    void spoofedParticipantClientIdCannotRequestCallToken() {
        Room room = roomWithParticipant();
        MockHttpServletRequest request = requestFor("attacker-user");

        ResponseEntity<?> response = controller.token(room.getId(), "owner-client", request);

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        verify(tokens, never()).createToken(any(), any(), any());
    }

    @Test
    void roomGuestCanOnlyRequestTheirOwnCallToken() {
        Room room = roomWithParticipant();
        room.registerParticipant("guest-client", "guest:owner", "Guest", "session-2");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.isGuestAuthenticated(request.getSession(false))).thenReturn(true);
        when(auth.participantOwnerId(request.getSession(false), room.getId(), "guest-client"))
                .thenReturn(Optional.of("guest:owner"));
        when(tokens.createToken(room, "guest-client", "Guest"))
                .thenReturn(new CallTokenResponse("wss://livekit.example", "token"));

        assertThat(controller.token(room.getId(), "guest-client", request).getStatusCode().value())
                .isEqualTo(200);
        assertThat(controller.token(room.getId(), "owner-client", request).getStatusCode().value())
                .isEqualTo(403);
        verify(tokens).createToken(room, "guest-client", "Guest");
    }

    private Room roomWithParticipant() {
        Room room = rooms.create("Test Room");
        room.claimHost("owner-client", "owner-user");
        room.registerParticipant("owner-client", "owner-user", "Owner", "session-1");
        return room;
    }

    private MockHttpServletRequest requestFor(String userId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.isAuthenticated(request.getSession(false))).thenReturn(true);
        when(auth.sessionUserId(request.getSession(false))).thenReturn(Optional.of(userId));
        when(auth.participantOwnerId(
                org.mockito.ArgumentMatchers.eq(request.getSession(false)),
                anyString(),
                anyString()
        )).thenReturn(Optional.of(userId));
        return request;
    }
}
