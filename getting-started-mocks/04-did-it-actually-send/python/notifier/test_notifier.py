import unittest

from notifier.errors import CarrierUnavailableError
from notifier.notifier import MAX_ATTEMPTS, Notifier


def no_sleep(_seconds: float) -> None:
    """Keeps the retry tests instant."""


class SpySender:
    """Remembers every message it was asked to deliver.

    It answers the only question this post cares about: did it actually send?
    """

    def __init__(self) -> None:
        self.sent: list[str] = []

    def __call__(self, message: str) -> None:
        self.sent.append(message)


class PackageNotifierTest(unittest.TestCase):
    def test_sends_one_message_for_a_delayed_package(self) -> None:
        delayed = lambda _: "delayed"
        spy = SpySender()
        notifier = Notifier(delayed, spy, no_sleep)

        notifier.notify("TRACK-123")

        self.assertEqual(["Package TRACK-123 is delayed"], spy.sent)

    def test_sends_nothing_for_a_delivered_package(self) -> None:
        delivered = lambda _: "delivered"
        spy = SpySender()
        notifier = Notifier(delivered, spy, no_sleep)

        notifier.notify("TRACK-123")

        self.assertEqual([], spy.sent)

    def test_sends_nothing_when_the_carrier_is_unavailable(self) -> None:
        def unavailable(_: str) -> str:
            raise CarrierUnavailableError("carrier returned 500")

        spy = SpySender()
        notifier = Notifier(unavailable, spy, no_sleep)

        with self.assertRaises(CarrierUnavailableError):
            notifier.notify("TRACK-123")
        self.assertEqual([], spy.sent)

    def test_sends_nothing_on_timeout(self) -> None:
        def timeout(_: str) -> str:
            raise TimeoutError("carrier did not answer in time")

        spy = SpySender()
        notifier = Notifier(timeout, spy, no_sleep)

        with self.assertRaises(TimeoutError):
            notifier.notify("TRACK-123")
        self.assertEqual([], spy.sent)

    def test_sends_nothing_for_an_unknown_status(self) -> None:
        for status in ("", "in_transit", "held_at_customs"):
            with self.subTest(status=status):
                spy = SpySender()
                notifier = Notifier(lambda _, s=status: s, spy, no_sleep)

                notifier.notify("TRACK-123")

                self.assertEqual([], spy.sent)

    def test_retries_then_sends(self) -> None:
        calls = 0

        def flaky(_: str) -> str:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise CarrierUnavailableError("carrier returned 500")
            return "delayed"

        spy = SpySender()
        notifier = Notifier(flaky, spy, no_sleep)

        notifier.notify("TRACK-123")

        self.assertEqual(["Package TRACK-123 is delayed"], spy.sent)

    def test_gives_up_after_the_budget(self) -> None:
        calls = 0

        def broken(_: str) -> str:
            nonlocal calls
            calls += 1
            raise CarrierUnavailableError("carrier returned 500")

        spy = SpySender()
        notifier = Notifier(broken, spy, no_sleep)

        with self.assertRaises(CarrierUnavailableError):
            notifier.notify("TRACK-123")
        self.assertEqual(MAX_ATTEMPTS, calls)
        self.assertEqual([], spy.sent)
