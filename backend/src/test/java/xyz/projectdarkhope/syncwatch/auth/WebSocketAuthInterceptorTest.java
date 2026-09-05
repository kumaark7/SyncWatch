package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class WebSocketAuthInterceptorTest {
    private final WebSocketAuthInterceptor interceptor = new WebSocketAuthInterceptor();

    @Test
    void guestCanUseOnlyTheirRoomDestinations() {
        Message<byte[]> ownRoom = guestMessage(
                StompCommand.SEND,
                "/app/room/ABC123/control"
        );
        Message<byte[]> otherRoom = guestMessage(
                StompCommand.SEND,
                "/app/room/OTHER1/control"
        );

        assertThat(interceptor.preSend(ownRoom, mock(org.springframework.messaging.MessageChannel.class)))
                .isSameAs(ownRoom);
        assertThatThrownBy(() -> interceptor.preSend(
                otherRoom,
                mock(org.springframework.messaging.MessageChannel.class)
        )).isInstanceOf(MessageDeliveryException.class);
    }

    private Message<byte[]> guestMessage(StompCommand command, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(AuthService.SESSION_AUTHENTICATED, true);
        attributes.put(AuthService.SESSION_ROLE, AuthService.ROLE_GUEST);
        attributes.put(AuthService.SESSION_GUEST_ID, "guest:owner");
        attributes.put(AuthService.SESSION_GUEST_ROOM, "ABC123");
        attributes.put(AuthService.SESSION_DISPLAY_NAME, "Nova");
        attributes.put(AuthService.SESSION_CLIENT_ID, "guest-client");
        accessor.setSessionAttributes(attributes);
        accessor.setDestination(destination);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
