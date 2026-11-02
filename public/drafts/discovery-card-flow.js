/* Pack variable-height cards without changing their DOM order or page-specific columns. */
(() => {
  'use strict';
  const root = document.querySelector('.page-view-stack');
  if (!root || !window.ResizeObserver || !window.MutationObserver) return;
  const selector = [
    '.site-settings-body', '.discovery-cards', '.community-card-grid', '.community-editor-grid',
    '.players-card-grid', '.players-hub-grid', '.players-directory-grid', '.players-loadout-decks', '.players-relationship-grid',
    '.map-stats-entity-grid', '.map-reference-grid', '.item-reference-grid', '.champion-grid',
    '.leaderboard-directory', '.browse-card-grid', '.stats-hub-grid', '.champion-ai-grid'
  ].join(', ');
  const layouts = new Map();
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
  function restore(child, layout) {
    const original = layout.original.get(child);
    if (original) child.style.gridRowEnd = original;
    else child.style.removeProperty('grid-row-end');
    layout.original.delete(child);
  }
  function items(grid) {
    return [...grid.children].flatMap(child => getComputedStyle(child).display === 'contents' ? [...child.children] : [child]);
  }
  function render() {
    frame = 0;
    const grids = new Set(root.querySelectorAll(selector));
    for (const [grid, layout] of layouts) if (!grids.has(grid)) {
      layout.observer.disconnect();
      for (const child of layout.observed) restore(child, layout);
      grid.classList.remove('discovery-card-flow');
      layouts.delete(grid);
    }
    for (const grid of grids) {
      let layout = layouts.get(grid);
      if (!layout) {
        layout = { observer: new ResizeObserver(schedule), observed: new Set(), original: new Map() };
        layouts.set(grid, layout);
        layout.observer.observe(grid);
      }
      const children = items(grid), current = new Set(children);
      for (const child of layout.observed) if (!current.has(child)) { layout.observer.unobserve(child); layout.observed.delete(child); restore(child, layout); }
      for (const child of children) if (!layout.observed.has(child)) { layout.original.set(child, child.style.gridRowEnd); layout.observer.observe(child); layout.observed.add(child); }
      if (!grid.getBoundingClientRect().width) continue;
      grid.classList.add('discovery-card-flow');
      const style = getComputedStyle(grid), row = parseFloat(style.gridAutoRows) || 2, gap = parseFloat(style.columnGap) || 0;
      for (const child of children) {
        const box = child.getBoundingClientRect(), childStyle = getComputedStyle(child);
        if (!box.height || childStyle.display === 'none') { child.style.removeProperty('grid-row-end'); continue; }
        const margin = (parseFloat(childStyle.marginTop) || 0) + (parseFloat(childStyle.marginBottom) || 0);
        const span = 'span ' + Math.max(1, Math.ceil((box.height + margin + gap) / row));
        if (child.style.gridRowEnd !== span) child.style.gridRowEnd = span;
      }
    }
  }
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  schedule();
})();
