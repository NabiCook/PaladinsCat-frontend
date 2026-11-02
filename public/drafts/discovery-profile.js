/* Sidebar account identity follows the confirmed frontend session. */
(() => {
  'use strict';
  const app = window.DiscoveryApp, trigger = document.querySelector('.rail-profile');
  if (!app || !trigger) return;
  const label = trigger.querySelector('.rail-label'), avatar = trigger.querySelector('img');
  const defaultAvatar = '/images/icons/Avatar_Default_Icon.avif';
  window.DiscoveryAuthLogin = () => {
    const returnPath = location.pathname + location.search;
    location.assign('/api/auth/oidc/login?return=' + encodeURIComponent(returnPath));
  };
  let user = null, resolved = false, revision = 0;
  trigger.dataset.navigationKey = 'Profile';
  function paint() {
    const name = user && (user.linked_player_name ?? user.linkedPlayerName ?? user.username);
    const text = name ? String(name).replace(/_/g, ' ') : resolved ? app.t('nav.login', undefined, 'Log in') : app.t('generated.common.account', undefined, 'Account');
    if (label) window.DiscoveryLocale.setText(label, text);
    trigger.setAttribute('aria-label', text);
    trigger.setAttribute('title', text);
  }
  async function refresh() {
    const current = ++revision;
    try {
      const result = await app.getUser(true), candidate = result?.user ?? result?.data?.user ?? result?.data ?? result;
      if (current !== revision) return false;
      const previous = JSON.stringify(user);
      user = candidate && Number(candidate.id ?? candidate.user_id) > 0 ? candidate : null;
      resolved = true;
      paint();
      if (avatar) avatar.src = defaultAvatar;
      const id = Number(user?.linked_player_id ?? user?.linkedPlayerId);
      if (avatar && Number.isSafeInteger(id) && id > 0) {
        void app.request('/players/' + id, { timeoutMs: 65000 }).then(response => {
          if (current === revision) avatar.src = window.DiscoveryPlayerAvatarPath?.(response?.player ?? response) || defaultAvatar;
        }).catch(() => {});
      }
      if (previous !== JSON.stringify(user)) document.dispatchEvent(new CustomEvent('discovery:session-changed'));
      return true;
    } catch {
      if (current === revision && !resolved) paint();
      return false;
    }
  }
  trigger.addEventListener('click', async () => {
    if (!await refresh()) return;
    if (!user) { window.DiscoveryAuthLogin(); return; }
    const id = Number(user.linked_player_id ?? user.linkedPlayerId);
    app.navigate(Number.isSafeInteger(id) && id > 0 ? '/players/' + id : '/link-account');
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if ([null, 'pc_auth_user', 'pc_auth_token'].includes(event.key)) void refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); });
  document.addEventListener('discovery:locale-changed', paint);
  avatar?.addEventListener('error', () => { if (!avatar.src.endsWith(defaultAvatar)) avatar.src = defaultAvatar; });
  paint();
  void refresh();
})();
