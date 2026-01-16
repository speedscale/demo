# DLP Demo (Minimal Node Server)

This is a minimal Node/Express server that returns JSON responses containing values that match common DLP patterns (email, SSN, credit card, UUIDs, hashes, JWTs, IPs, URLs, SQL, trace/span IDs).

## Run

```bash
npm install
npm start
```

The server listens on `PORT` (default `3001`).

## Endpoints

- `GET /` - Service status
- `GET /profile` - User profile with email, SSN, phone, JWT, IP, datetime
- `GET /payment` - Payment info with credit card, IP, trace/span IDs
- `GET /audit` - SQL, URIs, hashes, and timestamps
- `GET /ids` - UUID variants
