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

class SpaceXTest {
    private HttpServer server;
    private final List<String> paths = new ArrayList<>();
    private String body = "{\"id\":\"62dd70d5202306255024d139\",\"name\":\"Crew-5\"}";
    private int status = 200;
    private long delayMillis;
    private SpaceX client;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/spacex/", exchange -> {
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
        client = new SpaceX(baseURL(), Duration.ofSeconds(2));
    }

    private String baseURL() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/spacex/";
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void preservesLaunchResponseAndOutboundPath() {
        assertEquals(body, client.launches());
        assertEquals(List.of("/spacex/v5/launches/latest"), paths);
    }

    @Test
    void preservesEveryShipID() {
        for (String id : List.of("618fad7e563d69573ed8caa9", "614251b711a64135defb3654", "5ea6ed30080df4000697c916")) {
            body = "{\"id\":\"" + id + "\",\"name\":\"ship\"}";
            assertEquals(body, client.ship(id));
        }
        assertEquals(3, paths.size());
        assertEquals("/spacex/v4/ships/5ea6ed30080df4000697c916", paths.get(2));
    }

    @Test
    void reportsBackendFailure() {
        status = 503;
        assertEquals(502, assertThrows(ResponseStatusException.class, client::launches).getStatusCode().value());
    }

    @Test
    void preservesNotFound() {
        status = 404;
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> client.ship("000000000000000000000000")).getStatusCode().value());
    }

    @Test
    void rejectsMalformedOrEmptyData() {
        for (String invalid : List.of("<html>down</html>", "{}", "null", "[]")) {
            body = invalid;
            assertEquals(502, assertThrows(ResponseStatusException.class, client::launches).getStatusCode().value());
        }
    }

    @Test
    void boundsSlowBackendRequests() {
        delayMillis = 1000;
        client = new SpaceX(baseURL(), Duration.ofMillis(150));
        assertEquals(504, assertThrows(ResponseStatusException.class, client::launches).getStatusCode().value());
    }

    @Test
    void rejectsInvalidShipPathsWithoutCallingBackend() {
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> client.ship("../launches/latest")).getStatusCode().value());
        assertTrue(paths.isEmpty());
    }
}
