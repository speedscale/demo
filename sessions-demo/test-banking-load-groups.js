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
  assert.ok(['all', 'composition', 'multiples', 'goals', 'identity', 'synthesis'].includes(profile), 'BANK_LOAD_CASES must be all, composition, multiples, goals, identity or synthesis');
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

  if (profile === 'all' || profile === 'composition') {
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
  if (profile === 'all' || profile === 'multiples') {
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
  if (profile === 'all' || profile === 'synthesis') {
    const mapped = plan([arrival('writers-one', '/transactions', true, 2, 2), arrival('writers-two', '/transactions', true, 2, 2)]);
    mapped.loadGroups.forEach(g => {
      g.population.size = 2;
      g.population.identityFields = [{ name: 'bank_username', pattern: 'bank-bank-v1-{n}@example.com' }];
      g.identityVerification = {};
    });
    const input = path.join(artifacts, 'inbound-synthesis');
    fs.cpSync(sessions, input, { recursive: true });
    const metadata = path.join(input, '.metadata', 'snapshot.json');
    const original = fs.readFileSync(metadata, 'utf8');
    const prepared = JSON.parse(original);
    prepared.tokenizerConfig.generator.push(
      chain('/bank/login', { type: 'http_req_body' }, [{ type: 'json_path', config: { path: 'username' } }, { type: 'var_load', config: { name: 'bank_username' } }]),
      { ...chain('/bank/account', { type: 'http_res_body' }, [{ type: 'json_path', config: { path: 'id' } }, { type: 'var_store', config: { name: 'bank_account' } }]),
        filters: { filters: [{ include: true, operator: 'EQUAL', optUrl: '/bank/account' }] } },
      chain('/bank/accounts/', { type: 'http_url', config: { index: '2' } }, [{ type: 'var_load', config: { name: 'bank_account' } }]),
    );
    const preparedJSON = JSON.stringify(prepared);
    try {
      fs.writeFileSync(metadata, preparedJSON);
      for (const name of ['synthesis-rotation', 'synthesis-repeat']) {
        const result = await replay(name, input, mapped);
        checkDelivery(result, [4, 4]);
        assert.deepEqual(result.summary.groups.map(g => g.identity.verified), [4, 4]);
        assert.equal(result.journal.requests.completed, 48);
        assert.equal(result.journal.sessions.completed, 8);
        const starts = result.journal.events.filter(e => e.type === 'session-start');
        assert.deepEqual([...new Set(starts.map(e => e.actor))].sort(), [0, 1, 2, 3].map(n => `bank-bank-v1-${n}@example.com`));
        assert.equal(new Set(starts.map(e => e.executionId)).size, 8);
        assert.equal(result.journal.events.filter(e => e.type === 'transaction').length, 4);
        assert.ok(result.summary.groups.every(g => Object.values(g.identity.sources).every(source => source.verified === 2)));
      }
      const colliding = structuredClone(mapped);
      colliding.loadGroups.forEach(g => { g.population.identityFields[0].pattern = 'bank-bank-v1-0@example.com'; });
      const collision = await replay('synthesis-collision', input, colliding, false);
      checkDelivery(collision, [4, 4]);
      assert.equal(collision.journal.requests.failed, 0);
      assert.equal(collision.journal.sessions.completed, 8);
      assert.ok(collision.summary.groups.every(g => g.identity.verified === 0 && g.identity.collidingSources === 2));
      const absent = structuredClone(mapped);
      absent.loadGroups.forEach(g => { g.population.identityFields[0].pattern = 'unprovisioned-{n}@example.com'; });
      const missing = await replay('synthesis-missing-account', input, absent, false);
      checkDelivery(missing, [4, 4]);
      assert.equal(missing.journal.sessions.started, 0);
      assert.ok(missing.summary.groups.every(g => g.identity.authFailures > 0 && g.identity.verified === 0));
      // Remove only account-path correlation. Auth remains real and succeeds,
      // but recorded account IDs must fail ownership for remapped actors.
      prepared.tokenizerConfig.generator.pop();
      fs.writeFileSync(metadata, JSON.stringify(prepared));
      const stale = await replay('synthesis-stale-account', input, mapped, false);
      checkDelivery(stale, [4, 4]);
      assert.ok(stale.journal.events.some(e => e.type === 'request-end' && e.status === 403));
      assert.ok(stale.summary.groups.some(g => g.failedRequests > 0));
    } finally { fs.writeFileSync(metadata, preparedJSON); }
    const invalid = structuredClone(mapped);
    invalid.loadGroups[0].population.identityFields[0].name = 'session_index';
    await rejectBeforeTraffic('synthesis-reserved-variable', invalid, /reserved for runtime metadata/);
    invalid.loadGroups[0].population.identityFields[0].name = 'bank_username';
    invalid.loadGroups[0].population.identityFields[0].pattern = 'bank-{slot}@example.com';
    await rejectBeforeTraffic('synthesis-unknown-placeholder', invalid, /unknown or malformed placeholder/);
  }
  if (profile === 'all' || profile === 'identity') {
    const audited = plan([arrival('readers', '/statements', true, 8, 3), arrival('writers', '/transactions', true, 4, 2)]);
    audited.loadGroups.forEach(g => { g.identityVerification = {}; });
    const success = await replay('identity-rotation', sessions, audited);
    checkDelivery(success, [16, 8]);
    assert.deepEqual(success.summary.groups.map(g => g.identity.verified), [16, 8]);
    assert.ok(success.summary.groups.every(g => g.identity.status === 'PASS'));
    assert.equal(success.journal.sessions.completed, 24);
    const starts = success.journal.events.filter(e => e.type === 'session-start');
    assert.equal(new Set(starts.map(e => e.actor)).size, 12);
    assert.equal(new Set(starts.map(e => e.executionId)).size, 24);
    assert.ok(success.summary.groups.every(g => Object.values(g.identity.sources).every(s => s.verified === 2 && !s.collision)));
    // These claims come from real app-issued JWTs. Changing the verification
    // claim makes deliberately invalid uniqueness goals without bypassing auth.
    for (const [claim, name] of [['role', 'collision'], ['not_a_claim', 'missing'], ['jti', 'changing']]) {
      const config = structuredClone(audited);
      config.loadGroups.forEach(g => { g.identityVerification.jwtClaim = claim; });
      const failed = await replay(`identity-${name}`, sessions, config, false);
      checkDelivery(failed, [16, 8]);
      assert.equal(failed.journal.requests.failed, 0);
      assert.equal(failed.journal.sessions.completed, 24);
      assert.match(failed.summary.error, /identity verification failed/);
      for (const g of failed.summary.groups) {
        assert.equal(g.identity.status, 'FAIL');
        assert.ok(g.identity.failures.length <= 16);
        if (name === 'collision') { assert.equal(g.identity.collidingSources, g.population); assert.equal(g.identity.verified, 0); }
        if (name === 'missing') assert.equal(g.identity.missingIdentity, g.started);
        if (name === 'changing') { assert.equal(g.identity.changedIdentity, g.started - g.population); assert.equal(g.identity.verified, g.population); }
      }
    }
    const metadata = path.join(sessions, '.metadata', 'snapshot.json');
    const original = fs.readFileSync(metadata, 'utf8');
    try {
      const corrupted = JSON.parse(original);
      corrupted.tokenizerConfig.generator.push(...['/bank/account', '/bank/logout'].map(url =>
        chain(url, { type: 'http_req_header', config: { name: 'Authorization' } }, [{ type: 'constant', config: { new: 'Bearer invalid' } }])));
      fs.writeFileSync(metadata, JSON.stringify(corrupted));
      const rejected = await replay('identity-auth-failure', sessions, audited, false);
      assert.ok(rejected.journal.requests.failed > 0);
      assert.equal(rejected.journal.sessions.completed, 0);
      assert.ok(rejected.summary.groups.every(g => g.identity.status === 'FAIL' && g.identity.authFailures > 0 && g.identity.verified === 0));
    } finally { fs.writeFileSync(metadata, original); }
    const invalid = plan([arrival('requests', '/statements', false, 1, 1)]);
    invalid.loadGroups[0].identityVerification = {};
    await rejectBeforeTraffic('identity-invalid-request-mode', invalid, /identity verification requires session selection/);
  }
  if (profile === 'all' || profile === 'goals') {
    const goal = (id, url, value, window = {}) => ({ id, scope: scope(url), minSamples: '1',
      rule: { metricName: 'p95Latency', type: 'TOO_HIGH', action: 'ALERT', value }, ...window });
    const measured = plan([
      arrival('statement-pressure', '/statements', false, 30, 40, '2s'),
      arrival('posting-probe', '/transactions', false, 10, 20, '4s'),
    ]);
    measured.loadGroups[0].stages = [
      { duration: '0.5s', arrivals: { rate: 0 } }, { duration: '2s', arrivals: { rate: 30 } },
      { duration: '1.5s', arrivals: { rate: 0 } },
    ];
    measured.loadGroups[1].goals = [
      goal('baseline', '/transactions', 100, { startAfter: '0s', endAfter: '0.4s', minSamples: '3' }),
      goal('pressure', '/transactions', 100, { startAfter: '0.75s', endAfter: '2.5s', minSamples: '12' }),
      goal('recovery', '/transactions', 100, { startAfter: '3.6s', endAfter: '4s', minSamples: '3' }),
    ];
    const shared = await replay('goals-shared-pressure', requests, measured, false, { statementWorkMs: 100, postingWorkMs: 1 });
    checkDelivery(shared, [60, 40]);
    assert.equal(shared.journal.requests.failed, 0);
    assert.ok(shared.summary.groups.every(g => g.failed === 0 && g.completed === g.started));
    assert.match(shared.summary.error, /goal pressure failed: threshold/);
    assert.doesNotMatch(shared.summary.error, /missed|execution failed/);
    assert.deepEqual(shared.summary.groups[1].goals.map(g => g.status), ['PASS', 'FAIL', 'PASS']);
    const isolated = await replay('goals-isolated-pressure', requests, measured, true, { isolated: true, statementWorkMs: 100, postingWorkMs: 1 });
    checkDelivery(isolated, [60, 40]);
    assert.ok(isolated.summary.groups[1].goals.every(g => g.status === 'PASS'));
    const waits = result => result.journal.events.filter(e => e.type === 'resource-start' && e.operation === 'posting').map(e => e.waitMs);
    assert.ok(Math.max(...waits(shared)) > 100, 'bank queue independently confirms posting contention');
    assert.ok(Math.max(...waits(isolated)) < 100, 'isolated pool removes posting contention');
    for (const result of [shared, isolated]) {
      assert.equal(result.summary.groups.reduce((n, g) => n + g.response.samples, 0), result.journal.requests.completed);
      assert.ok(result.summary.groups.every(g => g.response.distribution && g.response.failedRequests === 0));
    }
    const journeys = plan([
      arrival('readers', '/statements', true, 8, 6), arrival('writers', '/transactions', true, 4, 3),
    ]);
    journeys.loadGroups[1].goals = [goal('posting-within-journey', '/transactions', 500, { minSamples: '16' })];
    const inside = await replay('goals-session-endpoint', sessions, journeys);
    checkDelivery(inside, [16, 8]);
    const posting = inside.summary.groups[1].goals[0];
    assert.equal(posting.status, 'PASS'); assert.equal(posting.response.samples, 16);
    assert.equal(inside.journal.events.filter(e => e.type === 'request-end' && e.path.endsWith('/transactions')).length, 16);
    assert.equal(inside.journal.sessions.completed, 24);
    const missing = plan([arrival('requests', '/statements', false, 4, 4)]);
    missing.loadGroups[0].goals = [goal('absent', '/not-recorded', 100)];
    const absent = await replay('goals-missing-telemetry', requests, missing, false);
    checkDelivery(absent, [8]); assert.equal(absent.journal.requests.failed, 0);
    assert.match(absent.summary.error, /goal absent failed: missing_samples/);
    assert.equal(absent.summary.groups[0].goals[0].response.samples, 0);
    const invalid = structuredClone(missing);
    invalid.loadGroups[0].goals[0].rule.metricName = 'unknown';
    await rejectBeforeTraffic('goals-invalid-metric', invalid, /unsupported load metric/);
  }
  await control('reset', {});
}

main({ validateGroups }).catch(error => {
  write('failure.json', { error: error.stack });
  console.error(`Grouped banking validation failed. Artifacts: ${artifacts}\n${error.stack}`);
  process.exitCode = 1;
});
