import unittest
from unittest.mock import Mock, patch

import requests

from app import app


def response(payload):
    result = Mock()
    result.json.return_value = payload
    return result


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    @patch("app.http.get")
    def test_combines_both_backends_and_limits_each_catalog(self, get):
        get.side_effect = [
            response([{"id": f"hf-{i}"} for i in range(7)]),
            response({"data": [{"id": f"or-{i}"} for i in range(8)]}),
        ]

        result = self.client.get("/catalog")

        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.get_json(), {
            "huggingface": [f"hf-{i}" for i in range(5)],
            "openrouter": [f"or-{i}" for i in range(5)],
        })
        self.assertEqual(get.call_count, 2)
        self.assertEqual(get.call_args_list[0].args[0], "https://huggingface.co/api/models")
        self.assertEqual(get.call_args_list[1].args[0], "https://openrouter.ai/api/v1/models")

    @patch("app.http.get")
    def test_reports_huggingface_failure(self, get):
        failed = response([])
        failed.raise_for_status.side_effect = requests.HTTPError("Hugging Face unavailable")
        get.return_value = failed

        result = self.client.get("/catalog")

        self.assertEqual(result.status_code, 500)
        self.assertEqual(result.get_json(), {"error": "Hugging Face unavailable"})
        self.assertEqual(get.call_count, 1)

    @patch("app.http.get")
    def test_reports_openrouter_failure(self, get):
        failed = response({})
        failed.raise_for_status.side_effect = requests.HTTPError("OpenRouter unavailable")
        get.side_effect = [response([{"id": "hf-model"}]), failed]

        result = self.client.get("/catalog")

        self.assertEqual(result.status_code, 500)
        self.assertEqual(result.get_json(), {"error": "OpenRouter unavailable"})
        self.assertEqual(get.call_count, 2)


class TicketTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_routes_named_sender_by_domain(self):
        result = self.client.post("/tickets", json={"from": "Ada Lovelace <Ada@Example.edu>", "subject": "Login"})

        self.assertEqual(result.status_code, 201)
        body = result.get_json()
        self.assertEqual(body["sender"]["email"], "ada@example.edu")
        self.assertEqual(body["queue"], "education")
        self.assertTrue(body["auto_reply"])

    def test_unparseable_sender_needs_review(self):
        result = self.client.post("/tickets", json={"from": "not an address", "subject": "Login"})

        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.get_json()["queue"], "needs-review")

    def test_rejects_missing_sender(self):
        result = self.client.post("/tickets", json={"subject": "Login"})

        self.assertEqual(result.status_code, 400)

if __name__ == "__main__":
    unittest.main()
