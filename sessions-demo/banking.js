// Opt-in load-plan fixture. Authentication is provided by sessions-demo's real
// JWT helpers; the work pool and ledger stay real in both dependency modes.
const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');

function integer(value, fallback, min, max, name) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`invalid ${name}`);
  return n;
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 65536) throw Object.assign(new Error('body_too_large'), { status: 413 });
  }
  try {
    const parsed = JSON.parse(data || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected object');
    return parsed;
  }
  catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

class WorkPool {
  constructor(name, capacity, maxQueue, emit) {
    Object.assign(this, { name, capacity, maxQueue, emit });
    this.active = 0;
    this.queue = [];
    this.peak = 0;
  }

  async run(context, signal, work) {
    const queuedAt = performance.now();
    if (signal.aborted) throw signal.reason;
    if (this.active >= this.capacity) {
      if (this.queue.length >= this.maxQueue) throw Object.assign(new Error('capacity_exhausted'), { status: 503 });
      this.emit({ type: 'resource-queued', pool: this.name, ...context });
      await new Promise((resolve, reject) => {
        const entry = { resolve: () => { signal.removeEventListener('abort', cancel); resolve(); } };
        const cancel = () => {
          this.queue.splice(this.queue.indexOf(entry), 1);
          reject(signal.reason);
        };
        signal.addEventListener('abort', cancel, { once: true });
        this.queue.push(entry);
      });
    } else {
      this.active++;
    }
    this.peak = Math.max(this.peak, this.active);
    this.emit({ type: 'resource-start', pool: this.name, waitMs: performance.now() - queuedAt, ...context });
    try {
      if (signal.aborted) throw signal.reason;
      return await work();
    } finally {
      this.emit({ type: 'resource-end', pool: this.name, ...context });
      const next = this.queue.shift();
      if (next) next.resolve(); // transfer this permit without opening a race
      else this.active--;
    }
  }

  snapshot() { return { active: this.active, queued: this.queue.length, peak: this.peak, capacity: this.capacity }; }
}

function createBanking(options, { resolveAuth, signJWT }) {
  if (!options.enabled) return null;
  if (!options.controlToken) throw new Error('BANK_CONTROL_TOKEN is required for the banking test profile');
  const population = integer(options.population, 12, 1, 10000, 'population');
  const slots = integer(options.slots, 2, 1, 100, 'slots');
  const maxQueue = integer(options.maxQueue, 256, 0, 10000, 'maxQueue');
  const journalLimit = integer(options.journalLimit, 100000, 1, 1000000, 'journalLimit');
  const seed = String(options.seed ?? 'bank-v1');
  let settings;
  let events, journalDropped, sequence, inFlight, requests, executions, accounts, actors, sessions;
  let shared, statements;
  function emit(event) {
    if (events.length >= journalLimit) { journalDropped++; return; }
    events.push({ sequence: events.length + 1, timeMs: performance.now(), ...event });
  }
  const id = kind => options.freshIds ? `${kind}-${randomUUID()}` : `${kind}-${++sequence}`;
  const token = (actor, execution) => signJWT({ uid: actor, sub: actor, role: 'customer', jti: execution,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });

  function reset(next = {}) {
    // Validate the whole update before touching state.
    if (next.isolated !== undefined && typeof next.isolated !== 'boolean') throw new Error('invalid isolated');
    const updated = {
      isolated: next.isolated ?? options.isolated ?? false,
      statementWorkMs: integer(next.statementWorkMs, options.statementWorkMs ?? 20, 0, 5000, 'statementWorkMs'),
      postingWorkMs: integer(next.postingWorkMs, options.postingWorkMs ?? 0, 0, 5000, 'postingWorkMs'),
    };
    settings = updated;
    events = []; journalDropped = 0; sequence = 0; inFlight = 0;
    requests = { arrived: 0, completed: 0, failed: 0 };
    sessions = { started: 0, completed: 0, active: 0 };
    executions = new Map(); accounts = new Map(); actors = new Map();
    for (let i = 0; i < population; i++) {
      const username = `bank-${seed}-${i}@example.com`;
      const accountId = options.freshIds ? `account-${randomUUID()}` : `account-${i}`;
      actors.set(username, { username, password: 'loadtest', accountId, persona: i % 3 === 0 ? 'writer' : 'reader' });
      accounts.set(accountId, { id: accountId, owner: username, balanceCents: 100000, transactions: new Map() });
    }
    shared = new WorkPool('shared', slots, maxQueue, emit);
    statements = new WorkPool('statements', slots, maxQueue, emit);
  }
  reset();

  async function handle(req, res, path) {
    if (path.startsWith('/bank/testing/')) {
      if (req.headers['x-bank-control'] !== options.controlToken) return send(res, 403, { error: 'control_token_required' });
      if (req.method === 'GET' && path === '/bank/testing/fixtures') {
        return send(res, 200, { seed, actors: [...actors.values()].map(actor => ({ ...actor, token: token(actor.username, 'prepared') })) });
      }
      if (req.method === 'GET' && path === '/bank/testing/journal') {
        return send(res, 200, { seed, settings, events, journalDropped, requests, sessions,
          resources: { shared: shared.snapshot(), statements: statements.snapshot() } });
      }
      if (req.method === 'POST' && path === '/bank/testing/reset') {
        const next = await body(req);
        if (inFlight) return send(res, 409, { error: 'work_in_flight' });
        try { reset(next); } catch (error) { return send(res, 400, { error: error.message }); }
        return send(res, 200, { reset: true, seed, settings });
      }
      return send(res, 404, { error: 'not_found' });
    }

    const requestId = id('request');
    const abort = new AbortController();
    const onClose = () => { if (!res.writableFinished) abort.abort(new Error('client_disconnected')); };
    res.on('close', onClose);
    const context = { requestId, method: req.method, path };
    requests.arrived++; inFlight++;
    emit({ type: 'request-start', ...context });
    try {
      if (req.method === 'POST' && path === '/bank/login') {
        const credentials = await body(req);
        const actor = actors.get(credentials.username);
        if (!actor || credentials.password !== actor.password) return send(res, 401, { error: 'invalid_credentials' });
        const executionId = id('execution');
        executions.set(executionId, actor.username);
        Object.assign(context, { actor: actor.username, executionId });
        sessions.started++; sessions.active++;
        emit({ type: 'session-start', ...context });
        return send(res, 200, { access_token: token(actor.username, executionId), executionId });
      }
      const auth = resolveAuth(req);
      if (!auth || !actors.has(auth.identity)) return send(res, 401, { error: 'unauthorized' });
      context.actor = auth.identity;
      const executionId = req.headers['x-bank-execution'];
      if (executionId) {
        if (executions.get(executionId) !== auth.identity) return send(res, 409, { error: 'invalid_execution' });
        context.executionId = executionId;
      }
      if (req.method === 'POST' && path === '/bank/logout') {
        if (!executionId) return send(res, 400, { error: 'execution_required' });
        executions.delete(executionId);
        sessions.completed++; sessions.active--;
        emit({ type: 'session-end', ...context });
        return send(res, 200, { completed: true });
      }
      const own = accounts.get(actors.get(auth.identity).accountId);
      if (req.method === 'GET' && path === '/bank/account') {
        return send(res, 200, { id: own.id, owner: own.owner, balanceCents: own.balanceCents });
      }
      const match = path.match(/^\/bank\/accounts\/([^/]+)\/(statements|transactions)$/);
      if (!match) return send(res, 404, { error: 'not_found' });
      const account = accounts.get(match[1]);
      if (!account) return send(res, 404, { error: 'account_not_found' });
      if (account.owner !== auth.identity) return send(res, 403, { error: 'wrong_owner' });
      if (req.method === 'GET' && match[2] === 'statements') {
        const pool = settings.isolated ? statements : shared;
        const data = await pool.run({ ...context, operation: 'statement' }, abort.signal, async () => {
          await sleep(settings.statementWorkMs, undefined, { signal: abort.signal });
          if (!options.dependencyURL) return { period: '2026-01', entries: [] };
          try {
            const response = await fetch(`${options.dependencyURL}/statement-data?account=${encodeURIComponent(account.id)}`, {
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(2000)]),
            });
            if (!response.ok) throw new Error(`dependency returned ${response.status}`);
            const data = await response.json();
            if (typeof data.period !== 'string' || !Array.isArray(data.entries)) throw new Error('invalid dependency payload');
            return data;
          } catch (error) { throw Object.assign(new Error(`statement_dependency_failed: ${error.message}`), { status: 502 }); }
        });
        return send(res, 200, { accountId: account.id, balanceCents: account.balanceCents, ...data });
      }
      if (req.method === 'POST' && match[2] === 'transactions') {
        const input = await body(req);
        if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0 || Math.abs(input.amountCents) > 1000000 ||
            typeof input.idempotencyKey !== 'string' || !input.idempotencyKey || input.idempotencyKey.length > 128) {
          return send(res, 400, { error: 'invalid_transaction' });
        }
        const result = await shared.run({ ...context, operation: 'posting' }, abort.signal, async () => {
          await sleep(settings.postingWorkMs, undefined, { signal: abort.signal });
          const previous = account.transactions.get(input.idempotencyKey);
          if (previous) return { status: previous.amountCents === input.amountCents ? 200 : 409, data: previous };
          const balance = account.balanceCents + input.amountCents;
          if (!Number.isSafeInteger(balance) || balance < 0) return { status: 409, data: { error: 'invalid_balance' } };
          const transaction = { id: id('transaction'), accountId: account.id, amountCents: input.amountCents, balanceCents: balance };
          account.transactions.set(input.idempotencyKey, transaction);
          account.balanceCents = balance;
          emit({ type: 'transaction', ...context, ...transaction });
          return { status: 201, data: transaction };
        });
        return send(res, result.status, result.data);
      }
      return send(res, 405, { error: 'method_not_allowed' });
    } catch (error) {
      if (!res.destroyed) send(res, error.status || 500, { error: error.message });
    } finally {
      const status = res.destroyed && !res.writableFinished ? 499 : res.statusCode;
      requests.completed++;
      if (status >= 400) requests.failed++;
      emit({ type: 'request-end', ...context, status });
      inFlight--;
      res.removeListener('close', onClose);
    }
  }
  return handle;
}

module.exports = { createBanking };
