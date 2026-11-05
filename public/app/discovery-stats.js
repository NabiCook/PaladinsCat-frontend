/* Independent Stats views. Contracts: app/stats/{performance,skins,compositions,ecpm,tiers,activity}; lib/api-client.ts. */
(() => {
  "use strict";
  const A=window.DiscoveryApp;if(!A)return;
  const message=(key,fallback,values)=>A.message(key,values,fallback);
  function attribute(node,name,value){if(value?.discoveryMessage)window.DiscoveryLocale.bind(node,value.key,value.fallback,name,value.values,true);else node.setAttribute(name,value);}
  const roleLabel=role=>['Global','Frontline','Damage','Flank','Support'].includes(role)?message('common.roles.'+role.toLowerCase(),role):role;
  const shell = document.querySelector(".dashboard-shell"), stack = document.querySelector(".page-view-stack");
  if (!shell || !stack || document.querySelector('[aria-controls="stats-hub-page"]')) return;
  const icons = {"hub":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-no-axes-combined\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 16v5\"></path><path d=\"M16 14.639V21\"></path><path d=\"M20 10.656V21\"></path><path d=\"m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15\"></path><path d=\"M4 18.463V21\"></path><path d=\"M8 14.656V21\"></path></svg>","performance":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-column-increasing lucide-bar-chart-4\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M13 17V9\"></path><path d=\"M18 17V5\"></path><path d=\"M3 3v16a2 2 0 0 0 2 2h16\"></path><path d=\"M8 17v-3\"></path></svg>","skins":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-palette\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"></path><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"></circle><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"></circle><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"></circle><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"></circle></svg>","compositions":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-users-round lucide-users-2\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M18 21a8 8 0 0 0-16 0\"></path><circle cx=\"10\" cy=\"8\" r=\"5\"></circle><path d=\"M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3\"></path></svg>","ecpm":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-gauge\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m12 14 4-4\"></path><path d=\"M3.34 19a10 10 0 1 1 17.32 0\"></path></svg>","tiers":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-medal\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15\"></path><path d=\"M11 12 5.12 2.2\"></path><path d=\"m13 12 5.88-9.8\"></path><path d=\"M8 7h8\"></path><circle cx=\"12\" cy=\"17\" r=\"5\"></circle><path d=\"M12 18v-2h-.5\"></path></svg>","activity":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-activity\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"></path></svg>"};
  const sections = [
    ["performance", message("menu.performanceOverview","Performance"), message("stats.portal.performanceDescription","Compare damage, healing and other performance metrics across roles and champions.")],
    ["skins", message("menu.skinStats","Skins"), message("stats.portal.skinsDescription","Explore skin usage and win rates, with separate game populations.")],
    ["compositions", message("menu.teamCompositions","Team compositions"), message("compositions.description","See how different five-player role combinations perform in Ranked.")],
    ["ecpm", message("generated.stats.effectiveCreditsPerMinute","Effective credits"), message("stats.portal.ecpmDescription","Compare credits earned per minute and the distribution for each role.")],
    ["tiers", message("menu.rankedDistribution","Rank distribution"), message("stats.tiers.description","Explore profile ranks and ranked match participation separately.")],
    ["activity", message("menu.playerActivity","Player activity"), message("stats.portal.activityDescription","Explore observed players, match activity and hourly trends.")]
  ];
  const roles = ["Frontline", "Damage", "Flank", "Support"];
  const metrics = [["dpm",message("common.metrics.damagePerMinute","Damage / min")],["wpm",message("common.metrics.weaponPerMinute","Weapon damage / min")],["apm",message("common.metrics.abilityPerMinute","Ability damage / min")],["hpm",message("common.metrics.healingPerMinute","Healing / min")],["shpm",message("common.metrics.selfHealingPerMinute","Self healing / min")],["gpm",message("common.metrics.creditsPerMinute","Credits / min")],["egpm",message("common.metrics.effectiveCreditsPerMinute","Effective credits / min")],["spm",message("common.metrics.shieldingPerMinute","Shielding / min")],["kda",message("common.metrics.kda","KDA")],["kpm",message("common.metrics.killsAssistsPerMinute","Kills + assists / min")],["deaths_per_minute",message("common.metrics.deathsPerMinute","Deaths / min")]];
  const scopes = [["ranked",message("stats.performance.ranked","Ranked Siege")],["casual",message("stats.matchups.siege","Casual Siege")],["team_deathmatch",message("stats.scope.teamDeathmatch","Team Deathmatch")],["arcade",message("stats.scope.arcade","Arcade")],["wave_defense",message("stats.scope.waveDefense","Wave Defense")],["experiment",message("stats.scope.experiment","Experimental")],["newcomer",message("stats.scope.newcomer","Newcomer")],["bot",message("stats.scope.bot","Training")]];
  const pages = new Map(), states = new Map(), requests = new Map(); let tierGeneration=0;
  const nav = document.createElement("button"); nav.type = "button"; nav.className = "rail-button"; attribute(nav,"aria-label",message("nav.stats","Stats"));attribute(nav,"title",message("nav.stats","Stats"));nav.dataset.navigationKey="Stats"; nav.setAttribute("aria-controls", "stats-hub-page"); nav.innerHTML = icons.hub;
  const navLabel = document.createElement("span"); navLabel.className = "rail-label"; A.setText(navLabel,message("nav.stats","Stats")); nav.append(navLabel);
  const itemsNav = document.querySelector('.rail-main [aria-label="Items"]'); if (itemsNav) itemsNav.after(nav); else document.querySelector(".rail-main")?.append(nav);
  function el(tag, cls = "", text) { const n = document.createElement(tag); n.className = cls; if (text != null) A.setText(n,text); return n; }
  function copy(text) { return el("p", "stats-copy", text); }
  function btn(label, action, cls = "reference-filter") { const b = el("button", cls, label); b.type = "button"; b.addEventListener("click", action); return b; }
  function icon(key) { const n = el("span", "stats-icon"); n.innerHTML = icons[key]; return n; }
  function fmt(value, digits = 0) { return value == null || value === "" || !Number.isFinite(Number(value)) ? "—" : A.formatNumber(Number(value), { maximumFractionDigits: digits }); }
  function rate(value, samples) { return Number(samples) > 0 && value != null && Number.isFinite(Number(value)) ? fmt(value, 2) + "%" : "—"; }
  function arr(value) { if (!Array.isArray(value)) throw new Error("Incomplete statistics response"); return value; }
  function record(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Incomplete statistics response"); return value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data : value; }
  function validNumber(value) { return value != null && value !== "" && Number.isFinite(Number(value)); }
  function summary(value) { const r = record(value); if (!["mean","min","max","median","mode","p10","p25","p75","p90"].every(k => validNumber(r[k])) || !validNumber(r.sample_size ?? r.sampleSize)) throw new Error("Incomplete distribution"); return r; }
  async function request(path, refresh = false) {
    path = window.DiscoveryApp.scopedPath(path);
    if (refresh) requests.delete(path);
    if (!requests.has(path)) {
      if (requests.size >= 64) requests.delete(requests.keys().next().value);
      requests.set(path, window.DiscoveryApp.scopedFetch("/api/v1" + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }).then(async r => { if (!r.ok) { const error = new Error("Statistics unavailable"); error.status = r.status; throw error; } const body = await r.json(); return body?.data ?? body; }).catch(error => { requests.delete(path); throw error; }));
    }
    return requests.get(path);
  }
  function panel(title) { const p = el("section", "stats-panel"); if (title) p.append(el("h2", "", title)); return p; }
  function state(host, copyValue, retry) { host.replaceChildren(); const box = el("div", "stats-state"); box.setAttribute("role", "status"); box.append(copy(copyValue)); if (retry) box.append(btn(message("async.tryAgain","Try again"), retry)); host.append(box); }
  function failure(host, retry) { state(host, message("async.couldNotLoad","Statistics are temporarily unavailable. Try again to reload this section."), retry); }
  function field(label, options, value, change) { const lab = el("label", "stats-field", label), control = el("select"); for (const [key, name] of options) { const opt = el("option", "", name); opt.value = key; control.append(opt); } attribute(control,"aria-label",label); control.value = value; control.addEventListener("change", () => change(control.value)); lab.append(control); return lab; }
  function search(label, change) { const lab = el("label", "stats-field stats-search", label), input = el("input"); input.type = "search"; attribute(input,"placeholder",label);attribute(input,"aria-label",label); input.addEventListener("input", () => change(input.value)); lab.append(input); return lab; }
  function page(key) {
    if (!pages.has(key)) { const n = el("main", "stats-page"); n.id = "stats-" + key + "-page"; n.hidden = true; n.inert = true; n.setAttribute("aria-hidden", "true"); n.setAttribute("aria-labelledby", "stats-" + key + "-title"); stack.append(n); pages.set(key, n); }
    return pages.get(key);
  }
  function heading(key, title, description) { const h = el("header", "stats-header"), titleEl = el("h1", "", title); titleEl.id = "stats-" + key + "-title"; titleEl.tabIndex = -1; h.append(titleEl); return h; }
  function activate() {
    const view = shell.dataset.view, key = view?.replace(/^stats-/, "");
    for (const [name, n] of pages) { const active = view === "stats-" + name; n.hidden = !active; n.inert = !active; n.setAttribute("aria-hidden", String(!active)); }
    if (!pages.has(key) || view !== "stats-" + key) { if (!document.querySelector('main[data-nav-group="Stats"]:not([hidden])')) { nav.classList.remove("active"); nav.removeAttribute("aria-current"); } return; }
    document.querySelectorAll("main, .dashboard-grid").forEach(n => { const active = n === page(key); n.inert = !active; n.setAttribute("aria-hidden", String(!active)); });
    document.querySelectorAll(".rail-button").forEach(n => { const active = n === nav; n.classList.toggle("active", active); if (active) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current"); });
    document.title = (page(key).querySelector("h1")?.textContent || String(message("nav.stats","Stats"))) + " · PaladinsCat";
  }
  function open(key) {
    if (!page(key).children.length) build(key);
    const view = "stats-" + key, app=window.DiscoveryApp, path=app?.currentPath(), expected=key==='hub'?'/stats':'/stats/'+key;
    const previous=app?.snapshot(view), routeChange=key==='activity' && Boolean(previous?.path && previous.path!==path), restore=Boolean(path && app?.isRestoring(path));
    if (shell.dataset.view !== view || routeChange) document.dispatchEvent(new CustomEvent("discovery:open-view", { detail: { view, routeChange, restore } }));
    app?.record(view,path&&new URL(path,location.origin).pathname===expected?path:expected);
    if(key==='skins'){const s=states.get(key),champion=String(Number(new URL(app.currentPath(),location.origin).searchParams.get('champion'))||'');if(s.champion!==champion){s.champion=champion;s.page=1;if(s.championSelect)s.championSelect.value=champion;void s.load();}}
    if(key==='activity')states.get(key)?.activate?.();
    const current=states.get(key);if(current?.tierDirty)void current.load(true);
    activate(); window.scrollTo({ top: 0, behavior: "instant" }); requestAnimationFrame(() => page(key).querySelector("h1")?.focus({ preventScroll: true }));
  }
  if (window.DiscoveryApp) { window.DiscoveryApp.registerRoute("/stats", () => open("hub")); sections.forEach(([key]) => window.DiscoveryApp.registerRoute("/stats/" + key, () => open(key))); }
  nav.addEventListener("click", () => window.DiscoveryApp.navigate("/stats")); new MutationObserver(activate).observe(shell, { attributes: true, attributeFilter: ["data-view"] });
  function begin(s) { s.sequence = (s.sequence || 0) + 1;s.requestTierGeneration=tierGeneration;s.tierDirty=false; state(s.body, message("async.loading","Loading statistics…")); window.DiscoveryLoading?.show(s.body,["performance","activity"].includes(s.key)?"dashboard":"table"); s.body.setAttribute("aria-busy", "true"); return s.sequence; }
  function finish(s, seq) { if (s.sequence !== seq || s.requestTierGeneration!==tierGeneration) return false; s.body.removeAttribute("aria-busy"); return true; }
  function cards(host, values) { const grid = el("div", "stats-metrics"); values.forEach(([label, value]) => { const c = el("div", "stats-metric"); c.append(el("span", "stats-meta", label), el("strong", "", value)); grid.append(c); }); host.append(grid); }
  function table(host, title, columns, rows) {
    const p = panel(title); if (!rows.length) { p.append(copy(message("generated.search.noResultsFound","No data matches this selection."))); host.append(p); return; }
    const wrap = el("div", "stats-table-wrap"); wrap.tabIndex = 0; wrap.setAttribute("role", "region"); attribute(wrap,"aria-label",title); const t = el("table", "stats-table"); t.append(el("caption", "stats-sr-only", title));
    const head = el("thead"), tr = el("tr"); columns.forEach(c => { const th = el("th", "", c); th.scope = "col"; tr.append(th); }); head.append(tr); const body = el("tbody");
    rows.forEach(row => { const r = el("tr"); row.forEach((value, index) => { const td = el(index ? "td" : "th"); if (!index) td.scope = "row"; if (value instanceof Node) td.append(value); else A.setText(td,value ?? "—"); r.append(td); }); body.append(r); }); t.append(head, body); wrap.append(t); p.append(wrap); host.append(p);
  }
  function bars(host, title, rows) {
    const p = panel(title), chart = el("div", "stats-bars"), maximum = Math.max(...rows.map(r => Number(r[1]) || 0), 1);
    if (!rows.length) p.append(copy(message("playerActivity.noMatches","No activity is available for this selection.")));
    rows.forEach(([name, value]) => { const line = el("div", "stats-bar-row"); line.append(el("span", "stats-bar-label", name)); const track = el("div", "stats-bar-track"), fill = el("span"); fill.style.width = Math.max(0, Math.min(100, Number(value) / maximum * 100)) + "%"; track.append(fill); track.setAttribute("aria-hidden", "true"); line.append(track, el("strong", "stats-bar-value", fmt(value, 2))); chart.append(line); }); p.append(chart); host.append(p);
  }
  function build(key) {
    if (key === "hub") { buildHub(); return; }
    const meta = sections.find(row => row[0] === key); if (!meta) return;
    const s = { key, sequence: 0, controls: el("div", "stats-controls"), body: el("div", "stats-body") }; states.set(key, s);
    const p = page(key); p.append(heading(key, meta[1], meta[2]), s.controls, s.body);
    ({ performance: buildPerformance, skins: buildSkins, compositions: buildCompositions, ecpm: buildEcpm, tiers: buildTiers, activity: buildActivity })[key](s);
    if (key !== "activity" && !s.controls.querySelector("button")) s.controls.append(btn(message("generated.players.refresh","Refresh"), () => void s.load(true))); void s.load();
  }
  function buildHub() {
    const host = page("hub"), grid = el("div", "stats-hub-grid");
    host.append(heading("hub", message("nav.stats","Stats"), message("stats.portal.description","Explore game-wide statistics, performance and player activity.")), grid);
    sections.filter(([key]) => key !== "tiers").forEach(([key, title, description]) => { const c = btn("", () => window.DiscoveryApp.navigate("/stats/" + key), "stats-hub-card"); const top = el("div", "stats-card-top"); top.append(icon(key), el("span", "stats-card-arrow", "→")); c.append(top, el("h2", "", title), copy(description)); c.dataset.section = key; grid.append(c); });
    for(const [key,title,description]of [['winrate',message('common.metrics.winRate','Win rates'),message('stats.portal.winrateDescription','Compare champion win rates by class.')],['banrate',message('common.metrics.banRate','Ban rates'),message('stats.portal.banrateDescription','Explore ranked champion ban rates.')]]){const card=btn('',()=>window.DiscoveryApp.navigate('/stats/'+key),'stats-hub-card');const top=el('div','stats-card-top');top.append(icon('performance'),el('span','stats-card-arrow','→'));card.append(top,el('h2','',title),copy(description));card.dataset.section=key;grid.append(card);}
  }
  function buildPerformance(s) {
    Object.assign(s, { scope: "ranked", metric: "dpm", queue: "424", search: "", sort: "mean", role: "all" });
    const mode = field(message("stats.scope.label","Game mode"), [["ranked",message("stats.performance.ranked","Ranked Siege")],["casual",message("stats.performance.casual","Casual")]], s.scope, value => { s.scope = value; if (value === "ranked" && s.metric === "gpm") s.metric = "dpm"; drawControls(); void s.load(); });
    function drawControls() { const metric = field(message("playerTrends.metric","Metric"), metrics.filter(([key]) => s.scope === "casual" || key !== "gpm"), s.metric, value => { s.metric = value; void s.load(); }); const queue = field(message("stats.scope.label","Casual mode"), [["424",message("stats.performance.siege","Siege")],["452",message("stats.performance.onslaught","Onslaught")],["469",message("stats.scope.teamDeathmatch","Team Deathmatch")]], s.queue, value => { s.queue = value; void s.load(); }); queue.hidden = s.scope !== "casual"; s.controls.replaceChildren(mode, queue, metric, btn(message("generated.players.refresh","Refresh"), () => void s.load(true))); }
    drawControls();
    s.load = async refresh => { const seq = begin(s), selected = { scope: s.scope, metric: s.metric, queue: s.scope === "ranked" ? "486" : s.queue };
      try { const data = record(await request("/stats/performance-page-data?" + new URLSearchParams({ scope: selected.scope, metric: selected.metric, queueId: selected.queue }), refresh)), dashboard = record(data.dashboard);
        if (dashboard.scope !== selected.scope || (selected.scope === "casual" && (dashboard.queue_ids?.length !== 1 || Number(dashboard.queue_ids[0]) !== Number(selected.queue)))) throw new Error("Population mismatch");
        summary(dashboard[selected.metric]); roles.forEach(role => summary(dashboard.roles?.[role])); const group = arr(data.comparison).find(row => row.metric === selected.metric); const rows = arr(group?.rows); if (!finish(s, seq)) return; s.rows = rows;
        s.redraw=()=>{s.body.replaceChildren(); const global = dashboard[selected.metric], n = Number(global.sample_size ?? global.sampleSize), digits = ["kda","kpm","deaths_per_minute"].includes(selected.metric) ? 2 : 0;
        const sampled = value => n > 0 ? fmt(value, digits) : "—";
        cards(s.body, [[message("generated.stats.average","Average"),sampled(global.mean)],[message("stats.performance.median","Median"),sampled(global.median)],[message("generated.stats.p90","90th percentile"),sampled(global.p90)],[message("generated.stats.samples","Samples"),fmt(n)]]);
        bars(s.body, message("stats.performance.roleAverages","Average by role"), roles.map(role => [roleLabel(role), Number(dashboard.roles[role].sample_size ?? dashboard.roles[role].sampleSize) > 0 ? dashboard.roles[role].mean : null]));
        table(s.body, message("stats.performance.distribution","Performance distribution"), [message("stats.scope.label","Population"),message("generated.stats.average","Average"),message("generated.stats.p10","P10"),message("generated.stats.p25","P25"),message("stats.performance.median","Median"),message("generated.stats.p75","P75"),message("generated.stats.p90","P90"),message("generated.stats.egpm.maximum","Maximum"),message("generated.stats.samples","Samples")], [["Global",global],...roles.map(role => [role,dashboard.roles[role]])].map(([label,row]) => [roleLabel(label),...["mean","p10","p25","median","p75","p90","max"].map(k => Number(row.sample_size ?? row.sampleSize) > 0 ? fmt(row[k],digits) : "—"),fmt(row.sample_size ?? row.sampleSize)]));
        const filters = el("div", "stats-controls"); s.comparison = el("div"); const input = search(message("playerTrends.search","Search champions"), value => { s.search = value; draw(); }); input.querySelector("input").value = s.search;
        filters.append(input, A.roleFilter(message("generated.stats.role","Champion role"), [["all",message("generated.stats.all","All roles")],...roles.map(role => [role,roleLabel(role)])], s.role, value => { s.role = value; draw(); }, 'stats-field'), field(message("skins.sortBy","Sort champions"), [["mean",message("generated.stats.average","Average")],["total_matches",message("generated.stats.samples","Samples")]], s.sort, value => { s.sort = value; draw(); })); s.body.append(filters,s.comparison);
        function draw() { const rows = s.rows.filter(row => String(row.champion_name).toLowerCase().includes(s.search.toLowerCase()) && (s.role === "all" || row.class === s.role)).sort((a,b) => Number(b[s.sort])-Number(a[s.sort])); s.comparison.replaceChildren(); table(s.comparison,message("stats.performance.championTitle","Champion comparison"),[message("generated.matches.champion","Champion"),message("stats.performance.role","Role"),message("generated.stats.average","Average"),message("stats.performance.median","Median"),message("generated.stats.p10","P10"),message("generated.stats.p90","P90"),message("generated.stats.samples","Samples")],rows.map(row => [row.champion_name,roleLabel(row.class),...["mean","median","p10","p90"].map(k=> Number(row.total_matches)>0?fmt(row[k],digits):"—"),fmt(row.total_matches)])); }
        draw();};s.redraw();
      } catch { if (finish(s, seq)) failure(s.body, () => void s.load(true)); }
    };
  }
  function buildSkins(s, fixedChampion, championSlug) {
    Object.assign(s,{scope:'ranked',sort:'plays',search:'',kind:'skins',champion:String(fixedChampion || Number(new URL(A.currentPath(),location.origin).searchParams.get('champion'))||''),role:'',page:1,pageSize:25,champions:[]});
    const draw=()=>{s.page=1;if(s.draw)s.draw();};
    const championControl=field(message("generated.matches.champion",'Champion',undefined),[['',message("generated.matches.all",'All',undefined)]],'',value=>{s.champion=value;s.page=1;A.record('stats-skins','/stats/skins'+(value?'?champion='+value:''));void s.load();});
    s.championSelect=championControl.querySelector('select'); if (fixedChampion) championControl.hidden = true;
    s.controls.append(field(message("stats.scope.label",'Game mode',undefined),scopes,s.scope,value=>{s.scope=value;s.page=1;void s.load();}),championControl,
      A.roleFilter(message("generated.champions.class.41ff354",'Class',undefined),[['',message("skins.allClasses",'All classes',undefined)],...roles.map(role=>[role,roleLabel(role)])],'',value=>{s.role=value;draw();},'stats-field'),
      field(message("skins.sortBy",'Sort by',undefined),[['plays',message("skins.sortPlays",'Most played',undefined)],['winRate',message("skins.sortWinRate",'Highest win rate',undefined)],['champion',message("skins.sortChampion",'Champion name',undefined)],['class',message("skins.sortClass",'Champion class',undefined)]],s.sort,value=>{s.sort=value;draw();}),
      search(message("generated.stats.searchSkins",'Search skins or champions',undefined),value=>{s.search=value;draw();}));
    if (fixedChampion) s.controls.querySelector('[role=group]')?.closest('.stats-field')?.setAttribute('hidden', '');
    const reference=Promise.all(['/data/champion-data.json','/app/champion-titles.json'].map(async path=>{const r=await fetch(path,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Champion reference unavailable');return r.json();})).then(([roster,ids])=>{
      s.champions=Object.entries(roster).map(([slug,c])=>({id:Number(ids.championIds[slug]),name:c.name,role:c.roles?.[0],slug})).sort((a,b)=>a.name.localeCompare(b.name,A.locale()));
      for(const champion of s.champions){const option=el('option','',champion.name);option.value=champion.id;championControl.querySelector('select').append(option);}championControl.querySelector('select').value=s.champion;
    }).catch(()=>{championControl.querySelector('select').disabled=true;});
    const championFor=row=>s.champions.find(c=>c.id===Number(row.champion_id)||c.name===row.champion_name);
    const championLink=row=>{const champion=championFor(row);if(!champion)return row.champion_name;const a=el('a','browse-link',champion.name);a.href='/champions/'+champion.slug;return a;};
    const portraitReference=import('./discovery-skin-portraits.js?v=avif-png-1');
    s.load=async refresh=>{const seq=begin(s),params=new URLSearchParams({scope:s.scope,sort:'plays',limit:'200'});if(s.champion)params.set('championId',s.champion);
      const broken=new URLSearchParams({scope:s.scope});if(s.champion)broken.set('championId',s.champion);
      const results=await Promise.allSettled([request('/stats/skins?'+params,refresh),request('/stats/broken-skins?'+broken,refresh),reference,portraitReference]);await championRateColorReady;if(!finish(s,seq))return;
      s.body.replaceChildren();s.skinHost=el('div');s.brokenHost=el('div');s.body.append(s.brokenHost,s.skinHost);
      const portraits=results[3].status==='fulfilled'?results[3].value:null;
      const skinName=row=>{const sources=portraits?.skinPortraitSources(Number(row.champion_id),Number(row.skin_id));if(!sources)return row.skin_name;const name=el('span','stats-skin-identity'),img=el('img','stats-skin-portrait');img.setAttribute('data-pc-image-managed','true');img.dataset.skinPng=sources.fallback;img.src=sources.preferred;img.alt='';img.width=40;img.height=29;img.loading='lazy';img.addEventListener('error',()=>portraits.retrySkinPortraitPng({currentTarget:img}));name.append(img,el('span','',row.skin_name));return name;};
      const matchesClass=row=>!s.role||championFor(row)?.role===s.role;
      const matches=row=>matchesClass(row)&&(row.skin_name+' '+row.champion_name).toLowerCase().includes(s.search.toLowerCase());
      s.draw=()=>{if(!s.skinHost)return;s.skinHost.replaceChildren();s.brokenHost.replaceChildren();
        if(results[0].status==='rejected')failure(s.skinHost,()=>void s.load(true));else{const filtered=arr(results[0].value).filter(matches).sort((a,b)=>s.sort==='champion'?a.champion_name.localeCompare(b.champion_name,A.locale())||a.skin_name.localeCompare(b.skin_name,A.locale()):s.sort==='class'?(championFor(a)?.role||'').localeCompare(championFor(b)?.role||'',A.locale())||a.champion_name.localeCompare(b.champion_name,A.locale()):Number(b[s.sort==='winRate'?'win_rate':'total_plays'])-Number(a[s.sort==='winRate'?'win_rate':'total_plays']));
          const total=Math.max(1,Math.ceil(filtered.length/s.pageSize));s.page=Math.min(total,s.page);const start=(s.page-1)*s.pageSize,visible=filtered.slice(start,start+s.pageSize);
          table(s.skinHost,message("skins.fullTitle",'Skin statistics',undefined),[message("generated.stats.skin",'Skin',undefined),...(fixedChampion?[]:[message("generated.matches.champion",'Champion',undefined),message("generated.champions.class.41ff354",'Class',undefined)]),message("generated.stats.plays",'Plays',undefined),message("generated.players.wins",'Wins',undefined),message("generated.players.losses",'Losses',undefined),message("common.metrics.winRate",'Win rate',undefined)],visible.map(row=>[skinName(row),...(fixedChampion?[]:[championLink(row),roleLabel(championFor(row)?.role)||'—']),fmt(row.total_plays),fmt(row.wins),fmt(row.losses),championRate(row.win_rate,row.total_plays)]));
          const pager=el('nav','players-pagination stats-skins-pagination'),controls=el('div','players-profile-match-pager'),prev=btn(message("skins.previous",'Previous',undefined),()=>{s.page--;s.draw();}),next=btn(message("skins.next",'Next',undefined),()=>{s.page++;s.draw();});prev.disabled=s.page<=1;next.disabled=s.page>=total;attribute(pager,'aria-label',message('generated.changelog.pagination','Pagination'));
          const range=message('skins.showingStatus','{start}–{end} of {total}',{start:A.formatNumber(filtered.length ? start+1 : 0),end:A.formatNumber(Math.min(start+s.pageSize,filtered.length)),total:A.formatNumber(filtered.length)});
          controls.append(field(message("skins.rowsPerPage",'Rows per page',undefined),[10,25,50,100].map(value=>[String(value),A.formatNumber(value)]),String(s.pageSize),value=>{s.pageSize=Number(value);s.page=1;s.draw();}),el('span','stats-meta',message("skins.pageStatus",'Page {page} of {total}',{page:A.formatNumber(s.page),total:A.formatNumber(total)})),prev,next);pager.append(el('span','stats-meta',range),controls);s.skinHost.lastElementChild.append(pager);
        }
        if(results[1].status==='rejected')failure(s.brokenHost,()=>void s.load(true));else {const brokenRows=arr(results[1].value).filter(matchesClass);if(brokenRows.length)table(s.brokenHost,message("skins.brokenTitle",'Broken skin statistics',undefined),[message("generated.stats.skin",'Skin',undefined),...(fixedChampion?[]:[message("generated.matches.champion",'Champion',undefined)]),message("generated.stats.plays",'Plays',undefined),message("common.metrics.winRate",'Win rate',undefined),message("stats.tiers.share",'Usage share',undefined)],brokenRows.map(row=>[skinName(row),...(fixedChampion?[]:[championLink(row)]),fmt(row.total_plays),championRate(row.win_rate,row.total_plays),championRate(row.usage_share,row.total_plays)]));}
      };s.draw();
    };
  }
  function buildCompositions(s) {
    Object.assign(s,{sort:"count",minimum:"0"});s.controls.append(field(message("skins.sortBy","Sort compositions"),[["count",message("skins.sortPlays","Most played")],["winrate",message("skins.sortWinRate","Highest win rate")],["wins",message("common.sort.totalWins","Most wins")]],s.sort,value=>{s.sort=value;if(s.draw)s.draw();}),field(message("generated.stats.samples","Minimum matches"),[["0",message("generated.stats.all","Any sample size")],["100",message("common.summary.valueMetric","{value} matches",{value:fmt(100),metric:String(message("generated.stats.matches.9f3e924","matches"))})],["1000",message("common.summary.valueMetric","{value} matches",{value:fmt(1000),metric:String(message("generated.stats.matches.9f3e924","matches"))})]],s.minimum,value=>{s.minimum=value;if(s.draw)s.draw();}));
    s.refreshControls=()=>{const options=s.controls.querySelectorAll('select')[1]?.querySelectorAll('option');[100,1000].forEach((count,index)=>{if(options?.[index+1])A.setText(options[index+1],message('common.summary.valueMetric','{value} matches',{value:fmt(count),metric:String(message('generated.stats.matches.9f3e924','matches'))}));});};
    s.load=async refresh=>{const seq=begin(s);try{const rows=arr(await request("/matches/compositions?limit=200",refresh));if(!finish(s,seq))return;s.draw=()=>{s.body.replaceChildren();const data=rows.filter(r=>Number(r.count)>=Number(s.minimum)).sort((a,b)=>Number(b[s.sort])-Number(a[s.sort]));table(s.body,"",[message("generated.stats.composition","Composition"),message("nav.matches","Matches"),message("generated.players.wins","Wins"),message("generated.players.losses","Losses"),message("common.metrics.winRate","Win rate")],data.map(row=>{const lineup=el("span","stats-lineup");for(const [key,label]of [["frontline","Frontline"],["damage","Damage"],["flank","Flank"],["support","Support"]])lineup.append(el("span","",String(message("common.summary.valueMetric","{value} {metric}",{value:fmt(row[key]),metric:String(roleLabel(label))}))));return[lineup,fmt(row.count),fmt(row.wins),fmt(row.losses),rate(row.winrate,row.count)];}));};s.draw();}catch{if(finish(s,seq))failure(s.body,()=>void s.load(true));}};
  }
  function buildEcpm(s) {
    s.load=async refresh=>{const seq=begin(s);try{const rows=arr(await request("/stats/baselines?queueId=486",refresh)).map(r=>({...r}));
        if(!rows.some(r=>r.role==="Global")){const raw=record(await request("/stats/performance-metrics?metric=egpm&queueId=486",refresh)),g=summary(raw.egpm);rows.unshift({role:"Global",avg_egpm:g.mean,p10_egpm:g.p10,p25_egpm:g.p25,p75_egpm:g.p75,p90_egpm:g.p90,max_egpm:g.max,sample_size:g.sample_size??g.sampleSize});}
        if(!finish(s,seq))return;s.redraw=()=>{s.body.replaceChildren();
        const ordered=[...rows].sort((a,b)=>["Global",...roles].indexOf(a.role)-["Global",...roles].indexOf(b.role));bars(s.body,message("generated.stats.ecpmByRole","Average ECPM by role"),ordered.map(r=>[roleLabel(r.role),Number(r.sample_size)>0?r.avg_egpm:null]));
        table(s.body,message("generated.stats.ecpm","ECPM distribution"),[message("stats.performance.role","Role"),message("generated.stats.average","Average"),message("generated.stats.p10","P10"),message("generated.stats.p25","P25"),message("generated.stats.p75","P75"),message("generated.stats.p90","P90"),message("generated.stats.egpm.maximum","Maximum"),message("generated.stats.samples","Samples")],ordered.map(row=>[roleLabel(row.role),...["avg_egpm","p10_egpm","p25_egpm","p75_egpm","p90_egpm","max_egpm"].map(k=>Number(row.sample_size)>0?fmt(row[k],1):"—"),fmt(row.sample_size)]));};s.redraw();
      }catch{if(finish(s,seq))failure(s.body,()=>void s.load(true));}};
  }
  function buildTiers(s) {
    s.source="profiles";s.controls.append(field(message("stats.scope.label","Rank population"),[["profiles",message("generated.stats.playerProfiles","Player profiles")],["matches",message("stats.tiers.matches","Match participation")]],s.source,value=>{s.source=value;void s.load();}));
    s.load=async refresh=>{const seq=begin(s),source=s.source,results=await Promise.allSettled([request("/stats/tiers?source="+source,refresh),request("/stats/tiers/summary",refresh)]);if(!finish(s,seq))return;s.redraw=()=>{s.body.replaceChildren();
      if(results[1].status==="fulfilled"){const r=record(results[1].value);cards(s.body,[[message("generated.stats.playerProfiles","Ranked profiles"),fmt(r.profile_players)],[message("generated.stats.activePlayers","Active ranked players"),fmt(r.active_players)],[message("generated.stats.matchPlayerRows","Player-match observations"),fmt(r.match_player_rows)],[message("generated.stats.rankedMatches.0b47f50","Ranked matches"),fmt(r.ranked_matches)]]);}
      else {const warning=panel();failure(warning,()=>void s.load(true));s.body.append(warning);}
      if(results[0].status==="rejected"){const host=panel();failure(host,()=>void s.load(true));s.body.append(host);return;}
      try{const rows=arr(results[0].value).sort((a,b)=>Number(a.tier_sort)-Number(b.tier_sort));bars(s.body,message("stats.tiers.title","Distribution by rank (%)"),rows.map(r=>[r.tier,r.percentage]));
        table(s.body,source==="profiles"?message("stats.tiers.profiles","Profile ranks"):message("stats.tiers.matches","Participation ranks"),[message("generated.players.rank","Rank"),source==="profiles"?message("stats.tiers.players","Profiles"):message("generated.stats.matchPlayerRows","Player-match observations"),message("stats.tiers.share","Share"),message("common.metrics.winRate","Average win rate")],rows.map(row=>{const wr=validNumber(row.avg_win_rate)?Number(row.avg_win_rate):null;return[row.tier,fmt(row.total_plays),rate(row.percentage,row.total_plays),rate(wr==null?null:Math.abs(wr)<=1?wr*100:wr,row.total_plays)];}));
      }catch{failure(s.body,()=>void s.load(true));}};s.redraw();
    };
  }
  function buildActivity(s) {
    s.controls.remove(); s.body.classList.add('activity-source');
    let modulePromise, adapter, generation = 0;
    const loadModule = () => modulePromise ||= import('./discovery-activity.js?v=1').catch(error => { modulePromise = null; throw error; });
    s.activate = () => {
      const token = ++generation;
      if (shell.dataset.view !== 'stats-activity') { adapter?.unmount(s.body); return; }
      void loadModule().then(() => {
        if (token !== generation || shell.dataset.view !== 'stats-activity') return;
        adapter = window.DiscoveryActivity;
        if (!adapter) throw new Error('Activity panel unavailable');
        const route = new URL(A.currentPath(), location.origin), breakdown = route.hash === '#platforms' || route.searchParams.get('breakdown') === 'platforms' ? 'platform' : 'region';
        adapter.mount(s.body, breakdown);
      }).catch(() => { if (token === generation && shell.dataset.view === 'stats-activity') failure(s.body, () => s.activate()); });
    };
    s.load = () => s.activate();
    const observer = new MutationObserver(() => s.activate());
    observer.observe(shell, { attributes:true, attributeFilter:['data-view'] });
    window.addEventListener('pagehide', () => { generation++; observer.disconnect(); adapter?.unmount(s.body); }, { once:true });
  }
  const championStates = new Set();
  let championRateColor = null;
  const championRateColorReady = import('/app/discovery-stat-quality.js?v=5f308f541b9e').then(module => { championRateColor = module.getPercentageColor; }).catch(() => {});
  function championRate(value, samples) {
    const output = el('span', '', rate(value, samples));
    if (Number(samples) > 0 && validNumber(value) && championRateColor) output.style.color = championRateColor(Number(value));
    return output;
  }
  async function championMaps(championId, scope, refresh) {
    try {
      return arr(await request('/stats/champions/' + championId + '/maps?' + new URLSearchParams({scope, ...(scope === 'casual' ? {queueId:'424'} : {})}), refresh));
    } catch (error) {
      if (scope !== 'ranked' || error.status !== 404) throw error;
      // Comparison excludes its named map, so merge two actual map exclusions.
      const get = name => request('/stats/maps/' + encodeURIComponent(name) + '/comparison?section=champions', refresh);
      const first = await get('Ranked Brightmarsh');
      if (first?.section !== 'champions' || !Array.isArray(first.rows) || first.next_cursor != null) throw new Error('Incomplete map comparison');
      const other = first.rows.find(row => typeof row.map_name === 'string' && row.map_name !== 'Ranked Brightmarsh')?.map_name;
      if (!other) return [];
      const second = await get(other);
      if (second?.section !== 'champions' || !Array.isArray(second.rows) || second.next_cursor != null) throw new Error('Incomplete map comparison');
      const maps = new Map();
      for (const row of [...first.rows, ...second.rows]) if (Number(row.entity_key) === championId) maps.set(row.map_name, {map: row.map_name, total_plays: row.total_count, wins: row.wins, losses: row.losses, win_rate: row.win_rate});
      return [...maps.values()];
    }
  }
  function buildChampionStats(s, champion, kind) {
    let scope = 'ranked', order = 'plays', level = 1;
    s.controls.append(field(message('stats.scope.label','Game mode'), [['ranked',message('stats.scope.ranked','Ranked Siege')],['casual',message('stats.matchups.siege','Casual Siege')]], scope, value => { scope=value; void s.load(); }));
    s.controls.append(field(message('skins.sortBy','Sort by'), [['plays',message('skins.sortPlays','Most played')],['win_rate',message('skins.sortWinRate','Highest win rate')]], order, value => { order=value; s.draw?.(); }));
    if (kind === 'items') {
      const levelControl=el('div','item-level-control'), label=el('span','',message('generated.stats.level','Level'));
      levelControl.append(label);
      for (const value of [1,2,3]) {
        const control=btn(A.formatNumber(value),()=>{level=value;for(const button of levelControl.querySelectorAll('button')){const active=Number(button.dataset.level)===value;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));}s.draw?.();});
        control.dataset.level=String(value);control.classList.toggle('is-active',value===level);control.setAttribute('aria-pressed',String(value===level));levelControl.append(control);
      }
      s.controls.after(levelControl);
    }
    s.load = async refresh => {
      s.draw = null;
      const seq=begin(s), selected=scope;
      try {
        const id=Number(champion.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Champion identity unavailable');
        const [rows, reference] = await Promise.all([
          kind === 'items'
            ? request('/stats/items?' + new URLSearchParams({championId:String(id), mode:selected, limit:'200', ...(selected === 'casual' ? {scope:'casual', queueId:'424'} : {})}), refresh).then(arr)
            : championMaps(id, selected, refresh),
          window.DiscoveryReferenceCards.ensure(kind),
          championRateColorReady,
        ]);
        if (!finish(s,seq) || !s.body.isConnected) return;
        s.draw=()=>{
          s.body.replaceChildren();
          const countKey=kind === 'items' ? 'total_uses' : 'total_plays';
          const sortValue=row=>{const entry=kind==='items'?(row.levels||[]).find(item=>Number(item.item_level)===level-1):row;const value=entry?.[order==='win_rate'?'win_rate':countKey];return validNumber(value)?Number(value):-1;};
          const sorted=[...rows].sort((a,b)=>sortValue(b)-sortValue(a));
          if (!sorted.length) { state(s.body,message('generated.search.noResultsFound','No data matches this selection.')); return; }
          if (kind === 'items') {
            const groups=el('div','item-reference-groups'), byId=new Map(reference.map(item=>[Number(item.fallbackId),item]));
            const byName=new Map(reference.map(item=>[item.name.toLowerCase(),item])), categories=['Defense','Utility','Healing','Offense','Other'];
            for (const category of categories) {
              const entries=sorted.map(row=>({row,item:byId.get(Number(row.item_id))||byName.get(String(row.item_name).toLowerCase())})).filter(entry=>(entry.item?.category||'Other')===category);
              if (!entries.length) continue;
              const section=el('section','item-reference-group');section.dataset.category=category;
              section.append(el('h2','',message(category==='Other'?'common.other':'maps.itemClass.'+category.toLowerCase(),category)));
              const grid=el('div','item-reference-grid');
              for (const {row,item} of entries) {
                const card=window.DiscoveryReferenceCards.item(item||{name:row.item_name,tiers:[]},level), old=card.querySelector('.item-reference-heading');
                const heading=el('button','item-reference-heading item-reference-open');heading.type='button';
                attribute(heading,'aria-label',message('discovery.stats.view','View {name} statistics',{name:row.item_name}));
                heading.append(...old.childNodes);old.replaceWith(heading);
                heading.addEventListener('click',()=>void window.DiscoveryItemPages.openById(Number(row.item_id)));
                window.DiscoveryItemPages.paintCardMetrics(card,row,level);grid.append(card);
              }
              section.append(grid);groups.append(section);
            }
            s.body.append(groups);
          } else {
            const grid=el('div','map-reference-grid');
            for (const row of sorted) grid.append(window.DiscoveryReferenceCards.map(row,selected));
            s.body.append(grid);
          }
        }; s.draw();
      } catch { if (finish(s,seq) && s.body.isConnected) failure(s.body,()=>void s.load(true)); }
    };
  }
  window.DiscoveryStats = { mountChampion(host, champion, kind) {
    const s={key:'champion-'+kind,sequence:0,controls:el('div','stats-controls'),body:el('div','stats-body')};
    host.append(s.controls,s.body); championStates.add(s);
    if (kind === 'skins') buildSkins(s,champion.id,champion.slug); else buildChampionStats(s,champion,kind);
    void s.load();
    return () => { s.sequence++; championStates.delete(s); };
  }};

  document.addEventListener('discovery:locale-changed',()=>{for(const s of championStates)if(s.body.isConnected && s.body.getAttribute('aria-busy')!=='true')s.draw?.();for(const s of states.values()){s.refreshControls?.();if(s.body.getAttribute('aria-busy')==='true')continue;if(s.redraw)s.redraw();else if(s.draw)s.draw();}activate();});
  document.addEventListener('discovery:lobby-tier-changed',()=>{tierGeneration++;requests.clear();for(const s of championStates)if(s.body.isConnected)void s.load(true);for(const s of states.values())s.tierDirty=true;const key=shell.dataset.view?.replace(/^stats-/, '');const active=states.get(key);if(active?.load)void active.load(true);});
  for(const [alias,target]of [['/stats/talents','/stats/loadouts'],['/stats/egpm','/stats/ecpm'],['/stats/metrics','/stats/performance'],['/stats/activity/clean','/stats/activity'],['/stats/regions','/stats/activity#regions'],['/stats/platforms','/stats/activity#platforms']])window.DiscoveryApp.registerRoute(alias,()=>window.DiscoveryApp.navigate(target));

})();
