const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createServer } = require('./server');

async function fixture(t, options = {}) {
  const server = createServer({ banking: { enabled: true, controlToken: 'test-control', ...options } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { token, execution, method = 'GET', body, control = false } = {}) {
    const response = await fetch(base + path, { method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(execution ? { 'x-bank-execution': execution } : {}),
      ...(control ? { 'x-bank-control': 'test-control' } : {}),
      'content-type': 'application/json',
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const prepared = await request('/bank/testing/fixtures', { control: true });
  assert.equal(prepared.status, 200);
  return { base, request, actors: prepared.body.actors };
}

async function eventually(fn) {
  const deadline = Date.now() + 3000;
  while (!await fn()) {
    assert.ok(Date.now() < deadline, 'condition was not observed before deadline');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('banking is opt-in and controls require a separate token', async t => {
  const disabled = createServer();
  disabled.listen(0, '127.0.0.1');
  await once(disabled, 'listening');
  t.after(() => { disabled.closeAllConnections(); disabled.close(); });
  const response = await fetch(`http://127.0.0.1:${disabled.address().port}/bank/testing/fixtures`);
  assert.equal(response.status, 404);
  const { request } = await fixture(t);
  assert.equal((await request('/bank/testing/fixtures')).status, 403);
});

test('12 complete sessions retain ownership, dynamic correlation and idempotency', async t => {
  const { request, actors } = await fixture(t);
  assert.equal(actors.length, 12);
  for (const actor of actors) {
    const login = await request('/bank/login', { method: 'POST', body: { username: actor.username, password: actor.password } });
    assert.equal(login.status, 200);
    const auth = { token: login.body.access_token, execution: login.body.executionId };
    const account = await request('/bank/account', auth);
    assert.equal(account.body.owner, actor.username);
    const posting = { ...auth, method: 'POST', body: { amountCents: 125, idempotencyKey: 'posting-1' } };
    const first = await request(`/bank/accounts/${account.body.id}/transactions`, posting);
    const repeat = await request(`/bank/accounts/${account.body.id}/transactions`, posting);
    assert.equal(first.status, 201);
    assert.equal(repeat.status, 200);
    assert.equal(first.body.id, repeat.body.id);
    assert.equal((await request('/bank/account', auth)).body.balanceCents, 100125);
    const wrong = { ...posting, body: { amountCents: 200, idempotencyKey: 'posting-1' } };
    assert.equal((await request(`/bank/accounts/${account.body.id}/transactions`, wrong)).status, 409);
    const foreign = actors.find(other => other.username !== actor.username);
    assert.equal((await request(`/bank/accounts/${account.body.id}/transactions`, { ...posting, token: foreign.token, execution: undefined })).status, 403);
    assert.equal((await request('/bank/logout', { ...auth, method: 'POST', body: {} })).status, 200);
    assert.equal((await request('/bank/account', auth)).status, 409, 'completed execution cannot be reused');
  }
  const stats = (await request('/bank/testing/journal', { control: true })).body;
  assert.equal(stats.sessions.started, 12);
  assert.equal(stats.sessions.completed, 12);
  assert.equal(stats.sessions.active, 0);
  assert.equal(new Set(stats.events.filter(e => e.type === 'session-start').map(e => e.actor)).size, 12);
  assert.equal(stats.journalDropped, 0);
});

test('statement pressure queues posting; isolation and recovery release it', async t => {
  let pending;
  const dependency = http.createServer((req, res) => { pending = res; });
  dependency.listen(0, '127.0.0.1');
  await once(dependency, 'listening');
  t.after(() => { dependency.closeAllConnections(); dependency.close(); });
  const { request, actors } = await fixture(t, { dependencyURL: `http://127.0.0.1:${dependency.address().port}`, slots: 1, statementWorkMs: 0 });
  const actor = actors[0];
  const auth = { token: actor.token };
  for (const isolated of [false, true]) {
    assert.equal((await request('/bank/testing/reset', { control: true, method: 'POST', body: { isolated } })).status, 200);
    pending = undefined;
    const statements = request(`/bank/accounts/${actor.accountId}/statements`, auth);
    await eventually(() => !!pending);
    const posting = request(`/bank/accounts/${actor.accountId}/transactions`, { ...auth, method: 'POST', body: { amountCents: 1, idempotencyKey: 'test' } });
    if (!isolated) {
      await eventually(async () => (await request('/bank/testing/journal', { control: true })).body.resources.shared.queued === 1);
      assert.equal((await request('/bank/testing/reset', { control: true, method: 'POST', body: {} })).status, 409, 'cannot erase evidence during active work');
    } else {
      assert.equal((await posting).status, 201, 'isolated posting finishes while statement dependency is still blocked');
    }
    pending.writeHead(200, { 'content-type': 'application/json' });
    pending.end(JSON.stringify({ period: '2026-01', entries: [] }));
    assert.equal((await statements).status, 200);
    assert.equal((await posting).status, 201);
    const stats = (await request('/bank/testing/journal', { control: true })).body;
    const work = stats.events.filter(e => e.type === 'resource-start');
    assert.equal(work.find(e => e.operation === 'posting').pool, 'shared');
    assert.equal(work.find(e => e.operation === 'statement').pool, isolated ? 'statements' : 'shared');
    assert.equal(stats.resources.shared.active, 0);
    assert.equal((await request('/bank/account', auth)).body.balanceCents, 100001);
  }
});

test('bad credentials and failed dependency never appear as successful work', async t => {
  const { request, actors } = await fixture(t, { dependencyURL: 'http://127.0.0.1:1' });
  assert.equal((await request('/bank/login', { method: 'POST', body: { username: actors[0].username, password: 'wrong' } })).status, 401);
  assert.equal((await request('/bank/account', { token: 'tampered' })).status, 401);
  assert.equal((await request(`/bank/accounts/${actors[0].accountId}/statements`, { token: actors[0].token })).status, 502);
  const stats = (await request('/bank/testing/journal', { control: true })).body;
  assert.equal(stats.sessions.started, 0);
  assert.equal(stats.events.filter(e => e.type === 'request-end' && e.status === 502).length, 1);
  assert.equal(stats.resources.shared.active, 0);
});

test('concurrent retries commit exactly one transaction', async t => {
  const { request, actors } = await fixture(t, { slots: 4 });
  const actor = actors[0];
  const results = await Promise.all(Array.from({ length: 20 }, () => request(`/bank/accounts/${actor.accountId}/transactions`, {
    token: actor.token, method: 'POST', body: { amountCents: 125, idempotencyKey: 'same' },
  })));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 200).length, 19);
  assert.equal(new Set(results.map(r => r.body.id)).size, 1);
  assert.equal((await request('/bank/account', { token: actor.token })).body.balanceCents, 100125);
});

test('pool overflow fails and cancelled queued work cannot commit', async t => {
  let pending;
  const dependency = http.createServer((req, res) => { pending = res; });
  dependency.listen(0, '127.0.0.1');
  await once(dependency, 'listening');
  t.after(() => { dependency.closeAllConnections(); dependency.close(); });
  const { base, request, actors } = await fixture(t, { slots: 1, maxQueue: 1, statementWorkMs: 0,
    dependencyURL: `http://127.0.0.1:${dependency.address().port}` });
  const actor = actors[0];
  const statement = request(`/bank/accounts/${actor.accountId}/statements`, { token: actor.token });
  await eventually(() => !!pending);
  const controller = new AbortController();
  const posting = fetch(`${base}/bank/accounts/${actor.accountId}/transactions`, {
    method: 'POST', headers: { authorization: `Bearer ${actor.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amountCents: 125, idempotencyKey: 'cancelled' }), signal: controller.signal,
  }).catch(error => error);
  await eventually(async () => (await request('/bank/testing/journal', { control: true })).body.resources.shared.queued === 1);
  const overflow = await request(`/bank/accounts/${actor.accountId}/transactions`, {
    token: actor.token, method: 'POST', body: { amountCents: 125, idempotencyKey: 'overflow' },
  });
  assert.equal(overflow.status, 503);
  controller.abort();
  await posting;
  await eventually(async () => (await request('/bank/testing/journal', { control: true })).body.resources.shared.queued === 0);
  pending.writeHead(200, { 'content-type': 'application/json' });
  pending.end(JSON.stringify({ period: '2026-01', entries: [] }));
  assert.equal((await statement).status, 200);
  assert.equal((await request('/bank/account', { token: actor.token })).body.balanceCents, 100000);
});
