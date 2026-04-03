# Python SpaceX Demo

Small Flask service used for Proxymock capture, mock, and replay.

## Setup

```bash
make install
```

## Run

```bash
make local
```

The app listens on `http://localhost:5001`.

## Endpoints

- `GET /healthz`
- `GET /spacex/launches`

## Proxymock

Record a real SpaceX request flow:

```bash
make capture
```

Run against recorded traffic:

```bash
make mock
```

Replay the same flow against the local app:

```bash
make replay
```

## Test

```bash
make test
```

Or use `test.http` for a REST client.
