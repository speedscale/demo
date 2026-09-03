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

# Delivers one finished message to the customer. It is the third seam, and the
# first one whose whole point is a side effect rather than an answer.
Sender = Callable[[str], None]


class Notifier:
    def __init__(
        self, get_shipment_status: ShipmentStatus, send: Sender, sleep: Sleep
    ) -> None:
        self._get_shipment_status = get_shipment_status
        self._send = send
        self._sleep = sleep

    def notify(self, tracking_number: str) -> None:
        """Tell the customer if there is anything worth telling them.

        It no longer returns the message, so a test cannot check a return value
        any more.
        """
        status = self._lookup(tracking_number)
        if status == "delayed":
            self._send(f"Package {tracking_number} is delayed")
        # Any other answer, including one we have never heard of, means there is
        # nothing to tell the customer. It must not crash the run.

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
