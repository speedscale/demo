#!/usr/bin/env python3
"""Drive synthetic booking journeys through a Kubernetes Service."""
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

base = sys.argv[1] if len(sys.argv) > 1 else "http://airline-booking-api:8090"
travel_date = datetime.date.fromisoformat(os.environ.get("TRAVEL_DATE", "2026-12-18"))
requests = 0


def call(method, path, body=None, expected=200):
    global requests
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
    try:
        response = urllib.request.urlopen(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status = response.status
        result = json.load(response)
    requests += 1
    print(f"{method} {path} -> [{status}]", flush=True)
    if status != expected:
        raise RuntimeError(f"expected {expected}, got {status}: {result}")
    return result


carts = []


def book(origin, destination, day, passengers, flight, fare_class, card):
    query = urllib.parse.urlencode({"origin": origin, "destination": destination,
                                    "date": str(travel_date + datetime.timedelta(days=day))})
    call("GET", "/api/offers?" + query)
    cart = call("POST", "/api/carts", {"passengers": passengers}, expected=201)["cartId"]
    carts.append(cart)
    call("POST", f"/api/carts/{cart}/items",
         {"flightNumber": flight, "fareClass": fare_class}, expected=201)
    call("GET", f"/api/carts/{cart}")
    declined = card == "tok_decline"
    order = call("POST", f"/api/carts/{cart}/checkout", {"cardToken": card},
                 expected=402 if declined else 201)
    if not declined:
        locator = order["recordLocator"]
        call("GET", f"/api/orders/{locator}")


book("SLC", "LAX", 0, 1, "DM1201", "Y", "tok_visa_4242")
book("SLC", "LAX", 0, 2, "DM1205", "M", "tok_amex_0005")
book("SLC", "DEN", 1, 3, "DM2407", "J", "tok_mc_4444")
book("LAX", "SLC", 3, 1, "DM1302", "Y", "tok_decline")
call("POST", "/api/carts", {"passengers": 12}, expected=400)
call("GET", "/api/orders/ZZZZZZ", expected=404)
call("POST", f"/api/carts/{carts[0]}/checkout", {"cardToken": "tok_visa_4242"}, expected=409)
print(json.dumps({"requests": requests, "approvedBookings": 3, "declinedBookings": 1}))
