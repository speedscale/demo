"""Deterministic HTTP fixture, not an inference model or a capacity benchmark."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import time

TRIAGE = {"severity": "high", "category": "technical", "urgency_score": 8,
          "escalation_required": True, "affected_component": "checkout", "customer_sentiment": "frustrated"}
ANALYSIS = {"root_cause": "A fixture checkout validation error.", "customer_impact": "Checkout is blocked.",
            "affected_systems": ["order-service"], "estimated_resolution_time": "Under investigation",
            "investigation_steps": ["Inspect checkout validation"], "summary": "Checkout validation blocks the order."}
RESPONSE = {"subject_line": "Checkout investigation", "response_body": "We are investigating your checkout issue.",
            "recommended_action": "Inspect checkout validation.", "follow_up_required": True, "internal_notes": "Demo fixture."}

class FixtureProvider:
    def __init__(self, port=0):
        self.requests = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.respond({"data": [{"id": "test-model", "object": "model"}]})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                owner.requests.append(body)
                system = body["messages"][0]["content"]
                if "classifier" in system:
                    content = TRIAGE
                elif "support analyst" in system:
                    content = ANALYSIS
                else:
                    content = RESPONSE
                time.sleep(0.04)
                self.respond({"id": "fixture-completion", "object": "chat.completion", "created": 1,
                              "model": body["model"], "choices": [{"index": 0, "message": {
                                  "role": "assistant", "content": json.dumps(content)}, "finish_reason": "stop"}]})

            def respond(self, payload):
                encoded = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def origin(self):
        return f"http://127.0.0.1:{self.server.server_port}"

    def start(self):
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
