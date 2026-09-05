package xyz.projectdarkhope.syncwatch.config;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.Message;
import org.springframework.messaging.SubscribableChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WebSocketConfigTest {
    @Test
    void connectAcknowledgmentContainsNegotiatedHeartbeatValues() {
        ExecutorSubscribableChannel inbound = new ExecutorSubscribableChannel();
        ExecutorSubscribableChannel outbound = new ExecutorSubscribableChannel();
        List<Message<?>> replies = new ArrayList<>();
        outbound.subscribe(replies::add);
        TestMessageBrokerRegistry registry = new TestMessageBrokerRegistry(inbound, outbound);
        new WebSocketConfig(null).configureMessageBroker(registry);
        SimpleBrokerMessageHandler broker = registry.simpleBroker(inbound);
        ThreadPoolTaskScheduler scheduler = (ThreadPoolTaskScheduler) broker.getTaskScheduler();
        scheduler.initialize();
        try {
            broker.start();
            SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.CONNECT);
            headers.setSessionId("test-connection");
            headers.setHeader(SimpMessageHeaderAccessor.HEART_BEAT_HEADER, new long[] {10_000, 10_000});
            broker.handleMessage(MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders()));

            assertThat(replies).hasSize(1);
            assertThat(SimpMessageHeaderAccessor.getMessageType(replies.getFirst().getHeaders()))
                    .isEqualTo(SimpMessageType.CONNECT_ACK);
            assertThat((long[]) replies.getFirst().getHeaders()
                    .get(SimpMessageHeaderAccessor.HEART_BEAT_HEADER))
                    .containsExactly(10_000, 10_000);
        } finally {
            broker.stop();
            scheduler.shutdown();
        }
    }

    @Test
    void simpleBrokerAdvertisesBidirectionalHeartbeats() {
        ExecutorSubscribableChannel inbound = new ExecutorSubscribableChannel();
        ExecutorSubscribableChannel outbound = new ExecutorSubscribableChannel();
        TestMessageBrokerRegistry registry = new TestMessageBrokerRegistry(inbound, outbound);
        WebSocketConfig config = new WebSocketConfig(null);

        config.configureMessageBroker(registry);
        SimpleBrokerMessageHandler simpleBroker = registry.simpleBroker(inbound);

        assertThat(simpleBroker.getHeartbeatValue()).containsExactly(10_000, 10_000);
        assertThat(simpleBroker.getTaskScheduler()).isNotNull();
    }

    private static final class TestMessageBrokerRegistry extends MessageBrokerRegistry {
        private TestMessageBrokerRegistry(SubscribableChannel inbound, MessageChannel outbound) {
            super(inbound, outbound);
        }

        private SimpleBrokerMessageHandler simpleBroker(SubscribableChannel brokerChannel) {
            return getSimpleBroker(brokerChannel);
        }
    }
}
