package xyz.projectdarkhope.syncwatch.room;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Room {
    public record ParticipantRegistration(
            boolean accepted,
            boolean joined,
            RoomParticipant participant
    ) {}

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

    public synchronized ParticipantRegistration registerParticipant(
            String clientId,
            String nameTag,
            String sessionId
    ) {
        if (clientId == null || clientId.isBlank()
                || nameTag == null || nameTag.isBlank()
                || sessionId == null || sessionId.isBlank()) {
            return new ParticipantRegistration(false, false, null);
        }

        boolean alreadyPresent = participantNames.containsKey(clientId);
        participantNames.put(clientId, nameTag.trim());
        boolean sessionAdded = sessionsByClientId
                .computeIfAbsent(clientId, ignored -> new HashSet<>())
                .add(sessionId);
        RoomParticipant participant = new RoomParticipant(
                clientId,
                participantNames.get(clientId),
                isHost(clientId)
        );
        return new ParticipantRegistration(true, !alreadyPresent && sessionAdded, participant);
    }

    public synchronized List<RoomParticipant> removeSession(String sessionId) {
        List<RoomParticipant> departures = new ArrayList<>();

        for (var entry : new ArrayList<>(sessionsByClientId.entrySet())) {
            if (!entry.getValue().remove(sessionId)) {
                continue;
            }

            if (entry.getValue().isEmpty()) {
                String clientId = entry.getKey();
                String nameTag = participantNames.get(clientId);
                sessionsByClientId.remove(entry.getKey());
                participantNames.remove(entry.getKey());
                if (nameTag != null) {
                    departures.add(new RoomParticipant(clientId, nameTag, isHost(clientId)));
                }
            }
        }

        return departures;
    }

    public synchronized boolean hasParticipant(String clientId) {
        return clientId != null && participantNames.containsKey(clientId);
    }

    public synchronized String getParticipantName(String clientId) {
        return clientId == null ? null : participantNames.get(clientId);
    }

    public synchronized String getClientIdForSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }

        for (var entry : sessionsByClientId.entrySet()) {
            if (entry.getValue().contains(sessionId)) {
                return entry.getKey();
            }
        }

        return null;
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
