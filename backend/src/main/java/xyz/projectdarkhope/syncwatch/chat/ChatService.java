package xyz.projectdarkhope.syncwatch.chat;

import org.springframework.stereotype.Service;
import xyz.projectdarkhope.syncwatch.room.Room;
import xyz.projectdarkhope.syncwatch.room.RoomParticipant;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ChatService {
    public static final int MAX_MESSAGE_LENGTH = 1000;
    private static final int MAX_HISTORY_PER_ROOM = 100;

    private final Map<String, ArrayDeque<ChatMessage>> historyByRoom = new ConcurrentHashMap<>();

    public ChatMessage createMessage(Room room, String senderId, String senderName, String rawText) {
        String text = normalizeText(rawText);
        if (text == null) {
            return null;
        }

        ChatMessage message = new ChatMessage(
                UUID.randomUUID().toString(),
                room.getId(),
                senderId,
                senderName,
                ChatMessageType.USER,
                text,
                System.currentTimeMillis()
        );

        append(message);
        return message;
    }

    public ChatMessage createPresenceMessage(
            Room room,
            RoomParticipant participant,
            ChatMessageType type
    ) {
        if (type != ChatMessageType.SYSTEM_JOIN && type != ChatMessageType.SYSTEM_LEAVE) {
            throw new IllegalArgumentException("Presence messages must be JOIN or LEAVE");
        }

        String action = type == ChatMessageType.SYSTEM_JOIN ? "joined" : "left";
        ChatMessage message = new ChatMessage(
                UUID.randomUUID().toString(),
                room.getId(),
                participant.clientId(),
                participant.nameTag(),
                type,
                participant.nameTag() + " " + action + " the room",
                System.currentTimeMillis()
        );

        append(message);
        return message;
    }

    private void append(ChatMessage message) {
        ArrayDeque<ChatMessage> history = historyByRoom.computeIfAbsent(
                message.roomId(),
                ignored -> new ArrayDeque<>()
        );
        synchronized (history) {
            history.addLast(message);
            while (history.size() > MAX_HISTORY_PER_ROOM) {
                history.removeFirst();
            }
        }
    }

    public List<ChatMessage> history(String roomId) {
        ArrayDeque<ChatMessage> history = historyByRoom.get(roomId);
        if (history == null) {
            return List.of();
        }

        synchronized (history) {
            return new ArrayList<>(history);
        }
    }

    private String normalizeText(String rawText) {
        if (rawText == null) {
            return null;
        }

        String text = rawText.trim();
        if (text.isEmpty() || text.length() > MAX_MESSAGE_LENGTH) {
            return null;
        }

        return text;
    }
}
