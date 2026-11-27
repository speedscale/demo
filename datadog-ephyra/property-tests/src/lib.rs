//! Reads the airline recording for the property test's inputs and expectations, calls the
//! booking API, and writes a failing booking back as proxymock RRPairs.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
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

/// A route and date the recorded journeys searched.
#[derive(Clone, Debug, PartialEq)]
pub struct Route {
    pub origin: String,
    pub destination: String,
    pub date: String,
}

/// A fare class as the pricing partner quoted it in the recording, per passenger.
#[derive(Clone, Debug, PartialEq)]
pub struct Fare {
    pub base_cents: i64,
    pub taxes_cents: i64,
    pub fare_basis: String,
}

/// A card token the recording used and what the payment gateway answered for it.
#[derive(Clone, Debug, PartialEq)]
pub struct Card {
    pub token: String,
    pub approved: bool,
    pub authorization_id: String,
    pub reason: String,
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

/// Per-passenger fares by fare class, from the pricing partner's recorded quotes.
pub fn recorded_fares() -> BTreeMap<String, Fare> {
    let mut out = BTreeMap::new();
    for md in rrpairs("localhost-5052") {
        let Some(q) = body_json(&md, "### RESPONSE ###") else { continue };
        if let (Some(class), Some(base), Some(taxes), Some(basis)) =
            (q["fareClass"].as_str(), cents(&q["baseFarePerPassenger"]), cents(&q["taxesPerPassenger"]), q["fareBasis"].as_str())
        {
            out.insert(class.to_string(), Fare { base_cents: base, taxes_cents: taxes, fare_basis: basis.to_string() });
        }
    }
    out
}

/// The card tokens the recorded checkouts used, in recorded order, with the gateway's answers.
pub fn recorded_cards() -> Vec<Card> {
    let mut out: Vec<Card> = Vec::new();
    for md in rrpairs("localhost-5053") {
        let (Some(req), Some(res)) = (body_json(&md, "### REQUEST ###"), body_json(&md, "### RESPONSE ###")) else { continue };
        let Some(token) = req["cardToken"].as_str() else { continue };
        if out.iter().any(|c| c.token == token) {
            continue;
        }
        out.push(Card {
            token: token.to_string(),
            approved: res["status"] == "APPROVED",
            authorization_id: res["authorizationId"].as_str().unwrap_or("").to_string(),
            reason: res["reason"].as_str().unwrap_or("").to_string(),
        });
    }
    out
}

/// The record locator of the first order in the recording, which is what the API issues for the
/// first order it writes to an empty Redis.
pub fn first_record_locator() -> String {
    for md in rrpairs("localhost") {
        if md.contains("/checkout HTTP/1.1") && md.contains("HTTP/1.1 201") {
            if let Some(locator) = body_json(&md, "### RESPONSE ###").and_then(|o| o["recordLocator"].as_str().map(str::to_string)) {
                return locator;
            }
        }
    }
    panic!("no ticketed order in {}", airline_recording().display());
}

/// Cents as a JSON number with two decimals, the way the partners and the API write money.
pub fn money(cents: i64) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}

pub fn cents(v: &Value) -> Option<i64> {
    v.as_f64().map(|x| (x * 100.0).round() as i64)
}

/// `date` (YYYY-MM-DD) plus `days`.
pub fn add_days(date: &str, days: i64) -> String {
    let mut parts = date.split('-').map(|p| p.parse::<i64>().unwrap_or(1));
    let (y, m, d) = (parts.next().unwrap_or(1970), parts.next().unwrap_or(1), parts.next().unwrap_or(1));
    // Days from civil (Howard Hinnant), then back.
    let y0 = if m <= 2 { y - 1 } else { y };
    let era = y0.div_euclid(400);
    let yoe = y0 - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let n = era * 146_097 + doe - 719_468 + days;
    civil(n)
}

fn civil(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// One agent for the whole run, so requests reuse keep-alive connections instead of opening a new
/// socket each (thousands of bookings would otherwise run the machine out of local ports).
fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).max_idle_connections_per_host(8).build())
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

