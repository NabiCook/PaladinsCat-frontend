/* Apply the canonical browser-local wallpaper preference to the existing backdrop. */
(() => {
  'use strict';
  const original = document.body.style.backgroundImage;
  let backdrop = getComputedStyle(document.body).backgroundImage;
  // Read the owning rule so a saved disabled preference does not erase the
  // template needed when the user subsequently enables a custom wallpaper.
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) if (rule.selectorText === 'body' && rule.style.backgroundImage.includes('url(')) backdrop = rule.style.backgroundImage; } catch {}
  }
  let generation = 0, timer = 0, index = 0, resolved = [], model;
  const revoke = images => images.forEach(image => { if (image.revoke) URL.revokeObjectURL(image.source); });
  function stop() { clearInterval(timer); timer = 0; }
  function show() {
    if (!resolved.length || document.visibilityState !== 'visible') return;
    const image = resolved[index % resolved.length];
    document.body.style.backgroundImage = backdrop.replace(/url\([^)]*\)/, 'url('+JSON.stringify(image.source)+')');
  }
  function schedule() {
    stop();
    if (resolved.length > 1 && document.visibilityState === 'visible') timer = setInterval(() => { index++; show(); },model.getCustomWallpaperRotationMs());
  }
  async function refresh() {
    const current = ++generation; stop();
    try {
      model ||= await import('./discovery-community-art.js?v=surgical-2');
      window.DiscoveryWallpaper = model;
      const images = model.getWallpaperEnabled() ? await model.resolveCustomWallpapers() : [];
      if (current !== generation) { revoke(images); return; }
      const previous = resolved; resolved = images; index = 0;
      if (images.length) show(); else document.body.style.backgroundImage = original;
      revoke(previous); schedule();
    } catch {
      if (current !== generation) return;
      revoke(resolved); resolved = []; document.body.style.backgroundImage = original;
    }
  }
  window.addEventListener('paladinscat:wallpaper-change',refresh);
  window.addEventListener('storage',event => { if ([null,'paladinscat-wallpaper-enabled','paladinscat-custom-wallpaper','paladinscat-custom-wallpaper-rotation-ms'].includes(event.key)) void refresh(); });
  document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'visible') { show(); schedule(); } else stop(); });
  window.addEventListener('pagehide',() => { generation++; stop(); revoke(resolved); resolved = []; },{once:true});
  void refresh();
})();
