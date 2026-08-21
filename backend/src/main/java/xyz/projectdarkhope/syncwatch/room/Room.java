package xyz.projectdarkhope.syncwatch.room;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Room {
    private final String id;
    private volatile String fileId;
    private volatile String fileName;
    private volatile String accessToken;
    private volatile String hostClientId;
    private volatile boolean playing;
    private volatile double currentTime;
    private volatile long updatedAt;
    private volatile long seekVersion;
    private final Map<String, String> participantNames = new HashMap<>();
    private final Map<String, Set<String>> sessionsByClientId = new HashMap<>();

    public Room(String id) {
        this.id = id;
        this.updatedAt = System.currentTimeMillis();
    }

    public String getId() { return id; }
    public String getFileId() { return fileId; }
    public void setFileId(String v) { fileId = v; }
    public String getFileName() { return fileName; }
    public void setFileName(String v) { fileName = v; }
    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String v) { accessToken = v; }
    public String getHostClientId() { return hostClientId; }
    public boolean isPlaying() { return playing; }
    public long getSeekVersion() { return seekVersion; }
    public boolean hasFile() { return fileId != null && !fileId.isBlank(); }
    public boolean hasHost() { return hostClientId != null && !hostClientId.isBlank(); }
    public boolean isHost(String clientId) {
        return clientId != null && !clientId.isBlank() && clientId.equals(hostClientId);
    }

    public synchronized boolean claimHost(String clientId) {
        if (clientId == null || clientId.isBlank()) return false;
        if (!hasHost()) {
            hostClientId = clientId;
            return true;
        }
        return hostClientId.equals(clientId);
    }

    public synchronized void resetPlayback() {
        playing = false;
        currentTime = 0;
        updatedAt = System.currentTimeMillis();
    }

    public synchronized void clearFile() {
        fileId = null;
        fileName = null;
        accessToken = null;
        resetPlayback();
    }

    public synchronized void updatePlayback(double time, boolean playing) {
        currentTime = Math.max(0, time);
        this.playing = playing;
        updatedAt = System.currentTimeMillis();
    }

    public synchronized void updateSeek(double time, boolean playing) {
        seekVersion++;
        updatePlayback(time, playing);
    }

    public synchronized double getCurrentTime() {
        if (!playing) return currentTime;
        return currentTime + (System.currentTimeMillis() - updatedAt) / 1000.0;
    }

    public synchronized boolean registerParticipant(
            String clientId,
            String nameTag,
            String sessionId
    ) {
        if (clientId == null || clientId.isBlank()
                || nameTag == null || nameTag.isBlank()
                || sessionId == null || sessionId.isBlank()) {
            return false;
        }

        participantNames.put(clientId, nameTag.trim());
        sessionsByClientId
                .computeIfAbsent(clientId, ignored -> new HashSet<>())
                .add(sessionId);
        return true;
    }

    public synchronized boolean removeSession(String sessionId) {
        boolean changed = false;

        for (var entry : new ArrayList<>(sessionsByClientId.entrySet())) {
            if (!entry.getValue().remove(sessionId)) {
                continue;
            }

            changed = true;
            if (entry.getValue().isEmpty()) {
                sessionsByClientId.remove(entry.getKey());
                participantNames.remove(entry.getKey());
            }
        }

        return changed;
    }

    public synchronized List<RoomParticipant> getParticipants() {
        return participantNames.entrySet().stream()
                .sorted(Map.Entry.comparingByValue(String.CASE_INSENSITIVE_ORDER))
                .map(entry -> new RoomParticipant(
                        entry.getKey(),
                        entry.getValue(),
                        isHost(entry.getKey())
                ))
                .toList();
    }
}
