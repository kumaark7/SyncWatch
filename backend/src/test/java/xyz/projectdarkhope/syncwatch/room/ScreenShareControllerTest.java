package xyz.projectdarkhope.syncwatch.room;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.sync.SyncEvent;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ScreenShareControllerTest {
    private final RoomStore rooms = new RoomStore();
    private final AuthService auth = mock(AuthService.class);
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final ScreenShareController controller = new ScreenShareController(
            rooms,
            auth,
            messaging
    );

    @Test
    void participantCanClaimOnlyAvailableScreenShare() {
        Room room = roomWithParticipants();
        MockHttpServletRequest hostRequest = requestFor(room, "host", "user:host");
        MockHttpServletRequest guestRequest = requestFor(room, "guest", "guest:one");

        ResponseEntity<?> started = controller.start(
                room.getId(),
                new ScreenShareController.ParticipantRequest("host"),
                hostRequest
        );
        ResponseEntity<?> conflict = controller.start(
                room.getId(),
                new ScreenShareController.ParticipantRequest("guest"),
                guestRequest
        );

        assertThat(started.getStatusCode().value()).isEqualTo(200);
        assertThat(conflict.getStatusCode().value()).isEqualTo(409);
        assertThat(room.getScreenSharerClientId()).isEqualTo("host");
        verify(messaging).convertAndSend(
                eq("/topic/room/" + room.getId()),
                any(SyncEvent.class)
        );
    }

    @Test
    void hostCanBlockGuestWhileRemainingAllowedToShare() {
        Room room = roomWithParticipants();
        MockHttpServletRequest hostRequest = requestFor(room, "host", "user:host");
        MockHttpServletRequest guestRequest = requestFor(room, "guest", "guest:one");

        ResponseEntity<?> setting = controller.setGuestAccess(
                room.getId(),
                new ScreenShareController.GuestAccessRequest("host", false),
                hostRequest
        );
        ResponseEntity<?> guestStart = controller.start(
                room.getId(),
                new ScreenShareController.ParticipantRequest("guest"),
                guestRequest
        );
        ResponseEntity<?> hostStart = controller.start(
                room.getId(),
                new ScreenShareController.ParticipantRequest("host"),
                hostRequest
        );

        assertThat(setting.getStatusCode().value()).isEqualTo(200);
        assertThat(guestStart.getStatusCode().value()).isEqualTo(403);
        assertThat(hostStart.getStatusCode().value()).isEqualTo(200);
        assertThat(room.isGuestScreenSharingAllowed()).isFalse();
    }

    @Test
    void blockingGuestsEndsAnActiveGuestLease() {
        Room room = roomWithParticipants();
        MockHttpServletRequest hostRequest = requestFor(room, "host", "user:host");
        MockHttpServletRequest guestRequest = requestFor(room, "guest", "guest:one");
        assertThat(controller.start(
                room.getId(),
                new ScreenShareController.ParticipantRequest("guest"),
                guestRequest
        ).getStatusCode().value()).isEqualTo(200);

        ResponseEntity<?> response = controller.setGuestAccess(
                room.getId(),
                new ScreenShareController.GuestAccessRequest("host", false),
                hostRequest
        );

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(room.getScreenSharerClientId()).isNull();
    }

    @Test
    void nonHostCannotChangeGuestAccess() {
        Room room = roomWithParticipants();
        MockHttpServletRequest guestRequest = requestFor(room, "guest", "guest:one");

        ResponseEntity<?> response = controller.setGuestAccess(
                room.getId(),
                new ScreenShareController.GuestAccessRequest("guest", false),
                guestRequest
        );

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(room.isGuestScreenSharingAllowed()).isTrue();
    }

    @Test
    void spoofedClientIdCannotStartOrStopAnotherParticipantsShare() {
        Room room = roomWithParticipants();
        MockHttpServletRequest attackerRequest = new MockHttpServletRequest();
        attackerRequest.getSession(true);
        when(auth.participantOwnerId(
                attackerRequest.getSession(false),
                room.getId(),
                "host"
        )).thenReturn(Optional.of("user:attacker"));

        assertThat(controller.start(
                room.getId(),
                new ScreenShareController.ParticipantRequest("host"),
                attackerRequest
        ).getStatusCode().value()).isEqualTo(403);
        assertThat(controller.stop(
                room.getId(),
                new ScreenShareController.ParticipantRequest("host"),
                attackerRequest
        ).getStatusCode().value()).isEqualTo(403);
        assertThat(room.getScreenSharerClientId()).isNull();
    }

    @Test
    void removingParticipantClearsTheirScreenShare() {
        Room room = roomWithParticipants();
        assertThat(room.startScreenShare("guest")).isTrue();

        room.removeParticipant("guest");

        assertThat(room.getScreenSharerClientId()).isNull();
    }

    private Room roomWithParticipants() {
        Room room = rooms.create("Test Room");
        room.claimHost("host", "user:host");
        room.registerParticipant("host", "user:host", "Host", "session-host");
        room.registerParticipant("guest", "guest:one", "Guest", "session-guest");
        return room;
    }

    private MockHttpServletRequest requestFor(Room room, String clientId, String ownerId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.participantOwnerId(
                request.getSession(false),
                room.getId(),
                clientId
        )).thenReturn(Optional.of(ownerId));
        return request;
    }
}
