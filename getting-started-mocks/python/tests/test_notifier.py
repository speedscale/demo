import unittest

from notifier import notification_for


class PackageNotifierTest(unittest.TestCase):
    def test_creates_notification_when_package_is_delayed(self) -> None:
        get_shipment_status = lambda _: "delayed"

        message = notification_for(get_shipment_status, "TRACK-123")

        self.assertEqual("Package TRACK-123 is delayed", message)

    def test_creates_no_notification_when_package_is_delivered(self) -> None:
        get_shipment_status = lambda _: "delivered"

        message = notification_for(get_shipment_status, "TRACK-123")

        self.assertIsNone(message)


if __name__ == "__main__":
    unittest.main()
