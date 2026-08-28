package xyz.projectdarkhope.syncwatch.auth;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        if (command == null || command == StompCommand.DISCONNECT) {
            return message;
        }

        Map<String, Object> attributes = accessor.getSessionAttributes();
        if (attributes == null
                || !Boolean.TRUE.equals(attributes.get(AuthService.SESSION_AUTHENTICATED))) {
            throw new MessageDeliveryException("Authentication required");
        }

        Object role = attributes.get(AuthService.SESSION_ROLE);
        if (role == null
                || AuthService.ROLE_ADMIN.equals(role)
                || command == StompCommand.CONNECT) {
            return message;
        }

        if (!AuthService.ROLE_GUEST.equals(role)) {
            throw new MessageDeliveryException("Unsupported session role");
        }

        Object roomValue = attributes.get(AuthService.SESSION_GUEST_ROOM);
        String roomId = roomValue instanceof String ? (String) roomValue : null;
        if (command != StompCommand.SEND && command != StompCommand.SUBSCRIBE) {
            return message;
        }

        String destination = accessor.getDestination();
        if (roomId == null || destination == null || !isAllowedGuestDestination(destination, roomId, command)) {
            throw new MessageDeliveryException("Guest WebSocket access is limited to the invited room");
        }

        return message;
    }

    private boolean isAllowedGuestDestination(String destination, String roomId, StompCommand command) {
        if (command == StompCommand.SEND) {
            return destination.equals("/app/room/" + roomId + "/control")
                    || destination.equals("/app/rooms/" + roomId + "/chat");
        }

        if (command == StompCommand.SUBSCRIBE) {
            return destination.equals("/topic/room/" + roomId)
                    || destination.equals("/topic/rooms/" + roomId + "/chat");
        }

        return true;
    }
}
