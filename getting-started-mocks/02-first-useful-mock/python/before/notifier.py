"""The package notifier before it had a seam.

It talks to the carrier directly, which is exactly why it cannot be tested:
nothing in a test can make the carrier say a package is delayed.
"""

import json
from urllib.request import urlopen

CARRIER_URL = "https://api.example-carrier.test"


def notify(tracking_number: str) -> str | None:
    """Return the message to send to the customer, or None when there is nothing to say."""
    with urlopen(f"{CARRIER_URL}/shipments/{tracking_number}") as response:
        shipment = json.load(response)

    if shipment["status"] == "delayed":
        return f"Package {tracking_number} is delayed"
    return None
