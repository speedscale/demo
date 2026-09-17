import json
import os
import unittest
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from notifier.carrier import CarrierClient


@unittest.skipUnless(
    os.environ.get("CARRIER_CONTRACT_TEST") == "1",
    "set CARRIER_CONTRACT_TEST=1 to call the real carrier",
)
class LiveCarrierContractTest(unittest.TestCase):
    def test_live_response_still_matches_the_captured_shape(self) -> None:
        base_url = required("CARRIER_URL").rstrip("/")
        api_key = required("CARRIER_API_KEY")
        tracking_number = required("CARRIER_TRACKING_NUMBER")

        CarrierClient(base_url, api_key).lookup(tracking_number)
        request = Request(
            f"{base_url}/shipments/{quote(tracking_number, safe='')}",
            headers={"X-API-Key": api_key, "Accept": "application/json"},
        )
        with urlopen(request, timeout=5) as response:
            live = json.load(response)
        captured = json.loads(
            (Path(__file__).parents[2] / "fixtures" / "carrier-shipment-delayed.json").read_text()
        )
        for field in captured:
            self.assertIn(field, live, f"live response is missing captured field {field}")


def required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value
