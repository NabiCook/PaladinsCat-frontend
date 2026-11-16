/* Rotate canonical scenes unless browser-local custom wallpapers take priority. */
(() => {
  'use strict';
  const original = document.body.style.backgroundImage;
  let backdrop = getComputedStyle(document.body).backgroundImage;
  // Read the owning rule so a saved disabled preference does not erase the
  // template needed when the user subsequently enables a custom wallpaper.
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) if (rule.selectorText === 'body' && rule.style.backgroundImage.includes('url(')) backdrop = rule.style.backgroundImage; } catch {}
  }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let generation = 0, frame = 0, timer = 0, fadeTimer = 0, index = 0, interval = 0, resolved = [], retired = [], model, activeLayer, disposed = false;
  const revoke = images => images.forEach(image => { if (image.revoke) URL.revokeObjectURL(image.source); });
  function stop() { clearInterval(timer); timer = 0; }
  function releaseRetired() {
    const used = new Set([...document.querySelectorAll('.pc-wallpaper-layer')].map(layer => layer.dataset.wallpaperSource));
    retired = retired.filter(images => {
      images.forEach(image => { if (image.revoke && !used.has(image.source)) { URL.revokeObjectURL(image.source); image.revoke = false; } });
      return images.some(image => image.revoke);
    });
  }
  function settle() {
    clearTimeout(fadeTimer); fadeTimer = 0;
    document.querySelectorAll('.pc-wallpaper-layer').forEach(layer => { if (layer !== activeLayer) layer.remove(); });
    if (activeLayer) { activeLayer.style.transition = 'none'; activeLayer.style.opacity = '1'; }
    releaseRetired();
  }
  function clear() {
    activeLayer = null; settle();
    document.body.classList.remove('pc-wallpaper-rotating');
    document.body.style.backgroundImage = original;
  }
  function load(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const finish = callback => { clearTimeout(deadline); image.onload = image.onerror = null; callback(); };
      const deadline = setTimeout(() => finish(() => reject(Error('Wallpaper load timed out'))), 15000);
      image.onload = () => image.decode().then(() => finish(() => resolve(source)), () => finish(() => reject(Error('Wallpaper decode failed'))));
      image.onerror = () => finish(() => reject(Error('Wallpaper load failed')));
      image.src = source;
    });
  }
  async function show(current = generation) {
    if (disposed || !resolved.length || document.visibilityState !== 'visible') return;
    const request = ++frame, images = resolved;
    const isCurrent = () => !disposed && current === generation && request === frame && document.visibilityState === 'visible';
    for (let attempt = 0; attempt < images.length; attempt++) {
      if (!isCurrent()) return;
      const position = (index + attempt) % images.length, image = images[position];
      try {
        const source = await load(image.source).catch(error => image.fallback && isCurrent() ? load(image.fallback) : Promise.reject(error));
        if (!isCurrent()) return;
        index = position;
        if (activeLayer?.dataset.wallpaperSource === source) { releaseRetired(); return; }
        settle();
        const animate = activeLayer && !motion.matches && !document.documentElement.classList.contains('site-lite-mode');
        const layer = document.createElement('div'); layer.className = 'pc-wallpaper-layer'; layer.setAttribute('aria-hidden', 'true');
        layer.dataset.wallpaperSource = source;
        layer.style.backgroundImage = backdrop.replace(/url\([^)]*\)/, 'url('+JSON.stringify(source)+')');
        layer.style.opacity = animate ? '0' : '1';
        document.body.classList.add('pc-wallpaper-rotating'); document.body.append(layer); activeLayer = layer;
        if (animate) {
          layer.getBoundingClientRect(); layer.style.opacity = '1';
          layer.addEventListener('transitionend', event => { if (event.propertyName === 'opacity' && activeLayer === layer) settle(); }, { once: true });
          fadeTimer = setTimeout(settle, model.WALLPAPER_TRANSITION_MS + 100);
        } else settle();
        return;
      } catch { if (!isCurrent()) return; }
    }
  }
  function schedule() {
    stop();
    if (!disposed && resolved.length > 1 && document.visibilityState === 'visible') timer = setInterval(() => { index++; void show(); }, interval);
  }
  async function refresh() {
    const current = ++generation; ++frame; stop();
    try {
      model ||= await import('./discovery-community-art.js?v=wallpaper-scenes-1');
      window.DiscoveryWallpaper = model;
      const enabled = model.getWallpaperEnabled();
      const custom = enabled ? await model.resolveCustomWallpapers() : [];
      const defaults = [...model.DEFAULT_WALLPAPERS];
      const fallbackIndex = defaults.findIndex(image => backdrop.includes(image.avif) || backdrop.includes(image.png));
      if (fallbackIndex > 0) [defaults[0], defaults[fallbackIndex]] = [defaults[fallbackIndex], defaults[0]];
      const images = !enabled ? [] : custom.length ? custom : model.randomizeWallpaperOrder(defaults).map(image => ({source:image.avif,fallback:image.png,revoke:false}));
      if (current !== generation || disposed) { revoke(images); return; }
      const previous = resolved; resolved = images; index = 0;
      if (previous.some(image => image.revoke)) retired.push(previous);
      releaseRetired();
      interval = custom.length ? model.getCustomWallpaperRotationMs() : model.BUILT_IN_WALLPAPER_INTERVAL_MS;
      document.body.style.setProperty('--pc-wallpaper-fade-duration', model.WALLPAPER_TRANSITION_MS + 'ms');
      if (images.length) await show(current); else clear();
      if (current === generation) schedule();
    } catch {
      if (current !== generation) return;
      if (resolved.some(image => image.revoke)) retired.push(resolved);
      resolved = []; clear();
    }
  }
  window.addEventListener('paladinscat:wallpaper-change',refresh);
  window.addEventListener('storage',event => { if ([null,'paladinscat-wallpaper-enabled','paladinscat-custom-wallpaper','paladinscat-custom-wallpaper-rotation-ms'].includes(event.key)) void refresh(); });
  document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'visible') { void show().then(schedule); } else { frame++; stop(); settle(); } });
  motion.addEventListener('change', () => { if (motion.matches) settle(); });
  window.addEventListener('pagehide',event => {
    generation++; frame++; stop(); settle();
    if (!event.persisted) { disposed = true; clear(); revoke(resolved); retired.forEach(revoke); resolved = retired = []; }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  void refresh();
})();
