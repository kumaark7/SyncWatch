package xyz.projectdarkhope.syncwatch.room;

import org.junit.jupiter.api.Test;
import xyz.projectdarkhope.syncwatch.sync.SyncEvent;

import static org.assertj.core.api.Assertions.assertThat;

class RoomPlaybackRevisionTest {
    @Test
    void playbackRevisionStartsAtZeroAndControlsIncrementExactlyOnce() {
        Room room = new Room("ROOM", "Room");

        assertThat(room.getPlaybackRevision()).isZero();

        room.updatePlayback(10, true);
        assertThat(room.getPlaybackRevision()).isEqualTo(1);

        room.updatePlayback(11, false);
        assertThat(room.getPlaybackRevision()).isEqualTo(2);

        room.updateSeek(20, false);
        assertThat(room.getPlaybackRevision()).isEqualTo(3);
        assertThat(room.getSeekVersion()).isEqualTo(1);
    }

    @Test
    void mediaSelectionAndClearResetPlaybackWithOneRevisionEach() {
        Room room = new Room("ROOM", "Room");

        room.setFileId("file-one");
        room.setFileName("Movie");
        room.resetPlayback();

        assertThat(room.getPlaybackRevision()).isEqualTo(1);
        assertThat(SyncEvent.fileSelected(room, "host").playbackRevision()).isEqualTo(1);
        assertThat(SyncEvent.fileSelected(room, "host").hasFile()).isTrue();
        assertThat(RoomResponse.from(room, "host").playbackRevision()).isEqualTo(1);

        room.clearFile();

        assertThat(room.getPlaybackRevision()).isEqualTo(2);
        assertThat(SyncEvent.fileCleared(room, "host").playbackRevision()).isEqualTo(2);
        assertThat(SyncEvent.fileCleared(room, "host").hasFile()).isFalse();
        assertThat(RoomResponse.from(room, "host").playbackRevision()).isEqualTo(2);
    }
}
