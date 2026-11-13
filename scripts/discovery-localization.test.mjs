import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../public/app/discovery-localization.js', import.meta.url), 'utf8');
const generated = JSON.parse(fs.readFileSync(new URL('../lib/localization/catalog/generated/ui.json', import.meta.url), 'utf8'));
const common = JSON.parse(fs.readFileSync(new URL('../lib/localization/catalog/ui/common.json', import.meta.url), 'utf8'));
const draft = JSON.parse(fs.readFileSync(new URL('../public/app/discovery-ui-messages.json', import.meta.url), 'utf8'));
const modules = ['generated/ui', 'ui/common'];
const english = { 'generated/ui': generated, 'ui/common': common };
const rankKeys = [
  'generated.players.rankedLeaderboard', 'generated.players.tier',
  'generated.players.sort', 'generated.players.rank',
  'generated.players.findAPlayer', 'generated.players.filterPlayers',
  'generated.players.points', 'generated.players.wr',
  'common.tiers.grandmaster', 'common.count.playerMany',
];
const response = data => ({ ok: true, json: async () => data });
const unavailable = () => ({ ok: false, json: async () => ({}) });
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };

function environment({ language = 'en', manifest, moduleFetch, draftFetch } = {}) {
  const calls = new Map(), timers = new Map(), bindings = [], events = [];
  let timerId = 0;
  const document = {
    cookie: 'paladinscat_locale=' + language,
    readyState: 'complete', documentElement: {},
    querySelectorAll: () => bindings,
    dispatchEvent: event => events.push(event),
    addEventListener() {},
  };
  const sandbox = {
    window: {}, document, Node: { TEXT_NODE: 3 }, Intl, Date, AbortSignal,
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async url => {
      const count = (calls.get(url) || 0) + 1;
      calls.set(url, count);
      if (url.startsWith('/app/discovery-ui-messages.json')) return draftFetch ? draftFetch(count) : response({ en: {} });
      if (url === '/locales/modules.json') return manifest ? manifest(count) : response(modules);
      const match = /^\/locales\/([^/]+)\/(.+)\.json$/.exec(url);
      assert.ok(match, 'Only existing locale resources are requested');
      const [, code, module] = match;
      return moduleFetch ? moduleFetch(code, module, count) : response(code === 'en' ? english[module] : {});
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'discovery-localization.js' });
  return {
    locale: sandbox.window.DiscoveryLocale, calls, timers, events,
    bind(key) {
      const node = { dataset: {}, childNodes: [{ nodeType: 3, nodeValue: '' }] };
      bindings.push(node);
      this.locale.bind(node, key);
      return node;
    },
    async retry() {
      assert.equal(timers.size, 1, 'One bounded recovery attempt is pending');
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      callback();
      await settle();
    },
  };
}

function assertRankLabels(locale) {
  for (const key of rankKeys) {
    assert.equal(locale.t(key, { count: 3 }), (generated[key] ?? common[key]).replace('{count}', '3'), key);
  }
}

function draftRequests(env) {
  return [...env.calls].find(([url]) => url.startsWith('/app/discovery-ui-messages.json'))?.[1] || 0;
}

function assertDraftLabels(locale) {
  assert.equal(Object.keys(draft.en).length, 296);
  for (const key of Object.keys(draft.en)) assert.notEqual(locale.t(key), key, key);
  assert.equal(locale.t('discovery.maps.filteredCount', { shown: 3, total: 12 }), '3 of 12 maps');
  assert.equal(locale.t('discovery.home.heading', { realm: 'Realm' }), 'Every angle of the Realm.');
}

