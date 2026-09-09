package xyz.projectdarkhope.syncwatch.auth;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.mock.web.MockHttpSession;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class WebSocketAuthInterceptorTest {
    private final WebSocketAuthInterceptor interceptor = new WebSocketAuthInterceptor(new RequestRateLimiter());

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
        MockHttpSession session = new MockHttpSession();
        attributes.forEach(session::setAttribute);
        attributes.put(AuthenticatedHandshakeInterceptor.LIVE_SESSION, session);
        accessor.setSessionAttributes(attributes);
        accessor.setDestination(destination);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    void registeredUsersCannotPublishForgedBrokerEventsOrSubscribeWildcards() {
        for (String destination : new String[]{"/topic/room/ABC123", "/topic/rooms/ABC123/chat", "/app/admin"}) {
            assertThatThrownBy(() -> interceptor.preSend(userMessage(StompCommand.SEND, destination), null))
                    .isInstanceOf(MessageDeliveryException.class);
        }
        assertThatThrownBy(() -> interceptor.preSend(userMessage(StompCommand.SUBSCRIBE, "/topic/**"), null))
                .isInstanceOf(MessageDeliveryException.class);
        assertThatThrownBy(() -> interceptor.preSend(userMessage(StompCommand.MESSAGE, "/topic/room/ABC123"), null))
                .isInstanceOf(MessageDeliveryException.class);
        Message<byte[]> valid = userMessage(StompCommand.SEND, "/app/room/ABC123/control");
        assertThat(interceptor.preSend(valid, null)).isSameAs(valid);
    }

    @Test
    void logoutInvalidatesCopiedWebsocketAuthenticationIncludingHeartbeats() {
        Message<byte[]> message = userMessage(StompCommand.SEND, "/app/room/ABC123/control");
        var attributes = StompHeaderAccessor.wrap(message).getSessionAttributes();
        ((MockHttpSession) attributes.get(AuthenticatedHandshakeInterceptor.LIVE_SESSION)).invalidate();
        assertThatThrownBy(() -> interceptor.preSend(message, null)).isInstanceOf(MessageDeliveryException.class);
    }

    @Test
    void guestSubscriptionsCannotCrossRoomsAndChatIsBounded() {
        assertThatThrownBy(() -> interceptor.preSend(guestMessage(StompCommand.SUBSCRIBE, "/topic/room/OTHER1"), null))
                .isInstanceOf(MessageDeliveryException.class);
        for (int i = 0; i < 30; i++) assertThat(interceptor.preSend(
                guestMessage(StompCommand.SEND, "/app/rooms/ABC123/chat"), null)).isNotNull();
        assertThat(interceptor.preSend(guestMessage(StompCommand.SEND, "/app/rooms/ABC123/chat"), null)).isNull();
        assertThat(interceptor.preSend(guestMessage(StompCommand.SEND, "/app/room/ABC123/control"), null)).isNotNull();
    }

    private Message<byte[]> userMessage(StompCommand command, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(AuthService.SESSION_AUTHENTICATED, true);
        attributes.put(AuthService.SESSION_ROLE, AuthService.ROLE_USER);
        attributes.put(AuthService.SESSION_USER_ID, "user-one");
        MockHttpSession session = new MockHttpSession();
        attributes.forEach(session::setAttribute);
        attributes.put(AuthenticatedHandshakeInterceptor.LIVE_SESSION, session);
        accessor.setSessionAttributes(attributes);
        accessor.setSessionId("test-socket");
        accessor.setDestination(destination);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    void revokedPassiveConnectionCannotReceiveBrokerMessages() {
        var connect = userMessage(StompCommand.CONNECT, null);
        assertThat(interceptor.preSend(connect, null)).isSameAs(connect);
        var outgoing = userMessage(StompCommand.MESSAGE, "/topic/room/ABC123");
        assertThat(interceptor.outboundGuard().preSend(outgoing, null)).isSameAs(outgoing);
        var attributes = StompHeaderAccessor.wrap(connect).getSessionAttributes();
        ((MockHttpSession) attributes.get(AuthenticatedHandshakeInterceptor.LIVE_SESSION)).invalidate();
        assertThat(interceptor.outboundGuard().preSend(outgoing, null)).isNull();
        StompHeaderAccessor heartbeat = StompHeaderAccessor.createForHeartbeat();
        heartbeat.setSessionAttributes(attributes);
        assertThatThrownBy(() -> interceptor.preSend(MessageBuilder.createMessage(new byte[0], heartbeat.getMessageHeaders()), null))
                .isInstanceOf(MessageDeliveryException.class);
    }
}
