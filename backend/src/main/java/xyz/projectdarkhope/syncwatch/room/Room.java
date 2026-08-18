package xyz.projectdarkhope.syncwatch.room;

public class Room {
    private final String id;
    private volatile String fileId;
    private volatile String fileName;
    private volatile String accessToken;

    public Room(String id) { this.id = id; }
    public String getId() { return id; }
    public String getFileId() { return fileId; }
    public void setFileId(String v) { fileId = v; }
    public String getFileName() { return fileName; }
    public void setFileName(String v) { fileName = v; }
    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String v) { accessToken = v; }
    public boolean hasFile() { return fileId != null && !fileId.isBlank(); }
}
