/** Execute the shipped dashboard callbacks: older I/O starts only after a control click. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
class Element {
  constructor(tag = 'div', cls = '', text = '') { this.tagName = tag; this.className = cls; this.textContent = text; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.isConnected = true; this.inert = false; this.classList = { add() {}, remove() {}, toggle() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelectorAll() { return []; }
  querySelector(selector) { if (selector === 'h1') return this.heading ||= new Element('h1'); return null; }
  click() { if (!this.disabled) return this.listeners.click?.({ preventDefault() {} }); }
}
function environment(extra = {}) {
  const document = new EventTarget();
  document.createElement = tag => new Element(tag);
  const context = vm.createContext({ window: {}, document, AbortController, AbortSignal, URLSearchParams, URL, Event, console, setTimeout, ...extra });
  vm.runInContext(source('public/app/discovery-archive.js'), context);
  return context;
}
function callback(context, file, start, end, name) {
  const text = source(file), first = text.indexOf(start), last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'exercise an actual shipped callback');
  return vm.runInContext(text.slice(first, last) + '\n' + name, context);
}
const n = (tag, cls = '', text = '') => new Element(tag, cls, text);
const button = (text, handler) => { const result = n('button', '', text); result.addEventListener('click', handler); return result; };
const tr = (key, fallback) => fallback;
const matchRows = (prefix = 'recent', count = 25) => Array.from({ length: count }, (_, i) => ({ match_id: `${prefix}-${i}`, champion_name: 'Pip', queue_id: 486, kills: 2, deaths: 1, assists: 3, duration_seconds: 100, entry_datetime: '2026-01-01T00:00:00Z' }));

test('loader has no mount/reset I/O; retry retains source, reset and navigation cancel stale reads', async () => {
  const context = environment(), archive = context.window.DiscoveryArchive, calls = [], changed = [];
  let active = true;
  const loader = archive.createLoader({ current: () => active, changed: value => changed.push(value), request: (path, options) => new Promise((resolve, reject) => calls.push({ path, options, resolve, reject })) });
  assert.equal(calls.length, 0);
  loader.reset(); assert.equal(calls.length, 0);
  const first = loader.run(archive.playerMatches('42'), { older: false });
  assert.equal(calls[0].path, '/players/42/matches?limit=25&offset=0');
  calls[0].resolve([]); await first;
  assert.equal(calls.length, 1, 'empty recent response never requests archives');
  const older = loader.run(archive.playerMatches('42', true), { older: true });
  calls[1].reject(new Error('unavailable')); await older;
  assert.equal(loader.snapshot().status, 'error');
  const retry = loader.retry(); assert.equal(calls[2].path, calls[1].path);
  loader.reset(); assert.equal(calls[2].options.signal.aborted, true);
  calls[2].resolve(['stale']); await retry;
  assert.equal(loader.snapshot().status, 'idle');
  const next = loader.run(archive.playerCharts('99', true, 50, 50));
  active = false; context.document.dispatchEvent(new Event('discovery:view-changed'));
  assert.equal(calls[3].options.signal.aborted, true);
  calls[3].resolve(['another player']); await next;
  assert.equal(changed.some(state => state.data?.[0] === 'another player'), false);
  await loader.run(archive.playerCharts('99', true)); assert.equal(calls.length, 4);
});

function profileEnvironment(request) {
  const context = environment(), rendered = [], plots = [], ctx = { body: n('div'), current: () => true, main: n('main') };
  Object.assign(context, { App: { request }, active: value => value.current(), n, button, tr, rows: raw => Array.isArray(raw) ? raw : raw.data || [], paragraph: text => n('p', '', text), state: (host, text) => host.replaceChildren(n('p', '', text)), failure: (host, error, retry) => host.replaceChildren(n('p', '', error.message), button('Retry', retry)), link: (text, href, cls) => Object.assign(n('a', cls, text), { href }), positive: value => /^[1-9]\d*$/.test(String(value)), fmt: value => String(value ?? '—'), num: value => value == null ? null : Number(value), date: value => value, table: (host, labels, values) => { rendered.push(values); host.append(n('table')); }, profileMatchFlags: row => row.performance_tags, profileChampionCell: row => row.champion_name, profileMatchQueue: row => row.queue_id, profileMatchKda: () => '3.5', profileMatchResult: () => 'Win', profileMatchClock: value => String(value), profileMatchMobile: () => n('div'), begin: () => ctx, panel: title => n('section', '', title), trendPlot: (host, series) => plots.push(series) });
  return { context, ctx, rendered, plots };
}

test('actual player-history controls render older pages, retry failure and return to recent', async () => {
  const calls = []; let failOlder = true;
  const { context, ctx, rendered } = profileEnvironment(async path => { calls.push(path); if (path.startsWith('/archive') && failOlder) { failOlder = false; throw new Error('retry older'); } return matchRows(path.startsWith('/archive') ? 'older' : 'recent'); });
  const render = callback(context, 'public/app/discovery-player-details.js', '  function profileRecentMatches(', '  function playerCharts(', 'profileRecentMatches');
  const section = render(ctx, '42'); await flush();
  assert.deepEqual(calls, ['/players/42/matches?limit=25&offset=0']);
  const [, sources, output, controls] = section.children;
  sources.children[1].click(); await flush();
  assert.equal(calls[1], '/archive/players/42/matches?limit=25&offset=0');
  output.children[1].click(); await flush();
  assert.equal(calls[2], calls[1]); assert.ok(rendered.at(-1)[0][0].includes('older-0'));
  controls.children[1].children[1].click(); await flush();
  assert.equal(calls[3], '/archive/players/42/matches?limit=25&offset=25');
  sources.children[0].click(); await flush();
  assert.equal(calls[4], calls[0]); assert.ok(rendered.at(-1)[0][0].includes('recent-0'));
});

test('actual chart handler plots recent data and loads/paginates older data only on clicks', async () => {
  const calls = [], entries = Array.from({ length: 50 }, (_, i) => ({ entry_datetime: `date-${i}`, kills: i, deaths: 1, assists: 2, damage_per_minute: i * 100, rating: 1500 + i }));
  const { context, ctx, plots } = profileEnvironment(async path => { calls.push(path); return entries; });
  const render = callback(context, 'public/app/discovery-player-details.js', '  function playerCharts(', '  async function profileEvidence(', 'playerCharts');
  render('/stats/player/42/charts', ['', '42']); await flush();
  assert.deepEqual(calls, ['/players/42/charts?limit=50&offset=0']);
  assert.equal(plots.length, 3); assert.equal(plots[0][0].kills, 49);
  const [sources, , controls] = ctx.body.children;
  sources.children[1].click(); await flush(); assert.equal(calls[1], '/archive/players/42/charts?limit=50&offset=0');
  controls.children[2].click(); await flush(); assert.equal(calls[2], '/archive/players/42/charts?limit=50&offset=50');
});

test('actual missing-match view never falls back automatically; older button mounts returned detail', async () => {
  const context = environment(), calls = [], mounted = [], host = n('main'), path = '/matches/1111111111', tokens = new WeakMap();
  Object.assign(context, { A: { createPage: () => host, open() {}, currentPath: () => path, request: async url => { calls.push(url); return { matches: url.startsWith('/archive') ? [{ match: { match_id: 1111111111 }, players: [] }] : [] }; }, getUser: async () => null, setText: (element, text) => { element.textContent = text; } }, el: n, message: (key, fallback) => fallback, heading() {}, loadScoreboard: async () => {}, begin: output => { const value = (tokens.get(output) || 0) + 1; tokens.set(output, value); return value; }, latest: (output, token) => tokens.get(output) === token, state: (output, text) => output.replaceChildren(n('p', '', text)) });
  context.window.DiscoveryMatchFeatures = { prepare: async raw => raw.matches[0], access: () => ({ loadouts: false, fullDetails: false }) };
  context.window.DiscoveryScoreboard = { destroy() {}, withCurrentStoredModeration: async value => value, mount: (target, value) => mounted.push(value) };
  const render = callback(context, 'public/app/discovery-browse.js', '  async function matchDetail(', "  A.registerRoute('/matches'", 'matchDetail');
  await render(path, ['', '1111111111']); await flush();
  assert.deepEqual(calls, ['/matches/1111111111']); assert.equal(mounted.length, 0);
  host.children[0].children[1].click(); await flush();
  assert.deepEqual(calls, ['/matches/1111111111', '/archive/matches/1111111111']); assert.equal(mounted[0].match.match_id, 1111111111);
});

test('actual exact-ID search action uses archive endpoint and renders returned results', async () => {
  const context = environment(), calls = [], results = [], actions = n('div');
  Object.assign(context, { searchActions: actions, nativeText: (element, text) => { element.textContent = text; }, M: (key, values, fallback) => fallback, resultList: n('div'), emptyMessage: n('p'), searchResults: [], searchLogic: async () => [{ mergeResults: values => values }], paintSearchResults: values => results.push(values) });
  context.window.DiscoveryApp = { request: async path => { calls.push(path); return { data: [{ type: 'match', id: '1111111111', href: '/matches/1111111111?archive=1' }] }; } };
  const paint = callback(context, 'public/app/discovery-dashboard.js', '  function paintSearchActions(', '  async function renderResults(', 'paintSearchActions');
  paint('1111111111', () => true, new AbortController()); assert.equal(calls.length, 0);
  actions.children.find(element => element.textContent === 'Search older match').click(); await flush();
  assert.deepEqual(calls, ['/archive/search/matches/1111111111']); assert.equal(results[0][0].href, '/matches/1111111111?archive=1');
});
