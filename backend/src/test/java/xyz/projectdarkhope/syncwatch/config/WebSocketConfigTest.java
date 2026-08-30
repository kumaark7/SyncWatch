package xyz.projectdarkhope.syncwatch.config;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.SubscribableChannel;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.support.ExecutorSubscribableChannel;

import static org.assertj.core.api.Assertions.assertThat;

class WebSocketConfigTest {
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
