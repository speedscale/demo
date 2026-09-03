import unittest

from notifier.errors import CarrierUnavailableError
from notifier.notifier import MAX_ATTEMPTS, Notifier


def no_sleep(_seconds: float) -> None:
    """The whole reason the sleep seam exists.

    The retry tests below finish instantly instead of waiting for real backoff.
    """


class PackageNotifierTest(unittest.TestCase):
    def test_creates_notification_when_package_is_delayed(self) -> None:
        delayed = lambda _: "delayed"
        notifier = Notifier(delayed, no_sleep)

        self.assertEqual("Package TRACK-123 is delayed", notifier.notify("TRACK-123"))

    def test_creates_no_notification_when_package_is_delivered(self) -> None:
        delivered = lambda _: "delivered"
        notifier = Notifier(delivered, no_sleep)

        self.assertIsNone(notifier.notify("TRACK-123"))

    def test_reports_carrier_unavailable(self) -> None:
        def unavailable(_: str) -> str:
            raise CarrierUnavailableError("carrier returned 500")

        notifier = Notifier(unavailable, no_sleep)

        with self.assertRaises(CarrierUnavailableError):
            notifier.notify("TRACK-123")

    def test_reports_timeout(self) -> None:
        def timeout(_: str) -> str:
            raise TimeoutError("carrier did not answer in time")

        notifier = Notifier(timeout, no_sleep)

        with self.assertRaises(TimeoutError):
            notifier.notify("TRACK-123")

    def test_ignores_an_unknown_status(self) -> None:
        for status in ("", "in_transit", "held_at_customs"):
            with self.subTest(status=status):
                notifier = Notifier(lambda _, s=status: s, no_sleep)

                self.assertIsNone(notifier.notify("TRACK-123"))

    def test_retries_until_the_carrier_answers(self) -> None:
        calls = 0

        def flaky(_: str) -> str:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise CarrierUnavailableError("carrier returned 500")
            return "delayed"

        sleeps = 0

        def count_sleep(_seconds: float) -> None:
            nonlocal sleeps
            sleeps += 1

        notifier = Notifier(flaky, count_sleep)

        self.assertEqual("Package TRACK-123 is delayed", notifier.notify("TRACK-123"))
        self.assertEqual(2, calls)
        self.assertEqual(1, sleeps)

    def test_gives_up_after_the_budget(self) -> None:
        calls = 0

        def broken(_: str) -> str:
            nonlocal calls
            calls += 1
            raise CarrierUnavailableError("carrier returned 500")

        notifier = Notifier(broken, no_sleep)

        with self.assertRaises(CarrierUnavailableError):
            notifier.notify("TRACK-123")
        self.assertEqual(MAX_ATTEMPTS, calls)
