"""The production wiring: the real HTTP carrier goes into the same seam the
tests fill with a canned answer."""

import os
import sys

from notifier.carrier import http_shipment_status
from notifier.notifier import Notifier


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 cli.py TRACKING-NUMBER", file=sys.stderr)
        return 2

    base_url = os.environ.get("CARRIER_URL", "https://api.example-carrier.test")
    notifier = Notifier(http_shipment_status(base_url))
    print(notifier.notify(sys.argv[1]) or "nothing to send")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
