package org.example.config;

import okhttp3.OkHttpClient;
import okhttp3.ConnectionSpec;
import okhttp3.TlsVersion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.OkHttp3ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

/**
 * DashScope API 配置
 * 用于配置超时时间等参数
 */
@Configuration
public class DashScopeConfig {

    @Value("${spring.ai.dashscope.chat.options.timeout:180000}")
    private long timeout;

    @Value("${ai.provider:dashscope}")
    private String provider;

    /**
     * 配置 RestClient.Builder，设置超时时间
     * Spring AI 会自动使用这个 Bean
     */
    @Bean
    public RestClient.Builder restClientBuilder() {
        // 创建自定义的 OkHttpClient，设置超时时间
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
                .connectTimeout(Duration.ofMillis(Math.min(timeout, 20000)))
                .readTimeout(Duration.ofMillis(timeout))
                .writeTimeout(Duration.ofMillis(timeout))
                .callTimeout(Duration.ofMillis(timeout));
        if ("openai".equalsIgnoreCase(provider)) {
            ConnectionSpec relayTls = new ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
                    .tlsVersions(TlsVersion.TLS_1_2)
                    .build();
            builder.connectionSpecs(List.of(relayTls, ConnectionSpec.CLEARTEXT));
        }
        OkHttpClient okHttpClient = builder.build();

        // 创建 RestClient.Builder 并配置 OkHttpClient
        return RestClient.builder()
                .requestFactory(new OkHttp3ClientHttpRequestFactory(okHttpClient));
    }
}
