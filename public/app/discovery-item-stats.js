(() => {
  "use strict";
  // The rail uses the shared Items navigation glyph.
  void fetch("/drafts/discovery-credit-icon.svg?v=2", { signal: AbortSignal.timeout(5000) })
    .then(response => { if (!response.ok) throw new Error("Credit icon unavailable"); return response.text(); })
    .then(source => {
      const icon = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
      if (icon.localName !== "svg" || icon.querySelector("parsererror")) return;
      icon.classList.add("lucide");
      const target = document.querySelector('.rail-button[data-items-trigger] > svg');
      target?.replaceWith(document.importNode(icon, true));
    }).catch(() => {});

  // Reuse lib/api-client.ts item contracts, including zero-based levels and
  // ranked-only detail. The dashboard reference controls remain the owner.
  window.createDiscoveryItemStats = function ({ itemGroups, itemsPage, itemDetailContent, getItems, getLevel, openItem }) {
    const A = window.DiscoveryApp;
    const text=(key,fallback,values)=>A.message(key,values,fallback);
    const attribute=(element,name,value)=>value?.discoveryMessage?window.DiscoveryLocale.bind(element,value.key,value.fallback,name,value.values,true):element.setAttribute(name,value);
    const roles = ["Frontline", "Damage", "Flank", "Support"];
    const cache = new Map();
    let color = () => "";
    const colorsReady = import("/drafts/discovery-stat-quality.js?v=5f308f541b9e").then(module => { color = module.getPercentageColor; }).catch(() => {});
    let itemMode = "ranked", itemRows = null, itemState = "idle", itemVersion = 0, detailVersion = 0, currentItem = null, selectedRole = "";
    document.addEventListener("discovery:lobby-tier-changed",()=>{cache.clear();itemRows=null;itemState="idle";itemVersion++;detailVersion++;});
    const number = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
    const count = value => number(value) === null ? "—" : A.formatNumber(number(value));
    const percent=value=>number(value)===null?"—":{discoveryPercent:true,numeric:number(value),toString:()=>A.formatNumber(number(value),{minimumFractionDigits:2,maximumFractionDigits:2})+"%"};
    const key = value => String(value).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    function node(tag, className, text) {
      const element = document.createElement(tag);
      element.className = className;
      if(text!==undefined){A.setText(element,text);if(text?.discoveryPercent){element.dataset.percentageValue=String(text.numeric);element.dataset.percentageDirection="high-is-good";}}
      return element;
    }
    function button(text, action, active = false) {
      const element = node("button", "reference-filter" + (active ? " is-active" : ""), text);
      element.type = "button";
      element.setAttribute("aria-pressed", String(active));
      element.addEventListener("click", action);
      return element;
    }
    function message(text) { return node("p", "reference-stat-message", text); }
    function status(parent, copy, retry) {
      const box = node("div", "reference-stat-status");
      box.setAttribute("role", "status");
      box.append(message(copy));
      if (retry) box.append(button(text("async.tryAgain", "Try again"), retry));
      parent.replaceChildren(box);
    }
    function metric(label, value, rate = false) {
      const pair = node("div", "reference-stat");
      const output = node("dd", "", value);
      if(rate&&value?.discoveryPercent)output.style.color=color(value.numeric);
      pair.append(node("dt", "", label), output);
      return pair;
    }
    function metrics(entries, className = "reference-stat-grid") {
      const list = node("dl", className);
      entries.forEach(entry => list.append(metric(...entry)));
      return list;
    }
    // Match app/stats/items/[itemId]/page.tsx: purchase-weighted means,
    // then relative percent differences in the exact same role population.
    function comparisonRows(raw) {
      if (!Array.isArray(raw)) throw new Error("Invalid item comparisons");
      return raw.map(row => {
        const uses = number(row?.total_uses), usage = number(row?.total_usage);
        const totalUsage = uses || usage || 0, winRate = number(row?.win_rate);
        if (!Number.isSafeInteger(Number(row?.item_id)) || Number(row.item_id) <= 0 || totalUsage < 0 || winRate === null || (row.total_uses != null && uses === null) || (row.total_usage != null && usage === null)) throw new Error("Invalid item comparison counts");
        return { itemId: Number(row.item_id), itemName: String(row.item_name || ""), totalUsage, winRate };
      });
    }
    function weightedWinRate(rows) {
      const total = rows.reduce((sum, row) => sum + row.totalUsage, 0);
      return total > 0 ? rows.reduce((sum, row) => sum + row.winRate * row.totalUsage, 0) / total : null;
    }
    function relativeDifference(value, baseline) {
      return value !== null && baseline !== null && baseline > 0 ? ((value - baseline) / baseline) * 100 : null;
    }
    function itemComparisons(data, raw) {
      const rows = comparisonRows(raw), references = getItems() || [];
      const byId = new Map(references.map(item => [Number(item.fallbackId), item]));
      const byName = new Map(references.map(item => [item.name.toLowerCase(), item]));
      const categoryFor = row => (byId.get(row.itemId) || byName.get(row.itemName.toLowerCase()))?.category || "Utility";
      const category = categoryFor({ itemId: Number(data.item_id), itemName: String(data.item_name || "") });
      const value = hasUses(data) ? number(data.win_rate) : null;
      return { category, vsClass: relativeDifference(value, weightedWinRate(rows.filter(row => categoryFor(row) === category))), vsGlobal: relativeDifference(value, weightedWinRate(rows)) };
    }
    function signedPercent(value) { return value === null ? "—" : A.formatNumber(value, { signDisplay: "always", minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"; }
    function hasUses(row) { return number(row?.total_uses) > 0; }
    function rate(row, uses = row?.total_uses) { return number(uses) > 0 ? percent(row?.win_rate) : "—"; }
    async function json(path, refresh = false) {
      path = window.DiscoveryApp.scopedPath("/stats/"+path).slice(7);
      if (refresh) cache.delete(path);
      if (!cache.has(path)) {
        const request = window.DiscoveryApp.scopedFetch("/api/v1/stats/" + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) })
          .then(async response => { if (!response.ok) throw new Error("Statistics unavailable"); return response.json(); })
          .catch(error => { cache.delete(path); throw error; });
        cache.set(path, { request, expires: Date.now() + 300000 });
      }
      const entry = cache.get(path);
      if (entry.expires < Date.now()) return json(path, true);
      return entry.request;
    }
    function scopeControl(parent, label, values, current, onChange) {
      const control = node("label", "reference-stat-select", label);
      const select = document.createElement("select");
      attribute(select,"aria-label",label);
      for (const [value, title] of values) { const option = node("option", "", title); option.value = value; select.append(option); }
      select.value = current;
      select.addEventListener("change", () => onChange(select.value));
      control.append(select);
      parent.append(control);
      return select;
    }
    const itemControls = node("div", "reference-stat-toolbar");
    const itemSelect = scopeControl(itemControls, text("generated.stats.itemStats","Item statistics"), [["ranked", text("stats.matchups.ranked","Ranked Siege")], ["casual", text("stats.scope.casual","Casual")]], itemMode, value => {
      itemMode = value; itemSelect.value = value; void loadItems();
    });
    const sortSelect = scopeControl(itemControls, text("discovery.items.sort","Sort items"), [["name", text("generated.stats.name","Name")], ["uses", text("discovery.items.mostPurchased","Most purchased")], ["win_rate", text("generated.stats.winRate","Win rate")]], "name", paintItemCards);
    itemsPage.querySelector(".item-level-control").before(itemControls);
    const itemStatus = node("div", "reference-stat-feedback"); itemControls.after(itemStatus);
    function itemRow(item) { return (itemRows || []).find(row => Number(row.item_id) === Number(item.fallbackId)) || (itemRows || []).find(row => key(row.item_name) === key(item.name)); }
    // Keys use the active reference ID, even when a live API record has another ID.
    function tierDescription(item, tier) {
      const reference = getItems()?.find(entry => key(entry.name) === key(item.name)) || item;
      const id = Number(reference.fallbackId), level = Number(tier.level);
      return Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(level) && level > 0
        ? text("discovery.items.tierDescriptions." + id + "." + level, tier.description)
        : tier.description;
    }
    function bindCardDescription(card, level) {
      const item = getItems()?.find(entry => key(entry.name) === key(card.dataset.itemName || ""));
      const tier = item?.tiers?.find(entry => Number(entry.level) === Number(level));
      const description = card.querySelector(".item-reference-description");
      if (description && tier) A.setText(description, tierDescription(item, tier));
    }
    // Keep catalogue and champion-specific level metrics in the same layout.
    function paintCardMetrics(card, row, levelNumber, state = "ready") {
      bindCardDescription(card, levelNumber);
      card.querySelector(".reference-card-stats")?.remove();
      const stats = node("div", "reference-card-stats");
      if (state === "loading") stats.append(message(text("async.loading","Loading statistics…")));
      else if (state === "error") stats.append(message(text("async.couldNotLoad","Statistics unavailable")));
      else if (!row) stats.append(message(text("generated.players.noData","No data")));
      else {
        const level = (row.levels || []).find(entry => Number(entry.item_level) === levelNumber - 1);
        stats.append(node("span", "reference-stat-variant", text("generated.stats.levelValue1","Level {value1}",{value1:count(levelNumber)})), metrics([[text("generated.stats.winRate","Win rate"), rate(level), true], [text("generated.stats.purchases","Purchases"), level ? count(level.total_uses) : "—"]]), metrics([[text("generated.stats.pickRate","Overall pick rate"),percent(row.pick_rate),true]], "reference-stat-grid reference-stat-overall"));
        card.dataset.itemId = row.item_id;
      }
      card.append(stats);
    }
    function paintItemCards() {
      itemGroups.querySelectorAll(".item-reference-card").forEach(card => {
        const item = getItems()?.find(entry => entry.name === card.dataset.itemName);
        if (!item) return;
        const row = itemRow(item);
        if (!card.querySelector("button.item-reference-heading")) {
          const oldHeading = card.querySelector(".item-reference-heading");
          const heading = node("button", "item-reference-heading item-reference-open");
          heading.type = "button";
          attribute(heading,"aria-label",text("discovery.stats.view","View {name} statistics",{name:item.name}));
          heading.append(...oldHeading.childNodes);
          heading.addEventListener("click", () => openItem(item, card));
          oldHeading.replaceWith(heading);
        }
        paintCardMetrics(card, row, getLevel(), itemState);
      });
      itemGroups.querySelectorAll(".item-reference-grid").forEach(grid => {
        const value = card => { const item = getItems().find(entry => entry.name === card.dataset.itemName); const row = itemRow(item); const level = row?.levels?.find(entry => Number(entry.item_level) === getLevel() - 1); return number(sortSelect.value === "uses" ? level?.total_uses : level?.win_rate) ?? -1; };
        [...grid.children].sort((a, b) => (sortSelect.value === "name" ? 0 : value(b) - value(a)) || a.dataset.itemName.localeCompare(b.dataset.itemName)).forEach(card => grid.append(card));
      });
    }
    async function loadItems(refresh = false) {
      const version = ++itemVersion;
      const mode = itemMode;
      itemState = "loading"; itemRows = null; itemStatus.replaceChildren(); paintItemCards();
      try {
        const rows = await json("items?mode=" + mode + (mode === "casual" ? "&scope=casual" : "") + "&limit=200", refresh);
        if (!Array.isArray(rows) || rows.some(row => !Number.isInteger(Number(row.item_id)))) throw new Error("Invalid items");
        await colorsReady;
        if (version !== itemVersion) return;
        itemRows = rows; itemState = "ready";
      } catch {
        if (version !== itemVersion) return;
        itemState = "error"; status(itemStatus, text("generated.stats.itemStatsUnavailable","Item statistics could not be loaded."), () => void loadItems(true));
      }
      paintItemCards();
    }
    function panel(title) { const section = node("section", "reference-stat-panel"); section.append(node("h2", "", title)); return section; }
    function table(headers, rows) {
      const wrap = node("div", "reference-stat-table-wrap");
      const grid = node("table", "reference-stat-table");
      const head = document.createElement("thead"), row = document.createElement("tr");
      headers.forEach(header => { const cell = node("th", "", header); cell.scope = "col"; row.append(cell); }); head.append(row);
      const body = document.createElement("tbody");
      rows.forEach(values => { const row = document.createElement("tr"); values.forEach((value, index) => { const cell = node(index === 0 ? "th" : "td", ""); if (index === 0) cell.scope = "row"; if (value instanceof Node) cell.append(value); else {A.setText(cell,value);if(value?.discoveryPercent){cell.dataset.percentageValue=String(value.numeric);cell.dataset.percentageDirection="high-is-good";}} row.append(cell); }); body.append(row); });
      grid.append(head, body); wrap.append(grid); return wrap;
    }
    function colored(value, uses) { const output = node("span", "", uses !== undefined && !(number(uses) > 0) ? "—" : percent(value)); if (output.textContent !== "—") output.style.color = color(number(value)); return output; }
    function itemTiers(item) {
      const section = panel(text("discovery.items.levels", "Item levels"));
      const tiers = node("div", "reference-stat-tiers");
      item.tiers.forEach(tier => { const entry = node("article", "reference-tier"); entry.append(node("h3", "", text("generated.stats.levelValue1","Level {value1}",{value1:count(tier.level)})), message(tierDescription(item, tier)), metrics([[text(tier.level===1?"discovery.items.purchaseCost":"discovery.items.upgradeCost",tier.level===1?"Purchase cost":"Upgrade cost"), text("discovery.items.credits","{cost} credits",{cost:count(tier.cost)})]])); tiers.append(entry); });
      section.append(tiers); return section;
    }
    async function showItem(item, refresh = false) {
      currentItem = item;
      const version = ++detailVersion;
      const mode = itemMode, role = selectedRole;
      const heading = node("header", "reference-page-header");
      const identity = node("div", "reference-detail-identity");
      const image = document.createElement("img"); image.src = "/images/items/" + item.name.replace(/\s+/g, "_") + "_Icon.avif"; image.alt = ""; image.width = 64; image.height = 64;
      const copy = node("div", ""); const title = node("h1", "", item.name); title.id = "item-detail-title"; title.tabIndex = -1;
      copy.append(node("p", "reference-stat-eyebrow", (item.category?String(text("maps.itemClass."+item.category.toLowerCase(),item.category))+" · ":"")+String(text(mode==="ranked"?"stats.matchups.ranked":"stats.scope.casual",mode==="ranked"?"Ranked Siege":"Casual"))), title); identity.append(image, copy); heading.append(identity);
      const summary = node("div", "reference-detail-summary");
      itemDetailContent.replaceChildren(heading, summary, itemTiers(item));
      if (mode === "casual") {
        if (itemState === "idle" || itemState === "loading") await loadItems();
        if (version !== detailVersion) return;
        const row = itemRow(item);
        if (row) summary.append(metrics([[text("generated.stats.winRate","Win rate"), rate(row), true], [text("generated.stats.purchases","Purchases"), count(row.total_uses)], [text("generated.stats.pickRate","Pick rate"), percent(row.pick_rate), true]]));
        const unavailable = panel(text("generated.stats.slotLevel","Purchase slot × level"));
        unavailable.append(message(text("discovery.items.rankedOnly","Detailed item statistics are available for Ranked Siege.")), button(text("discovery.items.viewRanked","View Ranked statistics"), () => { itemMode = "ranked"; itemSelect.value = "ranked"; selectedRole = ""; void loadItems(); void showItem(item); }));
        itemDetailContent.append(unavailable); return;
      }
      const controls = node("div", "reference-stat-toolbar");
      scopeControl(controls, text("generated.stats.role", "Role"), [["", text("generated.champions.all", "All")], ...roles.map(role => [role, text("common.roles." + role.toLowerCase(), role)])], role, value => { selectedRole = value; void showItem(item); });
      const body = node("div", "reference-item-breakdown"); body.setAttribute("aria-busy", "true");
      itemDetailContent.append(controls, body); status(summary, text("async.loading","Loading item statistics…"));
      try {
        const row = itemRow(item);
        const id = Number(item.recordId ?? row?.item_id ?? item.fallbackId);
        const results = await Promise.allSettled([
          json("items/" + id + "?mode=ranked" + (role ? "&role=" + role : ""), refresh),
          json("items?mode=ranked&limit=200" + (role ? "&role=" + role + "&summary=true" : ""), refresh),
        ]);
        if (version !== detailVersion || currentItem !== item) return;
        if (results[0].status !== "fulfilled") throw results[0].reason;
        const data = results[0].value;
        if (Number(data.item_id) !== id || data.mode !== "ranked" || !Array.isArray(data.breakdown) || !Array.isArray(data.slots) || !Array.isArray(data.levels)) throw new Error("Invalid item detail");
        await colorsReady;
        if (version !== detailVersion || currentItem !== item) return;
        summary.replaceChildren(metrics([[text("generated.stats.winRate","Win rate"), rate(data), true], [text("generated.stats.purchases","Purchases"), count(data.total_uses)], [text("generated.stats.record","Record"), text("common.format.winLossCompact","{wins} W / {losses} L",{wins:count(data.wins),losses:count(data.losses)})]]));
        const comparisons = node("div", "reference-detail-comparisons"); summary.append(comparisons);
        try {
          if (results[1].status !== "fulfilled") throw results[1].reason;
          const values = itemComparisons(data, results[1].value);
          const category = text("maps.itemClass." + values.category.toLowerCase(), values.category);
          comparisons.append(metrics([[text("generated.stats.vsClass", "vs Class") + " (" + category + ")", signedPercent(values.vsClass)], [text("generated.stats.vsGlobal", "vs Global"), signedPercent(values.vsGlobal)]]));
        } catch {
          comparisons.append(metrics([[text("generated.stats.vsClass", "vs Class"), "—"], [text("generated.stats.vsGlobal", "vs Global"), "—"]]));
          const unavailable = node("div"); status(unavailable, text("async.couldNotLoad", "Could not load this data"), () => void showItem(item, true)); comparisons.append(unavailable);
        }
        const section = panel(text("generated.stats.slotLevel","Purchase slot × level"));
        const slots = [...data.slots].sort((a, b) => Number(a.slot) - Number(b.slot));
        const levels = [...data.levels].sort((a, b) => Number(b.item_level) - Number(a.item_level));
        if (!hasUses(data) || !slots.length || !levels.length) section.append(message(text("discovery.items.noPurchases","No purchases recorded for this role.")));
        else {
          const rows = levels.map(level => [text("generated.stats.levelValue1","Level {value1}",{value1:count(Number(level.item_level)+1)}), ...slots.map(slot => {
            const cell = data.breakdown.find(entry => Number(entry.slot) === Number(slot.slot) && Number(entry.item_level) === Number(level.item_level));
            if (!cell) return "—";
            const content = node("div", "reference-matrix-cell"); content.dataset.slot = slot.slot; content.dataset.level = Number(level.item_level) + 1;
            content.append(colored(cell.win_rate, cell.total_uses), node("span", "", text("generated.stats.value1Purchases","{value1} purchases",{value1:count(cell.total_uses)}))); return content;
          }), colored(level.win_rate, level.total_uses), count(level.total_uses)]);
          section.append(table([text("generated.stats.upgradeLevel","Item level"), ...slots.map(slot => text("generated.stats.slotValue1","Slot {value1}",{value1:count(slot.slot)})), text("generated.stats.winRate","Win rate"), text("generated.stats.purchases","Purchases")], rows));
          section.append(message(text("discovery.items.breakdownNote","Win rate and purchases by item level and purchase slot.")));
          const totals = panel(text("discovery.items.purchaseSlots","Purchase slots"));
          totals.append(table([text("generated.stats.slot","Slot"), text("generated.stats.winRate","Win rate"), text("generated.stats.purchases","Purchases")], slots.map(slot => [text("generated.stats.slotValue1", "Slot {value1}", {value1:count(slot.slot)}), colored(slot.win_rate, slot.total_uses), count(slot.total_uses)])));
          body.append(totals);
        }
        body.prepend(section);
      } catch {
        if (version !== detailVersion) return;
        summary.replaceChildren(); status(body, text("generated.stats.itemStatsUnavailable","Item statistics could not be loaded."), () => void showItem(item, true));
      } finally { if (version === detailVersion) body.setAttribute("aria-busy", "false"); }
    }
    return { paintCardMetrics, bindCardDescription, popularRows() { return json("items?mode=ranked&limit=200"); }, load() { if (itemState === "idle") void loadItems(); }, lookup:id=>A.request(A.scopedPath("/stats/items/"+id+"?mode=ranked")), prepareRecord(){itemMode="ranked";itemSelect.value="ranked";selectedRole="";}, paint: paintItemCards, show: showItem, leave() { detailVersion++; currentItem = null; } };
  };

  // Observe the existing catalogue renderer rather than patching its private
  // navigation or the concurrently edited champion/map implementation.
  const shell = document.querySelector(".dashboard-shell");
  const itemsPage = document.querySelector("#items-page");
  const itemGroups = document.querySelector("[data-item-groups]");
  if (!shell || !itemsPage || !itemGroups) return;
  let detailPage = document.querySelector("#item-detail-page");
  if (!detailPage) {
    detailPage = document.createElement("main"); detailPage.id = "item-detail-page"; detailPage.className = "reference-page";
    detailPage.setAttribute("aria-labelledby", "item-detail-title"); detailPage.setAttribute("aria-hidden", "true"); detailPage.inert = true;
    itemsPage.after(detailPage);
  }
  let detailContent = detailPage.querySelector("[data-item-detail-content]");
  if (!detailContent) { detailContent = document.createElement("div"); detailContent.dataset.itemDetailContent = ""; detailPage.append(detailContent); }
  let references = null, referenceRequest = null, lastItem = null, returnCard = null, detailShown = false, unavailableId = null;
  const controller = window.createDiscoveryItemStats({ itemsPage, itemGroups, itemDetailContent: detailContent,
    getItems: () => references, getLevel: () => Number(document.querySelector('[data-item-level][aria-pressed="true"]')?.dataset.itemLevel || 1),
    openItem,
  });
  function openItem(item, card, navigation = {}) {
    lastItem = item; unavailableId=null;returnCard = card; detailShown = true;
    document.dispatchEvent(new CustomEvent("discovery:item-detail-open", {detail:{id:Number(item.fallbackId),navigation}}));
    shell.dataset.view = "item-detail"; applyView("item-detail"); void controller.show(item);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => { if (shell.dataset.view === "item-detail" && lastItem === item) document.querySelector("#item-detail-title")?.focus({ preventScroll: true }); });
  }
  function applyView(view) {
    for (const page of document.querySelectorAll("main, .dashboard-grid")) {
      const active = page === (view === "item-detail" ? detailPage : itemsPage);
      page.inert = !active; page.setAttribute("aria-hidden", String(!active));
    }
    for (const rail of document.querySelectorAll(".rail-button")) {
      const active = rail.hasAttribute("data-items-trigger"); rail.classList.toggle("active", active);
      if (active) rail.setAttribute("aria-current", "page"); else rail.removeAttribute("aria-current");
    }
    document.title=view==="item-detail"?(lastItem?lastItem.name:unavailableId?String(window.DiscoveryApp.message("generated.builds.itemValue1",{value1:window.DiscoveryApp.formatNumber(unavailableId)},"Item {value1}")):String(window.DiscoveryApp.message("menu.items",{},"Items")))+" · PaladinsCat":String(window.DiscoveryApp.message("menu.items",{},"Items"))+" · PaladinsCat";
  }
  function loadReferences() {
    if (referenceRequest) return referenceRequest;
    referenceRequest = fetch("/data/paladins-active-items.json", { signal: AbortSignal.timeout(10000) }).then(async response => {
      if (!response.ok) throw new Error("Item reference unavailable"); const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error("Invalid item reference"); references = data.items; controller.paint();
    }).catch(() => { referenceRequest = null; });
    return referenceRequest;
  }
  // Home art uses the same ranked item feed and catalogue as the Items page.
  let homeArtVersion = 0;
  async function updateHomeItemArt() {
    const host = document.querySelector("[data-home-item-art]");
    if (!host) return;
    const version = ++homeArtVersion;
    try {
      const [, rows] = await Promise.all([loadReferences(), controller.popularRows()]);
      if (version !== homeArtVersion || !Array.isArray(references) || !Array.isArray(rows)) return;
      const byId = new Map(references.map(item => [Number(item.fallbackId), item]));
      const leaders = new Map();
      for (const row of rows) {
        const item = byId.get(Number(row.item_id));
        const count = Number(row.total_uses);
        if (!item || !Number.isFinite(count) || count <= 0) continue;
        const prior = leaders.get(item.category);
        if (!prior || count > prior.count) leaders.set(item.category, { item, count });
      }
      const categories = ["Offense", "Defense", "Healing", "Utility"];
      if (categories.some(category => !leaders.has(category))) return;
      const icons = categories.map(category => {
        const item = leaders.get(category).item;
        const image = document.createElement("img");
        image.className = "home-item-art-icon";
        image.src = "/images/items/" + item.name.replace(/\s+/g, "_") + "_Icon.avif";
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        return image;
      });
      host.replaceChildren(...icons);
    } catch { /* Keep neutral placeholders when metrics are unavailable. */ }
  }
  void updateHomeItemArt();
  document.addEventListener("discovery:lobby-tier-changed", () => void updateHomeItemArt());
  document.addEventListener("discovery:open-view", event => { if (event.detail?.view === "dashboard") void updateHomeItemArt(); });

  // Route links can target an item hidden by catalogue filters, including before
  // the independently loaded catalogue reference has painted its buttons.
  function unavailableRecord(id,error,navigation={}) {
    const A=window.DiscoveryApp, path=navigation.path || '/game/items/'+id;
    lastItem=null;unavailableId=id;returnCard=null;detailShown=true;controller.leave();
    document.dispatchEvent(new CustomEvent('discovery:item-detail-open',{detail:{id,navigation}}));
    shell.dataset.view='item-detail';applyView('item-detail');
    const heading=document.createElement('h1');heading.id='item-detail-title';heading.tabIndex=-1;
    A.setText(heading,A.message('generated.builds.itemValue1',{value1:A.formatNumber(id)},'Item {value1}'));
    const message=document.createElement('p');message.className='reference-stat-message';
    A.setText(message,A.message(error?.status===404?'discovery.items.recordUnavailable':'async.couldNotLoad',{},error?.status===404?'Item record unavailable':'Could not load this data'));
    const retry=document.createElement('button');retry.className='reference-filter';retry.type='button';A.setText(retry,A.message('async.tryAgain',{},'Try again'));
    const current=()=>shell.dataset.view==='item-detail' && A.currentPath()===path;
    retry.addEventListener('click',()=>{if(current())void window.DiscoveryItemPages.openById(id,current,{restore:true,path});});
    detailContent.replaceChildren(heading,message,retry);document.title=heading.textContent+' · PaladinsCat';
  }
  window.DiscoveryItemPages={paintCardMetrics:(card,row,level)=>{controller.paintCardMetrics(card,row,level);if(!references)void loadReferences().then(()=>{if(card.isConnected)controller.bindCardDescription(card,level);});},async openById(value,isCurrent=()=>true,navigation={}){const id=Number(value);if(!Number.isSafeInteger(id)||id<=0||!isCurrent())return false;await loadReferences();if(!isCurrent())return false;let item=references?.find(entry=>Number(entry.fallbackId)===id);if(!item){try{const data=await controller.lookup(id);if(!isCurrent())return false;if(Number(data.item_id)!==id||typeof data.item_name!=="string"||!data.item_name.trim())throw Error("Invalid item identity");const reference=references?.find(entry=>entry.name.toLowerCase()===data.item_name.toLowerCase());item={...(reference||{}),fallbackId:id,recordId:id,name:data.item_name,category:reference?.category||(typeof data.category==="string"?data.category:""),tiers:reference?.tiers||[]};controller.prepareRecord();}catch(error){if(!isCurrent())return false;unavailableRecord(id,error,navigation);return true;}}const card=[...itemGroups.querySelectorAll("[data-item-name]")].find(entry=>entry.dataset.itemName===item.name)||null;openItem(item,card,navigation);return true;}};
  new MutationObserver(() => { controller.paint(); }).observe(itemGroups, { childList: true });
  new MutationObserver(() => {
    if(shell.dataset.view==="item-detail"&&(lastItem||unavailableId)){
      applyView("item-detail");
      if(!detailShown&&lastItem){detailShown=true;void controller.show(lastItem);}
    } else {
      detailPage.inert = true; detailPage.setAttribute("aria-hidden", "true");
      detailShown = false; controller.leave();
      if (shell.dataset.view === "items") { void loadReferences(); controller.load(); controller.paint(); }
    }
  }).observe(shell, { attributes: true, attributeFilter: ["data-view"] });
  document.querySelector("[data-view-back]").addEventListener("click", event => {
    if (shell.dataset.view !== "item-detail") return;
    if (window.DiscoveryApp) {
      const target = returnCard?.querySelector("button");
      requestAnimationFrame(() => Promise.allSettled(itemsPage.getAnimations().map(animation => animation.finished)).then(() => { if (shell.dataset.view === "items" && target?.isConnected) target.focus(); }));
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation(); detailShown = false; controller.leave();
    shell.dataset.view = "items"; applyView("items");
    const target = returnCard?.querySelector("button");
    requestAnimationFrame(() => Promise.allSettled(itemsPage.getAnimations().map(animation => animation.finished)).then(() => { if (shell.dataset.view === "items" && target?.isConnected) target.focus(); }));
  }, { capture: true });
  if (shell.dataset.view === "items") { void loadReferences(); controller.load(); }
})();
