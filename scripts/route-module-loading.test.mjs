import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/app/discovery-app.js', import.meta.url), 'utf8');
const start = source.indexOf('  const bootPath =');
const end = source.indexOf("  document.querySelector('[data-discovery-features-trigger]')", start);
assert.ok(start > 0 && end > start);
function boot(known) {
  let ready, registered = known;
  const modules = new Promise(resolve => { ready = resolve; });
  const entries = [], timers = [];
  vm.runInNewContext(source.slice(start, end), {
    window: { DiscoveryRouteModulesReady: modules },
    location: { pathname: '/matches/1283321925', search: '', hash: '' },
    document: { readyState: 'complete' }, initialDocument: false,
    resolve: () => registered, navigate: path => entries.push(path),
    setTimeout: fn => timers.push(fn),
  });
  timers.forEach(fn => fn());
  return { entries, ready: () => { registered = true; ready(); } };
}
test('a registered match paints before deferred route modules settle', async () => {
  const app = boot(true);
  assert.deepEqual(app.entries, ['/matches/1283321925']);
  app.ready(); await Promise.resolve();
  assert.equal(app.entries.length, 1);
});
test('a route owned by a deferred module waits for registration', async () => {
  const app = boot(false);
  assert.deepEqual(app.entries, []);
  app.ready(); await Promise.resolve();
  assert.deepEqual(app.entries, ['/matches/1283321925']);
});
