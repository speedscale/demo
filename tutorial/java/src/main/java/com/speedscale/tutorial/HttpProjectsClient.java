package com.speedscale.tutorial;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
public class HttpProjectsClient implements ProjectsClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final String baseUrl;
    private final ObjectMapper mapper;
    private final HttpClient client;

    public HttpProjectsClient(@Value("${DEMO_API_URL:https://demo-api.trafficreplay.com}") String baseUrl,
                              ObjectMapper mapper) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.mapper = mapper;
        this.client = HttpClient.newBuilder()
                // Honors the JVM proxy properties (https.proxyHost etc.) that proxymock injects.
                .proxy(ProxySelector.getDefault())
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(TIMEOUT)
                .build();
    }

    @Override
    public List<Project> listProjects() {
        HttpResponse<byte[]> response = get("/v1/projects");
        if (response.statusCode() != 200) {
            throw unavailable();
        }
        try {
            return mapper.readValue(response.body(), new TypeReference<List<Project>>() {
            });
        } catch (IOException e) {
            throw unavailable();
        }
    }

    @Override
    public Optional<Project> getProject(String id) {
        HttpResponse<byte[]> response = get("/v1/project/" + UriUtils.encodePathSegment(id, StandardCharsets.UTF_8));
        if (response.statusCode() == 404) {
            return Optional.empty();
        }
        if (response.statusCode() != 200) {
            throw unavailable();
        }
        try {
            return Optional.of(mapper.readValue(response.body(), Project.class));
        } catch (IOException e) {
            throw unavailable();
        }
    }

    private HttpResponse<byte[]> get(String path) {
        URI uri = URI.create(baseUrl + path + "?ts=" + System.currentTimeMillis());
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .header("Accept", "application/json")
                .header("User-Agent", "tutorial-orders/1")
                .header("X-Request-Id", UUID.randomUUID().toString())
                .GET()
                .build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            throw unavailable();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        }
    }

    private static ApiException unavailable() {
        return new ApiException(502, "catalog unavailable");
    }
}
