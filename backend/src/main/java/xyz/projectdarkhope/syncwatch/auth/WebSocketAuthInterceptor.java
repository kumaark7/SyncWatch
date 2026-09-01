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
                || !Boolean.TRUE.equals(attributes.get(AuthService.SESSION_AUTHENTICATED))
                || !AuthService.ROLE_USER.equals(attributes.get(AuthService.SESSION_ROLE))
                || !(attributes.get(AuthService.SESSION_USER_ID) instanceof String)) {
            throw new MessageDeliveryException("Authentication required");
        }

        return message;
    }
}
