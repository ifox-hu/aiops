package org.example.config;

import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Supplies an empty remote tool list when MCP is explicitly disabled. */
@Configuration
@ConditionalOnProperty(name = "spring.ai.mcp.client.enabled", havingValue = "false")
public class LocalToolConfig {
    @Bean
    public ToolCallbackProvider localToolCallbackProvider() {
        return () -> new ToolCallback[0];
    }
}
