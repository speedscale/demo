"""Turns a shipment status into a message worth sending."""

from collections.abc import Callable
from typing import Protocol

from notifier.errors import CarrierUnavailableError

MAX_ATTEMPTS = 3
BASE_BACKOFF_SECONDS = 0.1

ShipmentStatus = Callable[[str], str]
Sleep = Callable[[float], None]
Sender = Callable[[str, str], None]


class Recorder(Protocol):
    def record(self, tracking_number: str, message: str) -> None: ...
    def notified(self, tracking_number: str) -> bool: ...


class Notifier:
    def __init__(
        self,
        get_shipment_status: ShipmentStatus,
        send: Sender,
        recorder: Recorder,
        sleep: Sleep,
    ) -> None:
        self._get_shipment_status = get_shipment_status
        self._send = send
        self._recorder = recorder
        self._sleep = sleep

    def notify(self, tracking_number: str) -> None:
        if self._recorder.notified(tracking_number):
            return
        status = self._lookup(tracking_number)
        if status != "delayed":
            return

        message = f"Package {tracking_number} is delayed"
        self._send(tracking_number, message)
        self._recorder.record(tracking_number, message)

    def _lookup(self, tracking_number: str) -> str:
        last_failure: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return self._get_shipment_status(tracking_number)
            except (CarrierUnavailableError, TimeoutError, OSError) as failure:
                last_failure = failure
                if attempt < MAX_ATTEMPTS:
                    self._sleep(BASE_BACKOFF_SECONDS * 2 ** (attempt - 1))
        assert last_failure is not None
        raise last_failure
