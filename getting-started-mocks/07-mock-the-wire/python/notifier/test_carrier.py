import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from notifier.carrier import CarrierClient
from notifier.errors import CarrierUnavailableError


class FakeCarrier:
    def __init__(self, status_code: int = 200, body: str = '{"status":"delayed"}') -> None:
        self.status_code = status_code
        self.body = body
        self.requests: list[tuple[str, dict[str, str]]] = []

    def __enter__(self):
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                fake.requests.append((self.path, dict(self.headers.items())))
                self.send_response(fake.status_code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(fake.body.encode())

            def log_message(self, _format: str, *_args) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}"
        return self

    def __exit__(self, *_args) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


class CarrierClientTest(unittest.TestCase):
    def test_sends_tracking_number_and_api_key(self) -> None:
        with FakeCarrier() as carrier:
            CarrierClient(carrier.url, "secret-key").lookup("TRACK-123")

        path, headers = carrier.requests[0]
        lower_headers = {name.lower(): value for name, value in headers.items()}
        self.assertIn("TRACK-123", path)
        self.assertEqual("secret-key", lower_headers["x-api-key"])
        self.assertEqual("application/json", lower_headers["accept"])

    def test_parses_known_shipment_states(self) -> None:
        for status in ("delayed", "delivered", "in_transit", "lost"):
            with self.subTest(status=status), FakeCarrier(body=json.dumps({"status": status})) as carrier:
                self.assertEqual(status, CarrierClient(carrier.url, "secret-key").lookup("TRACK-123"))

    def test_treats_non_200_as_carrier_unavailable(self) -> None:
        with FakeCarrier(status_code=503, body='{"error":"upstream is down"}') as carrier:
            with self.assertRaises(CarrierUnavailableError):
                CarrierClient(carrier.url, "secret-key").lookup("TRACK-123")

    def test_fails_cleanly_on_malformed_json(self) -> None:
        with FakeCarrier(body='{"status": ') as carrier:
            with self.assertRaises(json.JSONDecodeError):
                CarrierClient(carrier.url, "secret-key").lookup("TRACK-123")
