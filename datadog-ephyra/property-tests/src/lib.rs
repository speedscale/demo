//! Seeds an ephyra property from the airline recording, plays the pricing partner,
//! calls the booking API, and writes a failure back as proxymock RRPairs.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

/// The booking fee the API adds per passenger (`Pricing.BookingFeePerPassenger`), in cents.
pub const BOOKING_FEE_CENTS: i64 = 450;

pub fn airline_recording() -> PathBuf {
    match std::env::var("AIRLINE_RECORDING") {
        Ok(dir) => PathBuf::from(dir),
        Err(_) => Path::new(env!("CARGO_MANIFEST_DIR")).join("../../dotnet-airline/proxymock/recording"),
    }
}

pub fn regressions_dir() -> PathBuf {
    match std::env::var("REGRESSIONS_DIR") {
        Ok(dir) => PathBuf::from(dir),
        Err(_) => Path::new(env!("CARGO_MANIFEST_DIR")).join("../proxymock/regressions-ephyra"),
    }
}

pub fn api_url() -> String {
    std::env::var("API_URL").unwrap_or_else(|_| "http://127.0.0.1:18090".to_string())
}

pub fn pricing_addr() -> String {
    std::env::var("PRICING_ADDR").unwrap_or_else(|_| "127.0.0.1:25052".to_string())
}

/// A route and date the recorded journeys searched.
#[derive(Clone, Debug, PartialEq)]
pub struct Route {
    pub origin: String,
    pub destination: String,
    pub date: String,
}

/// Fenced blocks that follow `heading` and precede the next `### ` heading.
fn blocks_after<'a>(md: &'a str, heading: &str) -> Vec<&'a str> {
    let Some(start) = md.find(heading) else { return Vec::new() };
    let section = &md[start + heading.len()..];
    let section = &section[..section.find("\n### ").unwrap_or(section.len())];
    section
        .split("```")
        .skip(1)
        .step_by(2)
        .map(|b| b.split_once('\n').map_or("", |(_, rest)| rest))
        .collect()
}

/// Markdown RRPairs under `<recording>/<host>`, sorted by file name (recorded order).
fn rrpairs(host: &str) -> Vec<String> {
    let dir = airline_recording().join(host);
    let mut paths: Vec<_> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .collect();
    paths.sort();
    paths.iter().filter_map(|p| fs::read_to_string(p).ok()).collect()
}

fn body_json(md: &str, heading: &str) -> Option<Value> {
    blocks_after(md, heading).get(1).and_then(|b| serde_json::from_str(b).ok())
}

/// Routes the recorded journeys asked the schedule partner about.
pub fn recorded_routes() -> Vec<Route> {
    let mut out = Vec::new();
    for md in rrpairs("localhost-5051") {
        let head = blocks_after(&md, "### REQUEST ###").first().copied().unwrap_or("");
        let Some(query) = head.lines().next().and_then(|l| l.split_whitespace().nth(1)).and_then(|u| u.split_once('?')).map(|(_, q)| q) else {
            continue;
        };
        let params: BTreeMap<&str, &str> = query.split('&').filter_map(|kv| kv.split_once('=')).collect();
        if let (Some(o), Some(d), Some(t)) = (params.get("origin"), params.get("destination"), params.get("date")) {
            let route = Route { origin: o.to_string(), destination: d.to_string(), date: t.to_string() };
            if !out.contains(&route) {
                out.push(route);
            }
        }
    }
    out
}

/// Fare basis per fare class, from the pricing partner's recorded quotes.
pub fn recorded_fare_bases() -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for md in rrpairs("localhost-5052") {
        if let Some(q) = body_json(&md, "### RESPONSE ###") {
            if let (Some(class), Some(basis)) = (q["fareClass"].as_str(), q["fareBasis"].as_str()) {
                out.insert(class.to_string(), basis.to_string());
            }
        }
    }
    out
}

/// A card token the payment gateway approved in the recording.
pub fn recorded_card_token() -> String {
    for md in rrpairs("localhost-5053") {
        let approved = body_json(&md, "### RESPONSE ###").is_some_and(|r| r["status"] == "APPROVED");
        if let (true, Some(req)) = (approved, body_json(&md, "### REQUEST ###")) {
            if let Some(token) = req["cardToken"].as_str() {
                return token.to_string();
            }
        }
    }
    panic!("no approved payment in {}", airline_recording().display());
}

/// Cents as a JSON number with two decimals, the way the partners and the API write money.
pub fn money(cents: i64) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}

pub fn cents(v: &Value) -> Option<i64> {
    v.as_f64().map(|x| (x * 100.0).round() as i64)
}

/// The per-passenger fare the pricing partner quotes next.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fare {
    pub base_cents: i64,
    pub taxes_cents: i64,
}

/// Stands in for the pricing partner: answers every quote request with the current fare,
/// echoing the flight, fare class and passenger count the API asked for.
pub struct PricingPartner {
    fare: Arc<Mutex<Fare>>,
}

