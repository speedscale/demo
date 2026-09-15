import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.reply(200, {"status": "ok"})
            return
        if os.environ.get("ROLE") == "dependency":
            self.reply(200, {"sku": "widget", "price": 42})
            return
        if self.path != "/quote?sku=widget":
            self.reply(404, {"error": "unknown route"})
            return
        try:
            with urlopen(os.environ["CATALOG_URL"] + "/price?sku=widget", timeout=5) as response:
                price = json.load(response)
            self.reply(200, {"sku": price["sku"], "total": price["price"]})
        except Exception:
            self.reply(502, {"error": "catalog unavailable"})

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
