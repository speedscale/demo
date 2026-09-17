class CarrierUnavailableError(Exception):
    """The carrier is reachable but refuses to answer.

    This is the HTTP 500 case, not a network failure.
    """


class CarrierContractError(Exception):
    """The carrier answered with a response shape the client does not understand."""
