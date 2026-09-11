// Real record -> mock dependency validation. No Docker or cloud provisioning.
// PROXYMOCK_BIN can point at a candidate build. Artifacts are retained on failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('./server');
const { drive } = require('./client/banking');

const artifacts = fs.mkdtempSync(path.join(process.env.BANK_ARTIFACTS || os.tmpdir(), 'bank-proxymock-'));
const binary = process.env.PROXYMOCK_BIN || 'proxymock';
const children = new Set();

function start(command, args, name, env = {}) {
  const log = fs.openSync(path.join(artifacts, `${name}.log`), 'w');
  const child = spawn(command, args, { cwd: __dirname, env: { ...process.env, ...env }, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  child.on('error', error => { child.startError = error; });
  child.done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  children.add(child);
  return child;
}

async function stop(child, { alreadyInterrupted = false } = {}) {
  if (!child || !child.pid) return;
  if (!alreadyInterrupted && child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
  let timer;
  const result = await Promise.race([child.done, new Promise(resolve => {
    timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ forced: true }); }, 5000);
  })]);
  clearTimeout(timer);
  if (result.forced) await child.done;
  children.delete(child);
  return result;
}

async function freePorts(count) {
  const sockets = [];
  try {
    for (let i = 0; i < count; i++) {
      const server = net.createServer();
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      sockets.push(server);
    }
    return sockets.map(server => server.address().port);
  } finally { await Promise.all(sockets.map(server => new Promise(resolve => server.close(resolve)))); }
}

