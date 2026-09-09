package xyz.projectdarkhope.syncwatch.auth;

import jakarta.servlet.http.HttpSession;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.time.Duration;
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {
    private static final Pattern SEND = Pattern.compile(
            "/app/(?:room/[A-Z0-9]{6}/control|rooms/[A-Z0-9]{6}/chat(?:/call-(?:joined|left))?)");
    private static final Pattern SUBSCRIBE = Pattern.compile(
            "/topic/(?:room/[A-Z0-9]{6}|rooms/[A-Z0-9]{6}/chat)");
    private final RequestRateLimiter limiter;
    private final Map<String, Map<String, Object>> sessions = new ConcurrentHashMap<>();

    public WebSocketAuthInterceptor(RequestRateLimiter limiter) { this.limiter = limiter; }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.DISCONNECT) {
            if (accessor.getSessionId() != null) sessions.remove(accessor.getSessionId());
            return message;
        }
        if (command != null && !Set.of(StompCommand.CONNECT, StompCommand.STOMP,
                StompCommand.SEND, StompCommand.SUBSCRIBE, StompCommand.UNSUBSCRIBE).contains(command)) {
            throw new MessageDeliveryException("Command not allowed");
        }

        Map<String, Object> attributes = accessor.getSessionAttributes();
        if (attributes == null
                || !Boolean.TRUE.equals(attributes.get(AuthService.SESSION_AUTHENTICATED))
                || !sessionStillValid(attributes)) {
            throw new MessageDeliveryException("Authentication required");
        }

        Object role = attributes.get(AuthService.SESSION_ROLE);
        if (AuthService.ROLE_USER.equals(role)
                && attributes.get(AuthService.SESSION_USER_ID) instanceof String) {
            return authorizeDestination(message, accessor,
                    "user:" + attributes.get(AuthService.SESSION_USER_ID));
        }
        if (!AuthService.ROLE_GUEST.equals(role)
                || !(attributes.get(AuthService.SESSION_GUEST_ID) instanceof String)
                || !(attributes.get(AuthService.SESSION_GUEST_ROOM) instanceof String roomId)
                || !(attributes.get(AuthService.SESSION_DISPLAY_NAME) instanceof String)
                || !(attributes.get(AuthService.SESSION_CLIENT_ID) instanceof String)
                || !guestDestinationAllowed(command, accessor.getDestination(), roomId)) {
            throw new MessageDeliveryException("Authentication required");
        }

        return authorizeDestination(message, accessor,
                (String) attributes.get(AuthService.SESSION_GUEST_ID));
    }

    private boolean sessionStillValid(Map<String, Object> attributes) {
        if (!(attributes.get(AuthenticatedHandshakeInterceptor.LIVE_SESSION) instanceof HttpSession session)) {
            return false;
        }
        try {
            return Boolean.TRUE.equals(session.getAttribute(AuthService.SESSION_AUTHENTICATED))
                    && java.util.Objects.equals(session.getAttribute(AuthService.SESSION_ROLE),
                            attributes.get(AuthService.SESSION_ROLE))
                    && java.util.Objects.equals(session.getAttribute(AuthService.SESSION_USER_ID),
                            attributes.get(AuthService.SESSION_USER_ID))
                    && java.util.Objects.equals(session.getAttribute(AuthService.SESSION_GUEST_ID),
                            attributes.get(AuthService.SESSION_GUEST_ID));
        } catch (IllegalStateException expired) {
            return false;
        }
    }

    private Message<?> authorizeDestination(Message<?> message, StompHeaderAccessor accessor, String owner) {
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT || command == StompCommand.STOMP) {
            if (accessor.getSessionId() == null) throw new MessageDeliveryException("Session required");
            sessions.put(accessor.getSessionId(), accessor.getSessionAttributes());
        }
        String destination = accessor.getDestination();
        if (command == StompCommand.SEND || command == StompCommand.SUBSCRIBE) {
            Pattern allowed = command == StompCommand.SEND ? SEND : SUBSCRIBE;
            if (destination == null || !allowed.matcher(destination).matches()) {
                throw new MessageDeliveryException("Destination not allowed");
            }
            // Room codes are invite capabilities; never allow broker wildcards or raw topic publication.
            if (command == StompCommand.SEND) {
                boolean chat = destination.contains("/chat");
                if (!limiter.allow((chat ? "chat:" : "control:") + owner,
                        chat ? 30 : 600, Duration.ofMinutes(1))) {
                    return null;
                }
            } else if (!limiter.allow("subscribe:" + owner, 120, Duration.ofMinutes(1))) {
                throw new MessageDeliveryException("Subscription limit exceeded");
            }
        }
        return message;
    }

    public ChannelInterceptor outboundGuard() {
        return new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                String sessionId = org.springframework.messaging.simp.SimpMessageHeaderAccessor
                        .getSessionId(message.getHeaders());
                Map<String, Object> attributes = sessionId == null ? null : sessions.get(sessionId);
                // A passive socket must not keep reading room traffic after logout, even with no heartbeats.
                if (attributes != null) return sessionStillValid(attributes) ? message : null;
                return org.springframework.messaging.simp.SimpMessageHeaderAccessor.getMessageType(message.getHeaders())
                        == org.springframework.messaging.simp.SimpMessageType.MESSAGE ? null : message;
            }
        };
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
