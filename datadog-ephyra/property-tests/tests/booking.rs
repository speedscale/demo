//! Books generated itineraries and pays with the recorded cards, one attempt after another.
//! Every line is priced at the recorded fare for its class, the order charges the sum of its
//! lines, a declined card leaves the cart open for the next attempt, and a ticketed cart stays
//! ticketed.

use std::collections::HashMap;

use airline_properties::{
    add_days, first_record_locator, get, post, recorded_cards, recorded_fares, recorded_routes, write_regression, Exchange, Model,
};
use ephyra::gens;
use ephyra::prelude::*;
use serde_json::Value;

/// Seed used when `EPHYRA_SEED` is not set, so a run is repeatable.
const DEFAULT_SEED: u64 = 1;

/// Stands for the record locator of an order the API has not assigned yet.
const NEW_LOCATOR: &str = "(assigned at checkout)";

#[test]
fn bookings_are_priced_and_paid_as_recorded() {
    let routes = recorded_routes();
    let fares = recorded_fares();
    let cards = recorded_cards();
    assert!(!routes.is_empty() && !fares.is_empty() && !cards.is_empty(), "the recording has no searches, quotes or payments");
    let tokens: Vec<String> = cards.iter().map(|c| c.token.clone()).collect();

    // An itinerary of legs (a recorded route, a day offset from its recorded date, which flight and
    // which fare class), a passenger count, and the cards tried at checkout in order.
    let leg = (gens::pick_from(routes), gens::int(0i64..=30), gens::int(0usize..=2), gens::int(0usize..=2));
    // Itineraries and attempt lists start at one entry and grow with ephyra's size parameter.
    let generator = (gens::vec(leg).len(1..), gens::int(1i64..=9), gens::vec(gens::pick_from(tokens)).len(1..));

    // Each failing input's exchanges, keyed by its Debug rendering, so the shrunk one can be written out.
    let mut failing: HashMap<String, Vec<Exchange>> = HashMap::new();
    let config = Config::default().tests(200).seed(DEFAULT_SEED).name("airline_bookings").no_regressions();
    let report = check(&config, generator, |input| {
        let (legs, passengers, attempts) = input.clone();
        let mut done: Vec<Exchange> = Vec::new();
        let result = (|| -> Result<(), String> {
            let mut picks = Vec::new();
            for (route, offset, flight_ix, class_ix) in &legs {
                let date = add_days(&route.date, *offset);
                let (status, offers) = get(&format!("/api/offers?origin={}&destination={}&date={date}", route.origin, route.destination));
                let flights = offers["offers"].as_array().cloned().unwrap_or_default();
                if status != 200 || flights.is_empty() {
                    return Err(format!("offers {}-{} on {date}: {status} {offers}", route.origin, route.destination));
                }
                let flight = &flights[flight_ix % flights.len()];
                let classes = flight["fareClasses"].as_array().cloned().unwrap_or_default();
                let class = classes[class_ix % classes.len()].as_str().unwrap_or("").to_string();
                picks.push((flight["flightNumber"].as_str().unwrap_or("").to_string(), class));
            }

            let (status, cart) = post("/api/carts", &serde_json::json!({ "passengers": passengers }));
            let cart_id = cart["cartId"].as_str().unwrap_or("").to_string();
            let mut model = Model::new(&fares, &cards, &cart_id, passengers);
            expect(model.create_cart(), status, &cart, &mut done)?;
            for (flight, class) in &picks {
                let x = model.add_item(flight, class);
                let (status, line) = post(&x.path, &x.request);
                expect(x, status, &line, &mut done)?;
            }
            for (i, token) in attempts.iter().enumerate() {
                let mut x = model.checkout(token, NEW_LOCATOR);
                let (status, body) = post(&x.path, &x.request);
                // The API assigns the record locator; the model takes it from a successful checkout.
                if let (201, 201, Some(locator)) = (x.status, status, body["recordLocator"].as_str()) {
                    x.response = x.response.replace(NEW_LOCATOR, locator);
                    model.locator = Some(locator.to_string());
                }
                expect(x, status, &body, &mut done).map_err(|e| format!("checkout attempt {} of {} ({token}): {e}", i + 1, attempts.len()))?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => TestResult::check(true, ""),
            Err(message) => {
                failing.insert(format!("{input:?}"), done);
                TestResult::fail(message)
            }
        }
    });

    if let Some(failure) = &report.failure {
        println!("first failing input: generated case {} of seed {}", failure.iteration + 1, report.seed);
        if let Some(exchanges) = failing.get(&failure.counterexample().debug) {
            let dir = write_regression(&for_empty_redis(exchanges));
            println!("shrunk booking written as {} RRPairs to {}", exchanges.len(), dir.display());
        }
    }
    report.assert_passed();
}

/// Checks one response against the model and keeps the exchange for the regression.
fn expect(x: Exchange, status: u16, body: &Value, done: &mut Vec<Exchange>) -> Result<(), String> {
    let ok = x.matches(status, body);
    let message = format!("{} expected {} {}, got {status} {body}", x.path, x.status, compact(&x.response));
    done.push(x);
    if ok {
        Ok(())
    } else {
        Err(message)
    }
}

fn compact(json: &str) -> String {
    serde_json::from_str::<Value>(json).map_or_else(|_| json.to_string(), |v| v.to_string())
}

/// The same exchanges as they look against an empty Redis: the first cart and the first order.
fn for_empty_redis(exchanges: &[Exchange]) -> Vec<Exchange> {
    let cart_id = exchanges.first().and_then(|x| serde_json::from_str::<Value>(&x.response).ok()).and_then(|v| v["cartId"].as_str().map(str::to_string));
    let locator = exchanges
        .iter()
        .filter_map(|x| serde_json::from_str::<Value>(&x.response).ok().and_then(|v| v["recordLocator"].as_str().map(str::to_string)))
        .find(|l| l != NEW_LOCATOR);
    let first_locator = first_record_locator();
    exchanges
        .iter()
        .map(|x| {
            let mut x = x.clone();
            if let Some(id) = &cart_id {
                x.path = x.path.replace(id, "C000001");
                x.response = x.response.replace(&format!("\"{id}\""), "\"C000001\"");
            }
            for l in locator.iter().map(String::as_str).chain([NEW_LOCATOR]) {
                x.response = x.response.replace(&format!("\"{l}\""), &format!("\"{first_locator}\""));
            }
            x
        })
        .collect()
}
