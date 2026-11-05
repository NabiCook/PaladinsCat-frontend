(() => {
  'use strict';
  const tabs = [
    ['build', 'generated.players.loadouts', 'Build'],
    ['skins', 'generated.stats.skin', 'Skin'],
    ['items', 'nav.items', 'Items'],
    ['maps', 'nav.maps', 'Maps'],
  ];
  let dispose = () => {};
  const selectedTabs = new Map();
  let selectActive = () => {}, activeTab = null;
  window.DiscoveryChampionTabs = {
    active: () => activeTab,
    select: key => selectActive(key),
    create(host, champion, { restore = false, tab } = {}) {
      dispose();
      const championKey = champion.slug || String(champion.id);
      const nav = document.createElement('div');
      nav.className = 'champion-detail-tabs reference-filters';
      nav.setAttribute('role', 'tablist');
      nav.setAttribute('aria-label', champion.name);
      const panels = new Map(), buttons = new Map(), mounted = new Map();
      for (const [key, messageKey, label] of tabs) {
        const panel = document.createElement('div');
        panel.className = 'champion-tab-panel'; panel.dataset.championPanel = key;
        panel.id = 'champion-panel-' + key; panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', 'champion-tab-' + key); panel.hidden = key !== 'build';
        const button = document.createElement('button'); button.type = 'button';
        button.id = 'champion-tab-' + key; button.className = 'reference-filter';
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
        window.DiscoveryLocale.setText(button, window.DiscoveryLocale.message(messageKey, undefined, label));
        buttons.set(key, button); panels.set(key, panel); nav.append(button);
      }
      const choose = (key, remember = true) => {
        if (!panels.has(key)) return;
        activeTab = key;
        selectedTabs.set(championKey, key);
        if (remember) window.DiscoveryViewScroll?.rememberChampionTab?.(key);
        for (const [name, button] of buttons) { const selected = name === key; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; button.classList.toggle('is-active', selected); panels.get(name).hidden = !selected; }
        if (key !== 'build' && !mounted.has(key)) {
          const panel = panels.get(key);
          const mount = window.DiscoveryStats?.mountChampion;
          if (mount) mounted.set(key, mount(panel, champion, key));
        }
      };
      for (const [key, button] of buttons) {
        button.addEventListener('click', () => choose(key));
        button.addEventListener('keydown', event => {
          const keys = [...buttons.keys()], index = keys.indexOf(key);
          const next = event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); choose(keys[next]); buttons.get(keys[next]).focus(); }
        });
      }
      host.append(nav, ...panels.values());
      selectActive = choose;
      const saved = restore ? (tab || selectedTabs.get(championKey)) : 'build';
      choose(panels.has(saved) ? saved : 'build', false);
      dispose = () => { for (const cleanup of mounted.values()) cleanup?.(); mounted.clear(); };
      return panels.get('build');
    }
  };
})();
