"""The production ShipmentStatus: it asks the carrier's HTTP API.

This is the same code that used to live inside notify(), moved behind the
seam. Nothing in this post's tests runs it; that is deliberate and the post
says why.
"""

import json
from urllib.request import urlopen

from notifier.notifier import ShipmentStatus


def http_shipment_status(base_url: str) -> ShipmentStatus:
    def lookup(tracking_number: str) -> str:
        with urlopen(f"{base_url}/shipments/{tracking_number}") as response:
            if response.status != 200:
                raise RuntimeError(f"carrier returned {response.status}")
            shipment = json.load(response)
        return shipment["status"]

    return lookup
