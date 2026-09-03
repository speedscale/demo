import unittest

from before.notifier import notify


class PackageNotifierTest(unittest.TestCase):
    # This is the test we want to write. Against this code it cannot be made to
    # pass on purpose: the test has no way to make the carrier report TRACK-123
    # as delayed, and the carrier host is not reachable from a laptop anyway.
    #
    # It is skipped so the suite stays green. Green because nothing ran is the
    # wrong kind of green; the post explains the fix.
    @unittest.skip("needs a live carrier that will report TRACK-123 as delayed, and the test cannot make that happen")
    def test_creates_notification_when_package_is_delayed(self) -> None:
        self.assertEqual("Package TRACK-123 is delayed", notify("TRACK-123"))
