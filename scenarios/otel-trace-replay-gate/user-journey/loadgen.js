// Drives realistic checkout traffic for a handful of named customers so
// that filtering proxymock-web down to ONE email isolates that person's
// journey across all four services.
//
//   GATEWAY_URL   where to send /checkout (default proxymock inbound :4143)
//   COUNT         number of checkouts to drive (default 40)
//   CONCURRENCY   parallel workers (default 8)

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4143';
const COUNT = Number(process.env.COUNT || 40);
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);

// The hero of the video is ada.lovelace@example.com — the rest are noise
// that a single Full Text filter has to cut through.
const USERS = [
  'ada.lovelace@example.com',
  'grace.hopper@example.com',
  'alan.turing@example.com',
  'katherine.johnson@example.com',
  'margaret.hamilton@example.com',
];

const CATALOG = [
  { sku: 'kbd-01', price: 79.0 },
  { sku: 'mouse-02', price: 39.5 },
  { sku: 'monitor-03', price: 219.0 },
  { sku: 'dock-04', price: 129.0 },
];

const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const traceparent = () => `00-${hex(32)}-${hex(16)}-01`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function checkout(i) {
  const email = pick(USERS);
  const cart = [pick(CATALOG), pick(CATALOG)];
  try {
    const res = await fetch(`${GATEWAY_URL}/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-email': email,
        'traceparent': traceparent(),
      },
      body: JSON.stringify({ email, cart }),
    });
    const body = await res.json();
    console.log(`#${i} ${res.status} ${email} -> ${body.orderId || 'ERR'}`);
  } catch (err) {
    console.log(`#${i} FAIL ${email} ${err.message}`);
  }
}

async function main() {
  let next = 0;
  const worker = async () => {
    while (next < COUNT) {
      const i = next++;
      await checkout(i);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`done: ${COUNT} checkouts against ${GATEWAY_URL}`);
}

main();
