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
            backend.createContext("/spacex/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String id = path.endsWith("/latest") ? "62dd70d5202306255024d139" : path.substring(path.lastIndexOf('/') + 1);
                byte[] body = ("{\"id\":\"" + id + "\",\"name\":\"archived sample\"}").getBytes(StandardCharsets.UTF_8);
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
        properties.add("demo.spacex-base-url", () -> "http://127.0.0.1:" + backend.getAddress().getPort() + "/spacex");
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
        HttpResponse<String> launch = send("/spacex/launches", token);
        assertEquals(200, launch.statusCode());
        assertEquals("62dd70d5202306255024d139", json.readTree(launch.body()).get("id").asText());
        for (String id : List.of("618fad7e563d69573ed8caa9", "614251b711a64135defb3654", "5ea6ed30080df4000697c916")) {
            HttpResponse<String> ship = send("/spacex/ship/" + id, token);
            assertEquals(200, ship.statusCode());
            assertEquals(id, json.readTree(ship.body()).get("id").asText());
        }
        assertNotNull(json.readTree(send("/spacex/ship", token).body()).get("ship_id"));
    }
}
