/* Register source-owned Operations pages before the older dashboard adapters. */
(() => {
  'use strict';
  const app = window.DiscoveryApp;
  if (!app) return;
  const pages = [
    [/^\/community\/diminishing-returns$/, 'diminishing', 'site-operations-diminishing', 'diminishingReturns.title', 'Diminishing Returns'],
    [/^\/operations\/tickets$/, 'tickets', 'site-operations-tickets', 'generated.operations.tickets', 'Tickets'],
    [/^\/operations\/tickets\/(?:[1-9]\d*|PC-[1-9]\d*)$/i, 'ticket', 'site-operations-ticket', 'generated.operations.tickets', 'Tickets'],
    [/^\/operations\/stats$/, 'stats', 'site-operations-statistics', 'operations.title', 'PaladinsCat Statistics'],
    [/^\/localization$/, 'localization', 'site-operations-localization', 'nav.localization', 'Localization'],
    [/^\/operations\/paladinscat-bot$/, 'bot', 'site-operations-bot', 'menu.paladinsCatBot', 'PaladinsCat Bot'],
    [/^\/features$/, 'features', 'site-operations-features', 'home.newFeatures', 'New Features'],
  ];
  let pending;
  function load() { return pending ||= import('./discovery-operations-pro.js?v=5').catch(error => { pending = null; throw error; }); }
  function open(page, path) {
    const [,kind,view,key,fallback] = page, title = app.t(key, undefined, fallback);
    if (window.DiscoveryOperationsPro) { window.DiscoveryOperationsPro.open(kind,path,view,title); return; }
    const host = app.createPage(view,title,'Site'); host.setAttribute('aria-label',title); host.classList.add('community-page'); host.classList.remove('discovery-page'); host.setAttribute('aria-busy','true');
    const loading = document.createElement('p'); loading.className='community-copy'; loading.setAttribute('role','status'); loading.textContent=app.t('async.loading',undefined,'Loading…'); host.replaceChildren(loading); app.open(view);
    load().then(() => { if (app.currentPath()===path) window.DiscoveryOperationsPro.open(kind,path,view,title); }).catch(() => {
      if (app.currentPath()!==path) return;
      host.removeAttribute('aria-busy'); const message=document.createElement('p'), retry=document.createElement('button'); message.className='community-copy'; message.textContent=app.t('async.couldNotLoad',undefined,'This section could not be loaded.'); retry.className='reference-filter'; retry.type='button'; retry.textContent=app.t('async.tryAgain',undefined,'Try again'); retry.addEventListener('click',()=>open(page,path)); host.replaceChildren(message,retry);
    });
  }
  for (const page of pages) app.registerRoute(page[0], path => open(page,path));
})();
