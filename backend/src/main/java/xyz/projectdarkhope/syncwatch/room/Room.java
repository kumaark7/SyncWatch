package xyz.projectdarkhope.syncwatch.room;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
    private final String name;
    private volatile String fileId;
    private volatile String fileName;
    private volatile String accessToken;
    private volatile long accessTokenExpiresAt;
    private volatile String driveOwnerUserId;
    private volatile String hostClientId;
    private volatile String screenSharerClientId;
    private volatile boolean guestScreenSharingAllowed = true;
    private volatile boolean playing;
    private volatile double currentTime;
    private volatile long updatedAt;
    private volatile long seekVersion;
    private final Map<String, String> participantNames = new LinkedHashMap<>();
    private final Map<String, String> participantUserIds = new LinkedHashMap<>();
    private final Map<String, Set<String>> sessionsByClientId = new LinkedHashMap<>();

    public Room(String id, String name) {
        this.id = id;
        this.name = name;
        this.updatedAt = System.currentTimeMillis();
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getFileId() { return fileId; }
    public void setFileId(String v) { fileId = v; }
    public String getFileName() { return fileName; }
    public void setFileName(String v) { fileName = v; }
    public String getAccessToken() { return accessToken; }
    public long getAccessTokenExpiresAt() { return accessTokenExpiresAt; }
    public String getDriveOwnerUserId() { return driveOwnerUserId; }
    public String getHostClientId() { return hostClientId; }
    public String getScreenSharerClientId() { return screenSharerClientId; }
    public boolean isGuestScreenSharingAllowed() { return guestScreenSharingAllowed; }
    public boolean isPlaying() { return playing; }
    public long getSeekVersion() { return seekVersion; }
    public boolean hasFile() { return fileId != null && !fileId.isBlank(); }
    public boolean hasHost() { return hostClientId != null && !hostClientId.isBlank(); }
    public boolean isHost(String clientId) {
        return clientId != null && !clientId.isBlank() && clientId.equals(hostClientId);
    }

    public synchronized boolean claimHost(String clientId, String userId) {
        if (clientId == null || clientId.isBlank() || userId == null || userId.isBlank()) {
            return false;
        }
        String existingOwner = participantUserIds.get(clientId);
        if (existingOwner != null && !existingOwner.equals(userId)) {
            return false;
        }
        participantUserIds.put(clientId, userId);
        if (!hasHost()) {
            hostClientId = clientId;
            return true;
        }
        return hostClientId.equals(clientId);
    }

    public synchronized String promoteOldestParticipantIfNeeded() {
        if (hostClientId != null && participantNames.containsKey(hostClientId)) {
            return hostClientId;
        }

        hostClientId = participantNames.keySet().stream().findFirst().orElse(null);
        return hostClientId;
    }

    public synchronized boolean transferHost(String currentHostClientId, String targetClientId) {
        if (!isHost(currentHostClientId)
                || targetClientId == null
                || targetClientId.isBlank()
                || !participantNames.containsKey(targetClientId)) {
            return false;
        }

        hostClientId = targetClientId;
        return true;
    }

    public synchronized boolean hasParticipants() {
        return !participantNames.isEmpty();
    }

    public synchronized boolean canStartScreenShare(String clientId) {
        if (!hasParticipant(clientId)) {
            return false;
        }
        String ownerId = participantUserIds.get(clientId);
        return ownerId != null && (
                isHost(clientId)
                        || !ownerId.startsWith("guest:")
                        || guestScreenSharingAllowed
        );
    }

    public synchronized boolean startScreenShare(String clientId) {
        if (!canStartScreenShare(clientId)
                || (screenSharerClientId != null && !screenSharerClientId.equals(clientId))) {
            return false;
        }
        screenSharerClientId = clientId;
        return true;
    }

    public synchronized boolean stopScreenShare(String clientId) {
        if (clientId == null || !clientId.equals(screenSharerClientId)) {
            return false;
        }
        screenSharerClientId = null;
        return true;
    }

    public synchronized String setGuestScreenSharingAllowed(boolean allowed) {
        guestScreenSharingAllowed = allowed;
        if (allowed || screenSharerClientId == null || isHost(screenSharerClientId)) {
            return null;
        }
        String ownerId = participantUserIds.get(screenSharerClientId);
        if (ownerId == null || !ownerId.startsWith("guest:")) {
            return null;
        }
        String stoppedClientId = screenSharerClientId;
        screenSharerClientId = null;
        return stoppedClientId;
    }

    public synchronized boolean clearScreenShare(String clientId) {
        return stopScreenShare(clientId);
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
        accessTokenExpiresAt = 0;
        driveOwnerUserId = null;
        resetPlayback();
    }

    public synchronized void setDriveCredentials(
            String ownerUserId,
            String accessToken,
            long accessTokenExpiresAt
    ) {
        this.driveOwnerUserId = ownerUserId;
        this.accessToken = accessToken;
        this.accessTokenExpiresAt = accessTokenExpiresAt;
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
            String userId,
            String nameTag,
            String sessionId
    ) {
        if (clientId == null || clientId.isBlank()
                || userId == null || userId.isBlank()
                || nameTag == null || nameTag.isBlank()
                || sessionId == null || sessionId.isBlank()) {
            return new ParticipantRegistration(false, false, null);
        }

        String existingOwner = participantUserIds.get(clientId);
        if (existingOwner != null && !existingOwner.equals(userId)) {
            return new ParticipantRegistration(false, false, null);
        }

        boolean alreadyPresent = participantNames.containsKey(clientId);
        participantUserIds.put(clientId, userId);
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
                clearScreenShare(clientId);
                sessionsByClientId.remove(entry.getKey());
                participantNames.remove(entry.getKey());
                participantUserIds.remove(entry.getKey());
                if (nameTag != null) {
                    departures.add(new RoomParticipant(clientId, nameTag, isHost(clientId)));
                }
            }
        }

        return departures;
    }

    public synchronized RoomParticipant removeParticipant(String clientId) {
        if (clientId == null || clientId.isBlank()) {
            return null;
        }

        String nameTag = participantNames.remove(clientId);
        clearScreenShare(clientId);
        participantUserIds.remove(clientId);
        sessionsByClientId.remove(clientId);
        if (nameTag == null) {
            return null;
        }

        return new RoomParticipant(clientId, nameTag, isHost(clientId));
    }

    public synchronized boolean hasParticipant(String clientId) {
        return clientId != null && participantNames.containsKey(clientId);
    }

    public synchronized boolean isParticipantOwnedBy(String clientId, String userId) {
        return clientId != null
                && userId != null
                && participantNames.containsKey(clientId)
                && userId.equals(participantUserIds.get(clientId));
    }

    public synchronized boolean isHostOwnedBy(String clientId, String userId) {
        return isHost(clientId) && isParticipantOwnedBy(clientId, userId);
    }

    public synchronized String getParticipantName(String clientId) {
        return clientId == null ? null : participantNames.get(clientId);
    }

    public synchronized String getParticipantOwnerId(String clientId) {
        return clientId == null ? null : participantUserIds.get(clientId);
    }

    public synchronized List<String> getParticipantOwnerIds() {
        return participantUserIds.values().stream().distinct().toList();
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
