import unittest

from notifier.errors import CarrierContractError, CarrierUnavailableError
from notifier.notifier import Notifier
from notifier.recorder import MemoryRecorder


def dummy_sleep(_seconds: float) -> None:
    pass


def stub_status(status: str):
    return lambda _tracking_number: status


class SpySender:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def __call__(self, _tracking_number: str, message: str) -> None:
        self.messages.append(message)


class MockSender:
    def __init__(self, test: unittest.TestCase, expected_message: str) -> None:
        self._test = test
        self._expected_message = expected_message
        self._calls = 0

    def __call__(self, _tracking_number: str, message: str) -> None:
        self._calls += 1
        self._test.assertEqual(1, self._calls, "sender called more than once")
        self._test.assertEqual(self._expected_message, message)

    def verify(self) -> None:
        self._test.assertEqual(1, self._calls, "expected exactly one send")


class PackageNotifierTest(unittest.TestCase):
    def test_notifies_the_customer_only_once(self) -> None:
        send = SpySender()
        recorder = MemoryRecorder()
        notifier = Notifier(stub_status("delayed"), send, recorder, dummy_sleep)
        for _ in range(3):
            notifier.notify("TRACK-123")
        self.assertEqual(1, len(send.messages))
        self.assertEqual(1, recorder.count)

    def test_does_not_record_a_delivered_package(self) -> None:
        send = SpySender()
        recorder = MemoryRecorder()
        Notifier(stub_status("delivered"), send, recorder, dummy_sleep).notify("TRACK-123")
        self.assertEqual([], send.messages)
        self.assertEqual(0, recorder.count)

    def test_a_strict_mock_owns_its_expectation(self) -> None:
        send = MockSender(self, "Package TRACK-123 is delayed")
        Notifier(stub_status("delayed"), send, MemoryRecorder(), dummy_sleep).notify("TRACK-123")
        send.verify()

    def test_surfaces_a_carrier_failure_without_sending(self) -> None:
        def broken(_tracking_number: str) -> str:
            raise CarrierUnavailableError("carrier returned 503")

        send = SpySender()
        notifier = Notifier(broken, send, MemoryRecorder(), dummy_sleep)
        with self.assertRaises(CarrierUnavailableError):
            notifier.notify("TRACK-123")
        self.assertEqual([], send.messages)

    def test_does_not_retry_a_contract_failure(self) -> None:
        calls = 0

        def drifted(_tracking_number: str) -> str:
            nonlocal calls
            calls += 1
            raise CarrierContractError("no status field")

        notifier = Notifier(drifted, SpySender(), MemoryRecorder(), dummy_sleep)
        with self.assertRaises(CarrierContractError):
            notifier.notify("TRACK-123")
        self.assertEqual(1, calls)
