package xyz.projectdarkhope.syncwatch.room;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RoomIdentitySecurityTest {
    @Test
    void oneSocketCannotInventMultipleParticipantsAndSpoofAnotherOwner() {
        Room room = new Room("ABC123", "Room");
        assertThat(room.registerParticipant("one", "user-one", "One", "socket-one").accepted()).isTrue();
        assertThat(room.registerParticipant("two", "user-one", "Two", "socket-one").accepted()).isFalse();
        assertThat(room.registerParticipant("one", "attacker", "Impostor", "socket-two").accepted()).isFalse();
        assertThat(room.registerParticipant("one", "user-one", "One", "reconnected-socket").accepted()).isTrue();
        assertThat(room.getParticipants()).hasSize(1);
        assertThat(room.registerParticipant("a".repeat(129), "user", "Name", "socket").accepted()).isFalse();
        assertThat(room.registerParticipant("valid", "user", "x".repeat(33), "socket").accepted()).isFalse();
    }
}
