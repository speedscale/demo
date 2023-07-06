package speedscale.server;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;

public class SpaceX {

    private static final String SPACEX_URL = "https://api.spacexdata.com";

    private static final HttpClient HTTP_TRANSPORT = HttpClient.newHttpClient();

    public static String launches() throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(SPACEX_URL + "/v5/launches/latest")).GET().build();
        HttpResponse<String> resp = HTTP_TRANSPORT.send(req, BodyHandlers.ofString());
        return resp.body();
    }

    public static String ship(String id) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(SPACEX_URL + "/v4/ships/" + id)).GET().build();
        HttpResponse<String> resp = HTTP_TRANSPORT.send(req, BodyHandlers.ofString());
        return resp.body();
    }
}