impl PricingPartner {
    pub fn start(addr: &str, fare_bases: BTreeMap<String, String>) -> Self {
        let server = tiny_http::Server::http(addr).unwrap_or_else(|e| panic!("pricing partner on {addr}: {e}"));
        let fare = Arc::new(Mutex::new(Fare { base_cents: 0, taxes_cents: 0 }));
        let current = Arc::clone(&fare);
        std::thread::spawn(move || {
            for mut req in server.incoming_requests() {
                let mut body = String::new();
                let _ = req.as_reader().read_to_string(&mut body);
                let ask: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
                let class = ask["fareClass"].as_str().unwrap_or("").to_string();
                let f = *current.lock().unwrap();
                let quote = quote_json(
                    ask["flightNumber"].as_str().unwrap_or(""),
                    &class,
                    ask["passengers"].as_i64().unwrap_or(0),
                    fare_bases.get(&class).map_or_else(|| format!("{class}14NR"), String::clone).as_str(),
                    f,
                );
                let header = tiny_http::Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
                let _ = req.respond(tiny_http::Response::from_string(quote).with_header(header));
            }
        });
        PricingPartner { fare }
    }

    pub fn set(&self, fare: Fare) {
        *self.fare.lock().unwrap() = fare;
    }
}

fn quote_json(flight: &str, class: &str, passengers: i64, fare_basis: &str, f: Fare) -> String {
    format!(
        "{{\n  \"flightNumber\": {},\n  \"fareClass\": {},\n  \"passengers\": {passengers},\n  \"currency\": \"USD\",\n  \"baseFarePerPassenger\": {},\n  \"taxesPerPassenger\": {},\n  \"fareBasis\": {}\n}}",
        json!(flight),
        json!(class),
        money(f.base_cents),
        money(f.taxes_cents),
        json!(fare_basis)
    )
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).build()
}

fn finish(result: Result<ureq::Response, ureq::Error>) -> (u16, Value) {
    match result {
        Ok(r) => (r.status(), parse(r)),
        Err(ureq::Error::Status(code, r)) => (code, parse(r)),
        Err(e) => panic!("booking API request failed: {e}"),
    }
}

fn parse(r: ureq::Response) -> Value {
    r.into_string().ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null)
}

pub fn get(path: &str) -> (u16, Value) {
    finish(agent().get(&format!("{}{path}", api_url())).call())
}

pub fn post(path: &str, body: Value) -> (u16, Value) {
    finish(agent().post(&format!("{}{path}", api_url())).set("Content-Type", "application/json").send_string(&body.to_string()))
}

/// The smallest booking that broke the property, enough to rebuild it as RRPairs.
#[derive(Clone, Debug)]
pub struct Booking {
    pub flight: String,
    pub fare_class: String,
    pub fare_basis: String,
    pub passengers: i64,
    pub fare: Fare,
    pub expected_cents: i64,
}

/// Writes the booking as a proxymock test: the inbound cart and add-item requests with the
/// response the property expects, and the pricing partner's quote as an outbound mock.
/// Replaying it against a fresh Redis fails until the bug is fixed.
pub fn write_regression(b: &Booking) -> PathBuf {
    let out = regressions_dir();
    let _ = fs::remove_dir_all(&out);
    let cart_tpl = template("localhost", |md| md.starts_with("### REQUEST ###\n```\nPOST http://localhost:8090/api/carts HTTP/1.1") && md.contains("201 Created"));
    let item_tpl = template("localhost", |md| md.contains("/items HTTP/1.1") && md.contains("201 Created"));
    let quote_tpl = template("localhost-5052", |md| md.contains("200 OK"));
    let item_url = item_tpl.lines().nth(2).and_then(|l| l.split_whitespace().nth(1)).unwrap().to_string();
    let item_path = item_url.trim_start_matches("http://localhost:8090").to_string();
    let cart_id = "C000001";
    let new_item_path = format!("/api/carts/{cart_id}/items");

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let ts = |offset_us: u128| {
        let t = now.as_micros() + offset_us;
        format!("{}.{:06}Z", iso8601((t / 1_000_000) as u64).trim_end_matches('Z'), t % 1_000_000)
    };

    let files = [
        (
            "localhost",
            ts(0),
            rewrite(
                &cart_tpl,
                None,
                Some(json!({ "passengers": b.passengers })),
                &format!("{{\n  \"cartId\": \"{cart_id}\",\n  \"passengers\": {},\n  \"status\": \"OPEN\"\n}}", b.passengers),
                &ts(0),
            ),
        ),
        (
            "localhost-5052",
            ts(1_000),
            rewrite(
                &quote_tpl,
                None,
                Some(json!({ "flightNumber": b.flight, "fareClass": b.fare_class, "passengers": b.passengers })),
                &quote_json(&b.flight, &b.fare_class, b.passengers, &b.fare_basis, b.fare),
                &ts(1_000),
            ),
        ),
        (
            "localhost",
            ts(2_000),
            rewrite(
                &item_tpl,
                Some((&item_path, &new_item_path)),
                Some(json!({ "flightNumber": b.flight, "fareClass": b.fare_class })),
                &format!(
                    "{{\n  \"flightNumber\": {},\n  \"fareClass\": {},\n  \"passengers\": {},\n  \"fareBasis\": {},\n  \"currency\": \"USD\",\n  \"total\": {}\n}}",
                    json!(b.flight),
                    json!(b.fare_class),
                    b.passengers,
                    json!(b.fare_basis),
                    money(b.expected_cents)
                ),
                &ts(2_000),
            ),
        ),
    ];
    for (host, ts, md) in files {
        let dir = out.join(host);
        fs::create_dir_all(&dir).expect("create regressions dir");
        fs::write(dir.join(format!("{}.md", ts.replace(':', "-").replace('T', "_"))), md).expect("write regression rrpair");
    }
    out
}

