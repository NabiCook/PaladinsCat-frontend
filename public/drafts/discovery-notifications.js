/* Notifications use the existing dashboard surfaces and the owning session APIs. */
(() => {
  'use strict';
  const App = window.DiscoveryApp, shell = document.querySelector('.dashboard-shell');
  if (!App || !shell || window.DiscoveryNotifications) return;
  const DISMISSED = 'pc_dismissed_notifications';
  const SYNC_KEY = 'pc_notification_sync', SYNC_EVENT = 'pc-notification-sync';
  let state = null, publishing = false;
  const t = (key, fallback, values) => App.t ? App.t(key, values, fallback) : window.DiscoveryLocale.t(key, values, fallback);
  const node = (tag, className = '', text) => { const element = document.createElement(tag); element.className = className; if (text != null) element.textContent = text; return element; };
  function button(label, action) { const element = node('button', 'reference-filter', label); element.type = 'button'; element.addEventListener('click', action); return element; }
  const active = s => state === s && s.host.isConnected;
  function userIdentity(raw) {
    const user = raw?.user || raw?.data?.user || raw?.data || raw;
    const id = Number(user?.id ?? user?.user_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  function guestDismissed() {
    try { const ids = JSON.parse(localStorage.getItem(DISMISSED) ?? '[]'); return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string' || typeof id === 'number').map(String) : []); }
    catch { return new Set(); }
  }
  function saveDismissed(ids) { try { localStorage.setItem(DISMISSED, JSON.stringify([...ids])); return true; } catch { return false; } }
  function publishSync() {
    publishing = true;
    try { window.dispatchEvent(new Event(SYNC_EVENT)); } finally { publishing = false; }
    try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch {}
  }
  function notifications(raw) {
    const rows = Array.isArray(raw) ? raw : raw?.data;
    if (!Array.isArray(rows)) throw Error('Invalid notification response');
    return rows.map(row => {
      const id = Number(row?.id);
      if (!Number.isSafeInteger(id) || id <= 0 || typeof row.message !== 'string') throw Error('Invalid notification identity');
      return { id, message: row.message, timestamp: row.timestamp || '', importance: Number(row.importance || 0), readAt: row.read_at ?? row.readAt ?? null, preview: row.preview ?? null, href: row.href ?? null };
    });
  }
  function localHref(value) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null; }
  function dispose(s) {
    if (!s) return;
    s.version++; s.controller?.abort();
    window.clearInterval(s.interval);
    window.cancelAnimationFrame(s.frame);
    window.removeEventListener(SYNC_EVENT, s.sync);
    window.removeEventListener('storage', s.storage);
    window.removeEventListener('focus', s.visible);
    document.removeEventListener('visibilitychange', s.visible);
    document.removeEventListener('pointerdown', s.outside);
    document.removeEventListener('keydown', s.keydown);
    s.host.remove();
  }
  function draw(s) {
    if (!active(s)) return;
    s.heading.textContent = t('notifications.title', 'Notifications');
    s.body.setAttribute('aria-busy', String(s.loading || s.pending));
    const unread = s.userId ? s.rows.filter(row => !row.readAt).length : 0;
    const count = App.formatNumber ? App.formatNumber(unread) : String(unread);
    const status = node('p', 'notification-popover-status', s.userId ? unread ? t('notifications.unread', '{count} unread', { count }) : t('notifications.caughtUp', "You're all caught up") : t('notifications.latestUpdates', 'Latest PaladinsCat updates'));
    status.setAttribute('role', 'status');
    const header = node('header', 'notification-popover-header'), title = node('div');
    title.append(s.heading, status); header.append(title);
    if (s.userId && unread) { const all = button(t('notifications.markAllRead', 'Mark all read'), () => void mutate(s, '/auth/account/site-notifications/read-all', () => { const now = new Date().toISOString(); s.rows = s.rows.map(row => ({ ...row, readAt: now })); })); all.className = 'notification-popover-text-action'; all.disabled = s.pending; header.append(all); }
    const list = node('div', 'notification-popover-list');
    s.body.replaceChildren(header, list);
    if (s.error) {
      const error = node('div', 'notification-popover-state'); error.setAttribute('role', 'alert');
      error.append(node('p', '', t('async.couldNotLoad', 'Could not load this data')), button(t('async.tryAgain', 'Try again'), () => void load(s, true)));
      if (Number(s.error.status) === 401) error.append(button(t('notifications.login', 'Log in'), () => { close(); App.navigate('/auth/login'); }));
      list.append(error);
    }
    if (s.loading && !s.rows.length) { list.append(node('p', 'notification-popover-state', t('notifications.loading', 'Loading notifications'))); return; }
    if (!s.rows.length && !s.error) list.append(node('p', 'notification-popover-state', t('notifications.empty', 'No notifications yet.')));
    for (const row of s.rows) {
      const article = node('article', 'notification-popover-item'), href = localHref(row.href);
      article.dataset.notificationId = String(row.id);
      const entry = node(href || (s.userId && !row.readAt) ? 'button' : 'div', 'notification-popover-entry');
      if (entry.tagName === 'BUTTON') { entry.type = 'button'; entry.disabled = s.pending; entry.addEventListener('click', async () => { if (s.userId && !row.readAt) await markRead(s, row); if (href && active(s)) { close(); App.navigate(href); } }); }
      if (s.userId && !row.readAt) entry.classList.add('is-unread');
      const dot = node('span', 'notification-popover-dot'); dot.setAttribute('aria-hidden', 'true');
      if (s.userId && !row.readAt) dot.classList.add('is-unread'); else if (row.importance >= 75) dot.classList.add('is-important'); else if (row.importance >= 25) dot.classList.add('is-accent');
      const copy = node('span', 'notification-popover-copy'); copy.append(node('span', 'notification-popover-message', row.message));
      if (row.preview) copy.append(node('span', 'notification-popover-preview', row.preview));
      const time = node('time', 'notification-popover-time', App.formatDate ? App.formatDate(row.timestamp) : row.timestamp); time.dateTime = row.timestamp; copy.append(time);
      entry.append(dot, copy);
      const remove = button('×', () => void dismiss(s, row)); remove.className = 'notification-popover-remove'; remove.setAttribute('aria-label', t('notifications.remove', 'Remove notification')); remove.title = t('notifications.remove', 'Remove notification'); remove.disabled = s.pending;
      article.append(entry, remove); list.append(article);
    }
    if (!s.userId && !s.loading) {
      const login = node('div', 'notification-popover-footer'), link = button(t('notifications.login', 'Log in'), () => { close(); App.navigate('/auth/login'); }); link.className = 'notification-popover-text-action'; login.append(link, document.createTextNode(' ' + t('notifications.loginSuffix', "to track what you've read."))); s.body.append(login);
    }
  }
  async function load(s, refreshIdentity = false) {
    if (!active(s) || s.pending) return;
    const version = ++s.version;
    s.controller?.abort(); s.controller = new AbortController(); s.loading = true; s.error = null; draw(s);
    try {
      const userId = userIdentity(await App.getUser(refreshIdentity));
      if (!active(s) || version !== s.version) return;
      if (userId !== s.userId) s.rows = [];
      s.userId = userId;
      const data = await App.request((userId ? '/auth/account/site-notifications' : '/notifications') + '?limit=8', { signal: s.controller.signal });
      if (!active(s) || version !== s.version) return;
      const hidden = guestDismissed(); for (const id of s.volatileDismissed) hidden.add(id);
      s.rows = notifications(data).filter(row => userId || !hidden.has(String(row.id)));
    } catch (error) { if (active(s) && version === s.version && !s.controller.signal.aborted) s.error = error; }
    finally { if (active(s) && version === s.version) { s.loading = false; draw(s); } }
  }
  async function mutate(s, path, commit) {
    if (!active(s) || s.pending || !s.userId) return false;
    const owner = s.userId;
    s.version++; s.controller?.abort(); s.loading = false; s.pending = true; s.error = null; draw(s);
    try {
      if (userIdentity(await App.getUser(true)) !== owner) { const error = Error('Session changed'); error.status = 401; throw error; }
      if (!active(s)) return false;
      await App.request(path, { method: 'POST' });
      if (!active(s)) return false;
      commit(); publishSync(); return true;
    } catch (error) { if (active(s)) s.error = error; return false; }
    finally { if (active(s)) { s.pending = false; draw(s); } }
  }
  function markRead(s, row) { return mutate(s, '/auth/account/site-notifications/' + row.id + '/read', () => { s.rows = s.rows.map(item => item.id === row.id ? { ...item, readAt: new Date().toISOString() } : item); }); }
  function dismiss(s, row) {
    if (!active(s) || s.pending) return;
    if (s.userId) return mutate(s, '/auth/account/site-notifications/' + row.id + '/dismiss', () => { s.rows = s.rows.filter(item => item.id !== row.id); });
    const hidden = guestDismissed(); hidden.add(String(row.id));
    if (!saveDismissed(hidden)) s.volatileDismissed.add(String(row.id));
    s.rows = s.rows.filter(item => item.id !== row.id); draw(s); publishSync();
  }
  function close(restoreFocus = false) {
    const s = state;
    if (!s) return;
    state = null; s.trigger.setAttribute('aria-expanded', 'false');
    dispose(s);
    if (restoreFocus && s.trigger.isConnected) s.trigger.focus();
  }
  function open() {
    if (state) return;
    const trigger = document.querySelector('.rail-bottom .notification');
    if (!trigger) return;
    const host = node('section', 'notification-popover'); host.id = 'dashboard-notifications-popover';
    host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', t('notifications.title', 'Notifications'));
    const heading = node('h2', '', t('notifications.title', 'Notifications')), body = node('div'); host.append(body);
    document.body.append(host);
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', host.id); trigger.setAttribute('aria-expanded', 'true');
    const s = state = { host, trigger, heading, body, userId: null, rows: [], loading: false, pending: false, error: null, version: 0, controller: null, volatileDismissed: new Set() };
    s.sync = () => { if (!publishing) void load(s, true); };
    s.storage = event => { if ([SYNC_KEY, DISMISSED, 'pc_auth_token', 'pc_auth_user'].includes(event.key)) s.sync(); };
    s.visible = () => { if (document.visibilityState === 'visible') s.sync(); };
    window.addEventListener(SYNC_EVENT, s.sync); window.addEventListener('storage', s.storage); window.addEventListener('focus', s.visible); document.addEventListener('visibilitychange', s.visible);
    s.outside = event => { if (!host.contains(event.target) && !trigger.contains(event.target)) close(); };
    s.keydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    document.addEventListener('pointerdown', s.outside); document.addEventListener('keydown', s.keydown);
    const position = () => {
      if (!active(s)) return;
      const rect = trigger.getBoundingClientRect();
      host.style.visibility = rect.width ? 'visible' : 'hidden';
      if (rect.width) {
        const mobile = window.matchMedia('(max-width: 600px)').matches;
        const railTop = mobile ? Math.min(window.innerHeight, trigger.closest('.rail').getBoundingClientRect().top) : 0;
        host.style.maxHeight = mobile ? Math.max(0, railTop - 16) + 'px' : '';
        const width = host.offsetWidth, height = host.offsetHeight;
        host.style.left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - width - 8)) + 'px';
        host.style.top = mobile
          ? Math.max(8, railTop - height - 8) + 'px'
          : Math.max(8, Math.min(rect.bottom - height, window.innerHeight - height - 8)) + 'px';
      }
      s.frame = window.requestAnimationFrame(position);
    };
    position();
    s.interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(s, true); }, 60000);
    void load(s, true);
  }
  document.addEventListener('discovery:view-changed', () => close());
  document.addEventListener('discovery:locale-changed', () => { if (state && active(state)) { state.host.setAttribute('aria-label', t('notifications.title', 'Notifications')); draw(state); } });
  window.DiscoveryNotifications = { open, close, toggle: () => state ? close() : open() };
})();
