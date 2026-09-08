"""The real carrier client, pointed at a test-controlled server by wire tests."""

import json
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from notifier.errors import CarrierUnavailableError

TIMEOUT_SECONDS = 2


class CarrierClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    def lookup(self, tracking_number: str) -> str:
        request = Request(
            f"{self._base_url}/shipments/{quote(tracking_number, safe='')}",
            headers={"X-API-Key": self._api_key, "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                shipment = json.load(response)
        except HTTPError as failure:
            raise CarrierUnavailableError(f"carrier returned {failure.code}") from failure
        return shipment["status"]


def http_shipment_status(base_url: str, api_key: str = ""):
    """Compatibility helper that exposes the client's lookup seam."""
    return CarrierClient(base_url, api_key).lookup
