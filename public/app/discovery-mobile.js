/* Keep the existing rail available on mobile without covering content while scrolling. */
(() => {
  'use strict';
  const shell = document.querySelector('.dashboard-shell');
  const rail = shell?.querySelector(':scope > .rail');
  if (!shell || !rail) return;
  const mobile = window.matchMedia('(max-width: 600px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollTop = document.createElement('button');
  scrollTop.type = 'button'; scrollTop.className = 'discovery-scroll-top'; scrollTop.hidden = true;
  scrollTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  if (window.DiscoveryLocale) {
    window.DiscoveryLocale.bind(scrollTop, 'discovery.scrollToTop', 'Scroll to top', 'aria-label');
    window.DiscoveryLocale.bind(scrollTop, 'discovery.scrollToTop', 'Scroll to top', 'title');
  } else { scrollTop.setAttribute('aria-label', 'Scroll to top'); scrollTop.title = 'Scroll to top'; }
  scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' }));
  document.body.append(scrollTop);
  const updateScrollTop = () => { scrollTop.hidden = !mobile.matches || window.scrollY <= 160; };
  window.addEventListener('scroll', updateScrollTop, { passive: true });

  // Move the original controls, retaining their listeners, labels and current state.
  function setupNavigation() {
    const main = rail.querySelector('.rail-main'), bottom = rail.querySelector('.rail-bottom');
    if (!main || !bottom) return;
    const original = [...main.children], bottomParent = bottom.parentNode;
    const bottomAnchor = document.createComment('desktop utilities');
    bottom.before(bottomAnchor);
    const coreKeys = ['Home', 'Search', 'Players', 'Champions'];
    const core = coreKeys.map(key => original.find(node => node.dataset.navigationKey === key)).filter(Boolean);
    const extra = original.filter(node => !core.includes(node));
    const panel = document.createElement('section');
    panel.id = 'mobile-navigation-options'; panel.className = 'rail-mobile-options'; panel.hidden = true;
    const links = document.createElement('div'); links.className = 'rail-mobile-links';
    panel.append(links); rail.append(panel);
    const more = document.createElement('button'); more.type = 'button'; more.className = 'rail-mobile-more';
    more.setAttribute('aria-controls', panel.id); more.setAttribute('aria-expanded', 'false');
    // Same installed Lucide Menu instance used by components/bottom-nav.tsx.
    more.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu" aria-hidden="true" focusable="false"><path d="M4 5h16"></path><path d="M4 12h16"></path><path d="M4 19h16"></path></svg>';
    const label = document.createElement('span'); more.append(label);
    const bind = (node, key, fallback, attribute) => {
      if (window.DiscoveryLocale) window.DiscoveryLocale.bind(node, key, fallback, attribute);
      else if (attribute) node.setAttribute(attribute, fallback); else node.textContent = fallback;
    };
    bind(label, 'bottomNav.more', 'More');
    bind(more, 'bottomNav.moreNavigation', 'More navigation', 'aria-label');
    bind(panel, 'discovery.menu.mainNavigation', 'Main navigation', 'aria-label');
    function setOpen(open, restoreFocus = false) {
      panel.hidden = !open || !mobile.matches;
      more.setAttribute('aria-expanded', String(!panel.hidden));
      rail.classList.toggle('is-mobile-expanded', !panel.hidden);
      if (restoreFocus) more.focus();
    }
    function syncActive() { more.classList.toggle('active', [...extra, ...bottom.querySelectorAll('.rail-button')].some(node => node.classList.contains('active'))); }
    function layout() {
      const hadPanelFocus = panel.contains(document.activeElement);
      setOpen(false);
      if (mobile.matches) { main.replaceChildren(...core, more); links.append(...extra); panel.append(bottom); }
      else { main.replaceChildren(...original); bottomParent.insertBefore(bottom, bottomAnchor.nextSibling); }
      if (hadPanelFocus) (mobile.matches ? more : original.find(node => node.classList.contains('active')) || original[0]).focus();
      syncActive(); updateScrollTop();
    }
    more.addEventListener('click', () => setOpen(panel.hidden));
    links.addEventListener('click', event => { if (event.target.closest('.rail-button')) setOpen(false, true); });
    main.addEventListener('click', event => { if (event.target.closest('.rail-button')) setOpen(false); });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !rail.contains(event.target) && !event.target.closest('.notification-popover')) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); setOpen(false, true); }
    });
    new MutationObserver(() => { setOpen(false); syncActive(); }).observe(shell, { attributes: true, attributeFilter: ['data-view'] });
    new MutationObserver(syncActive).observe(rail, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    mobile.addEventListener('change', layout);
    layout();
  }
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', setupNavigation, { once: true });
  else setupNavigation();
  updateScrollTop();
})();