pub fn post(path: &str, body: &Value) -> (u16, Value) {
    finish(agent().post(&format!("{}{path}", api_url())).set("Content-Type", "application/json").send_string(&body.to_string()))
}

/// One request to the booking API and the response a correct API gives.
#[derive(Clone, Debug)]
pub struct Exchange {
    pub path: String,
    pub request: Value,
    pub status: u16,
    pub response: String,
}

impl Exchange {
    pub fn matches(&self, status: u16, body: &Value) -> bool {
        status == self.status && serde_json::from_str::<Value>(&self.response).is_ok_and(|v| &v == body)
    }
}

/// What a cart should hold and answer, from the recorded fares and payment answers.
pub struct Model<'a> {
    pub fares: &'a BTreeMap<String, Fare>,
    pub cards: &'a [Card],
    pub cart_id: String,
    pub passengers: i64,
    /// Flight number to fare class; adding a flight again replaces its fare class.
    pub lines: BTreeMap<String, String>,
    pub locator: Option<String>,
}

impl<'a> Model<'a> {
    pub fn new(fares: &'a BTreeMap<String, Fare>, cards: &'a [Card], cart_id: &str, passengers: i64) -> Self {
        Model { fares, cards, cart_id: cart_id.to_string(), passengers, lines: BTreeMap::new(), locator: None }
    }

    pub fn line_cents(&self, class: &str) -> i64 {
        let f = &self.fares[class];
        self.passengers * (f.base_cents + f.taxes_cents + BOOKING_FEE_CENTS)
    }

    fn line_json(&self, flight: &str, class: &str) -> String {
        format!(
            "{{\n  \"flightNumber\": {},\n  \"fareClass\": {},\n  \"passengers\": {},\n  \"fareBasis\": {},\n  \"currency\": \"USD\",\n  \"total\": {}\n}}",
            json!(flight),
            json!(class),
            self.passengers,
            json!(self.fares[class].fare_basis),
            money(self.line_cents(class))
        )
    }

    pub fn create_cart(&self) -> Exchange {
        Exchange {
            path: "/api/carts".to_string(),
            request: json!({ "passengers": self.passengers }),
            status: 201,
            response: format!("{{\n  \"cartId\": \"{}\",\n  \"passengers\": {},\n  \"status\": \"OPEN\"\n}}", self.cart_id, self.passengers),
        }
    }

    pub fn add_item(&mut self, flight: &str, class: &str) -> Exchange {
        self.lines.insert(flight.to_string(), class.to_string());
        Exchange {
            path: format!("/api/carts/{}/items", self.cart_id),
            request: json!({ "flightNumber": flight, "fareClass": class }),
            status: 201,
            response: self.line_json(flight, class),
        }
    }

    /// `new_locator` is the record locator the API assigns if this checkout tickets the cart.
    pub fn checkout(&mut self, token: &str, new_locator: &str) -> Exchange {
        let card = self.cards.iter().find(|c| c.token == token).expect("card from the recording");
        let path = format!("/api/carts/{}/checkout", self.cart_id);
        let request = json!({ "cardToken": token });
        let cart = json!(self.cart_id);
        if let Some(locator) = &self.locator {
            let response = format!("{{\n  \"error\": \"cart already ordered\",\n  \"cartId\": {cart},\n  \"recordLocator\": {}\n}}", json!(locator));
            return Exchange { path, request, status: 409, response };
        }
        if !card.approved {
            let response = format!("{{\n  \"error\": \"payment declined\",\n  \"cartId\": {cart},\n  \"reason\": {}\n}}", json!(card.reason));
            return Exchange { path, request, status: 402, response };
        }
        self.locator = Some(new_locator.to_string());
        let lines: Vec<String> = self.lines.iter().map(|(f, c)| self.line_json(f, c).replace('\n', "\n    ")).collect();
        let total: i64 = self.lines.values().map(|c| self.line_cents(c)).sum();
        let response = format!(
            "{{\n  \"recordLocator\": {},\n  \"cartId\": {cart},\n  \"status\": \"TICKETED\",\n  \"passengers\": {},\n  \"lines\": [\n    {}\n  ],\n  \"total\": {},\n  \"currency\": \"USD\",\n  \"authorizationId\": {}\n}}",
            json!(new_locator),
            self.passengers,
            lines.join(",\n    "),
            money(total),
            json!(card.authorization_id)
        );
        Exchange { path, request, status: 201, response }
    }
}

