/* Explicit bindings for the approved native HTML; authored result/article content is data. */
(() => {
  'use strict';
  const L = window.DiscoveryLocale;
  if (!L) return;
  const bindings = [
    ['.rail','discovery.menu.mainNavigation','Main navigation','aria-label'],
    ['[data-view-back]','discovery.menu.backAria','Go back to the previous view','aria-label'],
    ['[data-view-back]','discovery.menu.backTitle','Back to previous view','title'],
    ['.hero-art','discovery.home.heroAlt','Inara in a forest','alt'],
    ['.hero-copy > p','discovery.home.intro','Players, champions, and everything in between.'],
    ['.hero-copy .primary-action','discovery.home.learnMore','Learn More '],
    ['[data-home-banner]','discovery.home.banner','Featured pages','aria-label'],
    ['[data-banner-controls]','discovery.home.banner','Featured pages','aria-label'],
    ['[data-banner-demo-title]','discovery.home.demoAnalysis','Demo analysis'],
    ['[data-banner-demo-available]','discovery.home.demoAvailable','available.'],
    ['[data-banner-demo-link]','discovery.home.openDemo','Open demo analysis'],
    ['[data-banner-page="0"]','discovery.home.showHomeBanner','Show home banner','aria-label'],
    ['[data-banner-page="1"]','discovery.home.showDemoBanner','Show demo analysis banner','aria-label'],
    ['[data-banner-previous]','discovery.home.previousBanner','Previous banner','aria-label'],
    ['[data-banner-next]','discovery.home.nextBanner','Next banner','aria-label'],
    ['.discovery-cards','discovery.home.explore','Explore Paladins','aria-label'],
    ['.discovery-card[data-card-accent="primary"] h2','nav.champions',' Champions'],
    ['.discovery-card[data-card-accent="primary"] .card-arrow','discovery.home.exploreChampions','Explore champions','aria-label'],
    ['.discovery-card[data-card-accent="secondary"] h2','menu.maps',' Maps'],
    ['.discovery-card[data-card-accent="secondary"] .card-arrow','discovery.home.exploreMaps','Explore maps','aria-label'],
    ['.discovery-card[data-card-accent="tertiary"] h2','menu.items',' Items'],
    ['.discovery-card[data-card-accent="tertiary"] .card-arrow','discovery.home.exploreItems','Explore items','aria-label'],
    ['.secondary-column','discovery.home.streamsEsports','Twitch and PaladinsCat Esports','aria-label'],
    ['.home-esports-name','discovery.home.esportsTitle','PaladinsCat Esports'],
    ['.home-esports-status','discovery.home.esportsComingSoon','Coming Soon'],
    ['#search-page-title','generated.search.search','Search'],
    ['.search-page-form','discovery.search.form','Search PaladinsCat','aria-label'],
    ['#search-page-query','discovery.search.label','Search players, matches, champions, items, cards, and talents','aria-label'],
    ['#search-page-query','discovery.search.placeholder','Search players, matches, champions, items, cards, talents…','placeholder'],
    ['.search-page-clear','generated.search.clearSearch','Clear search','aria-label'],
    ['.search-page-clear','generated.search.clearSearch','Clear search','title'],
    ['.search-page-submit','generated.search.search','Search','aria-label'],
    ['.search-page-submit','generated.search.search','Search','title'],
    ['.search-type-counts','discovery.search.counts','Result counts by type','aria-label'],
    ['#champions-page-title','nav.champions','Champions'],
    ['.champion-directory-controls','discovery.champions.filters','Champion filters','aria-label'],
    ['.champion-role-filter','generated.champions.class.41ff354','Class','aria-label'],
    ['[data-champion-role="all"]','generated.stats.all','All'],
    ['[data-champion-grid]','nav.champions','Champions','aria-label'],
    ['#maps-page-title','menu.maps','Maps'],
    ['#maps-page .map-stats-scope-control','stats.scope.label','Game mode'],
    ['[data-map-stats-scope]','stats.scope.label','Map statistics game mode','aria-label'],
    ['[data-map-stats-scope] option[value="ranked"]','stats.matchups.ranked','Ranked Siege'],
    ['[data-map-stats-scope] option[value="casual"]','stats.scope.casual','Casual'],
    ['[data-map-stats-scope] option[value="team_deathmatch"]','stats.scope.teamDeathmatch','Team Deathmatch'],
    ['[data-map-stats-scope] option[value="arcade"]','stats.scope.arcade','Arcade'],
    ['[data-map-stats-scope] option[value="wave_defense"]','stats.scope.waveDefense','Wave Defense'],
    ['[data-map-stats-scope] option[value="experiment"]','stats.scope.experiment','Experimental'],
    ['[data-map-stats-scope] option[value="newcomer"]','stats.scope.newcomer','Newcomer'],
    ['[data-map-stats-scope] option[value="bot"]','stats.scope.bot','Training / bots'],
    ['#maps-page .reference-toolbar .reference-filters','discovery.maps.modeFilter','Map mode','aria-label'],
    ['[data-map-mode="all"]','generated.stats.all','All'],
    ['[data-map-mode="Siege"]','stats.performance.siege','Siege'],
    ['[data-map-mode="Onslaught"]','stats.matchups.onslaught','Onslaught'],
    ['[data-map-mode="King of the Hill"]','discovery.mode.kingOfTheHill','King of the Hill'],
    ['[data-map-mode="Team Deathmatch"]','stats.scope.teamDeathmatch','Team Deathmatch'],
    ['[data-map-mode="Payload"]','discovery.mode.payload','Payload'],
    ['[data-map-mode="Other"]','common.other','Other'],
    ['#maps-page .reference-search .sr-only','discovery.maps.search','Search maps'],
    ['[data-map-query]','discovery.maps.search','Search maps','placeholder'],
    ['[data-map-grid]','menu.maps','Maps','aria-label'],
    ['#items-page-title','menu.items','Items'],
    ['#items-page .reference-toolbar .reference-filters','discovery.items.category','Item category','aria-label'],
    ['[data-item-category="all"]','generated.stats.all','All'],
    ['[data-item-category="Defense"]','maps.itemClass.defense','Defense'],
    ['[data-item-category="Utility"]','maps.itemClass.utility','Utility'],
    ['[data-item-category="Healing"]','maps.itemClass.healing','Healing'],
    ['[data-item-category="Offense"]','maps.itemClass.offense','Offense'],
    ['#items-page .reference-search .sr-only','generated.stats.searchItems','Search items'],
    ['[data-item-query]','generated.stats.searchItems','Search items','placeholder'],
    ['#item-level-label','generated.stats.upgradeLevel','Item level'],
  ];
  for (const [selector,key,fallback,attribute] of bindings) {
    document.querySelectorAll(selector).forEach(element => L.bind(element,key,fallback,attribute,undefined,true));
  }
  for (const level of [1,2,3]) {
    const element = document.querySelector('[data-item-level="'+level+'"]');
    if (element) L.bind(element,'generated.stats.levelValue1','Level {value1}',undefined,{value1:level},true);
  }
  // Stable navigation keys are independent of the translated accessible name.
  for (const [name,key,fallback] of [['Home','menu.home','Home'],['Search','generated.search.search','Search'],['Leaderboard','generated.players.leaderboard','Leaderboard'],['Champions','nav.champions','Champions'],['Maps','menu.maps','Maps'],['Items','menu.items','Items'],['Community','nav.community','Community']]) {
    const button = document.querySelector('.rail-main [data-navigation-key="'+name+'"]');
    if (!button) continue;
    L.bind(button,key,fallback,'aria-label',undefined,true);
    L.bind(button,key,fallback,'title',undefined,true);
    const label = button.querySelector('.rail-label'); if (label) L.bind(label,key,fallback,undefined,undefined,true);
  }
  const notification = document.querySelector('.rail-bottom .notification');
  if (notification) { L.bind(notification,'notifications.title','Notifications','aria-label',undefined,true); const label=notification.querySelector('.rail-label'); if(label) L.bind(label,'notifications.title','Notifications',undefined,undefined,true); }
  for (const [type,key,fallback] of [['player','generated.players.player','Player '],['match','generated.matches.match','Match '],['champion','generated.matches.champion','Champion '],['talent','generated.matches.talent','Talent '],['card','generated.matches.card','Card '],['item','generated.matches.item','Item ']]) {
    const element = document.querySelector('[data-search-type="'+type+'"]'); if (element) L.bind(element,key,fallback,undefined,undefined,true);
  }
  for (const role of ['Frontline','Damage','Flank','Support']) {
    const element = document.querySelector('[data-champion-role="'+role+'"]'); if (element) L.bind(element,'common.roles.'+role.toLowerCase(),role,undefined,undefined,true);
  }
  const hero = document.getElementById('hero-title'), realm = hero?.querySelector('em');
  const prefix = hero && [...hero.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
  let suffix;
  function heroHeading() {
    if (!hero || !realm || !prefix) return;
    const marker = '\uFFF0', template = String(L.message('discovery.home.heading',{realm:marker},'Every angle of the {realm}.'));
    const [before,after = ''] = template.split(marker);
    const label = String(L.message('discovery.home.realm',undefined,'Realm'));
    prefix.nodeValue = before;
    if (L.locale() === 'en') { realm.textContent = label + after; suffix?.remove(); suffix = null; }
    else { realm.textContent = label; suffix ||= document.createTextNode(''); suffix.nodeValue = after; realm.after(suffix); }
  }
  heroHeading();
  document.addEventListener('discovery:locale-changed', heroHeading);
})();
