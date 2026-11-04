/* Shape-preserving placeholders for initial dashboard results. */
(() => {
  'use strict';
  function show(host, kind, surfaceClass = '') {
    const layout = document.createElement('div');
    layout.className = 'discovery-skeleton discovery-skeleton--' + kind;
    layout.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < (surfaceClass === 'update-row' ? 3 : 4); i++) {
      const item = document.createElement('div');
      item.className = 'discovery-skeleton-item' + (surfaceClass ? ' ' + surfaceClass : '');
      for (const variant of ['short', '', 'long']) {
        const line = document.createElement('span');
        line.className = 'discovery-skeleton-line' + (variant ? ' discovery-skeleton-line--' + variant : '');
        item.append(line);
      }
      layout.append(item);
    }
    if (kind === "dashboard") {
      const chart = document.createElement("div");
      chart.className = "discovery-skeleton-chart";
      layout.append(chart);
    }
    host.append(layout);
  }
  window.DiscoveryLoading = { show };
})();
