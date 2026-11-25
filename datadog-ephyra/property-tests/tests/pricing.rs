//! A booking costs its passengers times the per-passenger fare: base fare, taxes and booking fee.

use ephyra::gens;
use ephyra::prelude::*;
use airline_properties::{
    cents, get, money, post, pricing_addr, recorded_card_token, recorded_fare_bases, recorded_routes, write_regression, Booking, Fare,
    PricingPartner, BOOKING_FEE_CENTS,
};
use serde_json::json;

#[test]
fn order_total_is_passengers_times_fare() {
    let routes = recorded_routes();
    assert!(!routes.is_empty(), "no schedule searches found in the recording");
    let fare_bases = recorded_fare_bases();
    let card = recorded_card_token();
    let partner = PricingPartner::start(&pricing_addr(), fare_bases.clone());

    // A recorded route, which of its flights and fare classes to book, passengers, and a fare in cents.
    let generator = (
        gens::pick_from(routes),
        gens::int(0usize..=7),
        gens::int(0usize..=2),
        gens::int(1i64..=9),
        gens::int(0i64..=200_000),
        gens::int(0i64..=40_000),
    );

    // The property runs again for every shrink candidate; the smallest failing booking is the shrunk one.
    let mut smallest: Option<Booking> = None;
    let config = Config::default().tests(200).name("airline_order_total").no_regressions();
    let report = check(&config, generator, |(route, flight_ix, class_ix, passengers, base, taxes)| {
        let (status, offers) = get(&format!("/api/offers?origin={}&destination={}&date={}", route.origin, route.destination, route.date));
        let flights = offers["offers"].as_array().cloned().unwrap_or_default();
        if status != 200 || flights.is_empty() {
            return TestResult::fail(format!("offers for {route:?} returned {status}"));
        }
        let flight = &flights[flight_ix % flights.len()];
        let classes = flight["fareClasses"].as_array().cloned().unwrap_or_default();
        let flight_number = flight["flightNumber"].as_str().unwrap_or("").to_string();
        let fare_class = classes[class_ix % classes.len()].as_str().unwrap_or("").to_string();

        let fare = Fare { base_cents: base, taxes_cents: taxes };
        partner.set(fare);
        let (status, cart) = post("/api/carts", json!({ "passengers": passengers }));
        if status != 201 {
            return TestResult::fail(format!("create cart returned {status}"));
        }
        let cart_id = cart["cartId"].as_str().unwrap_or("").to_string();
        let (status, line) = post(&format!("/api/carts/{cart_id}/items"), json!({ "flightNumber": flight_number, "fareClass": fare_class }));
        if status != 201 {
            return TestResult::fail(format!("add item returned {status}: {line}"));
        }
        let (status, order) = post(&format!("/api/carts/{cart_id}/checkout"), json!({ "cardToken": card }));
        if status != 201 {
            return TestResult::fail(format!("checkout returned {status}: {order}"));
        }

        let expected = passengers * (base + taxes + BOOKING_FEE_CENTS);
        let (line_total, order_total) = (cents(&line["total"]), cents(&order["total"]));
        let ok = line_total == Some(expected) && order_total == Some(expected);
        if !ok {
            let booking = Booking {
                flight: flight_number,
                fare_class: fare_class.clone(),
                fare_basis: line["fareBasis"].as_str().unwrap_or("").to_string(),
                passengers,
                fare,
                expected_cents: expected,
            };
            let key = |b: &Booking| (b.passengers, b.fare.base_cents + b.fare.taxes_cents);
            if smallest.as_ref().map_or(true, |s| key(&booking) < key(s)) {
                smallest = Some(booking);
            }
        }
        TestResult::check(
            ok,
            format!(
                "{passengers} passengers at {} + {} taxes: expected {}, line total {}, order total {}",
                money(base),
                money(taxes),
                money(expected),
                line["total"],
                order["total"]
            ),
        )
    });
    if let Some(b) = &smallest {
        let dir = write_regression(b);
        eprintln!(
            "shrunk booking: {} passengers on {} {} at {} + {} taxes, expected total {}\nregression RRPairs: {}",
            b.passengers,
            b.flight,
            b.fare_class,
            money(b.fare.base_cents),
            money(b.fare.taxes_cents),
            money(b.expected_cents),
            dir.display()
        );
    }
    report.assert_passed();
}
