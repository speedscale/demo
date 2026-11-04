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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class SpaceX {

    private final String baseURL;
    private final Duration timeout;
    private final HttpClient httpTransport;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final Random r = new Random();

    public SpaceX(
            @Value("${demo.spacex-base-url:https://demo-api.trafficreplay.com/spacex}") String baseURL,
            @Value("${demo.spacex-timeout:5s}") Duration timeout) {
        this.baseURL = baseURL.replaceAll("/+$", "");
        this.timeout = timeout;
        this.httpTransport = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public String launches() {
        return fetch("/v5/launches/latest");
    }

    public String ship(String id) {
        if (!id.matches("[0-9a-f]{24}")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown ship");
        }
        return fetch("/v4/ships/" + id);
    }

    private String fetch(String path) {
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
            if (body == null || !body.isObject() || !body.path("id").isTextual()
                    || body.path("id").asText().isBlank()) {
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

    public static String randomShip() {
        String[] ships = new String[] {
                "618fad7e563d69573ed8caa9",
                "614251b711a64135defb3654",
                "5ea6ed30080df4000697c916"
        };
        try {
            Thread.sleep(r.nextLong(50));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return ships[r.nextInt(ships.length)];
    }
}
