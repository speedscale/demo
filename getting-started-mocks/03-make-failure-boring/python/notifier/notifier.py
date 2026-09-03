"""Turns a shipment status into a message worth sending."""

from collections.abc import Callable

from notifier.errors import CarrierUnavailableError

# The retry budget is deliberately a constant. Making it configurable is the
# exercise at the end of the post.
MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 0.1

# Answers "where is this package?" for one tracking number.
ShipmentStatus = Callable[[str], str]

# The second seam. Production waits between retries. A test does not.
Sleep = Callable[[float], None]


class Notifier:
    def __init__(self, get_shipment_status: ShipmentStatus, sleep: Sleep) -> None:
        self._get_shipment_status = get_shipment_status
        self._sleep = sleep

    def notify(self, tracking_number: str) -> str | None:
        """Return the message to send, or None when nothing needs saying."""
        status = self._lookup(tracking_number)
        if status == "delayed":
            return f"Package {tracking_number} is delayed"
        # Any other answer, including one we have never heard of, means there is
        # nothing to tell the customer. It must not crash the run.
        return None

    def _lookup(self, tracking_number: str) -> str:
        """Ask the carrier, retrying a failure until the budget runs out."""
        last_failure: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return self._get_shipment_status(tracking_number)
            except (CarrierUnavailableError, TimeoutError, OSError) as failure:
                last_failure = failure
                if attempt < MAX_ATTEMPTS:
                    self._sleep(BACKOFF_SECONDS)
        raise last_failure
