class MemoryRecorder:
    """A fake: a working, stateful implementation of the recorder seam."""

    def __init__(self) -> None:
        self._messages: dict[str, str] = {}

    def record(self, tracking_number: str, message: str) -> None:
        self._messages.setdefault(tracking_number, message)

    def notified(self, tracking_number: str) -> bool:
        return tracking_number in self._messages

    def message(self, tracking_number: str) -> str | None:
        return self._messages.get(tracking_number)

    @property
    def count(self) -> int:
        return len(self._messages)