test('real canonical rank keys, English fallback, interpolation and plural labels remain correct', async () => {
  const env = environment();
  await env.locale.ready;
  assertRankLabels(env.locale);
  assert.equal(env.locale.t('common.count.playerOne', { count: 1 }), common['common.count.playerOne'].replace('{count}', '1'));
  assert.equal(env.locale.t('missing.key', { count: 7 }, '{count} players'), '7 players');
  assert.equal(env.timers.size, 0);
  await env.locale.setLocale('en');
  assert.equal(env.calls.get('/locales/en/generated/ui.json'), 1);
  assert.equal(env.calls.get('/locales/en/ui/common.json'), 1);
});

test('an initial 504 does not poison either rank-key catalog and recovery updates bound labels', async () => {
  const env = environment({ moduleFetch: (code, module, count) => count === 1 ? unavailable() : response(english[module]) });
  const bound = env.bind('generated.players.rankedLeaderboard');
  await env.locale.ready;
  assert.equal(env.locale.t(rankKeys[0]), rankKeys[0]);
  await env.retry();
  assertRankLabels(env.locale);
  assert.equal(bound.childNodes[0].nodeValue, generated[rankKeys[0]]);
  for (const module of modules) assert.equal(env.calls.get('/locales/en/' + module + '.json'), 2);
  assert.equal(env.timers.size, 0);
});

test('a rejected manifest is fetched again after availability recovers', async () => {
  const env = environment({ manifest: count => count === 1 ? unavailable() : response(modules) });
  await env.locale.ready;
  await env.retry();
  assertRankLabels(env.locale);
  assert.equal(env.calls.get('/locales/modules.json'), 2);
  assert.equal(env.timers.size, 0);
});

test('a genuinely missing key does not trigger resource retries', async () => {
  const env = environment();
  await env.locale.ready;
  assert.equal(env.locale.t('genuinely.missing.key'), 'genuinely.missing.key');
  assert.equal(env.timers.size, 0);
});

test('a permanent fetch failure stops after the single recovery attempt', async () => {
  const env = environment({ moduleFetch: unavailable });
  await env.locale.ready;
  await env.retry();
  assert.equal(env.timers.size, 0);
  for (const module of modules) assert.equal(env.calls.get('/locales/en/' + module + '.json'), 2);
});

test('a partial English load cannot permanently filter out target-language keys', async () => {
  const env = environment({
    language: 'de',
    moduleFetch: (code, module, count) => {
      if (code === 'en') return module === 'generated/ui' && count === 1 ? unavailable() : response(english[module]);
      return response(module === 'generated/ui' ? { [rankKeys[0]]: 'Target language rank label' } : {});
    },
  });
  await env.locale.ready;
  assert.equal(env.calls.has('/locales/de/generated/ui.json'), false);
  await env.retry();
  assert.equal(env.locale.t(rankKeys[0]), 'Target language rank label');
  assert.equal(env.locale.t('common.count.playerMany', { count: 3 }), '3 players');
  assert.equal(env.timers.size, 0);
});

test('a stale locale response cannot overwrite the current locale', async () => {
  let release, requested = false;
  const delayed = new Promise(resolve => { release = resolve; });
  const env = environment({
    moduleFetch: (code, module) => {
      if (code === 'en') return response(english[module]);
      if (code === 'de' && module === 'generated/ui') { requested = true; return delayed; }
      return response(module === 'generated/ui' ? { [rankKeys[0]]: 'Current locale rank label' } : {});
    },
  });
  await env.locale.ready;
  const stale = env.locale.setLocale('de');
  await settle();
  assert.equal(requested, true);
  await env.locale.setLocale('fr');
  release(response({ [rankKeys[0]]: 'Stale locale rank label' }));
  await stale;
  assert.equal(env.locale.locale(), 'fr');
  assert.equal(env.locale.t(rankKeys[0]), 'Current locale rank label');
  assert.equal(env.timers.size, 0);
});

test('changing locale cancels a pending retry for the previous generation', async () => {
  const env = environment({ moduleFetch: (code, module, count) => code === 'en' && count === 1 ? unavailable() : response(english[module]) });
  await env.locale.ready;
  assert.equal(env.timers.size, 1);
  await env.locale.setLocale('de');
  assert.equal(env.timers.size, 0);
  assertRankLabels(env.locale);
});

