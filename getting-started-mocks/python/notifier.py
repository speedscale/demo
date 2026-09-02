from collections.abc import Callable


def notification_for(
    get_shipment_status: Callable[[str], str], tracking_number: str
) -> str | None:
    if get_shipment_status(tracking_number) == "delayed":
        return f"Package {tracking_number} is delayed"
    return None