async function ready(port, child) {
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`process exited before ready; see ${artifacts}`);
    const connected = await new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.setTimeout(200);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (connected) return;
    if (Date.now() > deadline) throw new Error(`port ${port} did not become ready; see ${artifacts}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function recordingFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? recordingFiles(filename) : entry.name.endsWith('.md') ? [filename] : [];
  });
}

async function recorded(directory, count) {
  const deadline = Date.now() + 10000;
  while (recordingFiles(directory).length < count) {
    if (Date.now() > deadline) throw new Error(`only ${recordingFiles(directory).length}/${count} dependency recordings persisted`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function main({ validateGroups } = {}) {
  const started = performance.now();
  const [dependencyPort, mapPort, outboundPort, inboundPort] = await freePorts(4);
  const target = `127.0.0.1:${dependencyPort}`;
  const mapping = `${mapPort}=http://${target}`;
  const recording = path.join(artifacts, 'recorded');
  fs.writeFileSync(path.join(artifacts, 'provenance.json'), JSON.stringify({
    binary, node: process.version, demoCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim(),
    demoDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: __dirname, encoding: 'utf8' }).trim(),
    proxymockVersion: execFileSync(binary, ['version', '--client'], { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' }).trim(),
    seed: 'bank-v1', population: 12, concurrency: 3, mapping,
  }, null, 2));
  let app;
  try {
    const dependency = start(process.execPath, ['statement-data.js'], 'dependency', { PORT: String(dependencyPort) });
    await ready(dependencyPort, dependency);
    const recorder = start(binary, ['record', '--out', recording, '--out-format', 'markdown', '--map', mapping,
      '--proxy-out-port', String(outboundPort), '--proxy-in-port', String(inboundPort), '--timeout', '1m'], 'record');
    await ready(mapPort, recorder);
    app = createServer({ banking: { enabled: true, controlToken: 'harness-control', dependencyURL: `http://127.0.0.1:${mapPort}` } });
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    const base = `http://127.0.0.1:${app.address().port}`;
    const driverOptions = { base, controlToken: 'harness-control', concurrency: 3 };
    const real = await drive({ ...driverOptions, output: path.join(artifacts, 'real-journal.json') });
    const expectedMocks = real.journal.events.filter(e => e.type === 'resource-end' && e.operation === 'statement').length;
    // Capture persistence is asynchronous relative to the app's HTTP response.
    // Observe all expected fixtures before stopping the recorder.
    await recorded(recording, expectedMocks);
    const recordExit = await stop(recorder);
    assert.ok(!recordExit.forced && (recordExit.code === 0 || recordExit.signal === 'SIGINT'), 'recording must flush cleanly');
    await stop(dependency); // proves the mocked run cannot succeed by passthrough
    const mock = start(binary, ['mock', '--in', recording, '--out', path.join(artifacts, 'mocked'), '--out-format', 'markdown',
      '--no-passthrough', '--map', mapping, '--proxy-out-port', String(outboundPort), '--timeout', process.env.BANK_KEEP_RUNNING === '1' ? '2h' : '5m'], 'mock');
    await ready(mapPort, mock);
    let expectedObserved = 0;
    for (const mode of ['sessions', 'requests', 'mixed']) {
      const result = await drive({ ...driverOptions, mode, output: path.join(artifacts, `mock-${mode}-journal.json`) });
      expectedObserved += result.journal.events.filter(e => e.type === 'resource-end' && e.operation === 'statement').length;
    }
    await recorded(path.join(artifacts, 'mocked'), expectedObserved);
    if (validateGroups) await validateGroups({ base, driverOptions });
    // A new, unrecorded account must fail; missing mocks cannot look like success.
    const missing = await fetch(`http://127.0.0.1:${mapPort}/statement-data?account=never-recorded`);
    assert.equal(missing.status, 404, 'missing mock should fail closed');
    const missingBody = await missing.text();
    const inventory = await fetch(`${base}/bank/testing/fixtures`, { headers: { 'x-bank-control': 'harness-control' } }).then(r => r.json());
    const writer = inventory.actors.find(actor => actor.persona === 'writer');
    // Writers did not request statements while recording, so this account has
    // no dependency fixture. Verify the app exposes that setup failure as 502.
    const appMissing = await fetch(`${base}/bank/accounts/${writer.accountId}/statements`, { headers: { authorization: `Bearer ${writer.token}` } });
    const appMissingBody = await appMissing.json();
    const negativeJournal = await fetch(`${base}/bank/testing/journal`, { headers: { 'x-bank-control': 'harness-control' } }).then(r => r.json());
    fs.writeFileSync(path.join(artifacts, 'missing-mock.json'), JSON.stringify({ mockStatus: missing.status, missingBody,
      appStatus: appMissing.status, appMissingBody, journal: negativeJournal }, null, 2));
    assert.equal(appMissing.status, 502);
    assert.match(appMissingBody.error, /dependency returned 404/);
    assert.equal(negativeJournal.requests.failed, 1);
    // This proxymock version logs fail-closed misses without writing RRPair
    // files for them; retain their independent HTTP/journal evidence above.
    let manualInterrupted = false;
    if (validateGroups && process.env.BANK_KEEP_RUNNING === '1') {
      const manual = { base, artifacts, binary, controlToken: driverOptions.controlToken,
        recording: path.join(artifacts, 'inbound-sessions'), plan: path.join(artifacts, `${({ composition: 'composition-sessions', multiples: 'multiples-sessions', goals: 'goals-session-endpoint', identity: 'identity-rotation' })[process.env.BANK_LOAD_CASES] || 'sessions-rotate'}-plan.json`) };
      fs.writeFileSync(path.join(artifacts, 'manual.json'), JSON.stringify(manual, null, 2));
      console.log(JSON.stringify({ success: true, manual: true, ...manual }));
      console.log('Validation passed. Bank and dependency mock remain running; press Ctrl+C to stop both.');
      // Terminal Ctrl+C also reaches the child mock. Avoid a second SIGINT
      // while it is flushing its artifacts.
      await new Promise(resolve => process.once('SIGINT', () => { manualInterrupted = true; resolve(); }));
    }
    const mockExit = await stop(mock, { alreadyInterrupted: manualInterrupted });
    assert.ok(!mockExit.forced && (mockExit.code === 0 || mockExit.signal === 'SIGINT'), 'mock observations must flush cleanly');
    const result = { success: true, elapsedMs: performance.now() - started, artifacts };
    fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    if (app) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
    for (const child of children) await stop(child);
  }
}

if (require.main === module) main().catch(error => {
  fs.writeFileSync(path.join(artifacts, 'failure.txt'), error.stack || String(error));
  console.error(`Banking validation failed. Artifacts: ${artifacts}\n${error.stack}`);
  process.exitCode = 1;
});

module.exports = { main, start, stop, freePorts, ready, artifacts, binary };
