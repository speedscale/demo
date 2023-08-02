package speedscale.server;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.Random;

public class SpaceX {

    private static final String baseURL = "https://api.spacexdata.com";

    private static final HttpClient httpTransport = HttpClient.newHttpClient();
    private static final Random r = new Random();

    public static String launches() throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseURL + "/v5/launches/latest")).GET().build();
        HttpResponse<String> resp = httpTransport.send(req, BodyHandlers.ofString());
        return resp.body();
    }

    public static String ship(String id) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseURL + "/v4/ships/" + id)).GET().build();
        HttpResponse<String> resp = httpTransport.send(req, BodyHandlers.ofString());
        return resp.body();
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
            // ignored
        }
        return ships[r.nextInt(ships.length)];
    }
}
