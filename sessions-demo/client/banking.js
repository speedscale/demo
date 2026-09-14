// Fixture driver, not the load scheduler under test. Use its recorded journeys
// as generator/proxymock input. Controls bypass the recording proxy via CONTROL_BASE.
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function drive(options = {}) {
  const base = options.base || process.env.BASE || 'http://localhost:3000';
  const controlBase = options.controlBase || process.env.CONTROL_BASE || base;
  const controlToken = options.controlToken || process.env.BANK_CONTROL_TOKEN;
  const concurrency = Number(options.concurrency || process.env.CONCURRENCY || 3);
  const mode = options.mode || process.env.BANK_MODE || 'sessions';
  if (!controlToken) throw new Error('BANK_CONTROL_TOKEN is required');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('invalid CONCURRENCY');
  if (!['sessions', 'requests', 'mixed'].includes(mode)) throw new Error('BANK_MODE must be sessions, requests or mixed');
  async function request(path, { control = false, token, executionId, body } = {}) {
    const response = await fetch((control ? controlBase : base) + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json',
        ...(control ? { 'x-bank-control': controlToken } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(executionId ? { 'x-bank-execution': executionId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`);
    return result;
  }
  await request('/bank/testing/reset', { control: true, body: {} });
  const { actors, seed } = await request('/bank/testing/fixtures', { control: true });
  const started = performance.now();
  let next = 0;
  let expectedSessions = 0;
  const workers = Array.from({ length: Math.min(concurrency, actors.length) }, async () => {
    while (next < actors.length) {
      const index = next++;
      const actor = actors[index];
      const sessionized = mode === 'sessions' || (mode === 'mixed' && index % 2 === 0);
      let auth = { token: actor.token };
      if (sessionized) {
        expectedSessions++;
        const login = await request('/bank/login', { body: { username: actor.username, password: actor.password } });
        auth = { token: login.access_token, executionId: login.executionId };
      }
      // Use returned IDs/tokens, never substitute another actor's correlation.
      const account = await request('/bank/account', auth);
      assert.equal(account.owner, actor.username);
      if (actor.persona === 'reader') {
        const repetitions = index % 2 === 0 ? 2 : 1;
        for (let n = 0; n < repetitions; n++) await request(`/bank/accounts/${account.id}/statements`, auth);
      } else {
        const input = { ...auth, body: { amountCents: 125, idempotencyKey: `banking-${index}` } };
        const first = await request(`/bank/accounts/${account.id}/transactions`, input);
        const repeat = await request(`/bank/accounts/${account.id}/transactions`, input);
        assert.equal(first.id, repeat.id);
        assert.equal((await request('/bank/account', auth)).balanceCents, 100125);
      }
      if (sessionized) await request('/bank/logout', { ...auth, body: {} });
    }
  });
  // Real anonymous traffic for the unmatched/background selection cases.
  const outcomes = await Promise.allSettled([...workers, fetch(`${base}/health`).then(r => assert.equal(r.status, 200))]);
  const journal = await request('/bank/testing/journal', { control: true });
  const result = { mode, seed, actors: actors.length, concurrency, sessions: expectedSessions,
    elapsedMs: performance.now() - started, journal };
  if (options.output || process.env.BANK_JOURNAL) fs.writeFileSync(options.output || process.env.BANK_JOURNAL, JSON.stringify(result, null, 2));
  for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
  assert.equal(journal.journalDropped, 0, 'journal overflow invalidates coverage evidence');
  assert.equal(journal.requests.failed, 0);
  assert.equal(journal.requests.arrived, journal.requests.completed);
  assert.equal(journal.sessions.started, expectedSessions);
  assert.equal(journal.sessions.completed, expectedSessions);
  assert.equal(journal.sessions.active, 0);
  const seen = new Set(journal.events.filter(e => e.type === 'request-end' && e.actor).map(e => e.actor));
  assert.equal(seen.size, actors.length, 'every source actor must reach the app');
  for (const actor of actors.filter(a => a.persona === 'writer')) {
    assert.equal(journal.events.filter(e => e.type === 'transaction' && e.actor === actor.username).length, 1);
  }
  return result;
}

if (require.main === module) {
  drive().then(({ journal, ...result }) => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { drive };
