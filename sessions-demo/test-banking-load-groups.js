// Runs the actual proxymock replay scheduler against the real bank and a
// fail-closed proxymock dependency. The bank journal is the independent oracle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { main, start, stop, freePorts, ready, artifacts, binary } = require('./test-banking-proxymock');
const { drive } = require('./client/banking');

const write = (name, value) => fs.writeFileSync(path.join(artifacts, name), JSON.stringify(value, null, 2));
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') ? [] :
  e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.json') ? [path.join(dir, e.name)] : []);
const scope = url => ({ operator: 'AND', conditions: [{ operator: 'AND', filters: [{ include: true, operator: 'CONTAINS', optUrl: url }] }] });
const stage = (sessions, count, duration = '1s', rampFor) => ({ duration, ...(rampFor ? { rampFor } : {}),
  [sessions ? 'sessions' : 'virtualUsers']: { [sessions ? 'sessions' : 'virtualUsers']: String(count), requestDelay: { mode: 'FLAT', requestDelayFlat: '0.01s' } } });
const group = (id, url, sessions, count, reuse = 'ROTATE') => ({ id, scope: scope(url),
  selection: `LOAD_SELECTION_${sessions ? 'SESSIONS' : 'REQUESTS'}`,
  ...(sessions ? { population: { reuse: `LOAD_SESSION_REUSE_${reuse}` } } : {}), stages: [stage(sessions, count)] });
const plan = groups => ({ loadSeed: '7', loadUnmatchedPolicy: 'LOAD_UNMATCHED_EXCLUDE', loadDrainTimeout: '5s', loadGroups: groups });

