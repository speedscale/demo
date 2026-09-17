"""The production get_shipment_status: it asks the carrier's HTTP API.

Nothing in this post's tests runs it; that is deliberate and the post says why.
"""

import json
from urllib.error import HTTPError
from urllib.request import urlopen

from notifier.errors import CarrierUnavailableError
from notifier.notifier import ShipmentStatus

TIMEOUT_SECONDS = 2


def http_shipment_status(base_url: str) -> ShipmentStatus:
    def lookup(tracking_number: str) -> str:
        try:
            with urlopen(
                f"{base_url}/shipments/{tracking_number}", timeout=TIMEOUT_SECONDS
            ) as response:
                shipment = json.load(response)
        except HTTPError as failure:
            raise CarrierUnavailableError(f"carrier returned {failure.code}") from failure
        return shipment["status"]

    return lookup
