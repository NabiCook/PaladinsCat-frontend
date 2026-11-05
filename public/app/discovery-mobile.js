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
  let anchor = Math.max(0, window.scrollY), last = anchor;
  const show = () => { rail.classList.remove('is-mobile-hidden'); anchor = last = Math.max(0, window.scrollY); };
  window.addEventListener('scroll', () => {
    const y = Math.max(0, window.scrollY);
    updateScrollTop();
    if (!mobile.matches) { show(); return; }
    if (y <= 8 || rail.querySelector('.notification[aria-expanded="true"]')) { show(); return; }
    if ((y > last && y - anchor >= 12) || (y < last && anchor - y >= 12)) {
      rail.classList.toggle('is-mobile-hidden', y > anchor);
      anchor = y;
    } else if ((y > last && anchor > last) || (y < last && anchor < last)) anchor = last;
    last = y;
  }, { passive: true });
  rail.addEventListener('focusin', show);
  mobile.addEventListener('change', () => { show(); updateScrollTop(); });
  new MutationObserver(() => {
    show();
    if (!mobile.matches) return;
    window.requestAnimationFrame(() => {
      const strip = rail.querySelector('.rail-main'), active = strip?.querySelector('.rail-button.active');
      if (!strip || !active) return;
      const outer = strip.getBoundingClientRect(), inner = active.getBoundingClientRect();
      if (inner.left < outer.left) strip.scrollLeft += inner.left - outer.left;
      else if (inner.right > outer.right) strip.scrollLeft += inner.right - outer.right;
    });
  }).observe(shell, { attributes: true, attributeFilter: ['data-view'] });
  updateScrollTop();
})();
