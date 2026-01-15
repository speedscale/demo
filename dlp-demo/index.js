import express from 'express';
import morgan from 'morgan';

const app = express();
app.use(express.json());
app.use(morgan('tiny'));

const port = process.env.PORT || 3001;

const dlpSamples = {
  email: 'ava.sullivan@example.com',
  ssn: '123-45-6789',
  creditCard: '4111 1111 1111 1111',
  uuid: 'c0a8012e-7c5f-4d98-9b02-3b2af96f5df7',
  uuid3: '9073926b-929f-31c2-abc9-fad77ae3e8eb',
  uuid4: '6f1f7e5a-1c9d-4b49-b5ab-7ac4db2f4a0e',
  uuid5: '987fbc97-4bed-5078-9f07-9141ba07c9f3',
  md5: '5d41402abc4b2a76b9719d911017c592',
  sha256: 'f9647f0131cb3a5e7e9d6cc8e0bf7d9e2d507c6d2a7c2e3d9d8f5f7e8c2b1a6f',
  sha512: '1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f5302860c652bf08d560252aa5e74210546f369fbbbce8c12cfc7957b2652fe9a75',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiYXZhLnN1bGxpdmFuQGV4YW1wbGUuY29tIiwiaWF0IjoxNzAwMDAwMDAwfQ.dQw4w9WgXcQy6cX8u5bXG5l1ow9AG3o6Pqkq8E4J9V0',
  datetime: '2024-11-15T14:23:05.123Z',
  phone: '+14155552671',
  ipv4: '192.168.20.15',
  ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  url: 'https://payments.example.com/checkout?cart=9901',
  uri: 'postgres://orders_user:secret@db.internal:5432/orders',
  httpUrl: 'http://internal.example.net/api/v1/status',
  sql: 'SELECT * FROM customers WHERE email = "ava.sullivan@example.com";',
  sqlStatementName: 'user_lookup_stmt',
  sqlPortalName: 'cursor_orders_2024',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7'
};

app.get('/', (req, res) => {
  res.json({
    service: 'dlp-demo',
    message: 'DLP demo service is running',
    ts: new Date().toISOString()
  });
});

app.get('/profile', (req, res) => {
  res.json({
    id: dlpSamples.uuid4,
    name: 'Ava Sullivan',
    email: dlpSamples.email,
    phone: dlpSamples.phone,
    ssn: dlpSamples.ssn,
    created_at: dlpSamples.datetime,
    last_login_ip: dlpSamples.ipv4,
    session_jwt: dlpSamples.jwt
  });
});

app.get('/payment', (req, res) => {
  res.json({
    payment_id: dlpSamples.uuid,
    card: dlpSamples.creditCard,
    amount: 249.95,
    currency: 'USD',
    receipt_url: dlpSamples.url,
    billing_ip: dlpSamples.ipv6,
    processor_trace: {
      trace_id: dlpSamples.traceId,
      span_id: dlpSamples.spanId
    }
  });
});

app.get('/audit', (req, res) => {
  res.json({
    request_id: dlpSamples.uuid5,
    source_uri: dlpSamples.uri,
    http_callback: dlpSamples.httpUrl,
    sql: dlpSamples.sql,
    statement_name: dlpSamples.sqlStatementName,
    portal_name: dlpSamples.sqlPortalName,
    hashes: {
      md5: dlpSamples.md5,
      sha256: dlpSamples.sha256,
      sha512: dlpSamples.sha512
    },
    ts: dlpSamples.datetime
  });
});

app.get('/ids', (req, res) => {
  res.json({
    uuid: dlpSamples.uuid,
    uuid3: dlpSamples.uuid3,
    uuid4: dlpSamples.uuid4,
    uuid5: dlpSamples.uuid5,
    service: 'dlp-demo'
  });
});

app.listen(port, () => {
  console.log(`dlp-demo listening on port ${port}`);
});
