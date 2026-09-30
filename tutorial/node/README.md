# Tutorial orders service (Node.js)

The Node.js port of the proxymock getting-started service: Express, `pg` and `undici`.

Prerequisites: Node 22.21+, Docker (for Postgres), and proxymock for the recording step.

```sh
npm ci
(cd .. && docker compose up -d)          # Postgres, from tutorial/
node server.js
npm test
node traffic.mjs                          # drives a running service, default http://localhost:8080
```

Record it with proxymock:

```sh
DATABASE_URL=postgres://tutorial:tutorial@localhost:15432/tutorial?sslmode=disable proxymock record --map 15432=postgres://localhost:5432 -- node server.js
node traffic.mjs http://localhost:4143
```

Environment variables (`PORT`, `DATABASE_URL`, `DEMO_API_URL`, `APP_VERSION`, `APP_SLOW`) and the full behavior are in [`../contract/SPEC.md`](../contract/SPEC.md).
