/* Shared in-page routing and transport. The address bar remains the dashboard URL. */
(() => {
  'use strict';
  const shell = document.querySelector('.dashboard-shell');
  const stack = document.querySelector('.page-view-stack');
  if (!shell || !stack || window.DiscoveryApp) return;
  const routes = [], pages = new Map();
  let currentPath = '/', userRequest = null, userRequestedAt = 0, restorePath = null;
  const viewPaths = new Map();
  const productHosts = new Set([location.host, 'paladinscat.com', 'paladinscat.com', '127.0.0.1:3000', 'localhost:3000', 'localhost:3101']);
  const node = (tag, cls = '', text = '') => { const el = document.createElement(tag); el.className = cls; el.textContent = text; return el; };
  function canonical(input) {
    const url = new URL(input, location.origin);
    if (!productHosts.has(url.host)) throw new Error('External destination');
    return url.pathname + url.search + url.hash;
  }
  function registerRoute(pattern, handler) { routes.push({ pattern, handler }); }
  function resolve(path) {
    const url = new URL(path, location.origin);
    for (const route of routes) {
      if (typeof route.pattern === 'string' && route.pattern === url.pathname) return { route, match: [] };
      if (route.pattern instanceof RegExp) { route.pattern.lastIndex = 0; const match = route.pattern.exec(url.pathname); if (match) return { route, match }; }
    }
    return null;
  }
  function createPage(view, title, navGroup) {
    if (pages.has(view)) return pages.get(view).element;
    const element = node('main', 'discovery-page'); element.id = view + '-page'; element.hidden = true; element.inert = true;
    element.setAttribute('aria-hidden', 'true'); element.setAttribute('aria-label', title); element.dataset.navGroup = navGroup || '';
    stack.append(element); pages.set(view, { element, title, navGroup }); return element;
  }
  function activate() {
    const view = shell.dataset.view, active = pages.get(view);
    for (const [key, page] of pages) { const shown = key === view; page.element.hidden = !shown; page.element.inert = !shown; page.element.setAttribute('aria-hidden', String(!shown)); }
    shell.dataset.dynamicPage = String(Boolean(active));
    if (!active) return;
    document.querySelectorAll('main,.dashboard-grid').forEach(el => { const shown = el === active.element; el.inert = !shown; el.setAttribute('aria-hidden', String(!shown)); });
    for (const nav of document.querySelectorAll('.rail-button')) {
      const shown = (nav.dataset.navigationKey || nav.getAttribute('aria-label')) === active.navGroup || nav.dataset.discoveryGroup === active.navGroup;
      nav.classList.toggle('active', shown); if (shown) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
    }
    document.title = (active.element.querySelector('h1')?.textContent || active.title) + ' · PaladinsCat';
    document.dispatchEvent(new CustomEvent('discovery:view-changed', { detail: { view, path: currentPath } }));
  }
  function open(view) {
    if (!pages.has(view)) throw new Error('Unregistered dashboard view: ' + view);
    const routeChange = viewPaths.has(view) && viewPaths.get(view) !== currentPath;
    const restore = restorePath === currentPath;
    if (restore) restorePath = null;
    if (shell.dataset.view !== view || routeChange) document.dispatchEvent(new CustomEvent('discovery:open-view', { detail: { view, routeChange, restore } }));
    viewPaths.set(view, currentPath);
    activate(); window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => { const heading = pages.get(view).element.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } });
  }
  function navigate(input) {
    window.DiscoveryViewScroll?.capture();
    const path = canonical(input), found = resolve(path);
    shell.dataset.route = path;
    if (!found) {
      const host = createPage('route-unavailable', 'Page unavailable', '');
      const heading = node('h1'), description = node('p', 'discovery-copy');
      window.DiscoveryLocale.bind(host, 'discovery.route.unavailable', 'Page unavailable', 'aria-label');
      window.DiscoveryLocale.bind(heading, 'discovery.route.unavailable', 'Page unavailable');
      window.DiscoveryLocale.bind(description, 'discovery.route.notAvailable', 'This view is not available in the dashboard.');
      host.replaceChildren(heading, description);
      document.dispatchEvent(new CustomEvent('discovery:unresolved-route', { detail: { path } })); open('route-unavailable'); return false;
    }
    currentPath = path;
    try { const result = found.route.handler(path, found.match); if (result?.catch) result.catch(error => { document.dispatchEvent(new CustomEvent('discovery:route-error', { detail: { path, message: error.message } })); }); }
    catch (error) { document.dispatchEvent(new CustomEvent('discovery:route-error', { detail: { path, message: error.message } })); throw error; }
    return true;
  }
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API route');
    path = scopedPath(path);
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {}); headers.set('Accept', 'application/json');
    let body = options.body;
    if (body != null && !(body instanceof FormData) && typeof body !== 'string') { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
    if (!['GET', 'HEAD'].includes(method)) {
      const cookie = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-pc_csrf=') || v.startsWith('pc_csrf='));
      if (cookie) headers.set('X-CSRF-Token', decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)));
    }
    const timeoutMs = Math.max(1000, Math.min(180000, options.timeoutMs || 10000));
    let response;
    try { response = await fetch('/api' + path, { method, headers, body, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(timeoutMs) }); }
    catch (cause) { if (['TimeoutError', 'AbortError'].includes(cause.name)) { const error = new Error('This request took too long. Try again.'); error.status = 504; error.code = 'TIMEOUT'; throw error; } throw cause; }
    let data; try { data = await response.json(); } catch { data = null; }
    if (!response.ok) { const error = new Error(data?.error?.message || data?.message || (response.status === 401 ? 'Sign in to continue.' : response.status === 403 ? 'This action requires additional access.' : 'This content could not be loaded.')); error.status = response.status; error.code = data?.error?.code; error.data = data; throw error; }
    if (data == null && response.status !== 204) throw new Error('Invalid response');
    return data;
  }
  function getUser(refresh = false) { if (refresh || Date.now()-userRequestedAt > 30000) userRequest = null; if (!userRequest) { userRequestedAt = Date.now(); userRequest = request('/auth/me').catch(error => { userRequest = null; if ([401,403].includes(error.status)) return null; throw error; }); } return userRequest; }
  function scopedPath(path) { return window.DiscoveryLobbyTier?.withStoredLobbyTier(path) || path; }
  function scopedFetch(input, options) {
    const url = new URL(input,location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetch(input,options);
    const prefix = url.pathname.startsWith('/api/v1/') ? '/api/v1' : '/api';
    return fetch(prefix+scopedPath(url.pathname.slice(prefix.length)+url.search),options);
  }
  function setLobbyTier(value) {
    const model = window.DiscoveryLobbyTier;
    if (!model?.isLobbyTierFilter(value)) return;
    localStorage.setItem(model.LOBBY_TIER_STORAGE_KEY,value);
    document.dispatchEvent(new CustomEvent('discovery:lobby-tier-changed',{detail:{value}}));
  }
  function record(view, input, options = {}) {
    const path = canonical(input); viewPaths.set(view, path);
    if (options.current !== false) { currentPath = path; shell.dataset.route = path; restorePath = null; }
  }
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null; if (!anchor || anchor.hasAttribute('download')) return;
    const raw = anchor.getAttribute('href'); if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;
    if (raw.startsWith('#')) { event.preventDefault(); document.getElementById(raw.slice(1))?.scrollIntoView(); return; }
    let url; try { url = new URL(raw, location.origin); } catch { return; }
    if (!productHosts.has(url.host) || /^\/(?:images|fonts|assets|drafts)\//.test(url.pathname)) return;
    event.preventDefault(); event.stopImmediatePropagation(); navigate(url.pathname + url.search + url.hash);
  }, true);
  // Every bounded percentage uses the project's canonical semantic spectrum.
  let percentageColor = null, percentageFrame = 0;
  function paintPercentages() {
    percentageFrame = 0;
    if (!percentageColor) return;
    const active = document.querySelector('main[aria-hidden="false"]:is(.discovery-page,.site-page,.stats-page,.players-hub-page,.community-page)');
    if (!active) return;
    for (const value of active.querySelectorAll('td,th,dd,strong,span')) {
      if (value.children.length) continue;
      const percentage = window.DiscoveryLocale.percentageNumber(value.textContent);
      if (percentage == null) continue;
      const header = value.closest('td,th');
      const labelNode = header?.closest('table')?.querySelector('thead tr')?.children[header.cellIndex]
        || value.closest('dl > div')?.querySelector('dt');
      const label = window.DiscoveryLocale.sourceLabel(labelNode);
      const direction = value.dataset.percentageDirection || (/leave|incomplete|budget|loss rate/i.test(label) ? 'low-is-good' : 'high-is-good');
      value.style.color = percentageColor(percentage, direction);
      value.dataset.percentageValue = String(percentage);
      value.dataset.percentageDirection = direction;
    }
  }
  function schedulePercentages() { if (!percentageFrame) percentageFrame = requestAnimationFrame(paintPercentages); }
  import('./discovery-stat-quality.js').then(module => { percentageColor = module.getPercentageColor; schedulePercentages(); }).catch(() => {});
  new MutationObserver(schedulePercentages).observe(stack, { childList: true, subtree: true, characterData: true });
  new MutationObserver(schedulePercentages).observe(shell, { attributes: true, attributeFilter: ['data-view'] });
  new MutationObserver(activate).observe(shell, { attributes: true, attributeFilter: ['data-view'] });
  window.DiscoveryApp = { registerRoute, navigate, createPage, open, request, getUser, record, scopedPath, scopedFetch, setLobbyTier,
    t: (...args) => window.DiscoveryLocale.t(...args), locale: () => window.DiscoveryLocale.locale(),
    message: (...args) => window.DiscoveryLocale.message(...args), setText: (...args) => window.DiscoveryLocale.setText(...args),
    formatNumber: (...args) => window.DiscoveryLocale.formatNumber(...args), formatDate: (...args) => window.DiscoveryLocale.formatDate(...args),
    timeZone: () => window.DiscoveryLocale.timeZone(), setLocale: code => window.DiscoveryLocale.setLocale(code),
    snapshot: view => viewPaths.has(view) ? { view, path: viewPaths.get(view) } : view,
    restore: path => { restorePath = path; return navigate(path); },
    isRestoring: path => restorePath === path,
    hasView: view => pages.has(view), hasRoute: path => Boolean(resolve(path)), routes: () => routes.map(r => String(r.pattern)), currentPath: () => currentPath };
  registerRoute('/', () => document.querySelector('[data-search-home]')?.click());
  document.querySelector('[data-discovery-features-trigger]')?.addEventListener('click',() => navigate('/features'));
  document.addEventListener('discovery:locale-changed', event => {
    const locale = window.DiscoveryLocale;
    const labels = {Home:['menu.home','Home'],Search:['generated.search.search','Search'],Players:['nav.players','Players'],Leaderboard:['menu.leaderboards','Leaderboards'],Matches:['nav.matches','Matches'],Champions:['nav.champions','Champions'],Maps:['menu.maps','Maps'],Items:['menu.items','Items'],Stats:['nav.stats','Stats'],Community:['nav.community','Community'],Blog:['generated.blog.title','Blog'],Notifications:['notifications.title','Notifications'],Settings:['generated.players.settings','Settings'],Profile:['generated.account.profile','Profile']};
    for (const nav of document.querySelectorAll('.rail-button')) {
      const key = nav.dataset.navigationKey || nav.getAttribute('aria-label');
      nav.dataset.navigationKey = key;
      if (!labels[key]) continue;
      const [message,fallback] = labels[key];
      locale.bind(nav,message,fallback,'aria-label'); locale.bind(nav,message,fallback,'title');
      const label = nav.querySelector('.rail-label'); if (label) locale.bind(label,message,fallback);
    }
    if (!event.detail?.initial && resolve(currentPath) && !['champion-detail','champions','site-settings','site-blog','site-blog-post'].includes(shell.dataset.view) && !['/','/search'].includes(new URL(currentPath,location.origin).pathname)) {
      // Refresh the active owning renderer so its explicit t() calls and date/number formatters update.
      restorePath = currentPath; navigate(currentPath);
    }
  });
})();
