import unittest

from notifier.carrier import CarrierClient
from notifier.notifier import Notifier
from notifier.recorder import MemoryRecorder
from notifier.test_carrier import FakeCarrier, fixture


class DecisionLadderTest(unittest.TestCase):
    def assert_notified_once(self, messages: list[str], recorder: MemoryRecorder) -> None:
        self.assertEqual(["Package TRACK-123 is delayed"], messages)
        self.assertEqual(1, recorder.count)

    def test_same_behavior_with_a_function_stub(self) -> None:
        messages: list[str] = []
        recorder = MemoryRecorder()
        notifier = Notifier(
            lambda _tracking_number: "delayed",
            lambda _tracking_number, message: messages.append(message),
            recorder,
            lambda _seconds: None,
        )

        notifier.notify("TRACK-123")

        self.assert_notified_once(messages, recorder)

    def test_same_behavior_with_a_fake_server(self) -> None:
        with FakeCarrier(body=fixture("carrier-shipment-delayed.json")) as carrier:
            client = CarrierClient(carrier.url, "secret-key")
            messages: list[str] = []
            recorder = MemoryRecorder()
            notifier = Notifier(
                client.lookup,
                lambda _tracking_number, message: messages.append(message),
                recorder,
                lambda _seconds: None,
            )

            notifier.notify("TRACK-123")

        self.assert_notified_once(messages, recorder)
