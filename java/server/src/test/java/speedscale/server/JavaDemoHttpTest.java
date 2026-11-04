package speedscale.server;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class JavaDemoHttpTest {
    private static final HttpServer backend;
    private static final ObjectMapper json = new ObjectMapper();
    static {
        try {
            backend = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            backend.createContext("/v1/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String id = path.substring(path.lastIndexOf('/') + 1);
                String response = "{\"id\":\"" + id + "\",\"name\":\"project\"}";
                if (path.equals("/v1/projects")) {
                    response = "[{\"id\":\"kubernetes\",\"name\":\"Kubernetes\"}]";
                } else if (path.equals("/v1/categories")) {
                    response = "[{\"name\":\"Observability\",\"count\":8}]";
                }
                byte[] body = response.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            backend.start();
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }

    @DynamicPropertySource
    static void downstream(DynamicPropertyRegistry properties) {
        properties.add("demo.cncf-base-url", () -> "http://127.0.0.1:" + backend.getAddress().getPort());
    }

    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> send(String path, String token) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    @AfterAll static void stopBackend() { backend.stop(0); }

    @Test
    void preservesAuthenticatedHttpContract() throws Exception {
        assertEquals(200, send("/healthz", null).statusCode());
        assertEquals(403, send("/spacex/launches", null).statusCode());
        HttpRequest login = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"admin\",\"password\":\"pass\"}")).build();
        HttpResponse<String> loggedIn = client.send(login, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, loggedIn.statusCode());
        String token = json.readTree(loggedIn.body()).get("access_token").asText();
        HttpResponse<String> projects = send("/api/projects", token);
        assertEquals(200, projects.statusCode());
        assertEquals("kubernetes", json.readTree(projects.body()).get(0).get("id").asText());
        assertEquals(projects.body(), send("/spacex/launches", token).body());
        for (String id : List.of("kubernetes", "prometheus", "envoy")) {
            HttpResponse<String> project = send("/api/projects/" + id, token);
            assertEquals(200, project.statusCode());
            assertEquals(id, json.readTree(project.body()).get("id").asText());
            assertEquals(project.body(), send("/spacex/ship/" + id, token).body());
        }
        assertNotNull(json.readTree(send("/api/project", token).body()).get("project_id"));
        assertNotNull(json.readTree(send("/spacex/ship", token).body()).get("ship_id"));
        HttpResponse<String> categories = send("/api/categories", token);
        assertEquals(200, categories.statusCode());
        assertEquals("Observability", json.readTree(categories.body()).get(0).get("name").asText());
    }
}
