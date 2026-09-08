"""The production wiring: the real HTTP carrier, a real sender and a real sleep
go into the same seams the tests fill."""

import os
import sys
import time

from notifier.carrier import http_shipment_status
from notifier.notifier import Notifier
from notifier.recorder import MemoryRecorder


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 cli.py TRACKING-NUMBER", file=sys.stderr)
        return 2

    base_url = os.environ.get("CARRIER_URL", "https://api.example-carrier.test")
    api_key = os.environ.get("CARRIER_API_KEY", "")
    # In production the sender would hand the message to an email or SMS
    # provider. Printing it keeps the example runnable.
    sender = lambda _tracking_number, message: print(message)
    notifier = Notifier(http_shipment_status(base_url, api_key), sender, MemoryRecorder(), time.sleep)
    notifier.notify(sys.argv[1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
