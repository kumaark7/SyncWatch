package xyz.projectdarkhope.syncwatch.room;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import xyz.projectdarkhope.syncwatch.auth.AuthService;
import xyz.projectdarkhope.syncwatch.google.GoogleDriveOAuthService;
import xyz.projectdarkhope.syncwatch.sync.SyncEvent;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RoomControllerTest {
    private final RoomStore rooms = new RoomStore();
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final GoogleDriveOAuthService googleOAuth = mock(GoogleDriveOAuthService.class);
    private final AuthService auth = mock(AuthService.class);
    private final RoomController controller = new RoomController(
            rooms,
            messaging,
            googleOAuth,
            auth
    );

    @Test
    void roomCreationBindsHostClientIdToAuthenticatedUser() {
        RoomResponse response = controller.createRoom(
                "host",
                "Test Room",
                requestFor("host-user")
        );

        Room room = rooms.find(response.roomId()).orElseThrow();
        room.registerParticipant("host", "host-user", "Host", "session-1");
        assertThat(room.isHostOwnedBy("host", "host-user")).isTrue();
        assertThat(room.isHostOwnedBy("host", "attacker-user")).isFalse();
    }

    @Test
    void currentHostCanTransferHostToConnectedParticipant() {
        Room room = rooms.create("Test Room");
        room.claimHost("host", "host-user");
        room.registerParticipant("host", "host-user", "Host", "session-1");
        room.registerParticipant("guest", "guest-user", "Guest", "session-2");

        ResponseEntity<?> response = controller.transferHost(
                room.getId(),
                new HostTransferRequest("host", "guest"),
                requestFor("host-user")
        );

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(room.isHost("guest")).isTrue();
        ArgumentCaptor<SyncEvent> event = ArgumentCaptor.forClass(SyncEvent.class);
        verify(messaging).convertAndSend(eq("/topic/room/" + room.getId()), event.capture());
        assertThat(event.getValue().type()).isEqualTo("PARTICIPANTS");
        assertThat(event.getValue().hostClientId()).isEqualTo("guest");
    }

    @Test
    void nonHostCannotTransferHost() {
        Room room = rooms.create("Test Room");
        room.claimHost("host", "host-user");
        room.registerParticipant("host", "host-user", "Host", "session-1");
        room.registerParticipant("guest", "guest-user", "Guest", "session-2");

        ResponseEntity<?> response = controller.transferHost(
                room.getId(),
                new HostTransferRequest("guest", "host"),
                requestFor("guest-user")
        );

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(room.isHost("host")).isTrue();
    }

    @Test
    void spoofedHostClientIdCannotTransferHost() {
        Room room = rooms.create("Test Room");
        room.claimHost("host", "host-user");
        room.registerParticipant("host", "host-user", "Host", "session-1");
        room.registerParticipant("guest", "guest-user", "Guest", "session-2");

        ResponseEntity<?> response = controller.transferHost(
                room.getId(),
                new HostTransferRequest("host", "guest"),
                requestFor("attacker-user")
        );

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(room.isHost("host")).isTrue();
    }

    @Test
    void differentUserCannotRefreshAnotherUsersRoomDriveCredentials() {
        Room room = rooms.create("Test Room");
        room.claimHost("host", "user-b");
        room.registerParticipant("host", "user-b", "Host", "session-1");
        room.setFileId("drive-file");
        room.setDriveCredentials("user-a", "access-a", System.currentTimeMillis() + 60_000);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.sessionUserId(any())).thenReturn(Optional.of("user-b"));

        ResponseEntity<?> response = controller.refreshDriveToken(
                room.getId(),
                new DriveTokenRequest("host"),
                request
        );

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(room.getDriveOwnerUserId()).isEqualTo("user-a");
        verifyNoInteractions(googleOAuth);
    }

    @Test
    void fileSelectionUsesCurrentUsersStoredDriveConnection() {
        Room room = rooms.create("Test Room");
        room.claimHost("host", "user-a");
        room.registerParticipant("host", "user-a", "Host", "session-1");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.sessionUserId(any())).thenReturn(Optional.of("user-a"));
        when(googleOAuth.refreshConnection("user-a")).thenReturn(
                new GoogleDriveOAuthService.Credentials("access-a", 1234, "refresh-a")
        );

        ResponseEntity<?> response = controller.selectFile(
                room.getId(),
                new FileSelectionRequest("drive-file", "Movie", "host"),
                request
        );

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(room.getDriveOwnerUserId()).isEqualTo("user-a");
        assertThat(room.getAccessToken()).isEqualTo("access-a");
        verify(googleOAuth).refreshConnection("user-a");
    }

    private MockHttpServletRequest requestFor(String userId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        when(auth.sessionUserId(any())).thenReturn(Optional.of(userId));
        return request;
    }
}
