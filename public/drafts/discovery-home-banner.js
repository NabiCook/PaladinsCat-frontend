(() => {
  "use strict";
  const banner = document.querySelector('[data-home-banner]');
  if (!banner) return;
  const slides = [...banner.querySelectorAll('[data-banner-slide]')];
  const pages = [...banner.querySelectorAll('[data-banner-page]')];
  const previous = banner.querySelector('[data-banner-previous]');
  const next = banner.querySelector('[data-banner-next]');
  if (slides.length !== 2 || pages.length !== slides.length || !previous || !next) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, hovering = false, focused = false, timer;
  function show(index) {
    current = index;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.hidden = false;
      slide.dataset.active = String(active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
    });
    pages.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  function schedule() {
    window.clearTimeout(timer);
    if (hovering || focused || motion.matches || document.hidden || !banner.getClientRects().length) return;
    timer = window.setTimeout(() => { show((current + 1) % slides.length); schedule(); }, 8000);
  }
  pages.forEach((button, index) => button.addEventListener('click', () => { show(index); schedule(); }));
  previous.addEventListener('click', () => { show((current + slides.length - 1) % slides.length); schedule(); });
  next.addEventListener('click', () => { show((current + 1) % slides.length); schedule(); });
  banner.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; schedule(); } });
  banner.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  banner.addEventListener('focusin', () => { focused = true; schedule(); });
  banner.addEventListener('focusout', event => { if (!banner.contains(event.relatedTarget)) { focused = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('discovery:view-changed', schedule);
  motion.addEventListener('change', schedule);
  show(0);
  banner.classList.add('is-ready');
  schedule();
})();
