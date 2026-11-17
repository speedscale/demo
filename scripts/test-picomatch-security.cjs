const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const projects = ['llm-simulation-demo/frontend', 'scenarios/microservices/gateway'];

for (const project of projects) {
  const lock = require(path.join(root, project, 'package-lock.json'));
  const matchers = Object.keys(lock.packages).filter(name => name.endsWith('/picomatch'));

  test(`${project}: installs a matcher`, () => {
    assert.ok(matchers.length > 0);
  });

  for (const matcher of matchers) {
    test(`${project}/${matcher}: rejects repeated-extglob attacks without blocking`, () => {
      const result = spawnSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const pm = require(process.argv[1]);
        const input = 'a'.repeat(80) + '!';
        for (const pattern of ['+(*)', '*(*)', '+(*a)', '*(*a)', '+(a*)', '*(a*)']) {
          assert.equal(pm.isMatch(input + '.txt', pattern + '.js'), false, pattern);
        }
        assert.equal(pm.isMatch('aaaa', '+(*a)'), true);
        assert.equal(pm.isMatch('aaaa', '*(a*)'), true);
        assert.equal(pm.isMatch('src/app/page.tsx', 'src/**/*.{ts,tsx}'), true);
        assert.equal(pm.isMatch('src/app/page.css', 'src/**/*.{ts,tsx}'), false);
        assert.equal(pm.isMatch('file.jsts', 'file.+(js|ts)'), true);
        assert.equal(pm.isMatch('/node/healthz', '/node/**'), true);
        assert.equal(pm.isMatch('/java/healthz', '/node/**'), false);
      `, path.join(root, project, matcher)], { encoding: 'utf8', timeout: 2000 });

      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
    });
  }
}