fn template(host: &str, pick: impl Fn(&str) -> bool) -> String {
    rrpairs(host).into_iter().find(|md| pick(md)).unwrap_or_else(|| panic!("no template RRPair in {host}"))
}

fn b64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | u32::from(*b) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(T[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Replaces the first fenced JSON block in `part` with `body`.
fn replace_json_block(part: &str, body: &str) -> String {
    let Some(start) = part.find("```json\n") else { return part.to_string() };
    let rest = &part[start + 8..];
    let end = rest.find("\n```").expect("unterminated json block");
    format!("{}```json\n{body}{}", &part[..start], &rest[end..])
}

/// A copy of a recorded RRPair with a new path, request body, response body and timestamp.
/// Updates the markdown, the signature and the internal record so proxymock reads them consistently.
fn rewrite(tpl: &str, path: Option<(&str, &str)>, req_body: Option<Value>, res_body: &str, ts: &str) -> String {
    let swap = |s: &str| path.map_or(s.to_string(), |(old, new)| s.replace(old, new));
    let compact = req_body.as_ref().map(|v| v.to_string());

    let (req_part, rest) = tpl.split_once("### RESPONSE ###").unwrap();
    let mut req_part = swap(req_part);
    if let Some(v) = &req_body {
        req_part = replace_json_block(&req_part, &serde_json::to_string_pretty(v).unwrap());
    }
    let (res_part, after_res) = rest.split_once("### SIGNATURE ###").unwrap();
    let res_part = replace_json_block(res_part, res_body);
    let (sig, meta) = after_res.split_once("### METADATA ###").unwrap();
    let sig = sig
        .lines()
        .map(|l| match (&compact, l.starts_with("http:requestBodyJSON is ")) {
            (Some(c), true) => format!("http:requestBodyJSON is {c}"),
            _ => swap(l),
        })
        .collect::<Vec<_>>()
        .join("\n");

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let uuid_bytes: [u8; 16] = std::array::from_fn(|i| ((now.as_nanos() >> (i * 5)) as u8) ^ (i as u8).wrapping_mul(31) ^ ts.len() as u8);
    let hex: String = uuid_bytes.iter().map(|b| format!("{b:02x}")).collect();
    let uuid = format!("{}-{}-4{}-8{}-{}", &hex[..8], &hex[8..12], &hex[13..16], &hex[17..20], &hex[20..32]);

    let (meta_md, internal) = meta.split_once("### INTERNAL - DO NOT MODIFY ###").unwrap();
    let meta_md = meta_md
        .lines()
        .filter(|l| !l.starts_with("duration:") && !l.starts_with("elapsed:"))
        .map(|l| {
            if l.starts_with("uuid: ") {
                format!("uuid: {uuid}")
            } else if l.starts_with("ts: ") {
                format!("ts: {ts}")
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let json_line = internal.lines().find_map(|l| l.strip_prefix("json: ")).unwrap();
    let mut j: Value = serde_json::from_str(&swap(json_line)).unwrap();
    j["ts"] = ts.into();
    j["uuid"] = b64(&uuid_bytes).into();
    j["tags"]["source"] = "ephyra".into();
    j["netinfo"]["startTime"] = ts.into();
    if let Some((_, new)) = path {
        j["signature"]["http:url"] = b64(new.as_bytes()).into();
    }
    if let Some(c) = &compact {
        j["signature"]["http:requestBodyJSON"] = b64(c.as_bytes()).into();
    }

    format!(
        "{req_part}### RESPONSE ###{res_part}### SIGNATURE ###{sig}### METADATA ###{meta_md}### INTERNAL - DO NOT MODIFY ###\n```\njson: {j}\n```\n<!-- speedscale rrpair markdown v2.1 -->\n"
    )
}

fn iso8601(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Civil-from-days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3_600, rem % 3_600 / 60, rem % 60)
}
