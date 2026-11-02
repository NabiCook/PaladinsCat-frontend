// Map views reuse the contracts and sections owned by app/stats/maps and lib/api-client.ts.
// Kept separate from the concurrently edited champion/loadout preview.
(() => {
  const UI=(key,fallback,values)=>window.DiscoveryApp?.message?.(key,values,fallback)??fallback;
  const setText=(element,value)=>window.DiscoveryApp?.setText?window.DiscoveryApp.setText(element,value):(element.textContent=String(value??""));
  const attribute=(element,name,value)=>value?.discoveryMessage?window.DiscoveryLocale.bind(element,value.key,value.fallback,name,value.values,true):element.setAttribute(name,value);
  const scopeKeys={ranked:"stats.matchups.ranked",casual:"stats.scope.casual",team_deathmatch:"stats.scope.teamDeathmatch",arcade:"stats.scope.arcade",wave_defense:"stats.scope.waveDefense",experiment:"stats.scope.experiment",newcomer:"stats.scope.newcomer",bot:"stats.scope.bot"};
  const scopeLabel=value=>UI(scopeKeys[value],scopes[value]);
  const roleLabel=value=>value==="All"?UI("generated.stats.all",value):UI("common.roles."+value.toLowerCase(),value);
  const scopes = {
    ranked: "Ranked Siege", casual: "Casual", team_deathmatch: "Team Deathmatch",
    arcade: "Arcade", wave_defense: "Wave Defense", experiment: "Experimental",
    newcomer: "Newcomer", bot: "Training / bots",
  };
  const roles = ["Frontline", "Damage", "Flank", "Support"];
  const itemClasses = {
    "Blast Shields": "Defense", Guardian: "Defense", Haven: "Defense", Illuminate: "Defense", Resilience: "Defense", Sentinel: "Defense",
    Chronos: "Utility", Hoard: "Utility", "Master Riding": "Utility", "Morale Boost": "Utility", Nimble: "Utility",
    Bloodbath: "Healing", "Kill to Heal": "Healing", "Life Rip": "Healing", Meditation: "Healing", Rejuvenate: "Healing", Veteran: "Healing",
    Bulldozer: "Offense", "Deft Hands": "Offense", Lethality: "Offense", "Trigger Scent": "Offense", Wrecker: "Offense",
  };
  const node = (tag, className = "", text = "") => {
    const element = document.createElement(tag);
    element.className = className;
    setText(element,text);
    return element;
  };
  const number = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const count = (value) => number(value) == null ? "—" : window.DiscoveryApp.formatNumber(number(value));
  const percent = (value) => number(value) == null ? "—" : window.DiscoveryApp.formatNumber(number(value),{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
  const duration = (value) => {
    if (number(value) == null) return "—";
    const seconds = Math.max(0, Math.round(number(value)));
    return UI("common.format.durationShort","{minutes}m {seconds}s",{minutes:count(Math.floor(seconds/60)),seconds:count(seconds%60)});
  };
  const key = (value) => value.replace(/^(?:ranked|live|casual)\s+/i, "")
    .replace(/\s+\((?:onslaught|king of the hill|koth|team deathmatch|tdm|siege|payload)\)\s*$/i, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  const searchable = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  window.createDiscoveryMapStats = ({ grid, detail, catalog, openMap, championIcon }) => {
    const scopeControl = document.querySelector("[data-map-stats-scope]");
    const status = document.querySelector("[data-map-status]");
    const countLabel = document.querySelector("[data-map-count]");
    const cache = new Map();
    let scope = "ranked", listScope = null, listRequest = null, rows = null;
    let mode = "all", query = "", detailVersion = 0, listVersion=0,current = null;
    let color = null;
    let identities = null;
    let identityRequest = null;
    const colorRequest = import("./discovery-stat-quality.js").then((module) => { color = module.getPercentageColor; });
    // A failed color import leaves readable numbers and never invents a replacement scale.
    colorRequest.catch(() => {});

    async function request(route, validate) {
      const cacheKey = window.DiscoveryApp.scopedPath("/stats/maps" + route);
      const existing = cache.get(cacheKey);
      if (existing && Date.now() - existing.created < 60000) return existing.promise;
      const promise = window.DiscoveryApp.scopedFetch("/api/v1/stats/maps" + route, {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000),
      }).then(async (response) => {
        if (!response.ok) throw new Error("Map statistics unavailable");
        const value = await response.json();
        if (!validate(value)) throw new Error("Invalid map statistics");
        return value;
      });
      cache.set(cacheKey, { promise, created: Date.now() });
      promise.catch(() => { if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey); });
      return promise;
    }

    document.addEventListener('discovery:lobby-tier-changed',()=>{cache.clear();listScope=null;rows=null;listRequest=null;listVersion++;detailVersion++;});

    function describe(apiName, stats = null) {
      // Artwork aliases follow lib/map-images.ts; API identities and totals stay separate.
      const artworkKey = key(apiName).replace(/^stone keep(?: classic| v2 night)$/, "stone keep");
      const reference = catalog()?.find((entry) => key(entry.name) === artworkKey);
      return {
        ...(reference || {}), apiName, name: apiName.replace(/^Ranked\s+/i, ""), stats,
        classifications: reference?.classifications || [],
        artwork: reference?.artwork || "/images/maps/Match_Test_Maps.png",
        loadingArtwork: reference?.loadingArtwork || "/images/maps/Test_Maps_Loading.png",
      };
    }

    function button(label, action, active = false) {
      const element = node("button", "reference-filter" + (active ? " is-active" : ""), label);
      element.type = "button";
      element.setAttribute("aria-pressed", String(active));
      element.addEventListener("click", action);
      return element;
    }

    function message(target, text, retry) {
      target.replaceChildren(node("p", "map-stats-message", text));
      if (retry) target.append(button(UI("async.tryAgain","Try again"), retry));
    }

    function metric(label, value, type = "count") {
      const cell = node("div", "map-stats-metric");
      const formatted = node("dd", "", type === "percent" ? percent(value) : type === "duration" ? duration(value) : count(value));
      if(type==="percent"&&number(value)!=null){formatted.dataset.percentageValue=String(number(value));formatted.dataset.percentageDirection="high-is-good";if(color)formatted.style.color=color(number(value));}
      cell.append(node("dt", "", label), formatted);
      return cell;
    }

    function overview(stats) {
      const metrics = node("dl", "map-stats-metrics map-stats-overview");
      metrics.append(metric(UI("generated.stats.mapShare.77ce64b","Map share"), stats?.distribution_rate, "percent"), metric(UI("generated.stats.matches","Matches"), stats?.total_matches), metric(UI("generated.stats.avgTime","Average time"), stats?.avg_duration_seconds, "duration"));
      return metrics;
    }

    // Shared by the map directory and champion map statistics.
    function renderMapReferenceCard(map, selectedScope, metrics) {
      const card = node("button", "map-reference-card map-stats-map-card"); card.type = "button";
      card.dataset.mapName = map.apiName;
      attribute(card,"aria-label",UI("discovery.stats.view","View {name}",{name:map.name}));
      const art = node("span", "map-reference-art");
      const image = node("img"); image.src = map.artwork; image.alt = ""; image.loading = "lazy";
      image.width = 480; image.height = 270; art.append(image);
      const copy = node("span", "map-reference-copy");
      copy.append(node("span", "map-reference-name", map.name), node("span", "map-reference-modes",scopeLabel(selectedScope)));
      card.append(art, copy, metrics); return card;
    }
    function championCard(row, selectedScope) {
      const map = describe(row.map, row), values = node("dl", "map-stats-metrics map-stats-overview map-stats-champion");
      values.append(metric(UI("generated.stats.plays","Plays"), row.total_plays), metric(UI("generated.players.wins","Wins"), row.wins),
        metric(UI("generated.players.losses","Losses"), row.losses), metric(UI("common.metrics.winRate","Win rate"), Number(row.total_plays) > 0 ? row.win_rate : null, "percent"));
      const card = renderMapReferenceCard(map, selectedScope, values);
      card.addEventListener("click", () => openMap(map.apiName, card)); return card;
    }

    function renderList(nextMode = mode, nextQuery = query) {
      mode = nextMode; query = nextQuery;
      if (!rows) return;
      const matches = rows.filter((row) => (mode === "all" || row.classifications.includes(mode)) && searchable(row.apiName).includes(query));
      setText(countLabel,matches.length===rows.length?UI("discovery.maps.count","{count} maps",{count:count(rows.length)}):UI("discovery.maps.filteredCount","{shown} of {total} maps",{shown:count(matches.length),total:count(rows.length)}));
      setText(status,matches.length?"":rows.length?UI("discovery.maps.noMatches","No maps match these filters."):UI("stats.scope.noMapStats","No map statistics are available for {mode}.",{mode:String(scopeLabel(scope))}));
      grid.replaceChildren(...matches.map(map => renderMapReferenceCard(map, scope, overview(map.stats))));
    }

    async function loadList() {
      if (listScope === scope && rows) { renderList(); return; }
      if (listRequest?.scope === scope) return listRequest.promise;
      const requestedScope=scope,version=++listVersion;
      rows = null; listScope = null; grid.replaceChildren(); countLabel.textContent = "";
      setText(status,UI("async.loading","Loading {mode} maps…",{mode:String(scopeLabel(scope))}));
      grid.setAttribute("aria-busy", "true");
      const promise = (async () => {
        try {
          const [data] = await Promise.all([
            request("?scope=" + requestedScope + (requestedScope === "ranked" ? "&queueId=486" : "") + "&limit=100",
              (value) => Array.isArray(value) && value.every((row) => typeof row?.map === "string" && number(row.total_matches) != null)),
            colorRequest.catch(() => {}),
          ]);
          if(scope!==requestedScope||listVersion!==version)return;
          rows = data.map((row) => describe(row.map, row)); listScope = requestedScope;
          renderList();
        } catch {
          if(scope!==requestedScope||listVersion!==version)return;
          message(status, UI("generated.stats.mapStatsUnavailable","Map statistics could not be loaded."), loadList);
        } finally {
          if(scope===requestedScope&&listVersion===version){ grid.setAttribute("aria-busy", "false"); listRequest = null; }
        }
      })();
      listRequest = { scope: requestedScope, promise };
      return promise;
    }

    for(const option of scopeControl.children)if(scopeKeys[option.value])setText(option,scopeLabel(option.value));
    scopeControl.addEventListener("change", () => {
      scope = Object.hasOwn(scopes, scopeControl.value) ? scopeControl.value : "ranked";
      void loadList();
    });

    function loadIdentities() {
      if (identities) return Promise.resolve(identities);
      if (identityRequest) return identityRequest;
      identityRequest = Promise.all(["/data/champion-data.json", "/drafts/champion-titles.json?v=card-ids-1"].map(async (url) => {
        const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("Champion identities unavailable");
        return response.json();
      })).then(([roster, ids]) => {
        identities = new Map(Object.entries(roster).map(([slug, champion]) => [Number(ids.championIds[slug]), { ...champion, slug }]));
        return identities;
      }).catch((error) => { identityRequest = null; throw error; });
      return identityRequest;
    }

    function picture(src, className = "map-stats-icon") {
      const image = node("img", className); image.src = src; image.alt = ""; image.loading = "lazy";
      return image;
    }

    function heading(name, image, subtitle = "") {
      const header = node("div", "map-stats-entity-heading");
      if (image) header.append(picture(image));
      const copy = node("div"); copy.append(node("h3", "", name));
      if (subtitle) copy.append(node("p", "", subtitle));
      header.append(copy); return header;
    }

    function record(row) {
      return number(row.wins)==null||number(row.losses)==null?UI("async.couldNotLoad","Record unavailable"):UI("common.format.winLossCompact","{wins} W · {losses} L",{wins:count(row.wins),losses:count(row.losses)});
    }

    function comparison(card, section, entityKey, state) {
      if (state.scope !== "ranked") return;
      const disclosure = node("details", "map-stats-comparison");
      const output = node("div", "map-stats-comparison-rows");
      output.setAttribute("aria-live", "polite");
      disclosure.append(node("summary", "", UI("maps.compareOtherMaps","Compare other maps")), output);
      card.append(disclosure);
      let loaded = false;
      const load = async () => {
        setText(output,UI("async.loading","Loading comparison…")); output.setAttribute("aria-busy", "true");
        try {
          const response = await request("/" + encodeURIComponent(state.map.apiName) + "/comparison?section=" + section,
            (data) => data?.section === section && Array.isArray(data.rows));
          if (current !== state || !disclosure.isConnected) return;
          const compared = response.rows.filter((row) => String(row.entity_key) === String(entityKey));
          output.replaceChildren(...compared.map((row) => {
            const link = node("button", "map-stats-comparison-row"); link.type = "button";
            link.append(node("span", "", row.map_name.replace(/^Ranked\s+/i, "")));
            const metrics = node("span", "", percent(row.win_rate)+" "+String(UI("generated.stats.winRate.0a2b795","win rate"))+" · " + String(section==="items"?UI("generated.stats.value1Purchases","{value1} purchases",{value1:count(row.total_count)}):UI(section==="compositions"?"discovery.count.matches":"discovery.count.plays",section==="compositions"?"{count} matches":"{count} plays",{count:count(row.total_count)})));
            link.append(metrics);
            link.addEventListener("click", () => openMap(row.map_name, null)); return link;
          }));
          if(!compared.length)setText(output,UI("maps.noComparisonData","No comparison data is available."));
          if (response.next_cursor != null) output.append(node("p", "map-stats-message", UI("discovery.maps.comparisonPage","Showing the available comparison page.")));
          loaded = true;
        } catch {
          if (current === state && disclosure.isConnected) message(output, UI("async.couldNotLoad", "Comparison could not be loaded."), load);
        } finally { output.setAttribute("aria-busy", "false"); }
      };
      disclosure.addEventListener("toggle", () => { if (disclosure.open && !loaded) void load(); });
    }

    function performance(row, plays, state, bans = false) {
      const metrics = node("dl", "map-stats-metrics");
      metrics.append(metric(UI("generated.stats.winRate","Win rate"), number(row.wins) + number(row.losses) > 0 ? row.win_rate : null, "percent"), metric(UI("generated.stats.pickRate","Pick rate"), row.pick_rate, "percent"));
      if (bans && state.scope === "ranked") metrics.append(metric(UI("generated.champions.banRate","Ban rate"), row.ban_rate, "percent"));
      const detailLine = node("p", "map-stats-record", record(row) + " · " + String(plays==="total_uses"?UI("generated.stats.value1Purchases","{value1} purchases",{value1:count(row[plays])}):UI("discovery.count.plays","{count} plays",{count:count(row[plays])})));
      const fragment = document.createDocumentFragment(); fragment.append(metrics, detailLine);
      if (bans && state.scope === "ranked") fragment.append(node("p", "map-stats-record", UI("discovery.count.bans","{count} bans",{count:count(row.total_bans)})));
      return fragment;
    }

    function renderSection(state) {
      if (current !== state) return;
      const { data, section, panel } = state;
      panel.replaceChildren();
      const titles = { champions: UI("generated.stats.championPerformance","Champion performance"), talents: UI("generated.stats.talentPicks","Talent picks"), items: UI("generated.stats.itemMeta","Item performance"), compositions: UI("menu.teamCompositions","Team compositions") };
      panel.append(node("h2", "map-stats-section-title", titles[section]));
      if (section === "champions" || section === "talents") {
        const toolbar = node("div", "map-stats-detail-toolbar");
        const roleFilters = node("div", "reference-filters");
        roleFilters.setAttribute("role", "group"); attribute(roleFilters,"aria-label",UI("generated.stats.role","Champion role"));
        for (const role of ["All", ...roles]) roleFilters.append(button(roleLabel(role), () => { state.role = role; rememberDetail(state); renderSection(state); }, state.role === role));
        const sortFilters = node("div", "reference-filters");
        sortFilters.setAttribute("role", "group"); attribute(sortFilters,"aria-label",UI("generated.players.sortBy","Sort by"));
        const sorts = [["win_rate", UI("generated.stats.winRate","Win rate")], ["pick_rate", UI("generated.stats.pickRate","Pick rate")], ...(section === "talents" ? [["total_plays", UI("generated.stats.plays","Plays")]] : state.scope === "ranked" ? [["ban_rate", UI("generated.champions.banRate","Ban rate")]] : [])];
        for (const [field, label] of sorts) sortFilters.append(button(label, () => { state.sort = field; rememberDetail(state); renderSection(state); }, state.sort === field));
        toolbar.append(roleFilters, sortFilters); panel.append(toolbar);
      }
      const matchesRole = (id) => state.role === "All" || identities?.get(Number(id))?.roles?.[0] === state.role;
      const sorted = (entries) => [...entries].sort((a, b) => (number(b[state.sort]) ?? -1) - (number(a[state.sort]) ?? -1) || (number(b.total_plays) ?? 0) - (number(a.total_plays) ?? 0));
      const cards = node("div", "map-stats-entity-grid");
      if (section === "champions") {
        for (const champion of sorted(data.champions.filter((row) => matchesRole(row.champion_id)))) {
          const identity = identities?.get(Number(champion.champion_id));
          const card = node("article", "map-stats-entity"); card.dataset.championId = champion.champion_id;
          card.append(heading(champion.champion_name, championIcon(champion.champion_name), identity?.roles?.[0]?roleLabel(identity.roles[0]):""), performance(champion, "total_plays", state, true));
          comparison(card, section, champion.champion_id, state); cards.append(card);
        }
      } else if (section === "talents") {
        if (!identities) { message(panel, UI("async.couldNotLoad", "Talent identities could not be loaded."), () => reloadDetail(state)); return; }
        const groups = data.champions.filter((row) => matchesRole(row.champion_id)).map((champion) => ({
          champion, identity: identities.get(Number(champion.champion_id)),
          talents: sorted(data.talents.filter((row) => Number(row.champion_id) === Number(champion.champion_id) && identities.get(Number(row.champion_id))?.talents?.some((talent) => Number(talent.id) === Number(row.talent_id)))),
        })).filter((group) => group.talents.length).sort((a, b) => (number(b.talents[0][state.sort]) ?? 0) - (number(a.talents[0][state.sort]) ?? 0));
        for (const { champion, identity, talents } of groups) {
          const card = node("article", "map-stats-entity map-stats-talent-group");
          card.append(heading(champion.champion_name, championIcon(champion.champion_name), identity.roles?.[0]?roleLabel(identity.roles[0]):""));
          for (const talent of talents) {
            const canonical = identity.talents.find((row) => Number(row.id) === Number(talent.talent_id));
            const row = node("div", "map-stats-talent"); row.dataset.talentId = talent.talent_id;
            row.append(heading(talent.talent_name, canonical.iconUrl || null), performance(talent, "total_plays", state));
            comparison(row, section, talent.talent_id, state); card.append(row);
          }
          cards.append(card);
        }
      } else if (section === "items") {
        for (const category of ["Defense", "Utility", "Healing", "Offense"]) {
          const entries = data.items.filter((item) => (itemClasses[item.item_name] || "Utility") === category);
          if (!entries.length) continue;
          const group = node("section", "map-stats-item-group"); group.dataset.category = category;
          group.append(node("h3", "map-stats-category-title",UI("maps.itemClass."+category.toLowerCase(),category)));
          const groupGrid = node("div", "map-stats-entity-grid");
          for (const item of entries) {
            const card = node("article", "map-stats-entity"); card.dataset.itemId = item.item_id;
            card.append(heading(item.item_name, "/images/items/" + item.item_name.replace(/\s+/g, "_") + "_Icon.avif"), performance(item, "total_uses", state));
            comparison(card, section, item.item_id, state); groupGrid.append(card);
          }
          group.append(groupGrid); cards.append(group);
        }
        cards.className = "map-stats-item-groups";
      } else {
        for (const composition of data.compositions) {
          const card = node("article", "map-stats-entity"); card.dataset.composition = composition.comp_id;
          card.append(heading(String(composition.comp_id), null, UI("discovery.count.matches","{count} matches",{count:count(composition.count)})));
          const metrics = node("dl", "map-stats-metrics");
          metrics.append(metric(UI("generated.stats.winRate","Win rate"), number(composition.wins) + number(composition.losses) > 0 ? composition.winrate : null, "percent"));
          card.append(metrics, node("p", "map-stats-record", record(composition)));
          const lineup = node("dl", "map-stats-lineup");
          for (const role of roles) lineup.append(metric(roleLabel(role), composition[role.toLowerCase()]));
          card.append(lineup); comparison(card, section, composition.comp_id, state); cards.append(card);
        }
      }
      if (!cards.childElementCount) panel.append(node("p", "map-stats-message", UI("discovery.stats.noObservations","No observations match this selection.")));
      panel.append(cards);
    }

    async function reloadDetail(state) {
      const version = ++detailVersion;
      state.output.replaceChildren(); state.output.setAttribute("aria-busy", "true");
      message(state.output, UI("async.loading","Loading map statistics…"));
      try {
        const [data] = await Promise.all([
          request("/" + encodeURIComponent(state.map.apiName) + "?scope=" + state.scope,
            (value) => value?.map?.map === state.map.apiName && ["champions", "talents", "items", "compositions"].every((field) => Array.isArray(value[field])) && (value.stats_scope == null || value.stats_scope === state.scope)),
          loadIdentities().catch(() => null), colorRequest.catch(() => {}),
        ]);
        if (current !== state || detailVersion !== version) return;
        state.data = data;
        state.heroMetrics.replaceChildren(overview(data.map));
        state.output.replaceChildren();
        const sections = state.scope === "ranked" ? ["champions", "talents", "items", "compositions"] : ["champions"];
        const labels = { champions: UI("nav.champions","Champions"), talents: UI("generated.champions.talents","Talents"), items: UI("menu.items","Items"), compositions: UI("generated.stats.compositionStats","Compositions") };
        const nav = node("div", "reference-filters map-stats-sections");
        nav.setAttribute("role", "group"); attribute(nav,"aria-label",UI("generated.stats.mapStats","Map statistics"));
        state.panel = node("section", "map-stats-section");
        for (const section of sections) {const control=button(labels[section], () => {
          state.section = section; state.role = "All"; state.sort = "win_rate";
          rememberDetail(state);
          for (const control of nav.children) {
            const active = control.dataset.mapSection === section;
            control.classList.toggle("is-active", active); control.setAttribute("aria-pressed", String(active));
          }
          renderSection(state);
        }, section === state.section);control.dataset.mapSection=section;nav.append(control);}
        state.output.append(nav, state.panel); renderSection(state);
      } catch {
        if (current === state && detailVersion === version) message(state.output, UI("stats.scope.noMapStats","Statistics are unavailable for this map in {mode}.",{mode:String(scopeLabel(state.scope))}), () => reloadDetail(state));
      } finally { if (current === state && detailVersion === version) state.output.setAttribute("aria-busy", "false"); }
    }

    function detailSelection(map, saved) {
      const valid = saved && saved.map === map.apiName;
      const selectedScope = valid && Object.hasOwn(scopes, saved.scope) ? saved.scope : scope;
      const sections = selectedScope === "ranked" ? ["champions", "talents", "items", "compositions"] : ["champions"];
      return {
        scope: selectedScope,
        section: valid && sections.includes(saved.section) ? saved.section : "champions",
        role: valid && ["All", ...roles].includes(saved.role) ? saved.role : "All",
        sort: valid && ["win_rate", "pick_rate", "total_plays", "ban_rate"].includes(saved.sort) ? saved.sort : "win_rate",
      };
    }
    function rememberDetail(state = current) {
      if (!state || current !== state) return;
      window.DiscoveryViewScroll?.rememberState('mapDetail', { map: state.map.apiName, scope: state.scope, section: state.section, role: state.role, sort: state.sort });
    }
    function openDetail(map, saved = null) {
      const selection = detailSelection(map, saved);
      const header = node("header", "map-stats-hero reference-page-header");
      header.style.backgroundImage = "linear-gradient(90deg,rgba(14,18,23,.96),rgba(14,18,23,.66)),url(\"" + map.loadingArtwork + "\")";
      const copy = node("div", "map-stats-hero-copy"); copy.append(node("p", "map-stats-scope",scopeLabel(selection.scope)));
      const title = node("h1", "", map.name); title.id = "map-detail-title"; title.tabIndex = -1; copy.append(title);
      const heroMetrics = node("div"); heroMetrics.append(overview(map.stats)); header.append(copy, heroMetrics);
      const output = node("div", "map-stats-detail-output"); output.setAttribute("aria-live", "polite");
      detail.replaceChildren(header, output);
      current = { map, ...selection, heroMetrics, output };
      void reloadDetail(current);
      return title;
    }

    return { loadList, renderList, openDetail, rememberDetail, championCard, findMap: (name) => rows?.find((row) => row.apiName === name) || describe(name) };
  };
})();
