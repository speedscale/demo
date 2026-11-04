package speedscale.lib;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class CncfClientTest {
    private HttpServer server;
    private final List<String> paths = new ArrayList<>();
    private String body = "[{\"id\":\"kubernetes\",\"name\":\"Kubernetes\"}]";
    private int status = 200;
    private long delayMillis;
    private CncfClient client;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/", exchange -> {
            paths.add(exchange.getRequestURI().getPath());
            try {
                Thread.sleep(delayMillis);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        client = new CncfClient(baseURL(), Duration.ofSeconds(2));
    }

    private String baseURL() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/";
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void preservesProjectsResponseAndOutboundPath() {
        assertEquals(body, client.projects());
        assertEquals(List.of("/v1/projects"), paths);
    }

    @Test
    void fetchesEachProjectBySlug() {
        for (String id : List.of("kubernetes", "prometheus", "envoy")) {
            body = "{\"id\":\"" + id + "\",\"name\":\"ship\"}";
            assertEquals(body, client.project(id));
        }
        assertEquals(3, paths.size());
        assertEquals("/v1/project/envoy", paths.get(2));
    }

    @Test
    void fetchesCategories() {
        body = "[{\"name\":\"Observability\",\"count\":8}]";
        assertEquals(body, client.categories());
        assertEquals(List.of("/v1/categories"), paths);
    }

    @Test
    void rejectsMismatchedProject() {
        body = "{\"id\":\"envoy\",\"name\":\"Envoy\"}";
        assertEquals(502, assertThrows(ResponseStatusException.class, () -> client.project("kubernetes")).getStatusCode().value());
    }

    @Test
    void reportsBackendFailure() {
        status = 503;
        assertEquals(502, assertThrows(ResponseStatusException.class, client::projects).getStatusCode().value());
    }

    @Test
    void preservesNotFound() {
        status = 404;
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> client.project("unknown-project")).getStatusCode().value());
    }

    @Test
    void rejectsMalformedOrEmptyData() {
        for (String invalid : List.of("<html>down</html>", "{}", "null", "[]", "[{}]")) {
            body = invalid;
            assertEquals(502, assertThrows(ResponseStatusException.class, client::projects).getStatusCode().value());
        }
    }

    @Test
    void boundsSlowBackendRequests() {
        delayMillis = 1000;
        client = new CncfClient(baseURL(), Duration.ofMillis(150));
        assertEquals(504, assertThrows(ResponseStatusException.class, client::projects).getStatusCode().value());
    }

    @Test
    void rejectsInvalidProjectPathsWithoutCallingBackend() {
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> client.project("../launches/latest")).getStatusCode().value());
        assertTrue(paths.isEmpty());
    }
}
