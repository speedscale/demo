import unittest

from notifier.notifier import Notifier


class PackageNotifierTest(unittest.TestCase):
    def test_creates_notification_when_package_is_delayed(self) -> None:
        delayed = lambda tracking_number: "delayed"
        notifier = Notifier(delayed)

        self.assertEqual("Package TRACK-123 is delayed", notifier.notify("TRACK-123"))

    def test_creates_no_notification_when_package_is_delivered(self) -> None:
        delivered = lambda tracking_number: "delivered"
        notifier = Notifier(delivered)

        self.assertIsNone(notifier.notify("TRACK-123"))
