# Tutorial orders service (Java)

The Java port of the proxymock getting-started shop: Spring Boot, JDBC and the JDK HTTP client.

Prerequisites: JDK 21+ and Docker. Run every command below from `tutorial/java`.

```sh
# Start Postgres (from tutorial/)
(cd .. && docker compose up -d)

# Build (writes target/tutorial-orders.jar)
./mvnw -q package

# Run on http://localhost:8080
java -jar target/tutorial-orders.jar

# Unit tests (no Postgres or network needed)
./mvnw -q test

# Drive traffic at a running service (135 requests)
./mvnw -q compile exec:java -Dexec.args="http://localhost:8080"
```

Record it with proxymock, then drive traffic at proxymock's inbound port:

```sh
DATABASE_URL=postgres://tutorial:tutorial@localhost:15432/tutorial?sslmode=disable proxymock record --map 15432=postgres://localhost:5432 -- java -jar target/tutorial-orders.jar
./mvnw -q compile exec:java -Dexec.args="http://localhost:4143"
```

The driver reads `../contract/traffic.json`; set `TRAFFIC_FILE` to use another file.
Environment variables, endpoints and behavior are defined in [`../contract/SPEC.md`](../contract/SPEC.md).
To build the container instead: `docker build -t tutorial-orders-java .`

If every catalog call returns `502 catalog unavailable` while recording and the app log shows `PKIX path validation failed`, the Java truststore proxymock injects is older than its certificate. Rebuild it with `proxymock admin certs --jks`.
