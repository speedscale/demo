package speedscale.lib;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Random;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class CncfClient {

    private final String baseURL;
    private final Duration timeout;
    private final HttpClient httpTransport;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final Random r = new Random();

    public CncfClient(
            @Value("${demo.cncf-base-url:https://demo-api.trafficreplay.com}") String baseURL,
            @Value("${demo.cncf-timeout:5s}") Duration timeout) {
        this.baseURL = baseURL.replaceAll("/+$", "");
        this.timeout = timeout;
        this.httpTransport = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public String projects() {
        return fetch("/v1/projects", node -> validList(node, "id"));
    }

    public String project(String id) {
        if (!id.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown project");
        }
        return fetch("/v1/project/" + id,
                node -> node != null && node.isObject() && id.equals(node.path("id").asText()));
    }

    public String categories() {
        return fetch("/v1/categories", node -> validList(node, "name"));
    }

    private static boolean validList(JsonNode body, String field) {
        if (body == null || !body.isArray() || body.isEmpty()) {
            return false;
        }
        for (JsonNode item : body) {
            if (!item.isObject() || !item.path(field).isTextual() || item.path(field).asText().isBlank()) {
                return false;
            }
        }
        return true;
    }

    private String fetch(String path, Predicate<JsonNode> valid) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseURL + path))
                .timeout(timeout).GET().build();
        try {
            HttpResponse<String> response = httpTransport.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Demo data not found");
            }
            if (response.statusCode() != 200) {
                throw new IOException("Demo backend returned " + response.statusCode());
            }
            JsonNode body = objectMapper.readTree(response.body());
            if (!valid.test(body)) {
                throw new IOException("Demo backend returned invalid data");
            }
            return response.body();
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "Demo backend timed out", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Demo backend request interrupted", e);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Demo backend unavailable", e);
        }
    }

    public static String randomProject() {
        String[] projects = new String[] {
                "kubernetes",
                "prometheus",
                "envoy"
        };
        try {
            Thread.sleep(r.nextLong(50));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return projects[r.nextInt(projects.length)];
    }
}
