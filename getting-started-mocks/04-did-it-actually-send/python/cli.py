"""The production wiring: the real HTTP carrier, a real sender and a real sleep
go into the same seams the tests fill."""

import os
import sys
import time

from notifier.carrier import http_shipment_status
from notifier.notifier import Notifier


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 cli.py TRACKING-NUMBER", file=sys.stderr)
        return 2

    base_url = os.environ.get("CARRIER_URL", "https://api.example-carrier.test")
    # In production the sender would hand the message to an email or SMS
    # provider. Printing it keeps the example runnable.
    notifier = Notifier(http_shipment_status(base_url), print, time.sleep)
    notifier.notify(sys.argv[1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
