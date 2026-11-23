import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const read = name => readFileSync(new URL(`../public/app/${name}.js`, import.meta.url), 'utf8');

function transport(respond) {
  const base = new URL('https://fixture.test/');
  const calls = [], deadlines = [], waits = [];
  const window = {
    fetch(input, options) {
      calls.push({ input, options });
      return respond(options, calls.length);
    },
    addEventListener() {},
  };
  const stack = { querySelector: () => null };
  const document = {
    cookie: '',
    querySelector: selector => selector === '.page-view-stack' ? stack : selector === '.dashboard-shell' ? {} : null,
    addEventListener() {},
  };
  const context = createContext({
    window, document, location: base, URL, Request, Headers, FormData, TypeError,
    MutationObserver: class { observe() {} },
    fetch: (input, options) => window.fetch(input, options),
    AbortSignal: {
      any: AbortSignal.any,
      timeout(ms) {
        const controller = new AbortController();
        deadlines.push({ ms, expire: () => controller.abort(new DOMException('Timed out', 'TimeoutError')) });
        return controller.signal;
      },
    },
    setTimeout: (callback, ms) => waits.push({ callback, ms }) - 1,
    clearTimeout: id => { waits[id].cancelled = true; },
  });
  runInContext(read('discovery-api'), context);
  runInContext(read('discovery-app'), context);
  return { window, calls, deadlines, waits, request: window.DiscoveryApp.request };
}

function stalledBody({ signal }) {
  return new Response(new ReadableStream({ start(controller) {
    signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
  } }));
}

test('dashboard shared request retries a stalled body and preserves the original filter', async () => {
  const h = transport((options, attempt) => attempt === 1 ? stalledBody(options) : Response.json({ ready: true }));
  let bound = 16;
  h.window.DiscoveryLobbyTier = { withStoredLobbyTier: path => `${path}&tierMin=${bound}` };
  const caller = new AbortController();
  const pending = h.request('/stats/cards/2372?mode=ranked', { signal: caller.signal });
  assert.equal(h.deadlines[0].ms, 10000);
  assert.equal(h.calls[0].input, '/api/stats/cards/2372?mode=ranked&tierMin=16');
  h.deadlines[0].expire();
  await setImmediate();
  assert.equal(h.waits.at(-1).ms, 500);
  bound = 21;
  h.waits.at(-1).callback();
  assert.deepEqual(await pending, { ready: true });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].input, h.calls[0].input);
});

test('dashboard requests preserve caller abort and leave operations and rate limits single-attempt', async () => {
  const h = transport(stalledBody);
  const caller = new AbortController();
  const pending = h.request('/stats/tiers', { signal: caller.signal });
  caller.abort(new Error('Left view'));
  await assert.rejects(pending, /Left view/);
  assert.equal(h.calls.length, 1);

  const write = transport(stalledBody);
  const update = write.request('/account/save', { method: 'POST', body: 'fixture' });
  write.deadlines[0].expire();
  await assert.rejects(update, { status: 504, code: 'TIMEOUT' });
  assert.equal(write.calls.length, 1);

  const limited = transport(() => Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }));
  await assert.rejects(limited.request('/stats/items'), { status: 429, code: 'RATE_LIMITED' });
  assert.equal(limited.calls.length, 1);
});

test('raw dashboard API fetches get a deadline while non-API fetches are unaffected', async () => {
  const h = transport(stalledBody);
  const pending = h.window.fetch('/_pc/stats/tiers');
  assert.equal(h.calls[0].input, 'https://fixture.test/api/stats/tiers');
  assert.equal(h.deadlines[0].ms, 30000);
  const response = await pending;
  const json = response.json();
  h.deadlines[0].expire();
  await assert.rejects(json, { name: 'TimeoutError' });

  const outside = transport(() => Response.json({}));
  await outside.window.fetch('/data/champion-data.json', {});
  assert.equal(outside.deadlines.length, 0);
});

test('leaving a view during a retry delay cancels the next request', async () => {
  const h = transport(() => Response.json(null, { status: 503, headers: { 'Retry-After': '10' } }));
  const caller = new AbortController();
  const pending = h.request('/stats/tiers', { signal: caller.signal });
  await setImmediate();
  assert.equal(h.waits[0].ms, 10000);
  caller.abort(new Error('Left view'));
  await assert.rejects(pending, /Left view/);
  assert.equal(h.waits[0].cancelled, true);
  assert.equal(h.calls.length, 1);
});

test('homepage metrics publish separately and an API failure preserves the other metric', async () => {
  const first = Promise.withResolvers(), second = Promise.withResolvers();
  const makeMetric = () => {
    const value = { dataset: {} };
    return { value, querySelector: selector => selector === 'strong' ? value : {} };
  };
  const metrics = [makeMetric(), makeMetric()];
  const panel = { querySelector: () => null, querySelectorAll: selector => selector === '.activity-metric' ? metrics : [] };
  const document = { querySelector: selector => selector === '.activity-strip' ? panel : null, addEventListener() {} };
  const App = {
    registerRoute() {}, message: (_key, fallback) => fallback, formatNumber: String,
    setText: (el, text) => { el.textContent = text; },
    request: path => path.startsWith('/stats/') ? first.promise : second.promise,
  };
  runInContext(read('discovery-native'), createContext({ document, window: { DiscoveryApp: App, addEventListener() {} } }));
  first.resolve({ public_players: 42 });
  await setImmediate();
  assert.equal(metrics[0].value.textContent, '42');
  assert.equal(metrics[1].value.textContent, '…');
  second.reject(new Error('Unavailable'));
  await setImmediate();
  assert.equal(metrics[0].value.textContent, '42');
  assert.equal(metrics[1].value.textContent, '—');
});

test('independent statistics sections settle, retry, and discard obsolete scope results', async () => {
  const source = ts.createSourceFile('discovery-stats.js', read('discovery-stats'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const main = source.statements[0].expression.expression.expression;
  const functions = main.body.statements.filter(node => ts.isFunctionDeclaration(node) && ['isCurrent', 'loadSection'].includes(node.name?.text));
  assert.equal(functions.length, 2);
  const loadSection = new Function('state', 'failure', 'message', `let tierGeneration=1; ${functions.map(node => node.getText(source)).join('\n')}; return loadSection;`)(
    host => { host.view = 'loading'; }, (host, retry) => { host.view = 'failed'; host.retry = retry; }, () => 'Loading',
  );
  const host = () => ({ setAttribute() {}, removeAttribute() {} });
  const fast = host(), slow = host(), pending = Promise.withResolvers();
  const state = { sequence: 1, requestTierGeneration: 1 };
  const render = target => value => { target.view = value; };
  void loadSection(state, 1, fast, () => Promise.resolve('ready'), render(fast));
  void loadSection(state, 1, slow, refresh => refresh ? Promise.resolve('retried') : pending.promise, render(slow));
  await setImmediate();
  assert.equal(fast.view, 'ready');
  assert.equal(slow.view, 'loading');
  pending.reject(new Error('Unavailable'));
  await setImmediate();
  assert.equal(slow.view, 'failed');
  slow.retry();
  await setImmediate();
  assert.equal(slow.view, 'retried');
  assert.equal(fast.view, 'ready');
  const abandoned = host();
  const late = loadSection(state, 1, abandoned, () => Promise.resolve('wrong scope'), render(abandoned));
  state.sequence++;
  await late;
  assert.equal(abandoned.view, 'loading');
});
