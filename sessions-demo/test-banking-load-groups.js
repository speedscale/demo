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
  const profile = process.env.BANK_LOAD_CASES || 'all';
  assert.ok(['all', 'composition', 'multiples'].includes(profile), 'BANK_LOAD_CASES must be all, composition or multiples');
  write('load-group-profile.json', { profile });
  const arrival = (id, url, sessionized, rate, maxConcurrency, duration = '2s') => ({
    ...group(id, url, sessionized, 1), arrivalPolicy: { maxConcurrency, maxStartLag: '0.1s' },
    stages: [{ duration, arrivals: { rate, ...(sessionized ? { requestDelay: { mode: 'FLAT', requestDelayFlat: '0.01s' } } : {}) } }],
  });
  const checkDelivery = (result, expected) => {
    assert.deepEqual(result.summary.groups.map(g => g.scheduled), expected);
    assert.deepEqual(result.summary.groups.map(g => g.started), expected);
    assert.ok(result.summary.groups.every(g => (g.missed || 0) === 0));
  };
  if (profile === 'all') {
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

    const arrivalPlan = plan([arrival('statement-arrivals', '/statements', false, 30, 20), arrival('posting-arrivals', '/transactions', false, 5, 8)]);
    const invalidSpacing = structuredClone(arrivalPlan);
    invalidSpacing.loadGroups[0].arrivalPolicy.spacing = 'LOAD_ARRIVAL_SPACING_UNKNOWN';
    await rejectBeforeTraffic('unknown-arrival-spacing', invalidSpacing, /arrival spacing/);
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

    const jitter = config => {
      const copy = structuredClone(config);
      copy.loadGroups.forEach(g => { g.arrivalPolicy.spacing = 'LOAD_ARRIVAL_SPACING_JITTERED'; });
      return copy;
    };
    const timing = result => result.summary.groups.map(g => {
      assert.equal(g.arrivalSchedule.version, 'integrated-v1');
      assert.equal(g.arrivalSchedule.spacing, 'LOAD_ARRIVAL_SPACING_JITTERED');
      assert.equal(g.arrivalSchedule.firstStartOffsets.length, Math.min(g.scheduled, 16));
      return g.arrivalSchedule.firstStartOffsets;
    });
    const jitterPlan = jitter(arrivalPlan);
    const jitterFast = await replay('jitter-fast', requests, jitterPlan, true, { statementWorkMs: 1, postingWorkMs: 1 });
    const jitterSlow = await replay('jitter-slow', requests, jitterPlan, true, { statementWorkMs: 75, postingWorkMs: 1 });
    checkDelivery(jitterFast, [60, 10]); checkDelivery(jitterSlow, [60, 10]);
    assert.deepEqual(timing(jitterFast), timing(jitterSlow), 'response speed must not alter seeded planned timing');
    assert.ok(queuedPosting(jitterSlow.journal).length > 0, 'jittered posting still encounters real statement contention');
    jitterPlan.loadSeed = '8';
    const jitterChanged = await replay('jitter-changed-seed', requests, jitterPlan);
    checkDelivery(jitterChanged, [60, 10]);
    timing(jitterChanged).forEach((offsets, i) => assert.notDeepEqual(offsets, timing(jitterFast)[i]));

    const jitterSessionsPlan = jitter(sessionArrivals);
    jitterSessionsPlan.loadGroups.forEach(g => { g.population.reuse = 'LOAD_SESSION_REUSE_ROTATE'; });
    const jitterSessions = await replay('jitter-sessions', sessions, jitterSessionsPlan);
    checkDelivery(jitterSessions, [16, 8]); timing(jitterSessions);
    assert.deepEqual(jitterSessions.summary.groups.map(g => Object.keys(g.sourceExecutions).length), [8, 4]);
    assert.equal(jitterSessions.journal.sessions.completed, 24);

    const jitterOverload = await replay('jitter-overload', requests,
      jitter(plan([arrival('overloaded', '/statements', false, 40, 1, '0.5s')])), false, { statementWorkMs: 150 });
    const dropped = jitterOverload.summary.groups[0];
    timing(jitterOverload);
    assert.ok(dropped.missedCapacity > 0);
    assert.equal(dropped.scheduled, dropped.started + dropped.missed);
    assert.equal(dropped.missed, (dropped.missedCapacity || 0) + (dropped.missedIdentity || 0) + (dropped.missedLate || 0) + (dropped.missedCancelled || 0));
    assert.equal(dropped.failedRequests, 0);
    assert.equal(dropped.requests, jitterOverload.journal.requests.completed);
  }

  if (profile !== 'multiples') {
    const sharedPlan = (sessionized, rate = 25, duration = '2s') => {
      const config = plan([
        arrival('readers', '/statements', sessionized, rate, 20, duration),
        arrival('writers', '/transactions', sessionized, rate, 8, duration),
      ]);
      config.loadArrivalPools = [{ id: 'bank-mix', selection: config.loadGroups[0].selection,
        stages: [{ duration, arrivals: { rate } }] }];
      config.loadGroups.forEach((g, i) => {
        delete g.stages;
        g.arrivalShare = { poolId: 'bank-mix', basisPoints: i === 0 ? 8000 : 2000,
          ...(sessionized ? { requestDelay: { mode: 'FLAT', requestDelayFlat: '0.01s' } } : {}) };
      });
      return config;
    };
    const shares = sharedPlan(false);
    const sharedRequests = await replay('composition-requests', requests, shares, true, { statementWorkMs: 75, postingWorkMs: 1 });
    checkDelivery(sharedRequests, [40, 10]);
    assert.equal(sharedRequests.summary.pools[0].scheduled, 50);
    assert.deepEqual(sharedRequests.summary.groups.map(g => g.allocation.allocated), [40, 10]);
    assert.ok(sharedRequests.summary.groups.every(g => g.allocation.suppressed === 0));

    const budgeted = structuredClone(shares);
    budgeted.loadGroups[0].startBudget = '3'; budgeted.loadGroups[1].startBudget = '4';
    const budget = await replay('composition-budget', requests, budgeted);
    checkDelivery(budget, [3, 4]);
    assert.deepEqual(budget.summary.groups.map(g => g.allocation.suppressed), [37, 6]);
    const standalone = plan([arrival('exact-requests', '/statements', false, 20, 4, '30s')]);
    standalone.loadGroups[0].startBudget = '3';
    checkDelivery(await replay('composition-standalone-budget', requests, standalone), [3]);

    const weighted = await replay('composition-sessions', sessions, sharedPlan(true, 20));
    checkDelivery(weighted, [32, 8]);
    assert.equal(weighted.journal.sessions.started, 40);
    assert.equal(weighted.journal.sessions.completed, 40);
    assert.deepEqual(weighted.summary.groups.map(g => Object.keys(g.sourceExecutions).length), [8, 4]);

    const saturated = sharedPlan(false, 40, '0.5s');
    saturated.loadGroups[0].arrivalPolicy.maxConcurrency = 1;
    const shortfall = await replay('composition-shortfall', requests, saturated, false, { statementWorkMs: 150 });
    const [reader, writer] = shortfall.summary.groups;
    assert.equal(reader.scheduled, 16); assert.ok(reader.missedCapacity > 0);
    assert.equal(reader.scheduled, reader.started + reader.missed);
    assert.equal(writer.scheduled, 4); assert.equal(writer.started, 4);
    assert.equal(writer.missed || 0, 0, 'writer allocation must not absorb reader shortfall');
    assert.equal(shortfall.journal.requests.failed, 0);
    assert.equal(shortfall.journal.requests.completed, reader.requests + writer.requests);

    const badShares = sharedPlan(false);
    badShares.loadGroups[0].arrivalShare.basisPoints = 7000;
    await rejectBeforeTraffic('composition-invalid-shares', badShares, /shares must sum to 10000/);
    standalone.loadGroups[0].startBudget = '1000';
    await rejectBeforeTraffic('composition-impossible-budget', standalone, /budget exceeds available/);
  }
  if (profile !== 'composition') {
    // Enclose actual capture times in an explicit, persisted window. Power-of-two
    // seconds keep exact fixture totals independent of floating-point rounding.
    const baselineFor = input => {
      const times = files(input).map(file => Date.parse(JSON.parse(fs.readFileSync(file)).ts));
      assert.ok(times.length > 0 && times.every(Number.isFinite));
      const start = Math.floor(Math.min(...times) / 1000) * 1000;
      const seconds = 2 ** Math.ceil(Math.log2(Math.max(2, (Math.max(...times) - start + 1) / 1000)));
      return { seconds, window: { start: new Date(start).toISOString(), end: new Date(start + seconds * 1000).toISOString() } };
    };
    const multiplePlan = (input, sessionized) => {
      const { seconds, window } = baselineFor(input);
      const config = plan([
        arrival('statements', '/statements', sessionized, 0, 20, `${seconds}s`),
        arrival('posting', '/transactions', sessionized, 0, 8, `${seconds}s`),
      ]);
      config.loadGroups.forEach((g, i) => {
        g.recordedBaseline = window;
        delete g.stages[0].arrivals.rate;
        g.stages[0].arrivals.recordedMultiple = i === 0 ? 2 : 1;
      });
      return config;
    };
    const requestsAtMultiple = multiplePlan(requests, false);
    const doubled = await replay('multiples-requests', requests, requestsAtMultiple);
    checkDelivery(doubled, [24, 8]);
    assert.deepEqual(doubled.summary.groups.map(g => g.recordedBaseline.starts), [12, 8]);
    const slow = await replay('multiples-requests-slow', requests, requestsAtMultiple, true, { statementWorkMs: 75 });
    checkDelivery(slow, [24, 8]);
    assert.deepEqual(slow.summary.groups.map(g => g.arrivalSchedule), doubled.summary.groups.map(g => g.arrivalSchedule));
    for (const g of doubled.summary.groups) {
      const expected = g.id === 'statements' ? 2 : 1;
      assert.equal(g.recordedBaseline.stages[0].multiple, expected);
      assert.equal(g.recordedBaseline.stages[0].ratePerSecond, g.recordedBaseline.ratePerSecond * expected);
      assert.equal(g.recordedBaseline.unit, 'requests');
    }
    const journeys = await replay('multiples-sessions', sessions, multiplePlan(sessions, true));
    checkDelivery(journeys, [16, 4]);
    assert.deepEqual(journeys.summary.groups.map(g => g.recordedBaseline.starts), [8, 4]);
    assert.ok(journeys.summary.groups.every(g => g.recordedBaseline.unit === 'sessions'));
    assert.equal(journeys.journal.sessions.completed, 20);
    assert.deepEqual(journeys.summary.groups.map(g => Object.keys(g.sourceExecutions).length), [8, 4]);
    const budgeted = structuredClone(requestsAtMultiple);
    budgeted.loadGroups[0].startBudget = '3'; budgeted.loadGroups[1].startBudget = '2';
    checkDelivery(await replay('multiples-budget', requests, budgeted), [3, 2]);
    budgeted.loadGroups[0].startBudget = '1000';
    await rejectBeforeTraffic('multiples-impossible-budget', budgeted, /budget exceeds available/);
    const empty = structuredClone(requestsAtMultiple);
    empty.loadGroups.forEach(g => { g.recordedBaseline = { start: '2000-01-01T00:00:00Z', end: '2000-01-01T00:00:02Z' }; });
    await rejectBeforeTraffic('multiples-empty-baseline', empty, /baseline has no starts/);
    const ambiguous = structuredClone(requestsAtMultiple);
    ambiguous.loadGroups[0].stages[0].arrivals.rate = 10;
    await rejectBeforeTraffic('multiples-conflicting-rate', ambiguous, /cannot use absolute rate/);
  }
  await control('reset', {});
}

main({ validateGroups }).catch(error => {
  write('failure.json', { error: error.stack });
  console.error(`Grouped banking validation failed. Artifacts: ${artifacts}\n${error.stack}`);
  process.exitCode = 1;
});
