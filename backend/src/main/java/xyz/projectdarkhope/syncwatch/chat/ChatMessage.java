package xyz.projectdarkhope.syncwatch.chat;

public record ChatMessage(
        String id,
        String roomId,
        String senderId,
        String senderName,
        ChatMessageType type,
        String text,
        long timestamp
) {}
