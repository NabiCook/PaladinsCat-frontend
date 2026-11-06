(() => {
  const M = (key, values, fallback) => window.DiscoveryLocale.message(key, values, fallback);
  const nativeText = (element, value) => window.DiscoveryLocale.setText(element, value);
  const nativeAttribute = (element, name, value) => value?.discoveryMessage ? window.DiscoveryLocale.bind(element, value.key, value.fallback, name, value.values, true) : element.setAttribute(name, value);
  const nativeNumber = (value, options) => window.DiscoveryLocale.formatNumber(value, options);
  const nativeRole = role => M("common.roles." + role.toLowerCase(), undefined, role);
  const shell = document.querySelector(".dashboard-shell");
  const dashboard = document.querySelector(".dashboard-grid");
  const searchPage = document.querySelector("#search-page");
  const leaderboardPage = document.querySelector("#leaderboard-page");
  const championsPage = document.querySelector("#champions-page");
  const championDetailPage = document.querySelector("#champion-detail-page");
  const championDetailContent = document.querySelector("[data-champion-detail-content]");
  const mapsPage = document.querySelector("#maps-page");
  const mapDetailPage = document.querySelector("#map-detail-page");
  const itemsPage = document.querySelector("#items-page");
  const mapsButton = document.querySelector(".rail-button[data-maps-trigger]");
  const itemsButton = document.querySelector(".rail-button[data-items-trigger]");
  const pageForm = document.querySelector(".search-page-form");
  const pageInput = document.querySelector("#search-page-query");
  const backButton = document.querySelector("[data-view-back]");
  const clearButton = document.querySelector(".search-page-clear");
  const resultList = document.querySelector("[data-search-page-results]");
  const resultHeading = document.querySelector(".search-group-heading");
  const resultCount = document.querySelector("[data-search-page-count]");
  const emptyMessage = document.querySelector(".search-page-empty");
  const homeButton = document.querySelector("[data-search-home]");
  const searchButton = document.querySelector('.rail-button[aria-label="Search"]');
  const leaderboardButton = document.querySelector("[data-leaderboard-trigger]");
  const championsButton = document.querySelector('.rail-button[aria-label="Champions"]');
  const championGrid = document.querySelector("[data-champion-grid]");
  const championCount = document.querySelector("[data-champion-count]");
  const championStatus = document.querySelector("[data-champion-status]");
  const championRoleButtons = Array.from(document.querySelectorAll("[data-champion-role]"));

  if (
    !shell || !dashboard || !searchPage || !leaderboardPage || !championsPage || !championDetailPage || !championDetailContent ||
    !pageForm || !pageInput || !backButton ||
    !clearButton || !resultList || !resultHeading ||
    !resultCount || !emptyMessage || !homeButton || !searchButton || !leaderboardButton || !championsButton ||
    !championGrid || !championCount || !championStatus || championRoleButtons.length === 0
  ) return;

  function setupMenuSize() {
    const rail = shell.querySelector(".rail"), brand = rail?.querySelector(".rail-brand");
    if (!brand || brand.querySelector(".rail-size-toggle")) return;
    const storageKey = "paladinscat-discovery-menu-size";
    const toggle = document.createElement("button");
    toggle.type = "button"; toggle.className = "rail-size-toggle";
    toggle.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chevron-right\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m9 18 6-6-6-6\"></path></svg>";
    if (!rail.id) rail.id = "dashboard-sidebar";
    toggle.setAttribute("aria-controls", rail.id);
    brand.append(toggle);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "expanded" || saved === "collapsed") shell.dataset.menuSize = saved;
    } catch {}
    function sync() {
      const style = getComputedStyle(shell);
      const midpoint = (parseFloat(style.getPropertyValue("--rail-collapsed-width")) + parseFloat(style.getPropertyValue("--rail-expanded-width"))) / 2;
      const expanded = shell.dataset.menuSize ? shell.dataset.menuSize === "expanded" : rail.getBoundingClientRect().width > midpoint;
      const label = expanded ? M("discovery.menu.collapse", undefined, "Collapse and pin menu") : M("discovery.menu.expand", undefined, "Expand and pin menu");
      toggle.setAttribute("aria-expanded", String(expanded));
      nativeAttribute(toggle, "aria-label", label); nativeAttribute(toggle, "title", label);
    }
    toggle.addEventListener("click", () => {
      const size = toggle.getAttribute("aria-expanded") === "true" ? "collapsed" : "expanded";
      shell.dataset.menuSize = size;
      try { localStorage.setItem(storageKey, size); } catch {}
      sync();
    });
    new ResizeObserver(sync).observe(rail);
    sync();
  }
  setupMenuSize();

  championsButton.setAttribute("aria-controls", "champions-page");
  let selectedChampion = null;
  let detailReturnFocus = null;
  let skillIconTimer = 0;
  let championCardCooldowns = {};
  let championTitles = {};
  let championIds = {};
  const championCardMetricRequests = new Map();
  const selectedTalentsByChampion = new Map();
  let activeCardMetrics = null;
  let cardPercentageColor = null;
  let cardPercentageColorRequest = null;
  const championMetricRequests = new Map();
  const championTalentMetricRequests = new Map();
  const initialDocumentTitle = document.title;



  function normalize(value) {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  }

  function setView(view) {
    const inSearch = view === "search";
    const inLeaderboard = view === "leaderboard";
    const inChampions = view === "champions";
    const inChampionDetail = view === "champion-detail";
    const inMaps = view === "maps";
    const inMapDetail = view === "map-detail";
    const inItems = view === "items";
    shell.dataset.view = view;
    dashboard.inert = inSearch || inLeaderboard || inChampions || inChampionDetail || inMaps || inMapDetail || inItems;
    dashboard.setAttribute("aria-hidden", String(inSearch || inLeaderboard || inChampions || inChampionDetail || inMaps || inMapDetail || inItems));
    searchPage.inert = !inSearch;
    searchPage.setAttribute("aria-hidden", String(!inSearch));
    leaderboardPage.inert = !inLeaderboard;
    leaderboardPage.setAttribute("aria-hidden", String(!inLeaderboard));
    championsPage.inert = !inChampions;
    championsPage.setAttribute("aria-hidden", String(!inChampions));
    championDetailPage.inert = !inChampionDetail;
    championDetailPage.setAttribute("aria-hidden", String(!inChampionDetail));
    for (const [page, active] of [[mapsPage, inMaps], [mapDetailPage, inMapDetail], [itemsPage, inItems]]) {
      page.inert = !active;
      page.setAttribute("aria-hidden", String(!active));
    }

    // Reset every menu entry, including pages registered by independent modules.
    for (const button of shell.querySelectorAll(".rail .rail-button")) {
      button.classList.remove("active");
      button.removeAttribute("aria-current");
    }

    for (const [button, active] of [
      [homeButton, view === "dashboard"],
      [searchButton, inSearch],
      [leaderboardButton, inLeaderboard],
      [championsButton, inChampions || inChampionDetail],
      [mapsButton, inMaps || inMapDetail],
      [itemsButton, inItems],
    ]) {
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    document.title = inChampionDetail && selectedChampion
      ? selectedChampion.name + " · PaladinsCat"
      : inMapDetail && selectedMap ? selectedMap.name + " · PaladinsCat"
      : inMaps ? String(M("menu.maps", undefined, "Maps")) + " · PaladinsCat"
      : inItems ? String(M("menu.items", undefined, "Items")) + " · PaladinsCat"
      : initialDocumentTitle;
    if (!inChampionDetail) stopSkillIconCycle();
  }

  const searchText = (key, fallback, values) => window.DiscoveryLocale.t(key, values, fallback);
  const searchTypes = ['player', 'match', 'champion', 'talent', 'card', 'item'];
  const searchTypeKeys = {player:'generated.players.player',match:'generated.matches.match',champion:'generated.matches.champion',talent:'generated.matches.talent',card:'generated.matches.card',item:'generated.matches.item'};
  const searchTypeLabel = type => M(searchTypeKeys[type], undefined, type[0].toUpperCase()+type.slice(1));
  let searchLogicRequest;
  function searchLogic() {
    return searchLogicRequest ||= Promise.all([import('./discovery-search-state.js'), import('./discovery-search-reference.js')]).catch(error => { searchLogicRequest = null; throw error; });
  }
  const searchActions = document.createElement('div');
  searchActions.className = 'reference-filters search-remote-actions'; searchActions.hidden = true;
  document.querySelector('.search-page-results').before(searchActions);
  let searchResults = [];
  function createResult(player) {
    const playerId = String(player.id ?? player.player_id);
    const resultType = player.type || 'player';
    const playerName = player.title || player.name || player.player_name || player.display_name || player.alias || "Player " + playerId;
    const row = document.createElement("article");
    row.className = "search-page-result";
    row.tabIndex = 0;
    row.setAttribute("role", "link");
    nativeAttribute(row, "aria-label", M("discovery.search.viewResult", {name:playerName}, "View {name}"));
    const navigate = () => window.DiscoveryApp.navigate(player.href || "/players/" + encodeURIComponent(playerId));
    row.addEventListener("click", navigate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); navigate(); }
    });

    const resultChampion = resultType === 'champion' ? playerName : player.meta?.championName;
    const resultImage = player.avatar || (resultChampion ? championIconPath(resultChampion) : null);
    if (resultImage) {
      const avatar = document.createElement("img");
      avatar.src = resultImage;
      avatar.alt = "";
      avatar.width = 40;
      avatar.height = 40;
      avatar.className = "search-result-avatar";
      row.append(avatar);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "search-result-avatar search-result-avatar-fallback";
      fallback.setAttribute("aria-hidden", "true");
      fallback.textContent = playerName.slice(0, 1);
      row.append(fallback);
    }

    const details = document.createElement("div");
    details.className = "search-result-details";
    const titleLine = document.createElement("div");
    titleLine.className = "search-result-title-line";
    const title = document.createElement("span");
    title.className = "search-result-title";
    title.textContent = playerName;
    if (resultType === 'player' && /^[1-9]\d*$/.test(playerId) && window.DiscoveryPlayerName) window.DiscoveryPlayerName.prepare(title, playerName, {id:playerId});
    const type = document.createElement("span");
    type.className = "search-result-type";
    nativeText(type, searchTypeLabel(resultType));
    titleLine.append(title, type);

    const subtitle = document.createElement("p");
    subtitle.className = "search-result-subtitle";
    subtitle.textContent = player.subtitle || [playerId, player.platform, player.region].filter(Boolean).join(" · ");
    details.append(titleLine, subtitle);
    row.append(details);

    const arrow = document.createElement("span");
    arrow.className = "search-result-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    row.append(arrow);
    return row;
  }

  function paintSearchResults(matches) {
    const safe = matches.filter(result => {
      if (!searchTypes.includes(result.type) || !result.title || typeof result.href !== 'string') return false;
      try { const url = new URL(result.href, location.origin); return url.origin === location.origin && window.DiscoveryApp.hasRoute(url.pathname); } catch { return false; }
    });
    searchResults = safe;
    resultList.replaceChildren(...safe.map(createResult)); resultHeading.hidden = !safe.length;
    const types = [...new Set(safe.map(result => result.type))];
    nativeText(resultHeading.querySelector("h2"), types.length === 1 ? searchTypeLabel(types[0]) : M("generated.search.search", undefined, "Search"));
    resultCount.textContent = window.DiscoveryLocale.formatNumber(safe.length);
    for (const category of document.querySelectorAll('[data-search-type]')) {
      const count = category.querySelector('b'); if (count) count.textContent = window.DiscoveryLocale.formatNumber(safe.filter(result => result.type === category.dataset.searchType).length);
    }
    emptyMessage.hidden = safe.length > 0;
    nativeText(emptyMessage, safe.length ? "" : M("generated.search.noResultsFound", undefined, "No results found"));
  }

  function paintSearchActions(query, current, controller) {
    searchActions.replaceChildren();
    const numeric = /^\d{2,}$/.test(query), matchId = /^\d{10,13}$/.test(query) && Number(query) >= 1000000000;
    const playerName = (/^(xbox|xbl|psn|ps|playstation|switch|nintendo)[:/].{2,64}$/i.test(query) || (query.length >= 3 && query.length <= 32 && !/^\d+$/.test(query))) && !/[,%*?]/.test(query);
    const actions = [[numeric && !matchId,'player-id','generated.search.lookUpPlayerId','Look up player ID'],[matchId,'match-id','generated.search.lookUpMatchId','Look up match ID'],[playerName,'player-name','generated.search.searchHiRezExactPlayerName','Search Hi-Rez']];
    for (const [show,target,key,fallback] of actions) {
      if (!show) continue;
      const action = document.createElement('button'); action.type = 'button'; action.className = 'reference-filter'; nativeText(action, M(key, undefined, fallback));
      action.addEventListener('click',async () => {
        if (!current()) return;
        for (const control of searchActions.querySelectorAll('button')) control.disabled = true;
        resultList.setAttribute('aria-busy','true');
        try {
          const params = new URLSearchParams({q:query,limit:'36',remote:'true',remoteTarget:target}); if (target === 'match-id') params.set('refresh','true');
          const raw = await window.DiscoveryApp.request('/search/universal?'+params,{signal:controller.signal});
          if (!current()) return;
          const [logic] = await searchLogic(); if (!current()) return;
          paintSearchResults(logic.mergeResults([...searchResults,...raw.data]));
          if (!raw.data.length) { emptyMessage.hidden = false; nativeText(emptyMessage, M("generated.search.noResultsFound", undefined, "No results found")); }
        } catch { if (current()) { emptyMessage.hidden = false; nativeText(emptyMessage, M("generated.search.remoteLookupUnavailable", undefined, "Remote lookup unavailable")); } }
        finally { if (current()) { resultList.setAttribute('aria-busy','false'); for (const control of searchActions.querySelectorAll('button')) control.disabled = false; } }
      });
      searchActions.append(action);
    }
    searchActions.hidden = !searchActions.children.length;
  }

  async function renderResults() {
    const query = pageInput.value.trim();
    const sequence = renderResults.sequence = (renderResults.sequence || 0) + 1;
    renderResults.controller?.abort();
    const controller = new AbortController();
    renderResults.controller = controller;
    const current = () => sequence === renderResults.sequence && shell.dataset.view === "search" && pageInput.value.trim() === query;

    clearButton.hidden = pageInput.value.length === 0;
    resultList.replaceChildren();
    searchActions.hidden = true; searchActions.replaceChildren(); searchResults = [];
    resultHeading.hidden = true;
    resultCount.textContent = nativeNumber(0);
    emptyMessage.replaceChildren();
    for (const category of document.querySelectorAll("[data-search-type]")) {
      const count = category.querySelector("b");
      if (count) count.textContent = nativeNumber(0);
    }
    if (shell.dataset.view === "search") window.DiscoveryApp?.record("search", query ? "/search?q=" + encodeURIComponent(query) : "/search");
    if (query.length < 2 || shell.dataset.view !== "search") {
      resultList.setAttribute("aria-busy", "false");
      emptyMessage.hidden = query.length === 0;
      if (query) nativeText(emptyMessage, M("discovery.search.minimum", undefined, "Enter at least two characters or a player ID."));
      return;
    }

    resultList.setAttribute("aria-busy", "true");
    emptyMessage.hidden = false;
    nativeText(emptyMessage, M("generated.search.searching", undefined, "Searching…"));
    try {
      const [logic, references] = await searchLogic();
      const localPromise = references.loadStaticReferenceIndex().then(index => references.staticReferenceResults(query,index)).catch(() => []);
      const remotePromise = window.DiscoveryApp.request('/search/universal?q='+encodeURIComponent(query)+'&limit=36',{signal:controller.signal});
      const [remote, local] = await Promise.allSettled([remotePromise, localPromise]);
      if (!current()) return;
      const bundled = local.status === 'fulfilled' ? local.value : [];
      if (remote.status === 'rejected' && !bundled.length) throw remote.reason;
      const returned = remote.status === 'fulfilled' ? remote.value.data : [];
      if (!Array.isArray(returned)) throw new Error('Invalid search response');
      paintSearchResults(logic.mergeResults([...returned,...bundled]).slice(0,48));
      paintSearchActions(query,current,controller);
    } catch (error) {
      if (!current()) return;
      const restricted = [401, 403].includes(Number(error.status || error.statusCode));
      emptyMessage.hidden = false;
      nativeText(emptyMessage, restricted ? M("discovery.search.restricted", undefined, "This view requires a signed-in account with the appropriate access.") : M("generated.search.searchUnavailable", undefined, "Search unavailable"));
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "reference-filter";
      nativeText(retry, M("async.tryAgain", undefined, "Try again"));
      retry.addEventListener("click", () => void renderResults());
      emptyMessage.append(" ", retry);
      if (restricted) {
        const account = document.createElement("a");
        account.href = "/account";
        account.className = "reference-filter";
        nativeText(account, M("seo.auth.title", undefined, "Account access"));
        emptyMessage.append(" ", account);
      }
    } finally {
      if (current()) resultList.setAttribute("aria-busy", "false");
    }
  }

  const championIconAliases = new Map([
    ["bettylabomba", "BettyLaBomba"],
    ["bombking", "BombKing"],
    ["shalin", "ShaLin"],
    ["maldamba", "Mal'Damba"],
    ["vii", "VII"],
  ]);
  let championCatalog = null;
  let championCatalogRequest = null;
  let activeChampionRole = "all";

  function championSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function championIconPath(name) {
    const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
    const fileName = championIconAliases.get(normalized) || name;
    return "/images/champions/Champion " + fileName + " Icon.avif";
  }

  function createChampionCard(champion) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "champion-card";
    card.dataset.championSlug = champion.slug;
    nativeAttribute(card, "aria-label", M("common.summary.valueMetric", {value:champion.name, metric:String(nativeRole(champion.role))}, "{value}, {metric}"));

    const portrait = document.createElement("span");
    portrait.className = "champion-card-portrait";
    const image = document.createElement("img");
    image.src = championIconPath(champion.name);
    image.alt = "";
    image.width = 48;
    image.height = 48;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.onerror = null;
      image.src = "/images/champions/Champion_Generic_Icon.avif";
    }, { once: true });
    portrait.append(image);

    const details = document.createElement("span");
    details.className = "champion-card-details";
    const name = document.createElement("span");
    name.className = "champion-card-name";
    name.textContent = champion.name;
    const role = document.createElement("span");
    role.className = "champion-card-role";
    const roleIcon = document.createElement("img");
    roleIcon.src = "/images/icons/Class_" + (champion.role === "Frontline" ? "Front_Line" : champion.role) + "_Icon.avif";
    roleIcon.alt = "";
    roleIcon.width = 13;
    roleIcon.height = 13;
    role.append(roleIcon, document.createTextNode(champion.role));
    nativeText(role, nativeRole(champion.role));
    details.append(name, role);
    card.append(portrait, details);
    return card;
  }

  function renderChampionCards() {
    const visible = championCatalog
      .filter((champion) => activeChampionRole === "all" || champion.role === activeChampionRole)
      .sort((a, b) => a.name.localeCompare(b.name));
    nativeText(championCount, activeChampionRole === "all"
      ? M("discovery.champions.count", {count:nativeNumber(championCatalog.length)}, "{count} champions")
      : M("discovery.champions.filteredCount", {count:nativeNumber(visible.length), role:String(nativeRole(activeChampionRole)).toLocaleLowerCase(window.DiscoveryLocale.locale())}, "{count} {role} champions"));
    championGrid.replaceChildren(...visible.map(createChampionCard));
    championGrid.setAttribute("aria-busy", "false");
  }

  const championRoleIconPaths = {
    Frontline: "/images/icons/Class_Front_Line_Icon.avif",
    Damage: "/images/icons/Class_Damage_Icon.avif",
    Flank: "/images/icons/Class_Flank_Icon.avif",
    Support: "/images/icons/Class_Support_Icon.avif",
  };
  let championChangelogs = null;
  let championChangelogsRequest = null;

  function detailNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) window.DiscoveryLocale.setText(node, value);
    return node;
  }

  function detailImage(src, alt, className, width, height, fallback = null) {
    if (!src) return null;
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt || "";
    if (className) image.className = className;
    if (width) image.width = width;
    if (height) image.height = height;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      if (fallback && image.dataset.fallbackUsed !== "true") {
        image.dataset.fallbackUsed = "true";
        image.src = fallback;
      } else {
        image.remove();
      }
    });
    return image;
  }

  function detailSection(title, className = "champion-detail-section") {
    const section = detailNode("section", className);
    nativeAttribute(section, "aria-label", title);
    section.append(detailNode("h2", "champion-detail-section-title", title));
    return section;
  }

  function formatLoadoutDescription(description, level = 1) {
    const safeLevel = Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
    const number = (value) => nativeNumber(Number(value), { maximumFractionDigits: 2 });
    const numericPattern = "(-?(?:[\\d,]+(?:\\.\\d*)?|\\.\\d+))";
    return String(description || "")
      .replace(/^\s*(?:\[[^\]]+\]\s*)+/, "")
      .replace(new RegExp("\\{\\s*(?:scale\\s*=\\s*)?" + numericPattern + "\\s*\\|\\s*" + numericPattern + "\\s*\\}", "gi"), (_match, baseText, stepText) => {
        const base = Number(String(baseText).replace(/,/g, ""));
        const step = Number(String(stepText).replace(/,/g, ""));
        return number(base + step * (safeLevel - 1));
      })
      .replace(new RegExp("\\{\\s*" + numericPattern + "\\s*\\}", "g"), (_match, value) => number(String(value).replace(/,/g, "")));
  }

  const loadoutFrameRarities = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

  function loadoutFramePath(level) {
    return "/images/cards/frames/Card_Frame_Level_" + level + "_" + loadoutFrameRarities[level - 1] + ".avif";
  }

  function formatLoadoutCooldown(cooldown, level) {
    const text = String(cooldown || "").trim();
    const range = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*[-–]\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/);
    const value = range
      ? Number(range[1]) + (Number(range[2]) - Number(range[1])) * ((level - 1) / 4)
      : Number(text.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(value)) return text;
    return nativeNumber(value, { maximumFractionDigits: 2 });
  }

  function updateLoadoutRank(card, level) {
    const safeLevel = Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
    const frame = card.querySelector(".champion-loadout-frame");
    const description = card.querySelector(".champion-loadout-description");
    const cooldown = card.querySelector(".champion-loadout-cooldown-value");
    const cooldownBadge = card.querySelector(".champion-loadout-cooldown");
    const levelValue = card.querySelector(".champion-loadout-level");
    const levelButtons = card.querySelectorAll("[data-loadout-step]");
    const name = card.dataset.cardName || String(M("generated.matches.card", undefined, "Card"));
    card.dataset.level = String(safeLevel);
    if (frame) frame.src = loadoutFramePath(safeLevel);
    if (description) description.textContent = formatLoadoutDescription(card.dataset.description, safeLevel);
    if (cooldown) {
      const formattedCooldown = formatLoadoutCooldown(card.dataset.cooldown, safeLevel);
      cooldown.textContent = formattedCooldown;
      if (cooldownBadge) nativeAttribute(cooldownBadge, "aria-label", M("discovery.champion.cardCooldown", {seconds:formattedCooldown}, "Card cooldown {seconds} seconds"));
    }
    if (levelValue) levelValue.textContent = nativeNumber(safeLevel);
    levelButtons.forEach((button) => {
      const step = Number(button.dataset.loadoutStep);
      const nextLevel = safeLevel + step;
      button.disabled = nextLevel < 1 || nextLevel > 5;
      nativeAttribute(button, "aria-label", M(step < 0 ? "discovery.champion.lowerLevel" : "discovery.champion.raiseLevel", {name,level:nativeNumber(Math.max(1, Math.min(5, nextLevel)))}, step < 0 ? "Lower {name} to level {level}" : "Raise {name} to level {level}"));
      nativeAttribute(button, "title", M("discovery.champion.levelTitle", {name,level:nativeNumber(safeLevel),step:step < 0 ? " −" : " +"}, "{name} · level {level}{step}"));
    });
    if (activeCardMetrics?.section.contains(card)) {
      renderLoadoutTalentMetricRows(activeCardMetrics, card);
      updateCardMetricStatus(activeCardMetrics);
    }
  }


  function championMetricNumber(value, count = false) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    if (count ? !Number.isSafeInteger(number) : number > 100) return null;
    return number;
  }

  function loadChampionMetricScope(scope, refresh = false) {
    const queueId = scope === "casual" ? 424 : 486;
    const cacheKey = window.DiscoveryApp.scopedPath("/stats/champions?scope="+scope+"&queueId="+queueId);
    const existing = championMetricRequests.get(cacheKey);
    if (!refresh && existing && existing.expires > Date.now()) return existing.promise;
    // A cold statistic read can legitimately take longer than ten seconds while
    // the projection is rebuilt; aborting there left the panel blank until the
    // visitor refreshed the page. Give the request a wider window and retry once
    // for transient aborts/network faults, so a slow first load still resolves.
    const retryable = (error) => error && (error.name === "TimeoutError" || error.name === "AbortError" || error.name === "TypeError");
    const fetchScope = (attempt) => window.DiscoveryApp.scopedFetch("/api/v1/stats/champions?scope=" + scope + "&queueId=" + queueId + "&limit=200", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Champion statistics unavailable");
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Invalid champion statistics");
      return rows;
    }).catch((error) => {
      if (attempt < 2 && retryable(error)) return fetchScope(attempt + 1);
      throw error;
    });
    const promise = fetchScope(1).catch((error) => {
      if (championMetricRequests.get(cacheKey)?.promise === promise) championMetricRequests.delete(cacheKey);
      throw error;
    });
    championMetricRequests.set(cacheKey, { promise, expires: Date.now() + 300000 });
    return promise;
  }

  function countedChampionWinRate(row) {
    const wins = championMetricNumber(row?.wins, true), losses = championMetricNumber(row?.losses, true);
    return wins !== null && losses !== null && wins + losses > 0
      ? 100 * wins / (wins + losses) : null;
  }

  function renderChampionMetrics(champion) {
    const section = detailNode("section", "champion-detail-metrics");
    nativeAttribute(section, "aria-label", M("discovery.champion.siegeStatistics", undefined, "Siege statistics"));
    const grid = detailNode("dl", "champion-detail-metric-grid");
    const values = new Map();
    for (const [key, label] of [
      ["plays", M("discovery.champion.casualPlayCount", undefined, "Casual play count")], ["winRate", M("discovery.champion.casualWinRate", undefined, "Casual win rate")],
      ["rankedPlays", M("discovery.champion.rankedPlayCount", undefined, "Ranked play count")], ["rankedWinRate", M("discovery.champion.rankedWinRate", undefined, "Ranked win rate")],
    ]) {
      const item = detailNode("div", "champion-detail-metric");
      item.dataset.metric = key;
      const name = detailNode("dt", "champion-detail-metric-label", label);
      const value = detailNode("dd", "champion-detail-metric-value", "—");
      values.set(key, value);
      item.append(name, value);
      grid.append(item);
    }
    const status = detailNode("p", "champion-detail-metric-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const retry = detailNode("button", "champion-metrics-retry", M("discovery.choice.retryMetrics",undefined,"Retry metrics"));
    retry.type = "button";
    retry.hidden = true;
    section.append(grid, status, retry);
    const update = async (refresh = false) => {
      section.setAttribute("aria-busy", "true");
      nativeText(status, M("discovery.champion.loadingMetrics", undefined, "Loading metrics…"));
      retry.hidden = true;
      const results = await Promise.allSettled([loadChampionMetricScope("casual", refresh), loadChampionMetricScope("ranked", refresh)]);
      // A late response belongs only to the profile that requested it.
      if (!section.isConnected) return;
      section.discoveryMetricResults = results;
      draw(results);
    };
    const draw = results => {
      const unavailable = [];
      for (const [index, scope, playsKey, rateKey] of [
        [0, "Casual Siege", "plays", "winRate"], [1, "Ranked", "rankedPlays", "rankedWinRate"],
      ]) {
        const result = results[index];
        const matches = result.status === "fulfilled" ? result.value.filter((row) => championReferenceKey(row.champion_name || "") === championReferenceKey(champion.name)) : [];
        const row = matches.length === 1 ? matches[0] : null;
        const plays = row ? championMetricNumber(row.total_matches ?? row.total_plays, true) : null;
        const rate = row ? countedChampionWinRate(row) : null;
        values.get(playsKey).textContent = plays === null ? "—" : nativeNumber(plays);
        values.get(rateKey).textContent = rate === null ? "—" : nativeNumber(rate, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
        if (plays === null || rate === null) unavailable.push(scope);
      }
      section.setAttribute("aria-busy", "false");
      nativeText(status, unavailable.length > 1 ? M("discovery.champion.bothMetricsUnavailable", undefined, "Casual Siege and Ranked metrics unavailable.") : unavailable.length ? M("discovery.champion.metricsUnavailable", {scope:String(unavailable[0] === "Casual Siege" ? M("stats.matchups.siege", undefined, "Casual Siege") : M("generated.players.ranked", undefined, "Ranked"))}, "{scope} metrics unavailable.") : "");
      retry.hidden = !results.some((result) => result.status === "rejected");
    };
    section.discoveryRefreshLocale = () => { if (section.discoveryMetricResults) draw(section.discoveryMetricResults); };
    retry.addEventListener("click", () => { void update(true); });
    // Start after this synchronous renderer has attached the profile.
    queueMicrotask(() => { if (section.isConnected) void update(); });
    return section;
  }

  function championBannerPath(name) {
    const normalized = String(name || "").toLowerCase().replace(/[^a-z]/g, "");
    const exceptions = { bettylabomba: "Betty_la_Bomba", maldamba: "Mal'Damba", vii: "VII" };
    const stem = exceptions[normalized] || String(name || "").trim().replaceAll(" ", "_");
    return "/images/champions/Banner_" + encodeURIComponent(stem) + ".avif";
  }

  function renderChampionProfile(champion) {
    const data = champion.data || {};
    const profile = detailNode("section", "champion-detail-profile");
    profile.style.setProperty("--champion-banner", "url(" + JSON.stringify(championBannerPath(champion.name)) + ")");
    nativeAttribute(profile, "aria-label", M("discovery.champion.overview", {name:champion.name}, "{name} overview"));
    profile.dataset.champion = champion.slug;
    const identity = detailNode("div", "champion-detail-profile-identity");
    const titleRow = detailNode("div", "champion-detail-title-row");
    titleRow.append(detailNode("h1", "champion-detail-title", champion.name));
    const roles = Array.isArray(data.roles) && data.roles.length ? data.roles : champion.roles;
    roles.forEach((roleName) => {
      const badge = detailNode("span", "champion-detail-role", nativeRole(roleName));
      const iconPath = championRoleIconPaths[roleName];
      if (iconPath) badge.prepend(detailImage(iconPath, "", "", 14, 14));
      titleRow.append(badge);
    });
    const nameGroup = detailNode("div", "champion-detail-name-group");
    nameGroup.append(titleRow, detailNode("p", "champion-detail-subtitle", championTitles[champion.slug] || M("discovery.champion.titleUnavailable", undefined, "Title unavailable")));
    identity.append(nameGroup);

    const stats = data.stats || {};
    const statRows = [
      [M("common.metrics.health", undefined, "Health"), stats.health],
      [M("common.metrics.speed", undefined, "Speed"), stats.speed],
      [M("common.metrics.range", undefined, "Range"), stats.range],
      [M("common.metrics.speedUnits", undefined, "Speed units"), stats.speedUnits],
    ].filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (statRows.length) {
      const statGroup = detailNode("div", "champion-detail-stats");
      statRows.forEach(([label, value]) => {
        const item = detailNode("div", "champion-detail-stat");
        item.append(detailNode("span", "champion-detail-stat-label", label));
        const statistic = detailNode("span", "champion-detail-stat-value", typeof value === "number" ? nativeNumber(value, {useGrouping:false}) : value);
        if (typeof value === "number") statistic.dataset.nativeChampionValue = String(value);
        item.append(statistic);
        statGroup.append(item);
      });
      identity.append(statGroup);
    }
    identity.append(renderChampionMetrics(champion));
    profile.append(identity);
    return profile;
  }

  function renderChampionSkills(skills) {
    if (!Array.isArray(skills) || skills.length === 0) return null;
    const grid = detailNode("div", "champion-skills-grid");
    skills.forEach((skill) => {
      const card = detailNode("article", "champion-reference-card champion-skill-card");
      card.dataset.abilitySlot = skill.key;
      const icon = detailNode("div", "champion-skill-icon");
      const icons = [skill.iconUrl, skill.iconUrl2, skill.iconUrl3].filter((url) => typeof url === "string" && url.length > 0);
      if (icons.length) {
        const image = detailImage(icons[0], skill.name, "champion-skill-art", 40, 40);
        if (image && icons.length > 1) image.dataset.skillIcons = JSON.stringify(icons);
        icon.append(image);
      } else {
        icon.append(detailNode("span", "champion-skill-key", skill.key || "—"));
      }

      const details = detailNode("div", "champion-skill-copy");
      const title = detailNode("div", "champion-skill-title");
      if (skill.key) title.append(detailNode("span", "champion-skill-key", skill.key));
      title.append(detailNode("span", "champion-skill-name", skill.name));
      if (skill.damage) title.append(detailNode("span", "champion-skill-meta", M("discovery.champion.damage", {value:skill.damage}, "Damage {value}")));
      if (skill.cooldown) title.append(detailNode("span", "champion-skill-meta", M("discovery.champion.cooldown", {value:skill.cooldown}, "Cooldown {value}")));
      details.append(title);
      if (skill.description) details.append(detailNode("p", "champion-detail-description", skill.description));
      card.append(icon, details);
      grid.append(card);
    });
    return grid;
  }

  function loadChampionTalentMetrics(championId, refresh = false) {
    if (!Number.isSafeInteger(championId) || championId < 1) return Promise.reject(new Error("Champion identity unavailable"));
    const path = "/stats/talents/" + championId + "?mode=ranked", key = window.DiscoveryApp.scopedPath(path);
    const cached = championTalentMetricRequests.get(key);
    if (!refresh && cached && cached.expires > Date.now()) return cached.promise;
    const promise = window.DiscoveryApp.scopedFetch("/api/v1" + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) })
      .then(async response => { if (!response.ok) throw new Error("Talent statistics unavailable"); const data = await response.json(); if (!Array.isArray(data?.talents)) throw new Error("Invalid talent statistics"); return data; })
      .catch(error => { if (championTalentMetricRequests.get(key)?.promise === promise) championTalentMetricRequests.delete(key); throw error; });
    championTalentMetricRequests.set(key, { promise, expires: Date.now() + 300000 });
    return promise;
  }

  function renderChampionTalents(talents, slug, championId) {
    if (!Array.isArray(talents) || talents.length === 0) return null;
    const section = detailSection(M("common.sort.talents",undefined,"Talents"));
    section.classList.add("champion-talent-metrics-section");
    const values = new Map();
    const selected = selectedTalentsByChampion.get(slug) || 0;
    const heading = section.firstElementChild;
    const header = detailNode("div", "champion-talent-filter-header");
    heading.replaceWith(header);
    const reset = detailNode("button", "reference-filter champion-talent-reset", M("discovery.choice.allTalents",undefined,"All talents"));
    reset.type = "button";
    reset.dataset.talentFilter = "0";
    reset.setAttribute("aria-pressed", String(selected === 0));
    reset.classList.toggle("is-active", selected === 0);
    header.append(heading, reset);
    const grid = detailNode("div", "champion-talents-grid");
    grid.setAttribute("role", "group");
    nativeAttribute(grid, "aria-label", M("discovery.champion.talentFilter", undefined, "Filter ranked card metrics by talent"));
    talents.forEach((talent) => {
      const card = detailNode("button", "champion-reference-card champion-talent-card");
      card.type = "button";
      card.dataset.talentFilter = String(talent.id);
      card.setAttribute("aria-label", talent.name);
      card.setAttribute("aria-pressed", String(selected === talent.id));
      const artwork = detailNode("div", "champion-talent-artwork");
      const image = detailImage(talent.iconUrl, "", "", 56, 56);
      if (image) artwork.append(image);
      const copy = detailNode("div", "champion-talent-copy");
      copy.append(detailNode("h3", "champion-talent-name", talent.name));
      if (talent.description) copy.append(detailNode("p", "champion-detail-description", talent.description));
      const metrics = detailNode("dl", "champion-talent-metrics");
      metrics.id = "champion-talent-metrics-" + slug + "-" + talent.id;
      for (const [key, text] of [["plays", M("generated.champions.plays", undefined, "Plays")], ["winRate", M("common.metrics.winRate", undefined, "Win rate")]]) {
        const metric = detailNode("div", "champion-talent-metric"), value = detailNode("dd", "champion-loadout-metric-value", "—");
        metric.append(detailNode("dt", "champion-loadout-metric-label", text), value); metrics.append(metric);
        if (!values.has(Number(talent.id))) values.set(Number(talent.id), {});
        values.get(Number(talent.id))[key] = value;
      }
      copy.append(metrics); card.setAttribute("aria-describedby", metrics.id);
      card.append(artwork, copy);
      grid.append(card);
    });
    const status = detailNode("p", "champion-card-metrics-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const retry = detailNode("button", "champion-metrics-retry", M("discovery.choice.retryMetrics", undefined, "Retry metrics")); retry.type = "button"; retry.hidden = true;
    section.append(grid, status, retry);
    let sequence = 0, result = null;
    const draw = () => {
      for (const [id, nodes] of values) {
        const matches = result?.talents?.filter(talent => Number(talent.talentId) === id) || [], sample = matches.length === 1 ? matches[0] : null;
        const plays = championMetricNumber(sample?.totalPlays, true), winRate = plays !== null && plays > 0 ? championMetricNumber(sample?.winRate) : null;
        nodes.plays.textContent = plays === null ? "—" : nativeNumber(plays);
        nodes.winRate.textContent = winRate === null ? "—" : nativeNumber(winRate, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
        nodes.winRate.style.color = winRate === null || !cardPercentageColor ? "" : cardPercentageColor(winRate);
      }
    };
    const refreshMetrics = async (refresh = false) => {
      const token = ++sequence, path = "/stats/talents/" + championId + "?mode=ranked", scope = window.DiscoveryApp.scopedPath(path);
      result = null; draw(); section.setAttribute("aria-busy", "true"); retry.hidden = true; nativeText(status, M("discovery.champion.loadingMetrics", undefined, "Loading metrics…"));
      try {
        const [data] = await Promise.all([loadChampionTalentMetrics(championId, refresh), loadCardPercentageColors()]);
        if (!section.isConnected || token !== sequence || scope !== window.DiscoveryApp.scopedPath(path)) return;
        result = data; draw(); nativeText(status, "");
      } catch {
        if (!section.isConnected || token !== sequence || scope !== window.DiscoveryApp.scopedPath(path)) return;
        nativeText(status, M("generated.champions.talentStatisticsUnavailable", undefined, "Talent statistics unavailable")); retry.hidden = false;
      }
      section.setAttribute("aria-busy", "false");
    };
    section.discoveryRefreshMetrics = refreshMetrics;
    section.discoveryRefreshLocale = () => { if (result) draw(); };
    retry.addEventListener("click", () => { void refreshMetrics(true); });
    queueMicrotask(() => { if (section.isConnected) void refreshMetrics(); });
    return section;
  }

  function championReferenceText(value) {
    return String(value || "").replace(/&#39;|&#x27;|&apos;/gi, "'").replace(/&amp;/gi, "&");
  }

  function championReferenceKey(value) {
    return normalize(championReferenceText(value)).replace(/[^a-z0-9]/g, "");
  }

  function skillIconReference(url) {
    return String(url).split("/").pop().replace(/\.[^.]+$/, "")
      .replace(/^(?:Ability_|WeaponAttack_)/, "").replace(/_(?:Icon_)?\d+$/, "").replace(/_Icon$/, "");
  }

  // Resolve the base's category names, stance names and existing artwork aliases.
  function loadoutCategoryConnection(category, skills) {
    const key = championReferenceKey(category);
    if (key === "general") return { rank: skills.length, form: 0 };
    const matches = skills.filter((skill) => [skill.name, ...skill.name.split(/\s*\/\s*/),
      ...[skill.iconUrl, skill.iconUrl2, skill.iconUrl3].filter(Boolean).map(skillIconReference)]
      .some((name) => championReferenceKey(name) === key));
    if (matches.length !== 1) return { rank: skills.length + 1, form: 0 };
    const skill = matches[0];
    const icons = [skill.iconUrl, skill.iconUrl2, skill.iconUrl3].filter(Boolean);
    return {
      skill,
      rank: skills.indexOf(skill),
      form: Math.max(0, skill.name.split(/\s*\/\s*/).findIndex((name) => championReferenceKey(name) === key)),
      iconUrl: icons.find((url) => championReferenceKey(skillIconReference(url)) === key) || icons[0],
    };
  }

  function renderChampionLoadouts(loadouts, slug, skills = []) {
    if (!Array.isArray(loadouts) || loadouts.length === 0) return null;
    const section = detailNode("section", "champion-detail-section");
    nativeAttribute(section, "aria-label", M("generated.champions.loadoutCards", undefined, "Loadout cards"));
    const categories = detailNode("div", "champion-loadout-categories");
    const byCategory = new Map();
    loadouts.forEach((loadout) => {
      const category = loadout.category || "General";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(loadout);
    });
    const orderedCategories = Array.from(byCategory.entries()).sort(([left], [right]) => {
      const a = loadoutCategoryConnection(left, skills);
      const b = loadoutCategoryConnection(right, skills);
      return a.rank - b.rank || a.form - b.form;
    });
    const connectedSkills = new Set(orderedCategories.map(([category]) => loadoutCategoryConnection(category, skills).skill).filter(Boolean));
    const slotGroups = new Map();
    orderedCategories.forEach(([category, cards]) => {
      const connection = loadoutCategoryConnection(category, skills);
      const slot = connection.skill?.key || (championReferenceKey(category) === "general" ? "General" : category);
      let slotGroup = slotGroups.get(slot);
      if (!slotGroup) {
        const group = detailNode("section", "champion-loadout-category");
        group.dataset.abilitySlot = slot;
        group.setAttribute("aria-label", connection.skill?.name || championReferenceText(category));
        if (!connection.skill) group.append(detailNode("h3", "champion-loadout-category-title", championReferenceText(category)));
        const groupSkills = connection.skill ? [connection.skill] : slot === "General" ? skills.filter((skill) => !connectedSkills.has(skill)) : [];
        const abilityCards = renderChampionSkills(groupSkills);
        if (abilityCards) group.append(abilityCards);
        const hasForms = orderedCategories.filter(([name]) => loadoutCategoryConnection(name, skills).skill === connection.skill).length > 1;
        const forms = hasForms ? detailNode("div", "champion-loadout-subgroups") : group;
        if (hasForms) group.append(forms);
        slotGroup = { group, forms, hasForms };
        slotGroups.set(slot, slotGroup);
        categories.append(group);
      }
      const sourceGroup = detailNode("div", "champion-loadout-source-group");
      sourceGroup.dataset.category = category;
      if (slotGroup.hasForms) sourceGroup.append(detailNode("h4", "champion-loadout-category-title", championReferenceText(category)));
      const cardGrid = detailNode("div", "champion-loadout-card-grid");
      cards.forEach((loadout) => {
        const cooldownValue = loadout.cooldown ?? championCardCooldowns[slug]?.[loadout.name] ?? "";
        const hasCooldown = cooldownValue !== "" && cooldownValue !== null && cooldownValue !== undefined;
        const card = detailNode("article", "champion-loadout-card" + (hasCooldown ? " has-cooldown" : ""));
        card.dataset.cardName = loadout.name || "Card";
        card.dataset.cardId = String(loadout.id || "");
        card.dataset.description = hasCooldown
          ? String(loadout.description || "").replace(/\s*Card Cooldown:\s*(?:\{[^}]+\}|[\d.]+(?:\s*[-–]\s*[\d.]+)?)s?\.?/i, "").trim()
          : loadout.description || "";
        card.dataset.cooldown = hasCooldown ? String(cooldownValue) : "";
        card.dataset.level = "1";

        const face = detailNode("div", "champion-loadout-face");
        const artwork = detailNode("div", "champion-loadout-artwork");
        const art = detailImage(loadout.iconUrl, "", "champion-loadout-art", 320, 180);
        const frame = detailImage(loadoutFramePath(1), "", "champion-loadout-frame", 316, 480);
        if (frame) frame.setAttribute("aria-hidden", "true");
        const title = detailNode("h3", "champion-loadout-name", loadout.name);
        if ((loadout.name || "").length >= 24) title.classList.add("is-extra-long");
        else if ((loadout.name || "").length >= 19) title.classList.add("is-long");
        const cardBody = detailNode("div", "champion-loadout-card-body");
        const description = detailNode("p", "champion-loadout-description", formatLoadoutDescription(loadout.description, 1));
        const levelValue = detailNode("output", "champion-loadout-level", "1");
        nativeAttribute(levelValue, "aria-label", M("discovery.champion.cardLevel", {name:loadout.name || String(M("generated.matches.card", undefined, "Card"))}, "{name} level"));
        levelValue.setAttribute("aria-live", "polite");

        if (art) artwork.append(art);
        cardBody.append(title, description);
        if (hasCooldown) {
          const cooldown = detailNode("span", "champion-loadout-cooldown");
          nativeAttribute(cooldown, "aria-label", M("discovery.champion.cardCooldown", {seconds:formatLoadoutCooldown(cooldownValue, 1)}, "Card cooldown {seconds} seconds"));
          const cooldownIcon = detailImage("/app/cooldown-icon.png", "", "champion-loadout-cooldown-icon", 18, 18);
          const cooldownText = detailNode("span", "champion-loadout-cooldown-value", formatLoadoutCooldown(cooldownValue, 1));
          if (cooldownIcon) cooldown.append(cooldownIcon);
          cooldown.append(cooldownText);
          cardBody.append(cooldown);
        }

        const levelControls = detailNode("div", "champion-loadout-level-controls");
        const lowerLevel = detailNode("button", "champion-loadout-stepper", "−");
        lowerLevel.type = "button";
        lowerLevel.dataset.loadoutStep = "-1";
        lowerLevel.disabled = true;
        nativeAttribute(lowerLevel, "aria-label", M("discovery.champion.lowerLevel", {name:loadout.name || String(M("generated.matches.card", undefined, "Card")),level:nativeNumber(1)}, "Lower {name} to level {level}"));
        const raiseLevel = detailNode("button", "champion-loadout-stepper", "+");
        raiseLevel.type = "button";
        raiseLevel.dataset.loadoutStep = "1";
        nativeAttribute(raiseLevel, "aria-label", M("discovery.champion.raiseLevel", {name:loadout.name || String(M("generated.matches.card", undefined, "Card")),level:nativeNumber(2)}, "Raise {name} to level {level}"));
        levelControls.append(lowerLevel, raiseLevel);

        const footer = detailNode("div", "champion-loadout-card-footer");
        footer.classList.add("has-card-metrics");
        const metrics = detailNode("table", "champion-loadout-metrics");
        nativeAttribute(metrics, "aria-label", M("discovery.champion.rankedCardMetrics", {name:loadout.name || String(M("generated.matches.card", undefined, "Card"))}, "{name} ranked metrics"));
        const metricHead = detailNode("thead");
        const metricHeader = detailNode("tr");
        for (const label of [M("generated.matches.talent", undefined, "Talent"), M("generated.champions.plays", undefined, "Plays"), M("common.metrics.winRate", undefined, "Win rate")]) {
          const column = detailNode("th", "champion-loadout-metric-label", label);
          column.scope = "col";
          metricHeader.append(column);
        }
        metricHead.append(metricHeader);
        metrics.append(metricHead, detailNode("tbody"));
        const assessment = detailNode("p", "champion-loadout-assessment");
        assessment.hidden = true;
        footer.append(levelControls, metrics, assessment);
        face.append(artwork, cardBody);
        if (frame) face.append(frame);
        face.append(levelValue);
        card.append(face, footer);
        updateLoadoutRank(card, 1);
        cardGrid.append(card);
      });
      sourceGroup.append(cardGrid);
      slotGroup.forms.append(sourceGroup);
    });
    section.append(categories);
    section.dataset.championSlug = slug;
    return section;
  }

  function renderChampionChangelog(history) {
    if (!history || !Array.isArray(history.categories) || history.categories.length === 0) return null;
    const section = detailSection(M("menu.changelog",undefined,"Changelog"));
    section.classList.add("champion-changelog-section");
    const heading = section.querySelector("h2");
    const headingRow = detailNode("div", "champion-changelog-heading");
    headingRow.append(heading);
    if (typeof history.sourceUrl === "string" && /^https:\/\/paladins\.fandom\.com\//.test(history.sourceUrl)) {
      const sourceLink = detailNode("a", "champion-changelog-source", M("discovery.choice.source",undefined,"Source ↗"));
      sourceLink.href = history.sourceUrl;
      sourceLink.target = "_blank";
      sourceLink.rel = "noreferrer noopener";
      headingRow.append(sourceLink);
    }
    section.prepend(headingRow);

    const panel = detailNode("div", "champion-changelog-panel");
    history.categories.forEach((category) => {
      const entries = Array.isArray(category.entries) ? category.entries : [];
      const disclosure = detailNode("details", "champion-changelog-category");
      const summary = detailNode("summary", "champion-changelog-summary");
      summary.append(detailNode("span", "champion-changelog-category-name", category.name || M("common.fallback.general", undefined, "General")));
      const count = detailNode("span", "champion-changelog-count", nativeNumber(entries.length, {useGrouping:false}));
      count.dataset.nativeChampionValue = String(entries.length); summary.append(count);
      disclosure.append(summary);
      const list = detailNode("div", "champion-changelog-entry-list");
      entries.forEach((entry) => {
        const row = detailNode("article", "champion-changelog-entry");
        const identity = detailNode("div", "champion-changelog-identity");
        const image = detailImage(entry.iconUrl, "", "champion-changelog-icon", 36, 36);
        if (image) identity.append(image);
        identity.append(detailNode("h3", "champion-changelog-entry-name", entry.name || ""));
        const trends = detailNode("ul", "champion-changelog-trends");
        (Array.isArray(entry.trends) ? entry.trends : []).forEach((trend) => trends.append(detailNode("li", "", trend)));
        row.append(identity, trends);
        list.append(row);
      });
      disclosure.append(list);
      panel.append(disclosure);
    });
    section.append(panel);
    return section;
  }


  let loadoutModelRequest = null;
  let loadoutModelAttempt = 0;
  function loadLoadoutModel() {
    if (!loadoutModelRequest) {
      let timer;
      const imported = import('/app/discovery-loadout-model.js?v=ai-loadouts-3&attempt=' + loadoutModelAttempt++);
      const timeout = new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('Suggestion model unavailable')), 10000); });
      const request = Promise.race([imported, timeout]).finally(() => window.clearTimeout(timer)).catch((error) => {
        if (loadoutModelRequest === request) loadoutModelRequest = null;
        throw error;
      });
      loadoutModelRequest = request;
    }
    return loadoutModelRequest;
  }

  function formatLoadoutLift(lift) {
    const points = lift * 100;
    return String(M("discovery.choice.points", {value:(points > 0 ? "+" : "") + nativeNumber(points, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, "{value} pp"));
  }

  function choiceReasonLabel(reason) {
    // Exact reason enum from the owning loadout model; authored content is never matched.
    const keys = {
        "Card evidence is unavailable.": "discovery.choice.cardEvidenceUnavailable",
        "Champion baseline is unavailable.": "discovery.choice.baselineUnavailable",
        "Card references are ambiguous.": "discovery.choice.ambiguousCards",
        "Card evidence is incomplete.": "discovery.choice.incompleteEvidence",
        "Card counts are inconsistent.": "discovery.choice.inconsistentCounts",
        "Card level counts are inconsistent.": "discovery.choice.inconsistentLevels",
        "Card level evidence is incomplete.": "discovery.choice.incompleteLevels",
        "The card-selection totals are inconsistent.": "discovery.choice.inconsistentTotals",
        "Champion and talent snapshots do not match.": "discovery.choice.snapshotMismatch",
        "Not enough supported card levels to form a 15-point loadout.": "discovery.choice.insufficientLevels"
    };
    return keys[reason] ? M(keys[reason], undefined, reason) : reason;
  }

  function renderAISuggestions(state) {
    state.aiGrid.replaceChildren();
    state.aiRetry.hidden = !state.aiError;
    state.aiPanel.setAttribute('aria-busy', String(!!state.talentId && (state.loading || state.aiLoading)));
    if (!state.talentId) {
      nativeText(state.aiStatus, M("discovery.choice.selectTalent", undefined, "Select a talent to see three loadout suggestions."));
      return;
    }
    const talent = state.champion.data.talents.find(item => item.id === state.talentId);
    if (state.loading || state.aiLoading) {
      nativeText(state.aiStatus, M("discovery.choice.preparing", {name:talent.name}, "Preparing {name} suggestions…"));
      return;
    }
    const result = state.aiResult;
    if (state.aiError || !result) {
      nativeText(state.aiStatus, M("discovery.choice.unavailable", undefined, "Suggestions unavailable. Retry to load the card evidence and champion baseline."));
      return;
    }
    nativeText(state.aiStatus, M("discovery.choice.baseline", {name:talent.name,rate:nativeNumber((result.baseline.rate * 100), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, "{name} · Ranked Siege · Champion baseline {rate}%"));
    if (result.status !== 'ready') {
      nativeText(state.aiStatus, choiceReasonLabel(result.reason));
      return;
    }
    for (const preset of result.presets) {
      const panel = detailNode('article', 'champion-ai-preset champion-reference-card');
      panel.dataset.aiPreset = preset.id;
      const heading = detailNode('div', 'champion-ai-preset-heading');
      const presetKeys = {popular:["discovery.choice.popular","discovery.choice.popularDescription"],"win-rate":["common.metrics.winRate","discovery.choice.winRateDescription"],optimal:["discovery.choice.optimal","discovery.choice.optimalDescription"]}[preset.id];
      heading.append(detailNode("h3", "champion-ai-preset-name", presetKeys ? M(presetKeys[0], undefined, preset.name) : preset.name));
      panel.append(heading, detailNode("p", "champion-ai-description", presetKeys ? M(presetKeys[1], undefined, preset.description) : preset.description));
      const list = detailNode('ol', 'champion-ai-card-list');
      for (const choice of preset.cards) {
        const row = detailNode('li', 'champion-ai-card-choice');
        row.dataset.cardId = String(choice.cardId);
        row.dataset.cardLevel = String(choice.level);
        const image = detailImage(choice.iconUrl, '', 'champion-ai-card-art', 32, 32);
        if (image) row.append(image);
        const copy = detailNode('div', 'champion-ai-card-copy');
        copy.append(detailNode('span', 'champion-ai-card-name', choice.name));
        const evidence = detailNode('span', 'champion-ai-card-evidence');
        const rate = detailNode('span', 'champion-ai-card-rate', M("discovery.choice.winRate", {rate:nativeNumber((choice.rate * 100), { minimumFractionDigits: 1, maximumFractionDigits: 2 })}, "{rate}% WR"));
        if (cardPercentageColor) rate.style.color = cardPercentageColor(choice.rate * 100);
        evidence.append(document.createTextNode(""), rate);
        nativeText(evidence, M("discovery.choice.playsPrefix", {count:nativeNumber(choice.plays)}, "{count} plays · "));
        copy.append(evidence, detailNode('span', 'champion-ai-card-lift', M("discovery.choice.versusChampion", {lift:formatLoadoutLift(choice.lift)}, "{lift} vs champion")));
        const level = detailNode("span", "champion-ai-card-level", nativeNumber(choice.level));
        nativeAttribute(level, "aria-label", M("common.playerChampions.level", {level:nativeNumber(choice.level)}, "Level {level}"));
        row.append(copy, level); list.append(row);
      }
      panel.append(list);
      state.aiGrid.append(panel);
    }
  }

  function renderCardAssessment(state, card) {
    const assessment = card.querySelector('.champion-loadout-assessment');
    if (!assessment) return;
    assessment.replaceChildren();
    assessment.hidden = !state.talentId || state.loading || !state.aiResult;
    if (assessment.hidden) return;
    const choice = state.aiResult.choices.find(item => item.cardId === Number(card.dataset.cardId) && item.level === Number(card.dataset.level));
    const label = choice?.tag || 'Insufficient evidence';
    assessment.dataset.assessment = label.toLowerCase().replaceAll(' ', '-');
    const tagKeys = {Neutral:"neutral","Insufficient evidence":"insufficient",Avoid:"avoid","Below baseline":"belowBaseline",OP:"op",Underrated:"underrated",Overrated:"overrated"};
    const badge = detailNode("span", "champion-loadout-assessment-tag", tagKeys[label] ? M("discovery.choice." + tagKeys[label], undefined, label) : label);
    nativeAttribute(badge, "title", M("discovery.choice.screeningNote", undefined, "Screening label for this talent and card level; observed results do not establish a causal effect."));
    assessment.append(badge);
    if (choice) {
      const lift = detailNode('span', 'champion-loadout-assessment-lift', formatLoadoutLift(choice.lift));
      nativeAttribute(lift, "title", M("discovery.choice.liftNote", undefined, "Observed win-rate difference against this champion’s counted Ranked Siege baseline."));
      assessment.append(lift);
    }
  }

  async function refreshAISuggestions(state, token, refresh = false) {
    if (!state.talentId || !state.payloadsByTalent.has(state.talentId)) {
      state.aiLoading = false;
      state.aiError = !!state.talentId;
      renderAISuggestions(state);
      return;
    }
    state.aiLoading = true; state.aiError = false; renderAISuggestions(state);
    try {
      const [model, baselines] = await Promise.all([loadLoadoutModel(), loadChampionMetricScope('ranked', refresh)]);
      if (activeCardMetrics !== state || state.token !== token || !state.section.isConnected) return;
      const matches = baselines.filter(row => Number(row.champion_id) === state.champion.id);
      const baseline = matches.length === 1 ? model.championBaseline(matches[0]) : null;
      const result = model.buildLoadoutSuggestions({ cards: state.champion.data.loadouts, payload: state.payloadsByTalent.get(state.talentId), baseline });
      state.aiResult = result;
      state.aiError = result.status === 'unavailable';
      if (baseline) {
        const profile = championDetailContent.querySelector('.champion-detail-metrics');
        const count = profile?.querySelector('[data-metric="rankedPlays"] dd');
        const rate = profile?.querySelector('[data-metric="rankedWinRate"] dd');
        if (count) count.textContent = nativeNumber(baseline.plays);
        if (rate) rate.textContent = nativeNumber((baseline.rate * 100), { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%';
      }
    } catch {
      if (activeCardMetrics !== state || state.token !== token || !state.section.isConnected) return;
      state.aiResult = null; state.aiError = true;
    }
    state.aiLoading = false;
    renderAISuggestions(state);
    renderCardMetricValues(state);
  }

  function loadChampionCardMetrics(championId, talentId, refresh = false) {
    if (!Number.isSafeInteger(championId) || championId < 1) return Promise.reject(new Error("Champion identity unavailable"));
    const key = window.DiscoveryApp.scopedPath("/stats/cards/"+championId+"?mode=ranked&talentId="+(talentId||""));
    const cached = championCardMetricRequests.get(key);
    if (!refresh && cached && cached.expires > Date.now()) return cached.promise;
    const query = new URLSearchParams({ mode: "ranked" });
    if (talentId) query.set("talentId", String(talentId));
    const promise = window.DiscoveryApp.scopedFetch("/api/v1/stats/cards/" + championId + "?" + query, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Card metrics unavailable");
      const payload = await response.json();
      if (!Array.isArray(payload?.cards) || Number(payload.talentId || 0) !== talentId) throw new Error("Card metric filter mismatch");
      // Match the existing API client's legacy-reference deduplication.
      const byName = new Map();
      for (const row of payload.cards) {
        const name = championReferenceKey(row.cardName);
        if (!name) continue;
        const existing = byName.get(name);
        const plays = championMetricNumber(row.totalPlays, true);
        const existingPlays = existing ? championMetricNumber(existing.totalPlays, true) : null;
        if (!existing || (plays ?? -1) > (existingPlays ?? -1)) byName.set(name, row);
      }
      return { cards: Array.from(byName.values()), totalMatches: payload.totalMatches, talentId: payload.talentId };
    }).catch((error) => {
      if (championCardMetricRequests.get(key)?.promise === promise) championCardMetricRequests.delete(key);
      throw error;
    });
    championCardMetricRequests.set(key, { promise, expires: Date.now() + 300000 });
    return promise;
  }

  function visibleCardTalents(state) {
    const talents = state.champion.data.talents || [];
    return state.talentId ? talents.filter((talent) => talent.id === state.talentId) : talents;
  }

  function cardMetricsAtLevel(row, level) {
    const unavailable = { plays: null, rate: null };
    if (!row || !Array.isArray(row.levels)) return unavailable;
    const matches = row.levels.filter((entry) => Number(entry.level) === level);
    if (matches.length === 1) return {
      plays: championMetricNumber(matches[0].plays, true),
      rate: championMetricNumber(matches[0].winRate),
    };
    if (matches.length > 1) return unavailable;
    // The endpoint omits unobserved levels. Prove its level counts are complete
    // before treating a missing level as zero samples.
    const seen = new Set();
    let total = 0;
    const complete = row.levels.every((entry) => {
      const rank = Number(entry.level);
      const plays = championMetricNumber(entry.plays, true);
      if (!Number.isInteger(rank) || rank < 1 || rank > 5 || seen.has(rank) || plays === null) return false;
      seen.add(rank);
      total += plays;
      return true;
    });
    return complete && total === championMetricNumber(row.totalPlays, true) ? { plays: 0, rate: null } : unavailable;
  }

  function loadCardPercentageColors() {
    if (!cardPercentageColorRequest) {
      cardPercentageColorRequest = import("/app/discovery-stat-quality.js?v=5f308f541b9e")
        .then((module) => {
          if (typeof module.getPercentageColor !== "function") throw new Error("Percentage colors unavailable");
          cardPercentageColor = module.getPercentageColor;
          if (activeCardMetrics?.section.isConnected) {
            renderCardMetricValues(activeCardMetrics);
            renderAISuggestions(activeCardMetrics);
          }
        })
        .catch(() => { cardPercentageColor = null; });
    }
    return cardPercentageColorRequest;
  }

  function renderCardLevelTrend(levelMetrics, kind, selectedLevel) {
    const trend = detailNode("span", "champion-loadout-level-trend");
    trend.dataset.trendMetric = kind;
    trend.setAttribute("role", "img");
    const maxPlays = Math.max(0, ...levelMetrics.map((metric) => metric.plays ?? 0));
    const descriptions = [];
    levelMetrics.forEach((metric, index) => {
      const level = index + 1;
      const value = kind === "plays" ? metric.plays : metric.plays !== null && metric.plays > 0 ? metric.rate : null;
      const dot = detailNode("span", "champion-loadout-level-dot");
      dot.dataset.trendLevel = String(level);
      dot.dataset.trendValue = value === null ? "" : String(value);
      dot.classList.toggle("is-selected", level === selectedLevel);
      dot.classList.toggle("is-missing", value === null);
      dot.setAttribute("aria-hidden", "true");
      if (value !== null) {
        if (kind === "plays") {
          const intensity = maxPlays > 0 ? value / maxPlays : 0;
          dot.dataset.intensity = String(intensity);
          dot.style.setProperty("--trend-color", "color-mix(in srgb, oklch(from var(--blue) l calc(c * 1.35) h) " + (intensity * 100) + "%, var(--muted))");
        } else if (cardPercentageColor) dot.style.setProperty("--trend-color", cardPercentageColor(value));
      }
      const formatted = value === null ? String(kind === "winRate" && metric.plays === 0 ? M("discovery.champion.noPlays", undefined, "no plays") : M("discovery.champion.unavailable", undefined, "unavailable"))
        : kind === "plays" ? String(M("discovery.champion.playsValue", {count:nativeNumber(value)}, "{count} plays"))
        : String(M("discovery.champion.winRateValue", {rate:nativeNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}, "{rate}% win rate"));
      nativeAttribute(dot, "title", M("discovery.champion.levelDescription", {level:nativeNumber(level),value:formatted}, "Level {level}: {value}"));
      descriptions.push(dot.title);
      trend.append(dot);
    });
    const label = String(kind === "plays" ? M("generated.champions.plays", undefined, "Plays") : M("common.metrics.winRate", undefined, "Win rate"));
    nativeAttribute(trend, "aria-label", M("discovery.champion.levelTrend", {metric:label,details:descriptions.join(". ")}, "{metric} by level, 1 to 5. {details}"));
    trend.title = descriptions.join(" · ") + (kind === "plays" ? " · " + String(M("discovery.champion.playsTrendNote", undefined, "Grey to blue is relative to this card and talent's available levels.")) : "");
    return trend;
  }

  function renderLoadoutTalentMetricRows(state, card) {
    const level = Number(card.dataset.level);
    const id = Number(card.dataset.cardId);
    const table = card.querySelector(".champion-loadout-metrics");
    nativeAttribute(table, "aria-label", M("discovery.champion.levelRankedMetrics", {name:card.dataset.cardName,level:nativeNumber(level)}, "{name} · level {level} · Ranked Siege metrics"));
    table.dataset.metricsLevel = String(level);
    const body = table.querySelector("tbody");
    body.replaceChildren();
    let missing = 0;
    for (const talent of visibleCardTalents(state)) {
      const rows = state.rowsByTalent.get(talent.id);
      const row = rows?.find((item) => Number(item.cardId) === id)
        || rows?.find((item) => championReferenceKey(item.cardName) === championReferenceKey(card.dataset.cardName));
      const levelMetrics = Array.from({ length: 5 }, (_, index) => cardMetricsAtLevel(row, index + 1));
      const metric = levelMetrics[level - 1];
      const talentRow = detailNode("tr");
      talentRow.dataset.cardMetricTalent = String(talent.id);
      const identity = detailNode("th", "champion-loadout-metric-talent");
      identity.scope = "row";
      identity.title = talent.name;
      const icon = detailImage(talent.iconUrl, talent.name, "champion-loadout-metric-talent-icon", 28, 28);
      if (icon) identity.append(icon); else identity.textContent = talent.name;
      const plays = detailNode("td", "champion-loadout-metric-value");
      plays.dataset.cardMetric = "plays";
      plays.append(detailNode("span", "champion-loadout-metric-number", metric.plays === null ? "—" : nativeNumber(metric.plays)),
        renderCardLevelTrend(levelMetrics, "plays", level));
      const rate = detailNode("td", "champion-loadout-metric-value");
      rate.dataset.cardMetric = "winRate";
      const rateAvailable = metric.plays !== null && metric.plays > 0 && metric.rate !== null;
      const rateNumber = detailNode("span", "champion-loadout-metric-number", !rateAvailable ? "—"
        : nativeNumber(metric.rate, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%");
      if (rateAvailable && cardPercentageColor) rateNumber.style.color = cardPercentageColor(metric.rate);
      rate.append(rateNumber, renderCardLevelTrend(levelMetrics, "winRate", level));
      talentRow.append(identity, plays, rate);
      body.append(talentRow);
      if (metric.plays === null || (metric.plays !== 0 && metric.rate === null)) missing++;
    }
    card.dataset.metricsUnavailable = String(missing > 0);
    renderCardAssessment(state, card);
  }

  function renderCardMetricValues(state) {
    state.section.querySelectorAll(".champion-loadout-card").forEach((card) => renderLoadoutTalentMetricRows(state, card));
  }

  function updateCardMetricStatus(state) {
    if (state.loading) return;
    const failed = state.failedTalentIds.size;
    nativeText(state.status, failed ? (failed === visibleCardTalents(state).length ? M("discovery.champion.cardMetricsUnavailable", undefined, "Card metrics unavailable.") : M("discovery.champion.someTalentMetricsUnavailable", undefined, "Some talent metrics are unavailable."))
      : state.section.querySelector('[data-metrics-unavailable="true"]') ? M("discovery.champion.someCardMetricsUnavailable", undefined, "Some card level metrics are unavailable.") : "");
    state.retry.hidden = failed === 0;
    state.metricsHeader.hidden = !state.status.textContent && state.retry.hidden;
  }

  async function refreshChampionCardMetrics(state, refresh = false) {
    const token = ++state.token;
    const talents = visibleCardTalents(state);
    state.section.setAttribute("aria-busy", "true");
    state.loading = true;
    state.rowsByTalent = new Map();
    state.payloadsByTalent = new Map();
    state.aiResult = null;
    state.aiError = false;
    state.aiLoading = !!state.talentId;
    renderAISuggestions(state);
    state.failedTalentIds = new Set();
    state.metricsHeader.hidden = false;
    nativeText(state.status, M("discovery.champion.loadingTalentMetrics", undefined, "Loading talent metrics…"));
    state.retry.hidden = true;
    renderCardMetricValues(state);
    const results = await Promise.allSettled(talents.map((item) => loadChampionCardMetrics(state.champion.id, item.id, refresh)));
    if (activeCardMetrics !== state || state.token !== token || !state.section.isConnected) return;
    results.forEach((result, index) => {
      const id = talents[index].id;
      if (result.status === "fulfilled") {
        state.rowsByTalent.set(id, result.value.cards);
        state.payloadsByTalent.set(id, result.value);
      }
      else state.failedTalentIds.add(id);
    });
    state.loading = false;
    renderCardMetricValues(state);
    updateCardMetricStatus(state);
    state.section.setAttribute("aria-busy", "false");
    void refreshAISuggestions(state, token, refresh);
  }

  function initializeChampionCardMetrics(champion, section) {
    const header = detailNode("div", "champion-card-metrics-context");
    const status = detailNode("p", "champion-card-metrics-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const retry = detailNode("button", "champion-metrics-retry", M("discovery.choice.retryCardMetrics",undefined,"Retry card metrics"));
    retry.type = "button";
    retry.hidden = true;
    header.append(status, retry);
    section.prepend(header);
    const aiPanel = detailSection(M("discovery.choice.title",undefined,"PaladinsCat Choice"));
    aiPanel.classList.add('champion-ai-loadouts');
    const aiStatus = detailNode('p', 'champion-ai-context');
    aiStatus.setAttribute('role', 'status');
    aiStatus.setAttribute('aria-live', 'polite');
    const aiGrid = detailNode('div', 'champion-ai-grid');
    const aiRetry = detailNode('button', 'champion-metrics-retry', M("discovery.choice.retrySuggestions",undefined,"Retry suggestions"));
    aiRetry.type = 'button'; aiRetry.hidden = true;
    aiPanel.append(aiStatus, aiGrid, aiRetry);
    section.before(aiPanel);
    const state = { champion, section, metricsHeader: header, status, retry, aiPanel, aiStatus, aiGrid, aiRetry,
      talentId: selectedTalentsByChampion.get(champion.slug) || 0, token: 0, rowsByTalent: new Map(),
      payloadsByTalent: new Map(), failedTalentIds: new Set(), loading: false, aiLoading: false, aiError: false, aiResult: null };
    aiRetry.addEventListener('click', () => { void refreshChampionCardMetrics(state, true); });
    activeCardMetrics = state;
    void loadCardPercentageColors();
    retry.addEventListener("click", () => { void refreshChampionCardMetrics(state, true); });
    void refreshChampionCardMetrics(state);
  }

  function selectChampionCardTalent(talentId) {
    const state = activeCardMetrics;
    if (!state || (talentId && !state.champion.data.talents?.some((talent) => talent.id === talentId))) return;
    const selected = talentId && talentId === state.talentId ? 0 : talentId;
    if (state.talentId === selected) return;
    state.talentId = selected;
    selectedTalentsByChampion.set(state.champion.slug, selected);
    championDetailContent.querySelectorAll("[data-talent-filter]").forEach((button) => {
      const active = Number(button.dataset.talentFilter) === selected;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
    void refreshChampionCardMetrics(state);
  }

  function renderChampionDetail(champion, options = {}) {
    championDetailContent.replaceChildren();
    championDetailContent.append(renderChampionProfile(champion));
    const buildPanel = window.DiscoveryChampionTabs.create(championDetailContent, champion, options);
    const talents = renderChampionTalents(champion.data?.talents, champion.slug, champion.id);
    const loadouts = renderChampionLoadouts(champion.data?.loadouts, champion.slug, champion.data?.skills);
    if (talents) buildPanel.append(talents);
    if (loadouts) {
      buildPanel.append(loadouts);
      initializeChampionCardMetrics(champion, loadouts);
    } else activeCardMetrics = null;
  }

  function stopSkillIconCycle() {
    if (skillIconTimer) window.clearInterval(skillIconTimer);
    skillIconTimer = 0;
  }

  function startSkillIconCycle() {
    stopSkillIconCycle();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rotatingImages = Array.from(championDetailContent.querySelectorAll("img[data-skill-icons]"));
    if (rotatingImages.length === 0) return;
    skillIconTimer = window.setInterval(() => {
      rotatingImages.forEach((image) => {
        if (!image.isConnected) return;
        let icons;
        try { icons = JSON.parse(image.dataset.skillIcons || "[]"); } catch { icons = []; }
        if (!Array.isArray(icons) || icons.length < 2) return;
        const next = ((Number(image.dataset.skillIndex) || 0) + 1) % icons.length;
        image.dataset.skillIndex = String(next);
        image.classList.add("is-switching");
        window.setTimeout(() => {
          if (!image.isConnected) return;
          image.src = icons[next];
          window.setTimeout(() => image.isConnected && image.classList.remove("is-switching"), 120);
        }, 110);
      });
    }, 2500);
  }

  function loadChampionChangelogs() {
    if (championChangelogs) return Promise.resolve(championChangelogs);
    if (championChangelogsRequest) return championChangelogsRequest;
    championChangelogsRequest = fetch("/data/champion-changelogs.json", {
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Champion changelog request failed");
        return response.json();
      })
      .then((data) => {
        championChangelogs = data;
        return championChangelogs;
      })
      .catch(() => {
        championChangelogsRequest = null;
        return null;
      });
    return championChangelogsRequest;
  }

  function showChampionLoadError() {
    championCatalogRequest = null;
    championCount.textContent = "";
    nativeText(championStatus, M("generated.champions.championReferenceDataIsUnavailable", undefined, "The champion roster could not be loaded."));
    championGrid.setAttribute("aria-busy", "false");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "champion-retry";
    nativeText(retry, M("async.tryAgain", undefined, "Try again"));
    retry.addEventListener("click", loadChampionRoster, { once: true });
    championGrid.replaceChildren(retry);
  }

  function loadChampionRoster() {
    if (championCatalog) return Promise.resolve(championCatalog);
    if (championCatalogRequest) return championCatalogRequest;
    nativeText(championStatus, M("async.loading", undefined, "Loading champion roster…"));
    championCount.textContent = "";
    championGrid.setAttribute("aria-busy", "true");
    championGrid.replaceChildren();
    championCatalogRequest = fetch("/data/champion-data.json", {
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Champion roster request failed");
        return response.json();
      })
      .then(async (data) => {
        const titleResponse = await fetch("/app/champion-titles.json?v=card-ids-1", {
          headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000),
        });
        if (!titleResponse.ok) throw new Error("Champion titles unavailable");
        const titleData = await titleResponse.json();
        championTitles = titleData.titles || {};
        championIds = titleData.championIds || {};
        try {
          const cooldownResponse = await fetch("/app/champion-card-cooldowns.json", {
            headers: { Accept: "application/json" },
          });
          if (cooldownResponse.ok) {
            const cooldownData = await cooldownResponse.json();
            championCardCooldowns = cooldownData.cooldowns || {};
          }
        } catch {
          championCardCooldowns = {};
        }
        championCatalog = Object.entries(data)
          .map(([slug, entry]) => ({
            slug,
            id: championMetricNumber(championIds[slug], true),
            name: typeof entry?.name === "string" ? entry.name : "",
            role: Array.isArray(entry?.roles) ? entry.roles[0] : "",
            roles: Array.isArray(entry?.roles) ? entry.roles : [],
            data: entry,
          }))
          .filter((champion) => champion.name && champion.role);
        if (championCatalog.length === 0) throw new Error("Champion roster is empty");
        nativeText(championStatus, "");
        renderChampionCards();
        return championCatalog;
      })
      .catch(showChampionLoadError);
    return championCatalogRequest;
  }


  // Reuse the owning local references; the standalone draft does not invent API statistics.
  const mapGrid = document.querySelector("[data-map-grid]");
  const itemGroups = document.querySelector("[data-item-groups]");
  const mapQuery = document.querySelector("[data-map-query]");
  const itemQuery = document.querySelector("[data-item-query]");
  const mapStatus = document.querySelector("[data-map-status]");
  const itemStatus = document.querySelector("[data-item-status]");
  const mapDetailContent = document.querySelector("[data-map-detail-content]");
  const references = { maps: null, items: null };
  const referenceRequests = { maps: null, items: null };
  let activeMapMode = "all";
  let activeItemCategory = "all";
  let activeItemLevel = 1;
  let selectedMap = null;
  let mapReturnFocus = null;
  const mapStatistics = window.createDiscoveryMapStats({
    grid: mapGrid, detail: mapDetailContent, catalog: () => references.maps, openMap: openMapDetail, championIcon: championIconPath,
  });

  function referenceText(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    window.DiscoveryLocale.setText(element, text);
    return element;
  }

  function updateReferenceFilters(selector, selected) {
    document.querySelectorAll(selector).forEach((button) => {
      const active = button === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderMapModes(map, className = "map-reference-modes") {
    const modes = document.createElement("span");
    modes.className = className;
    map.classifications.forEach((mode) => modes.append(referenceText("span", "", mode)));
    return modes;
  }

  function renderMaps() {
    void mapStatistics.loadList();
    mapStatistics.renderList(activeMapMode, normalize(mapQuery.value.trim()));
  }

  // The catalogue and champion statistics use one item-card renderer.
  function renderItemReferenceCard(item, level) {
    const tier = item.tiers?.find((entry) => entry.level === level);
    const card = document.createElement("article");
    card.className = "item-reference-card";
    card.dataset.itemName = item.name; card.dataset.level = String(level);
    const heading = document.createElement("div"); heading.className = "item-reference-heading";
    const image = document.createElement("img");
    image.src = "/images/items/" + item.name.replace(/\s+/g, "_") + "_Icon.avif";
    image.alt = ""; image.width = 48; image.height = 48; image.loading = "lazy";
    heading.append(image, referenceText("h3", "", item.name)); card.append(heading);
    if (tier) {
      const cost = document.createElement("dl"); cost.className = "item-reference-cost";
      cost.append(referenceText("dt", "", M(level === 1 ? "discovery.items.purchaseCost" : "discovery.items.upgradeCost", undefined, level === 1 ? "Purchase cost" : "Upgrade cost")),
        referenceText("dd", "", M("discovery.items.credits", {cost:nativeNumber(tier.cost)}, "{cost} credits")));
      card.append(referenceText("p", "item-reference-description", M("discovery.items.tierDescriptions." + item.fallbackId + "." + tier.level, undefined, tier.description)), cost);
    }
    return card;
  }

  function renderItems() {
    if (!references.items) return;
    const query = normalize(itemQuery.value.trim());
    const matches = references.items.filter((item) =>
      (activeItemCategory === "all" || item.category === activeItemCategory) && normalize(item.name).includes(query));
    nativeText(document.querySelector("[data-item-count]"), matches.length === references.items.length
      ? M("discovery.items.count", {count:nativeNumber(matches.length)}, "{count} items") : M("discovery.items.filteredCount", {shown:nativeNumber(matches.length),total:nativeNumber(references.items.length)}, "{shown} of {total} items"));
    nativeText(itemStatus, matches.length ? "" : M("discovery.items.noMatches", undefined, "No items match these filters."));
    itemGroups.replaceChildren();
    for (const category of ["Defense", "Utility", "Healing", "Offense"]) {
      const items = matches.filter((item) => item.category === category);
      if (!items.length) continue;
      const section = document.createElement("section");
      section.className = "item-reference-group";
      section.dataset.category = category;
      section.append(referenceText("h2", "", M("maps.itemClass." + category.toLowerCase(), undefined, category)));
      const grid = document.createElement("div");
      grid.className = "item-reference-grid";
      for (const item of items) {
        const card = renderItemReferenceCard(item, activeItemLevel);
        grid.append(card);
      }
      section.append(grid);
      itemGroups.append(section);
    }
  }

  const referenceDataRequests = { maps: null, items: null };
  function fetchReference(view) {
    if (references[view]) return Promise.resolve(references[view]);
    if (!referenceDataRequests[view]) referenceDataRequests[view] = fetch(view === "maps" ? "/app/discovery-map-reference.json" : "/data/paladins-active-items.json", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000),
    }).then(async response => {
      if (!response.ok) throw new Error("Reference unavailable");
      const data = await response.json(), entries = data[view];
      if (!Array.isArray(entries) || !entries.length) throw new Error("Reference empty");
      references[view] = entries; return entries;
    }).catch(error => { referenceDataRequests[view] = null; throw error; });
    return referenceDataRequests[view];
  }
  window.DiscoveryReferenceCards = {
    ensure: fetchReference,
    item: renderItemReferenceCard,
    map: (row, scope) => mapStatistics.championCard(row, scope),
  };

  function loadReference(view) {
    if (referenceRequests[view]) return referenceRequests[view];
    const isMaps = view === "maps";
    const status = isMaps ? mapStatus : itemStatus;
    const content = isMaps ? mapGrid : itemGroups;
    nativeText(status, M("async.loading", undefined, "Loading…"));
    content.setAttribute("aria-busy", "true");
    referenceRequests[view] = fetchReference(view).then(() => {
      if (isMaps) renderMaps(); else renderItems();
    }).catch(() => {
      referenceRequests[view] = null;
      nativeText(status, M("async.couldNotLoad", undefined, "Could not load this data"));
      const retry = referenceText("button", "reference-filter", M("async.tryAgain", undefined, "Try again"));
      retry.type = "button";
      retry.addEventListener("click", () => { void loadReference(view); });
      status.append(retry);
    }).finally(() => content.setAttribute("aria-busy", "false"));
    return referenceRequests[view];
  }

  function focusReference(element, preventScroll = true) {
    const page = element?.closest(".reference-page");
    if (!page) return;
    requestAnimationFrame(() => {
      Promise.allSettled(page.getAnimations().map((animation) => animation.finished)).then(() => {
        if (!page.inert && element.isConnected) element.focus({ preventScroll });
      });
    });
  }

  let pendingChampionTabRestore = null;
  function snapshotCurrentView(view) {
    const snapshot = window.DiscoveryApp?.snapshot(view) || view;
    if (typeof snapshot !== 'object' || !snapshot) return snapshot;
    const recorded = window.history.state?.discoveryDashboardHistory?.entry;
    const sameEntry = recorded?.view === view && recorded.path === snapshot.path;
    const result = sameEntry ? { ...recorded, ...snapshot } : snapshot;
    if (view === 'champion-detail') result.championTab = (sameEntry && recorded.championTab) || window.DiscoveryChampionTabs?.active();
    return result;
  }

  function enterNativeView(view, path, { restore = false, keepPath = false } = {}) {
    const current = shell.dataset.view || "dashboard";
    const previous = snapshotCurrentView(current);
    const changed = !restore && (current !== view || (previous.path && previous.path !== path));
    if (changed) viewHistory.push(previous);
    window.DiscoveryApp?.record(view, path, { current: !keepPath });
    setView(view);
    const destination = { view, path: keepPath ? window.DiscoveryApp?.currentPath() : path };
    if (changed) { cancelScrollRestore(); browserViewHistory.push(previous, destination, viewHistory); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
    else if (restore) browserViewHistory.replace(destination, viewHistory);
  }

  function openReference(view, options) {
    enterNativeView(view, '/game/' + view, options);
    void loadReference(view);
    window.scrollTo({ top: 0, behavior: "instant" });
    focusReference(document.querySelector("#" + view + "-page-title"));
  }

  function openMapDetail(name, trigger, options = {}) {
    const map = mapStatistics.findMap(name);
    if (!map) return;
    selectedMap = map;
    mapReturnFocus = trigger;
    const saved = options.restore ? window.DiscoveryViewScroll?.restoredState('mapDetail') : null;
    const title = mapStatistics.openDetail(map, saved);
    enterNativeView('map-detail', options.path || '/game/maps/' + encodeURIComponent(map.apiName), options);
    mapStatistics.rememberDetail();
    window.scrollTo({ top: 0, behavior: 'instant' });
    focusReference(title);
  }

  // Browser entries carry view and scroll snapshots while retaining the exact URL.
  function createBrowserViewHistory(browser, listen, onRestore, readScroll = () => ({ x: window.scrollX, y: window.scrollY })) {
    let session = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const key = 'discoveryDashboardHistory', positions = new Map();
    let index = 0;
    const positionKey = () => session + ':' + index;
    const copyTrail = trail => trail.map(entry => typeof entry === 'object' && entry !== null ? { ...entry } : entry);
    const withScroll = (entry, scroll) => ({ ...(typeof entry === 'object' && entry !== null ? entry : { view: entry }), scroll: { x: Number(scroll?.x) || 0, y: Number(scroll?.y) || 0 } });
    const state = (entry, trail) => ({ ...(browser.state && typeof browser.state === 'object' ? browser.state : {}), [key]: { session, index, entry, trail: copyTrail(trail) } });
    const validEntry = entry => entry && typeof entry === 'object' && typeof entry.view === 'string' && typeof entry.path === 'string' && /^\/(?![\\/])/.test(entry.path);
    const saved = browser.state?.[key];
    let initial = saved && typeof saved.session === 'string' && Number.isSafeInteger(saved.index) && saved.index >= 0 && validEntry(saved.entry) && Array.isArray(saved.trail) && saved.trail.every(entry => typeof entry === 'string' || validEntry(entry)) ? saved : null;
    if ('scrollRestoration' in browser) browser.scrollRestoration = 'manual';
    if (initial) { session = initial.session; index = initial.index; }
    const initialEntry = initial?.entry || { view: 'dashboard', path: '/' };
    const initialScroll = initialEntry.scroll || { x: 0, y: 0 };
    positions.set(positionKey(), initialScroll);
    browser.replaceState(state(withScroll(initialEntry, initialScroll), initial?.trail || []), '');
    listen('popstate', event => {
      const target = event.state?.[key];
      if (!target || typeof target.session !== 'string' || !Number.isInteger(target.index) || !Array.isArray(target.trail)) return;
      session = target.session; index = target.index;
      const scroll = positions.get(positionKey()) || target.entry?.scroll || { x: 0, y: 0 };
      positions.set(positionKey(), scroll);
      onRestore(withScroll(target.entry, scroll), copyTrail(target.trail));
    });
    return {
      resume(canRestore = () => true) {
        const target = initial; initial = null;
        if (!target) return false;
        if (!canRestore(target.entry)) { this.replace({ view: 'dashboard', path: '/' }, []); return false; }
        onRestore(withScroll(target.entry, positions.get(positionKey())), copyTrail(target.trail));
        return true;
      },
      remember() { const scroll = readScroll(); positions.set(positionKey(), { x: Number(scroll.x) || 0, y: Number(scroll.y) || 0 }); },
      updateEntry(values) {
        const current = browser.state?.[key];
        if (current?.session === session && current.index === index && current.entry) browser.replaceState(state({ ...current.entry, ...values }, current.trail), '');
      },
      persist() {
        const current = browser.state?.[key], scroll = positions.get(positionKey());
        if (current?.session === session && current.index === index && scroll) browser.replaceState(state(withScroll(current.entry, scroll), current.trail), '');
      },
      push(previous, entry, trail) {
        const currentEntry = browser.state?.[key]?.entry;
        const prior = typeof previous === 'string' && currentEntry?.view === previous ? currentEntry : previous;
        const previousWithScroll = withScroll(prior, positions.get(positionKey()) || readScroll());
        trail[trail.length - 1] = previousWithScroll;
        browser.replaceState(state(previousWithScroll, trail.slice(0, -1)), '');
        index++; positions.set(positionKey(), { x: 0, y: 0 });
        browser.pushState(state(withScroll(entry, { x: 0, y: 0 }), trail), '', entry.path);
      },
      replace(entry, trail) {
        const recorded = browser.state?.[key]?.entry;
        const scroll = positions.get(positionKey()) || recorded?.scroll || { x: 0, y: 0 };
        const restored = recorded?.path && recorded.path === entry.path ? { ...recorded, ...entry } : entry;
        browser.replaceState(state(withScroll(restored, scroll), trail), '', restored.path);
      },
      back(trail) {
        if (index <= 0 || !trail.length || browser.state?.[key]?.session !== session) return false;
        this.remember(); this.persist(); browser.back(); return true;
      },
    };
  }

  let pendingScrollRestore = null, scrollWriteTimer = 0;
  function cancelScrollRestore() {
    if (!pendingScrollRestore) return;
    pendingScrollRestore.observer.disconnect();
    clearTimeout(pendingScrollRestore.timeout);
    if (pendingScrollRestore.frame) cancelAnimationFrame(pendingScrollRestore.frame);
    pendingScrollRestore = null;
  }
  function restoreViewScroll(entry, navigate) {
    cancelScrollRestore();
    const scroll = entry?.scroll || { x: 0, y: 0 }, view = typeof entry === 'object' ? entry.view : entry;
    const pending = { scroll, view, observer: null, frame: 0, timeout: 0 };
    pendingScrollRestore = pending;
    const attempt = () => {
      pending.frame = 0;
      if (pendingScrollRestore !== pending || shell.dataset.view !== pending.view) return;
      const root = document.scrollingElement || document.documentElement;
      const maxY = Math.max(0, root.scrollHeight - window.innerHeight);
      window.scrollTo({ left: pending.scroll.x, top: Math.min(pending.scroll.y, maxY), behavior: 'instant' });
      const active = document.querySelector('main[aria-hidden="false"], .dashboard-grid[aria-hidden="false"]');
      if (maxY >= pending.scroll.y && active?.getAttribute('aria-busy') !== 'true' && !active?.querySelector('[aria-busy="true"]')) { cancelScrollRestore(); browserViewHistory.remember(); browserViewHistory.persist(); }
    };
    const schedule = () => { if (pendingScrollRestore === pending && !pending.frame) pending.frame = requestAnimationFrame(attempt); }; pending.schedule = schedule;
    pending.observer = new MutationObserver(schedule);
    pending.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'aria-hidden', 'hidden', 'data-view'] });
    pending.timeout = setTimeout(() => { if (pendingScrollRestore === pending) { cancelScrollRestore(); browserViewHistory.remember(); browserViewHistory.persist(); } }, 150000);
    navigate(); schedule();
  }
  function captureDashboardScroll() {
    if (!pendingScrollRestore) browserViewHistory.remember();
  }

  const viewHistory = [];
  const browserViewHistory = createBrowserViewHistory(window.history, (type, handler) => window.addEventListener(type, handler), (entry, trail) => {
    restoreViewScroll(entry, () => { viewHistory.splice(0, viewHistory.length, ...trail, entry); showPreviousView(); });
  });
  window.DiscoveryViewScroll = {
    capture: captureDashboardScroll,
    rememberRoute: (view, path) => {
      const entry = window.history.state?.discoveryDashboardHistory?.entry;
      if (entry?.view === view && shell.dataset.view === view) browserViewHistory.updateEntry({ path });
    },
    rememberChampionTab: tab => { if (shell.dataset.view === 'champion-detail') browserViewHistory.updateEntry({ championTab: tab }); },
    rememberState: (name, value) => {
      const entry = window.history.state?.discoveryDashboardHistory?.entry;
      if (entry?.view === shell.dataset.view) browserViewHistory.updateEntry({ viewState: { ...entry.viewState, [name]: value } });
    },
    restoredState: name => window.history.state?.discoveryDashboardHistory?.entry?.viewState?.[name],
  };
  window.addEventListener('scroll', () => {
    if (pendingScrollRestore) return;
    captureDashboardScroll(); clearTimeout(scrollWriteTimer);
    scrollWriteTimer = setTimeout(() => { if (!pendingScrollRestore) browserViewHistory.persist(); }, 250);
  }, { passive: true });
  window.addEventListener('pagehide', () => {
    captureDashboardScroll();
    const entry = snapshotCurrentView(shell.dataset.view || 'dashboard');
    if (entry && typeof entry === 'object') browserViewHistory.updateEntry(entry);
    browserViewHistory.persist();
  });
  document.addEventListener('click', captureDashboardScroll, true);
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) document.addEventListener(event, () => { if (pendingScrollRestore) { cancelScrollRestore(); captureDashboardScroll(); } }, { passive: true, capture: true });
  window.addEventListener('resize', () => pendingScrollRestore?.schedule());
  document.addEventListener('load', () => pendingScrollRestore?.schedule(), true);

  function openSearch(query = "", options = {}) {
    pageInput.maxLength = 100;
    pageInput.value = query;
    enterNativeView("search", options.path || (query.trim() ? "/search?q=" + encodeURIComponent(query.trim()) : "/search"), options);
    void renderResults();
    requestAnimationFrame(() => { if (shell.dataset.view === "search") pageInput.focus({ preventScroll: true }); });
  }

  function openLeaderboard() {
    const current = shell.dataset.view || "dashboard";
    const previous = snapshotCurrentView(current);
    if (current !== "leaderboard") viewHistory.push(previous);
    setView("leaderboard");
    if (current !== "leaderboard") { cancelScrollRestore(); browserViewHistory.push(previous, { view: "leaderboard" }, viewHistory); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
  }

  function openChampions(options) {
    enterNativeView('champions', '/champions', options);
    void loadChampionRoster();
  }

  function openChampionDetail(slug, trigger, options = {}) {
    const champion = championCatalog?.find((entry) => entry.slug === slug);
    if (!champion) return;
    const reuse = Boolean(options.restore && selectedChampion?.slug === slug && championDetailContent.querySelector('[data-champion-panel="build"]'));
    selectedChampion = champion;
    detailReturnFocus = trigger instanceof HTMLElement ? trigger : null;
    if (!reuse) renderChampionDetail(champion, { restore: Boolean(options.restore), tab: options.tab });
    else if (options.tab) window.DiscoveryChampionTabs.select(options.tab);
    enterNativeView('champion-detail', options.path || '/champions/' + slug, options);
    window.DiscoveryViewScroll?.rememberChampionTab(window.DiscoveryChampionTabs.active());
    startSkillIconCycle();
    requestAnimationFrame(() => { if (shell.dataset.view === 'champion-detail' && selectedChampion?.slug === slug) championDetailPage.focus({ preventScroll: true }); });
    void loadChampionChangelogs().then((catalog) => {
      if (shell.dataset.view !== "champion-detail" || selectedChampion?.slug !== slug || !catalog) return;
      const buildPanel = championDetailContent.querySelector('[data-champion-panel="build"]');
      if (!buildPanel || buildPanel.querySelector('.champion-changelog-section')) return;
      const changelog = renderChampionChangelog(catalog[slug]);
      if (changelog) buildPanel.append(changelog);
    });
  }

  // Reuse the established framed cards for saved decks without changing champion pages.
  window.DiscoveryChampionCards = { cardMetricsAtLevel, renderCardLevelTrend, loadCardPercentageColors, metricColor: value => cardPercentageColor?.(value), render(loadouts, slug) {
    const section = renderChampionLoadouts(loadouts, slug);
    if (!section) return section;
    for (const card of section.querySelectorAll('.champion-loadout-card')) {
      const source = loadouts.find(loadout => String(loadout.id) === card.dataset.cardId);
      updateLoadoutRank(card, Math.min(5, Math.max(1, Number(source?.level) || 1)));
      card.querySelector('.champion-loadout-level-controls')?.remove();
    }
    return section;
  } };

  function showDashboard(options = {}) {
    const current = shell.dataset.view || "dashboard", previous = snapshotCurrentView(current);
    const changed = current !== "dashboard" && !options.restore;
    if (changed) viewHistory.push(previous);
    pageInput.value = "";
    renderResults();
    window.DiscoveryApp?.record('dashboard', '/');
    setView("dashboard");
    if (changed) { cancelScrollRestore(); browserViewHistory.push(previous, { view: "dashboard", path: "/" }, viewHistory); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
    else if (options.restore) browserViewHistory.replace({ view: "dashboard", path: "/" }, viewHistory);
    pageInput.blur();
  }

  function showPreviousView() {
    const current = shell.dataset.view || "dashboard";
    const previous = viewHistory.pop() || "dashboard";
    const destination = typeof previous === "object" ? previous.view : previous;
    if (destination === "dashboard") { showDashboard({ restore: true }); return; }
    if (previous.path && window.DiscoveryApp?.hasRoute(previous.path)) {
      pendingChampionTabRestore = destination === "champion-detail" ? { path: previous.path, tab: previous.championTab } : null;
      window.DiscoveryApp.restore(previous.path); return;
    }
    if (current === "search" && destination !== "search") {
      pageInput.value = "";
      renderResults();
    }
    setView(destination);
    if (destination === "search") requestAnimationFrame(() => pageInput.focus({ preventScroll: true }));
    else if (destination === "champion-detail") requestAnimationFrame(() => championDetailPage.focus({ preventScroll: true }));
    else if (destination === "champions" && current === "champion-detail" && detailReturnFocus?.isConnected) {
      requestAnimationFrame(() => detailReturnFocus.focus({ preventScroll: true }));
    }
    else if (destination === "maps" && current === "map-detail" && mapReturnFocus?.isConnected) {
      focusReference(mapReturnFocus, false);
    }
    else if (["maps", "items"].includes(destination)) focusReference(document.querySelector("#" + destination + "-page-title"));
    else if (destination === "map-detail") focusReference(document.querySelector("#map-detail-title"));
    else pageInput.blur();
  }

  searchButton.addEventListener("click", () => openSearch());
  homeButton.addEventListener("click", showDashboard);
  leaderboardButton.addEventListener("click", openLeaderboard);
  championsButton.addEventListener("click", openChampions);
  championGrid.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest("[data-champion-slug]");
    if (!card || !championGrid.contains(card)) return;
    openChampionDetail(card.dataset.championSlug, card);
  });
  championDetailContent.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const talentButton = event.target.closest("[data-talent-filter]");
    if (talentButton && championDetailContent.contains(talentButton)) {
      selectChampionCardTalent(Number(talentButton.dataset.talentFilter));
      return;
    }
    const levelButton = event.target.closest("[data-loadout-step]");
    const card = levelButton?.closest(".champion-loadout-card");
    if (!card || !levelButton || !championDetailContent.contains(card)) return;
    const currentLevel = Number(card.dataset.level) || 1;
    updateLoadoutRank(card, currentLevel + Number(levelButton.dataset.loadoutStep));
  });
  championRoleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeChampionRole = button.dataset.championRole || "all";
      championRoleButtons.forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      if (championCatalog) renderChampionCards();
    });
  });
  document.querySelectorAll("[data-maps-trigger]").forEach((button) => button.addEventListener("click", () => openReference("maps")));
  document.querySelectorAll("[data-items-trigger]").forEach((button) => button.addEventListener("click", () => openReference("items")));
  document.querySelectorAll("[data-map-mode]").forEach((button) => button.addEventListener("click", () => {
    activeMapMode = button.dataset.mapMode;
    updateReferenceFilters("[data-map-mode]", button);
    renderMaps();
  }));
  document.querySelectorAll("[data-item-category]").forEach((button) => button.addEventListener("click", () => {
    activeItemCategory = button.dataset.itemCategory;
    updateReferenceFilters("[data-item-category]", button);
    renderItems();
  }));
  document.querySelectorAll("[data-item-level]").forEach((button) => button.addEventListener("click", () => {
    activeItemLevel = Number(button.dataset.itemLevel);
    updateReferenceFilters("[data-item-level]", button);
    renderItems();
  }));
  mapQuery.addEventListener("input", renderMaps);
  itemQuery.addEventListener("input", renderItems);
  mapGrid.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest("[data-map-name]");
    if (card && mapGrid.contains(card)) openMapDetail(card.dataset.mapName, card);
  });
  backButton.addEventListener("click", () => { if (!browserViewHistory.back(viewHistory)) showPreviousView(); });
  document.querySelectorAll("[data-search-page-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => openSearch());
  });

  pageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderResults();
  });
  pageInput.addEventListener("input", renderResults);
  clearButton.addEventListener("click", () => {
    pageInput.value = "";
    renderResults();
    pageInput.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.dataset.view === "search") {
      event.preventDefault();
      showDashboard();
      searchButton.focus({ preventScroll: true });
    }
  });

  // Bridge existing catalogue views into the shared same-URL route registry.
  document.addEventListener('discovery:native-route', async (event) => {
    const { kind, name, section, detailId } = event.detail || {};
    const routeAtStart = window.DiscoveryApp?.currentPath();
    const viewAtStart = shell.dataset.view;
    const restore = window.DiscoveryApp?.isRestoring(routeAtStart) || false;
    const restoredTab = restore && pendingChampionTabRestore?.path === routeAtStart ? pendingChampionTabRestore.tab : undefined;
    pendingChampionTabRestore = null;
    if (kind === 'search') {
      openSearch(new URL(routeAtStart, location.origin).searchParams.get('q') || '', { restore, path: routeAtStart });
      return;
    }
    if (kind === 'champions') {
      if (!name) { openChampions({ restore }); return; }
      await loadChampionRoster();
      if (routeAtStart !== window.DiscoveryApp?.currentPath() || shell.dataset.view !== viewAtStart) return;
      const champion = championCatalog?.find(entry => entry.slug === name);
      if (!champion) return;
      openChampionDetail(name, null, { restore, path: routeAtStart, tab: restoredTab });
      if (section === 'talents' && detailId) championDetailContent.querySelector('[data-talent-filter="' + detailId + '"]')?.click();

    } else if (kind === 'maps') {
      openReference('maps', { restore, keepPath: Boolean(name) }); await loadReference('maps'); await mapStatistics.loadList();
      if (routeAtStart !== window.DiscoveryApp?.currentPath() || shell.dataset.view !== 'maps') return;
      if (name) { const card = [...mapGrid.querySelectorAll('[data-map-name]')].find(el => el.dataset.mapName.replace(/^Ranked\s+/i,'').toLowerCase() === name.replace(/^Ranked\s+/i,'').toLowerCase()); openMapDetail(card?.dataset.mapName || name, card, { restore: true, path: routeAtStart }); }
    } else if (kind === 'items') {
      openReference('items', { restore, keepPath: Boolean(detailId) }); await loadReference('items');
      if (routeAtStart !== window.DiscoveryApp?.currentPath() || shell.dataset.view !== 'items') return;
      if (detailId) await window.DiscoveryItemPages?.openById(detailId, () => routeAtStart === window.DiscoveryApp?.currentPath() && shell.dataset.view === 'items', { restore: true, path: routeAtStart });
    }
  });

  // Native item cards and routed records share the shell's exact history.
  document.addEventListener('discovery:item-detail-open', event => {
    const { id, navigation = {} } = event.detail || {};
    if (!Number.isSafeInteger(id) || id <= 0) return;
    enterNativeView('item-detail', navigation.path || '/game/items/' + id, navigation);
  });

  // Shared navigation history for independently owned dashboard page modules.
  document.addEventListener("discovery:open-view", (event) => {
    const view = event.detail?.view;
    if (!window.DiscoveryApp?.hasView(view) && !["players-hub", "site-settings", "site-community", "site-community-post", "site-chat", "site-blog", "site-blog-post", "site-notifications", "site-account", "stats-hub", "stats-performance", "stats-skins", "stats-compositions", "stats-ecpm", "stats-tiers", "stats-activity"].includes(view)) return;
    const current = shell.dataset.view || "dashboard";
    const previous = snapshotCurrentView(current);
    const restoring = Boolean(event.detail?.restore || (pendingScrollRestore && window.DiscoveryApp?.isRestoring(window.DiscoveryApp.currentPath())));
    const changed = !restoring && (current !== view || event.detail?.routeChange);
    if (changed) viewHistory.push(previous);
    setView(view);
    const destination = { view, path: window.DiscoveryApp?.currentPath() };
    if (changed) { cancelScrollRestore(); browserViewHistory.push(previous, destination, viewHistory); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
    else if (restoring) { browserViewHistory.replace(destination, viewHistory); if (!event.detail?.restore && destination.path) window.DiscoveryApp?.record(view, destination.path); }
  });

  document.addEventListener("discovery:lobby-tier-changed", () => {
    if (shell.dataset.view === "champion-detail") championDetailContent.querySelector(".champion-talent-metrics-section")?.discoveryRefreshMetrics();
  });

  document.addEventListener("discovery:locale-changed", () => {
    if (championCatalog) renderChampionCards();
    if (searchResults.length) paintSearchResults(searchResults);
    else { resultCount.textContent = nativeNumber(0); document.querySelectorAll("[data-search-type] b").forEach(node => { node.textContent = nativeNumber(0); }); }
    championDetailContent.querySelectorAll("[data-native-champion-value]").forEach(node => { node.textContent = nativeNumber(node.dataset.nativeChampionValue, {useGrouping:false}); });
    championDetailContent.querySelectorAll(".champion-detail-metrics,.champion-talent-metrics-section").forEach(section => section.discoveryRefreshLocale?.());
    championDetailContent.querySelectorAll(".champion-loadout-card").forEach(card => updateLoadoutRank(card, Number(card.dataset.level) || 1));
    if (activeCardMetrics?.section.isConnected) { renderAISuggestions(activeCardMetrics); activeCardMetrics.section.querySelectorAll(".champion-loadout-card").forEach(card => renderCardAssessment(activeCardMetrics, card)); }
    if (["dashboard", "search", "leaderboard", "champions", "champion-detail", "maps", "map-detail", "items"].includes(shell.dataset.view)) setView(shell.dataset.view);
  });

  renderResults();
  setView("dashboard");
  // Deferred page modules register their routes before DOMContentLoaded.
  const resumeLastView = () => browserViewHistory.resume(entry => entry.view === 'dashboard' || window.DiscoveryApp?.hasRoute(entry.path));
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', resumeLastView, { once: true });
  else queueMicrotask(resumeLastView);
})();