/// Writes the exchanges as a proxymock test of inbound requests with the responses a correct API
/// gives. Replay it against an empty Redis with the partner mocks running.
pub fn write_regression(exchanges: &[Exchange]) -> PathBuf {
    let out = regressions_dir().join("localhost");
    let _ = fs::remove_dir_all(regressions_dir());
    fs::create_dir_all(&out).expect("create regressions dir");
    let start = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_micros();
    for (i, x) in exchanges.iter().enumerate() {
        let tpl = template(|md| {
            let line = md.lines().nth(2).unwrap_or("");
            let same_route = line.starts_with("POST ") && line.ends_with(&format!("{} HTTP/1.1", route_suffix(&x.path)));
            same_route && md.contains(&format!("\nHTTP/1.1 {} ", x.status))
        });
        let t = start + i as u128 * 1_000;
        let ts = format!("{}.{:06}Z", iso8601((t / 1_000_000) as u64).trim_end_matches('Z'), t % 1_000_000);
        let old_path = tpl.lines().nth(2).and_then(|l| l.split_whitespace().nth(1)).unwrap().trim_start_matches("http://localhost:8090").to_string();
        let md = rewrite(&tpl, (&old_path, &x.path), &x.request, &x.response, &ts, i);
        fs::write(out.join(format!("{}.md", ts.replace(':', "-").replace('T', "_"))), md).expect("write regression rrpair");
    }
    fs::canonicalize(regressions_dir()).unwrap_or_else(|_| regressions_dir())
}

/// The last path segment, which names the operation: `carts`, `items` or `checkout`.
fn route_suffix(path: &str) -> String {
    format!("/{}", path.rsplit('/').next().unwrap_or(""))
}

fn template(pick: impl Fn(&str) -> bool) -> String {
    rrpairs("localhost").into_iter().find(|md| pick(md)).unwrap_or_else(|| panic!("no matching template RRPair in the recording"))
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
fn rewrite(tpl: &str, (old, new): (&str, &str), req_body: &Value, res_body: &str, ts: &str, seq: usize) -> String {
    let swap = |s: &str| s.replace(old, new);
    let compact = req_body.to_string();

    let (req_part, rest) = tpl.split_once("### RESPONSE ###").unwrap();
    let req_part = replace_json_block(&swap(req_part), &serde_json::to_string_pretty(req_body).unwrap());
    let (res_part, after_res) = rest.split_once("### SIGNATURE ###").unwrap();
    let res_part = replace_json_block(res_part, res_body);
    let (sig, meta) = after_res.split_once("### METADATA ###").unwrap();
    let sig = sig
        .lines()
        .map(|l| if l.starts_with("http:requestBodyJSON is ") { format!("http:requestBodyJSON is {compact}") } else { swap(l) })
        .collect::<Vec<_>>()
        .join("\n");

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let uuid_bytes: [u8; 16] = std::array::from_fn(|i| ((now.as_nanos() >> (i * 5)) as u8) ^ (i as u8).wrapping_mul(31) ^ seq as u8);
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
    j["signature"]["http:url"] = b64(new.as_bytes()).into();
    j["signature"]["http:requestBodyJSON"] = b64(compact.as_bytes()).into();

    format!(
        "{req_part}### RESPONSE ###{res_part}### SIGNATURE ###{sig}### METADATA ###{meta_md}### INTERNAL - DO NOT MODIFY ###\n```\njson: {j}\n```\n<!-- speedscale rrpair markdown v2.1 -->\n"
    )
}

fn iso8601(secs: u64) -> String {
    let rem = secs % 86_400;
    format!("{}T{:02}:{:02}:{:02}Z", civil((secs / 86_400) as i64), rem / 3_600, rem % 3_600 / 60, rem % 60)
}
