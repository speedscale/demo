"""Turns a shipment status into a message worth sending."""

from collections.abc import Callable

# Answers "where is this package?" for one tracking number.
#
# This is the seam. Production wires it to the carrier's HTTP API (see
# carrier.py). A test hands in whatever answer it needs.
ShipmentStatus = Callable[[str], str]


class Notifier:
    def __init__(self, get_shipment_status: ShipmentStatus) -> None:
        self._get_shipment_status = get_shipment_status

    def notify(self, tracking_number: str) -> str | None:
        """Return the message to send, or None when nothing needs saying."""
        if self._get_shipment_status(tracking_number) == "delayed":
            return f"Package {tracking_number} is delayed"
        return None
