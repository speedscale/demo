class CarrierUnavailableError(Exception):
    """The carrier is reachable but refuses to answer.

    This is the HTTP 500 case, not a network failure.
    """
