package speedscale.server;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.text.SimpleDateFormat;
import java.util.Date;

public class Treasury {
    private static final String baseURL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

    private static final HttpClient httpTransport = HttpClient.newHttpClient();
    private static final SimpleDateFormat dateFormat = new SimpleDateFormat("YYYY-MM-dd");

    public static String interestRates(Date d) throws Exception {
        String date = dateFormat.format(d);
        HttpRequest req = HttpRequest.newBuilder(
                URI.create(baseURL + "/v2/accounting/od/avg_interest_rates?filter=record_date:gte:" + date)).GET()
                .build();
        HttpResponse<String> resp = httpTransport.send(req, BodyHandlers.ofString());
        return resp.body();
    }
}