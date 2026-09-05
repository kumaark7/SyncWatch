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
        if (AuthService.ROLE_USER.equals(role)
                && attributes.get(AuthService.SESSION_USER_ID) instanceof String) {
            return message;
        }
        if (!AuthService.ROLE_GUEST.equals(role)
                || !(attributes.get(AuthService.SESSION_GUEST_ID) instanceof String)
                || !(attributes.get(AuthService.SESSION_GUEST_ROOM) instanceof String roomId)
                || !(attributes.get(AuthService.SESSION_DISPLAY_NAME) instanceof String)
                || !(attributes.get(AuthService.SESSION_CLIENT_ID) instanceof String)
                || !guestDestinationAllowed(command, accessor.getDestination(), roomId)) {
            throw new MessageDeliveryException("Authentication required");
        }

        return message;
    }

    private boolean guestDestinationAllowed(
            StompCommand command,
            String destination,
            String roomId
    ) {
        if (command != StompCommand.SEND && command != StompCommand.SUBSCRIBE) {
            return true;
        }
        if (destination == null) {
            return false;
        }
        if (command == StompCommand.SUBSCRIBE) {
            return destination.equals("/topic/room/" + roomId)
                    || destination.equals("/topic/rooms/" + roomId + "/chat");
        }
        return destination.equals("/app/room/" + roomId + "/control")
                || destination.equals("/app/rooms/" + roomId + "/chat")
                || destination.equals("/app/rooms/" + roomId + "/chat/call-joined")
                || destination.equals("/app/rooms/" + roomId + "/chat/call-left");
    }
}
