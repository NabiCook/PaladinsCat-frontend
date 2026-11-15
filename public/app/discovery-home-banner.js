(() => {
  "use strict";
  const banner = document.querySelector('[data-home-banner]');
  if (!banner) return;
  const slides = [...banner.querySelectorAll('[data-banner-slide]')];
  const pages = [...banner.querySelectorAll('[data-banner-page]')];
  const previous = banner.querySelector('[data-banner-previous]');
  const next = banner.querySelector('[data-banner-next]');
  if (slides.length < 2 || pages.length !== slides.length || !previous || !next) return;

  const navigationIcon = banner.querySelector('[data-banner-navigation-icon]');
  const arrow = window.DiscoveryApp?.createNavigationArrow?.();
  if (navigationIcon && arrow) navigationIcon.replaceChildren(arrow);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, hovering = false, focused = false, inViewport = true, timer;
  const available = () => slides.map((slide,index) => ({slide,index})).filter(({slide}) => !slide.hasAttribute('data-banner-ad') || slide.dataset.adEligible === 'true').map(({index}) => index);
  function show(index) {
    const eligible = available();
    current = eligible.includes(index) ? index : eligible[0];
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.hidden = !eligible.includes(i);
      slide.dataset.active = String(active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
      if (eligible.includes(i)) slide.setAttribute('aria-label', (eligible.indexOf(i) + 1) + ' of ' + eligible.length + (slide.hasAttribute('data-banner-ad') ? ' · Advertisement' : ''));
    });
    pages.forEach((button, i) => { button.hidden = !eligible.includes(i); button.setAttribute('aria-pressed', String(i === current)); });
    banner.dispatchEvent(new CustomEvent('discovery:home-banner-change', { detail: { index: current } }));
  }
  function advance(direction) {
    const eligible = available(), position = eligible.indexOf(current);
    show(eligible[(position + direction + eligible.length) % eligible.length]);
    schedule();
  }
  function schedule() {
    window.clearTimeout(timer);
    if (hovering || focused || motion.matches || document.hidden || !inViewport || banner.closest('.dashboard-shell')?.dataset.view !== 'dashboard' || !banner.getClientRects().length) return;
    timer = window.setTimeout(() => advance(1), 8000);
  }
  pages.forEach((button, index) => button.addEventListener('click', () => { show(index); schedule(); }));
  previous.addEventListener('click', () => advance(-1));
  next.addEventListener('click', () => advance(1));
  banner.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; schedule(); } });
  banner.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  banner.addEventListener('focusin', () => { focused = true; schedule(); });
  banner.addEventListener('focusout', event => { if (!banner.contains(event.relatedTarget)) { focused = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('discovery:view-changed', schedule);
  motion.addEventListener('change', schedule);
  banner.addEventListener('discovery:ad-availability', () => { show(current); schedule(); });
  const visibility = new IntersectionObserver(entries => { inViewport = entries[0].isIntersecting; schedule(); });
  visibility.observe(banner);
  window.addEventListener('pagehide', event => { if(!event.persisted){ window.clearTimeout(timer); visibility.disconnect(); } });
  show(0);
  banner.classList.add('is-ready');
  schedule();
})();
