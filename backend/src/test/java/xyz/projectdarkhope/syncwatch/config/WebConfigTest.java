package xyz.projectdarkhope.syncwatch.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WebConfigTest {
    @Test
    void productionOriginAllowsGoogleConnectionDelete() {
        WebConfig config = new WebConfig();
        ReflectionTestUtils.setField(
                config,
                "frontendOrigin",
                "https://play.projectdarkhope.xyz"
        );
        TestCorsRegistry registry = new TestCorsRegistry();

        config.addCorsMappings(registry);

        CorsConfiguration apiCors = registry.configurations().get("/api/**");
        assertThat(apiCors).isNotNull();
        assertThat(apiCors.getAllowedOrigins())
                .containsExactly("https://play.projectdarkhope.xyz");
        assertThat(apiCors.getAllowedMethods())
                .contains("GET", "POST", "PUT", "DELETE", "OPTIONS");
        assertThat(apiCors.getAllowCredentials()).isTrue();
    }

    private static final class TestCorsRegistry extends CorsRegistry {
        private Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }
}
