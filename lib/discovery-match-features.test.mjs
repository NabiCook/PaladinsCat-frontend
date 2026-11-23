import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/app/discovery-match-features.js', import.meta.url), 'utf8');

class Element {
  className = '';
  children = [];
  attributes = new Map();
  dataset = {};
  classList = { add: name => { this.className += ` ${name}`; } };

  get firstElementChild() { return this.children[0]; }
  get isConnected() { return this.connected || Boolean(this.parent?.isConnected); }
  set src(value) { this.setAttribute('src', value); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}

  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  replaceWith(node) {
    const parent = this.parent;
    parent.children[parent.children.indexOf(this)] = node;
    node.parent = parent;
    this.parent = null;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...children);
  }

  querySelectorAll(selector) {
    return this.children.flatMap(child => {
      const descendants = child.querySelectorAll(selector);
      const match = child.className.split(' ').includes(selector.slice(1));
      return match ? [child, ...descendants] : descendants;
    });
  }
}

function fixture({ delayReferences = false } = {}) {
  const host = new Element();
  host.connected = true;
  const document = Object.assign(new EventTarget(), {
    createElement: () => new Element(),
    createElementNS: () => new Element(),
  });
  const references = new Map(), requests = [];
  const palette = Promise.withResolvers();
  let scope = '', current = true, paletteReady = false;
  const window = {
    DiscoveryApp: {
      t: (_key, _values, fallback) => fallback,
      message: (_key, _values, fallback) => fallback,
      setText: (el, text) => { el.textContent = text; },
      formatNumber: String,
      scopedPath: path => path + scope,
      request(path, options) {
        const pending = Promise.withResolvers();
        requests.push({ path, ...options, ...pending });
        return pending.promise;
      },
    },
    DiscoveryScoreboard: { championIcon: () => '/champion.avif' },
    DiscoveryChampionCards: {
      loadCardPercentageColors: () => palette.promise.then(() => { paletteReady = true; }),
      cardMetricsAtLevel: (card, level) => card?.levels.find(entry => entry.level === level),
      renderCardLevelTrend(levels, metric, level) {
        const indicator = new Element();
        indicator.className = 'trend';
        indicator.dataset.value = levels[level - 1]?.[metric];
        indicator.dataset.color = metric === 'winRate' && paletteReady && levels[level - 1] ? 'colored' : '';
        return indicator;
      },
    },
  };
  runInNewContext(source, {
    window, document, Node: Element, AbortSignal,
    fetch(path) {
      if (!delayReferences) return Promise.resolve({ ok: true, json: async () => ({}) });
      const pending = Promise.withResolvers();
      references.set(path.split('?')[0], data => pending.resolve({ ok: true, json: async () => data }));
      return pending.promise;
    },
  });
  const players = [2372, 2417].map((id, i) => ({
    player_id: i + 1, champion_id: id, champion_name: i === 0 ? 'Seris' : 'Lian', task_force: 2,
  }));
  const facts = players.map(player => ({
    ...player,
    cards: [{ card_id: player.champion_id, card_name: 'Recorded card', card_level: 2, fallback_icon_url: '/card-fallback.avif' }],
    talents: [{ talent_id: player.champion_id + 1, talent_name: 'Recorded talent' }],
    items: [{ item_name: 'Chronos', item_level: 1 }],
  }));
  window.DiscoveryMatchFeatures.renderLoadouts(host, { players, fact: { players: facts } }, () => current);
  const rows = () => host.querySelectorAll('.match-build-row');
  return {
    rows, references, palette, requests,
    artwork: (row, kind) => rows()[row].querySelectorAll('.match-build-assets')[kind].querySelectorAll('.match-build-asset')[0].firstElementChild,
    trends: row => rows()[row].querySelectorAll('.trend').map(el => el.dataset.value),
    winRateColor: row => rows()[row].querySelectorAll('.trend')[1].dataset.color,
    statistics: (index, plays) => ({ talentId: players[index].champion_id + 1, cards: [{
      cardId: players[index].champion_id, cardName: 'Recorded card', totalPlays: plays, levels: [{ level: 2, plays, winRate: 55 }],
    }] }),
    changeScope(value) { scope = value; document.dispatchEvent(new Event('discovery:lobby-tier-changed')); },
    leave() { current = false; },
  };
}

test('recorded rows render before references and each row applies its own late stats', async () => {
  const page = fixture({ delayReferences: true });
  assert.equal(page.rows().length, 2);
  assert.equal(page.artwork(0, 1).getAttribute('src'), '/card-fallback.avif');
  assert.deepEqual(page.trends(0), [undefined, undefined]);
  const initialRow = page.rows()[0];
  await setImmediate();
  assert.deepEqual(page.requests.map(request => request.timeoutMs), [30000, 30000]);

  page.requests[1].resolve(page.statistics(1, 18));
  page.references.get('/data/paladins-active-items.json')({ items: [{ name: 'Chronos' }] });
  await setImmediate();
  assert.deepEqual(page.trends(1), [18, 55]);
  assert.deepEqual(page.trends(0), [undefined, undefined]);
  assert.equal(page.artwork(0, 2).getAttribute('src'), '/images/items/Chronos_Icon.avif');
  assert.equal(page.artwork(0, 1).getAttribute('src'), '/card-fallback.avif');

  page.requests[0].resolve(page.statistics(0, 42));
  page.references.get('/data/champion-data.json')({ seris: { loadouts: [{ id: 2372, iconUrl: '/seris-card.avif' }] } });
  await setImmediate();
  assert.strictEqual(page.rows()[0], initialRow);
  assert.equal(page.artwork(0, 1).getAttribute('src'), '/seris-card.avif');
  assert.deepEqual(page.trends(0), [42, 55]);
  assert.equal(page.winRateColor(0), '');

  page.palette.resolve();
  await setImmediate();
  assert.equal(page.winRateColor(0), 'colored');
  assert.equal(page.winRateColor(1), 'colored');
});

test('a failed row preserves its recorded card while the neighboring row fills in', async () => {
  const page = fixture();
  await setImmediate();
  page.requests[0].reject({ status: 504, code: 'TIMEOUT' });
  page.requests[1].resolve(page.statistics(1, 25));
  await setImmediate();
  assert.deepEqual(page.trends(0), [undefined, undefined]);
  assert.equal(page.artwork(0, 1).getAttribute('src'), '/card-fallback.avif');
  assert.deepEqual(page.trends(1), [25, 55]);
});

test('scope changes and navigation suppress late paints', async () => {
  const page = fixture();
  await setImmediate();
  page.changeScope('&tierMin=21&tierMax=26');
  await setImmediate();
  assert.equal(page.requests.length, 4);
  assert.match(page.requests[2].path, /&tierMin=21&tierMax=26$/);
  page.requests[2].resolve(page.statistics(0, 7));
  await setImmediate();
  page.requests[0].resolve(page.statistics(0, 99));
  await setImmediate();
  assert.deepEqual(page.trends(0), [7, 55]);
  page.leave();
  page.requests[3].resolve(page.statistics(1, 12));
  await setImmediate();
  assert.deepEqual(page.trends(1), [undefined, undefined]);
});
