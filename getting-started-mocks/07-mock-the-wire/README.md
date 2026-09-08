# 07: Mock the Wire

The earlier tests replaced the entire carrier lookup. This stage keeps the real
HTTP client and replaces only the carrier with a controlled local server.

The wire tests prove that the client:

- puts the tracking number in the request path;
- sends `X-API-Key` and `Accept: application/json` headers;
- parses all known shipment states;
- translates non-200 responses into `CarrierUnavailable`; and
- fails cleanly when the response is malformed JSON.

Go uses `httptest`, Java uses OkHttp `MockWebServer`, Node.js uses MSW, and
Python uses `ThreadingHTTPServer`.

## Run it

```bash
cd java && mvn test
cd node && npm install && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

Keep the faster function-level tests as well. They test the notifier's choices;
these tests cover the protocol between the seam and the socket.
