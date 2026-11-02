/* Keep the visible and keyboard navigation order in one place. */
(() => {
  const rail = document.querySelector('.rail-main');
  if (!rail) return;
  const order = ['Home', 'Search', 'Champions', 'Maps', 'Items', 'Players', 'Leaderboard', 'Matches', 'Demo analysis', 'Stats', 'Community', 'Blog', 'Site'];
  const position = new Map(order.map((name, index) => [name, index]));
  const buttons = [...rail.children];
  const key = button => {
    const name = button.dataset.navigationKey || button.getAttribute('aria-label');
    return name === 'News' ? 'Blog' : name;
  };
  buttons.sort((a, b) => (position.get(key(a)) ?? order.length) - (position.get(key(b)) ?? order.length));
  rail.append(...buttons);
})();