async function validateGroups({ base, driverOptions }) {
  async function control(route, body) {
    const r = await fetch(`${base}/bank/testing/${route}`, { method: body ? 'POST' : 'GET',
      headers: { 'x-bank-control': driverOptions.controlToken, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(r.status, 200);
    return r.json();
  }
  const [inPort, outPort] = await freePorts(2);
  async function capture(mode) {
    const dir = path.join(artifacts, `inbound-${mode}`);
    const recorder = start(binary, ['record', '--app-host', '127.0.0.1', '--app-port', new URL(base).port,
      '--proxy-in-port', String(inPort), '--proxy-out-port', String(outPort), '--out', dir, '--out-format', 'json', '--timeout', '1m'], `record-${mode}`);
    try {
      await ready(inPort, recorder);
      const result = await drive({ ...driverOptions, base: `http://127.0.0.1:${inPort}`, controlBase: base, mode,
        output: path.join(artifacts, `capture-${mode}-journal.json`) });
      const until = Date.now() + 10000;
      while (!fs.existsSync(dir) || files(dir).length < result.journal.requests.completed + 1) {
        if (Date.now() > until) throw new Error('inbound recording did not flush');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally { await stop(recorder); }
    return dir;
  }
  const requests = await capture('requests');
  const sessions = await capture('sessions');
  write('capture-files.json', { requests: files(requests), sessions: files(sessions) });
  // Reuse the stock response-variable transforms. Each actor execution gets
  // its own cache in the generator; no authentication shim is installed.
  const transforms = [];
  const chain = (url, extractor, transforms) => ({ filters: { filters: [{ include: true, operator: 'CONTAINS', optUrl: url }] }, extractor, transforms });
  for (const [field, variable] of [['access_token', 'bank_token'], ['executionId', 'bank_execution']]) {
    transforms.push(chain('/bank/login', { type: 'http_res_body' }, [
      { type: 'json_path', config: { path: field } }, { type: 'var_store', config: { name: variable } }]));
  }
  for (const url of ['/bank/account', '/bank/logout']) {
    transforms.push(chain(url, { type: 'http_req_header', config: { name: 'Authorization' } }, [
      { type: 'constant', config: { new: 'Bearer ${{bank_token}}' } }]));
    transforms.push(chain(url, { type: 'http_req_header', config: { name: 'X-Bank-Execution' } }, [
      { type: 'var_load', config: { name: 'bank_execution' } }]));
  }
  fs.mkdirSync(path.join(sessions, '.metadata'), { recursive: true });
  fs.writeFileSync(path.join(sessions, '.metadata', 'snapshot.json'), JSON.stringify({
    id: '11111111-1111-1111-1111-111111111111', tokenizerConfig: { generator: transforms },
  }, null, 2));

  // Grouped request execution is also a useful first check of capture/compile/
  // runtime/report wiring before session correlation is configured below.
  async function replay(name, input, config, expectedSuccess = true, reset = {}) {
    await control('reset', reset);
    const configPath = path.join(artifacts, `${name}-plan.json`);
    write(`${name}-plan.json`, config);
    const output = path.join(artifacts, name);
    const child = start(binary, ['replay', '--in', input, '--out', output, '--load-plan', configPath, '--test-against', base,
      '--load-test'], name);
    let timer;
    let result;
    try { result = await Promise.race([child.done, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} timed out`)), 45000); })]); }
    finally { clearTimeout(timer); await stop(child); }
    const journal = await control('journal');
    write(`${name}-journal.json`, journal);
    assert.equal(result.code === 0, expectedSuccess, `${name}: see ${name}.log`);
    const summary = JSON.parse(fs.readFileSync(path.join(output, 'load-groups.json')));
    assert.equal(journal.journalDropped, 0);
    if (expectedSuccess) {
      assert.equal(journal.requests.failed, 0);
      assert.equal(journal.requests.arrived, journal.requests.completed);
      assert.equal(journal.sessions.active, 0);
      assert.equal(summary.groups.reduce((n, g) => n + g.requests, 0), journal.requests.completed);
      assert.ok(summary.groups.every(g => g.started > 0 && g.failed === 0 && g.started === g.completed));
    }
    return { summary, journal };
  }
  async function rejectBeforeTraffic(name, config, reason, extra = []) {
    await control('reset', {});
    write(`${name}-plan.json`, config);
    const child = start(binary, ['replay', '--in', requests, '--out', path.join(artifacts, name),
      '--load-plan', path.join(artifacts, `${name}-plan.json`), '--test-against', base, ...extra], name);
    let timer;
    let result;
    try { result = await Promise.race([child.done, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} timed out`)), 30000); })]); }
    finally { clearTimeout(timer); await stop(child); }
    const journal = await control('journal');
    write(`${name}-journal.json`, journal);
    assert.notEqual(result.code, 0);
    assert.match(fs.readFileSync(path.join(artifacts, `${name}.log`), 'utf8'), reason);
    assert.equal(journal.requests.arrived, 0, `${name} must fail before traffic`);
  }
  await rejectBeforeTraffic('no-data', plan([group('empty', '/not-recorded', false, 1)]), /positive load has no eligible data/);
  const tps = group('tps', '/statements', false, 1);
  tps.stages = [{ duration: '1s', targetTps: { tps: 10 } }];
  await rejectBeforeTraffic('unsupported-tps', plan([tps]), /grouped TPS is not supported/);
  await rejectBeforeTraffic('legacy-conflict', plan([group('load', '/statements', false, 1)]), /cannot be combined with --vus/, ['--vus', '1']);
  const overCapacity = plan([group('read-load', '/statements', false, 1), group('write-load', '/transactions', false, 1)]);
  overCapacity.maxVusers = 1;
  await rejectBeforeTraffic('capacity', overCapacity, /capacity/);
  const endpointPlan = plan([group('statements', '/statements', false, 2), group('posting', '/transactions', false, 1)]);
  const endpoints = await replay('endpoint-groups', requests, endpointPlan);
  assert.deepEqual(endpoints.summary.groups.map(g => g.peakConcurrency), [2, 1]);
  const pressure = plan([group('statement-pressure', '/statements', false, 2), group('posting-probe', '/transactions', false, 1)]);
  pressure.loadGroups[0].stages = [stage(false, 0, '0.2s'), stage(false, 2, '0.8s', '0.2s'), stage(false, 0, '0.3s')];
  pressure.loadGroups[1].stages = [stage(false, 1, '1.3s')];
  const shared = await replay('shared-pressure', requests, pressure, true, { statementWorkMs: 75, postingWorkMs: 1 });
  const isolated = await replay('isolated-pressure', requests, pressure, true, { isolated: true, statementWorkMs: 75, postingWorkMs: 1 });
  const queuedPosting = journal => journal.events.filter(e => e.type === 'resource-queued' && e.operation === 'posting');
  assert.ok(queuedPosting(shared.journal).length > 0, 'statement pressure must queue transaction posting in the shared pool');
  assert.equal(queuedPosting(isolated.journal).length, 0, 'the isolated statement pool must protect posting');
  const missingDir = path.join(artifacts, 'missing-dependency-input');
  fs.mkdirSync(missingDir);
  const writer = files(requests).map(file => JSON.parse(fs.readFileSync(file))).find(rr => rr.http.req.url.endsWith('/transactions'));
  writer.http.req.url = writer.http.req.url.replace('/transactions', '/statements');
  writer.http.req.uri = writer.http.req.uri?.replace('/transactions', '/statements');
  writer.http.req.method = 'GET'; writer.command = 'GET';
  delete writer.http.req.bodyBase64;
  delete writer.http.req.headers['Content-Length'];
  delete writer.http.req.headers['content-length'];
  fs.writeFileSync(path.join(missingDir, 'missing.json'), JSON.stringify(writer));
  const missing = await replay('missing-dependency-replay', missingDir, plan([group('missing', '/statements', false, 1)]), false);
  assert.ok(missing.summary.groups[0].failedRequests > 0);
  assert.equal(missing.summary.groups[0].failedRequests, missing.journal.requests.failed);
  assert.ok(missing.journal.events.some(e => e.type === 'request-end' && e.status === 502));
  for (const reuse of ['ROTATE', 'STICKY', 'ONCE']) {
    const config = plan([group('readers', '/statements', true, 2, reuse), group('writers', '/transactions', true, 1, reuse)]);
    config.loadGroups.forEach(g => { g.stages[0].duration = '2s'; });
    const { summary, journal } = await replay(`sessions-${reuse.toLowerCase()}`, sessions, config);
    const expected = reuse === 'STICKY' ? [2, 1] : [8, 4];
    assert.deepEqual(summary.groups.map(g => Object.keys(g.sourceExecutions).length), expected);
    assert.deepEqual(summary.groups.map(g => g.population), [8, 4]);
    assert.equal(journal.sessions.started, summary.groups.reduce((n, g) => n + g.started, 0));
    assert.equal(journal.sessions.started, journal.sessions.completed);
    if (reuse === 'ONCE') assert.equal(journal.sessions.completed, 12);
  }

  const arrival = (id, url, sessionized, rate, maxConcurrency, duration = '2s') => ({
    ...group(id, url, sessionized, 1), arrivalPolicy: { maxConcurrency, maxStartLag: '0.1s' },
    stages: [{ duration, arrivals: { rate, ...(sessionized ? { requestDelay: { mode: 'FLAT', requestDelayFlat: '0.01s' } } : {}) } }],
  });
  const arrivalPlan = plan([arrival('statement-arrivals', '/statements', false, 30, 20), arrival('posting-arrivals', '/transactions', false, 5, 8)]);
  const checkDelivery = (result, expected) => {
    assert.deepEqual(result.summary.groups.map(g => g.scheduled), expected);
    assert.deepEqual(result.summary.groups.map(g => g.started), expected);
    assert.ok(result.summary.groups.every(g => (g.missed || 0) === 0));
  };
  const fastArrivals = await replay('arrivals-fast', requests, arrivalPlan, true, { statementWorkMs: 1, postingWorkMs: 1 });
  const slowArrivals = await replay('arrivals-slow', requests, arrivalPlan, true, { statementWorkMs: 75, postingWorkMs: 1 });
  checkDelivery(fastArrivals, [60, 10]); checkDelivery(slowArrivals, [60, 10]);
  assert.ok(queuedPosting(slowArrivals.journal).length > 0, 'posting still arrives while statements occupy the shared pool');
  const ramped = plan([arrival('ramped-arrivals', '/statements', false, 4, 4)]);
  ramped.loadGroups[0].startAfter = '0.2s';
  ramped.loadGroups[0].stages = [
    { duration: '0.5s', arrivals: { rate: 4 } },
    { duration: '0.25s', arrivals: { rate: 0 } },
    { duration: '1s', rampFor: '0.5s', arrivals: { rate: 8 } },
  ];
  checkDelivery(await replay('arrivals-ramp', requests, ramped), [8]);
  const sessionArrivals = plan([arrival('reader-arrivals', '/statements', true, 8, 3), arrival('writer-arrivals', '/transactions', true, 4, 2)]);
  const sessionRate = await replay('session-arrivals', sessions, sessionArrivals);
  checkDelivery(sessionRate, [16, 8]);
  assert.deepEqual(sessionRate.summary.groups.map(g => Object.keys(g.sourceExecutions).length), [8, 4]);
  assert.equal(sessionRate.journal.sessions.started, 24); assert.equal(sessionRate.journal.sessions.completed, 24);
  sessionArrivals.loadGroups.forEach(g => { g.population.reuse = 'LOAD_SESSION_REUSE_ONCE'; });
  const onceArrivals = await replay('session-arrivals-once', sessions, sessionArrivals);
  checkDelivery(onceArrivals, [8, 4]); assert.equal(onceArrivals.journal.sessions.completed, 12);
  const overload = await replay('arrivals-overload', requests, plan([arrival('overloaded', '/statements', false, 40, 1, '0.5s')]), false,
    { statementWorkMs: 150 });
  assert.ok(overload.summary.groups[0].missedCapacity > 0);
  const occupied = arrival('occupied-identity', '/statements', true, 20, 4, '0.5s');
  occupied.population.size = 1;
  const identity = await replay('arrivals-identity', sessions, plan([occupied]), false, { statementWorkMs: 150 });
  assert.ok(identity.summary.groups[0].missedIdentity > 0);
  assert.equal(identity.summary.groups[0].peakConcurrency, 1);
  for (const result of [overload, identity]) {
    const g = result.summary.groups[0];
    assert.equal(g.scheduled, g.started + g.missed);
    assert.equal(g.missed, (g.missedCapacity || 0) + (g.missedIdentity || 0) + (g.missedLate || 0) + (g.missedCancelled || 0));
    assert.equal(g.failedRequests, 0, 'delivery shortfall must be distinguished from app errors');
    assert.equal(g.requests, result.journal.requests.completed);
    assert.equal(result.journal.requests.failed, 0);
    assert.equal(result.journal.sessions.active, 0);
  }
  await control('reset', {});
}

main({ validateGroups }).catch(error => {
  write('failure.json', { error: error.stack });
  console.error(`Grouped banking validation failed. Artifacts: ${artifacts}\n${error.stack}`);
  process.exitCode = 1;
});