test('all296 real draft English keys recover after504 and successful data stays cached', async () => {
  const env = environment({ draftFetch: count => count === 1 ? unavailable() : response(draft) });
  const bound = env.bind('common.other');
  await env.locale.ready;
  assertRankLabels(env.locale);
  assert.equal(env.locale.t('common.other'), 'common.other');
  await env.retry();
  assertDraftLabels(env.locale);
  assertRankLabels(env.locale);
  assert.equal(bound.childNodes[0].nodeValue, draft.en['common.other']);
  assert.equal(draftRequests(env), 2);
  assert.equal(env.timers.size, 0);
  await env.locale.setLocale('en');
  assertDraftLabels(env.locale);
  assert.equal(draftRequests(env), 2);
});

test('permanent draft failure retains usable catalog labels and stops after one retry', async () => {
  const env = environment({ draftFetch: unavailable });
  await env.locale.ready;
  assertRankLabels(env.locale);
  await env.retry();
  assertRankLabels(env.locale);
  assert.equal(draftRequests(env), 2);
  assert.equal(env.timers.size, 0);
});

test('permanent draft failure preserves already usable current-locale labels', async () => {
  const env = environment({ language: 'de', draftFetch: unavailable,
    moduleFetch: (code, module) => response(code === 'en' ? english[module] : { [rankKeys[0]]: 'Usable current locale label' }) });
  await env.locale.ready;
  assert.equal(env.locale.t(rankKeys[0]), 'Usable current locale label');
  await env.retry();
  assert.equal(env.locale.t(rankKeys[0]), 'Usable current locale label');
  assert.equal(draftRequests(env), 2);
  assert.equal(env.timers.size, 0);
});

test('rejected and invalid draft responses reset their promise and recover296 keys', async () => {
  const failures = [
    () => Promise.reject(Error('draft unavailable')),
    () => ({ ok: true, json: async () => { throw SyntaxError('invalid draft JSON'); } }),
    () => response({}),
    () => response({ en: [] }),
    () => response({ en: { invalid: 42 } }),
  ];
  for (const failure of failures) {
    const env = environment({ draftFetch: count => count === 1 ? failure() : response(draft) });
    await env.locale.ready;
    assertRankLabels(env.locale);
    await env.retry();
    assertDraftLabels(env.locale);
    assert.equal(draftRequests(env), 2);
    assert.equal(env.timers.size, 0);
  }
});

test('draft recovery keeps target filtering and current locale English fallback', async () => {
  const extra = { ...draft, de: { ...draft.de, 'not.an.english.key': 'Discard this label' } };
  const env = environment({ language: 'de', draftFetch: count => count === 1 ? unavailable() : response(extra) });
  await env.locale.ready;
  assertRankLabels(env.locale);
  await env.retry();
  assert.equal(env.locale.locale(), 'de');
  for (const key of Object.keys(draft.en)) assert.notEqual(env.locale.t(key), key, key);
  assert.equal(env.locale.t('not.an.english.key'), 'not.an.english.key');
  assert.equal(env.locale.t('common.other'), draft.de['common.other'] || draft.en['common.other']);
  assert.equal(env.timers.size, 0);
});

test('a shared draft failure retries only the current locale generation', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const env = environment({ draftFetch: count => count === 1 ? delayed : response(draft) });
  const current = env.locale.setLocale('de');
  release(unavailable());
  await Promise.all([env.locale.ready, current]);
  assert.equal(env.locale.locale(), 'de');
  await env.retry();
  assert.equal(env.locale.locale(), 'de');
  assert.equal(env.locale.t('common.other'), draft.de['common.other']);
  assert.equal(draftRequests(env), 2);
  assert.equal(env.timers.size, 0);
});
