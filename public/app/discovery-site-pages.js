(() => {
  const M = (key, values, fallback) => window.DiscoveryLocale.message(key, values, fallback);
  const siteAttribute = (element, name, value) => value?.discoveryMessage ? window.DiscoveryLocale.bind(element, value.key, value.fallback, name, value.values, true) : element.setAttribute(name, value);
  "use strict";
  const shell = document.querySelector(".dashboard-shell");
  const stack = document.querySelector(".page-view-stack");
  if (!shell || !stack) return;
  const names = { "site-settings": "Settings", "site-community": "Community", "site-community-post": "Community", "site-chat": "Community chat", "site-blog": "Blog", "site-blog-post": "Blog", "site-notifications": "Notifications", "site-account": "Account" };
  const categories = [["all", "All"], ["public-release", "Public releases"], ["q-and-a", "Q & A"], ["guide", "Guides"], ["operational-report", "Operational reports"]];
  const pages = new Map(), tokens = new Map(), requests = new Map();
  let blogLoaded = false, communityLoaded = false;
  let preferences = null, selectedCategory = "all", blogPosts = [], postFilter = "", communityPosts = [], communityFilter = "";
  let settingsRequest = null;
  let settingsCleanup = [];
  function disposeSettings() { for (const close of settingsCleanup.splice(0)) close(); }
  document.addEventListener('discovery:open-view', event => { if (event.detail?.view !== 'site-settings') disposeSettings(); });
  let selectedBlogPath = null;
  function loadSettingsModel(refresh = false) {
    if (preferences && !refresh) return Promise.resolve(preferences);
    if (refresh) settingsRequest = null;
    if (!settingsRequest) settingsRequest = import("/app/discovery-settings-model.js?v=" + (refresh ? Date.now() : 1))
      .then(model => { preferences = model; applyPreferences(); return model; })
      .catch(error => { settingsRequest = null; throw error; });
    return settingsRequest;
  }
  void loadSettingsModel().catch(() => {});
  const communityButton = document.querySelector('.rail-main .rail-button[aria-label="Community"]');
  const blogButton = document.querySelector('.rail-main .rail-button[aria-label="News"], .rail-main .rail-button[aria-label="Blog"]');
  const settingsButton = document.querySelector('.rail-bottom .rail-button[aria-label="Display preferences"], .rail-bottom .rail-button[aria-label="Settings"]');
  const notificationsButton = document.querySelector('.rail-bottom .rail-button[aria-label="Notifications"]');
  const accountButton = document.querySelector('.rail-profile');
  function node(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text != null) window.DiscoveryLocale.setText(el, text); return el; }
  function button(text, action, className = "reference-filter") { const el = node("button", className, text); el.type = "button"; el.addEventListener("click", action); return el; }
  function paragraph(text) { return node("p", "site-copy", text); }
  function section(title) { const el = node("section", "site-panel"); if (title) el.append(node("h2", "", title)); return el; }
  function page(view) { if (!pages.has(view)) { const el = node("main", "site-page"); el.id = view + "-page"; el.hidden = true; el.inert = true; el.setAttribute("aria-hidden", "true"); el.setAttribute("aria-labelledby", view + "-title"); stack.append(el); pages.set(view, el); } return pages.get(view); }
  function header(view, title = names[view], description) { const el = node("header", "site-header"); const heading = node("h1", "", title); heading.id = view + "-title"; heading.tabIndex = -1; el.append(heading);  return el; }
  function state(parent, message, retry) { const el = node("div", "site-state"); el.setAttribute("role", "status"); el.append(paragraph(message)); if (retry) el.append(button(M("async.tryAgain",undefined,"Try again"), retry)); parent.replaceChildren(el); }
  function token(view) { const next = (tokens.get(view) || 0) + 1; tokens.set(view, next); return next; }
  function current(view, sequence) { return tokens.get(view) === sequence; }
  async function request(path, refresh = false) {
    const key = window.DiscoveryLocale.locale() + "|" + path;
    if (refresh) requests.delete(key);
    if (!requests.has(key)) requests.set(key, fetch(path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }).then(async response => {
      if (!response.ok) { const error = new Error("Content unavailable"); error.status = response.status; throw error; }
      const body = await response.json(); return body && typeof body === "object" && "data" in body ? body.data : body;
    }).catch(error => { requests.delete(key); throw error; }));
    return requests.get(key);
  }
  function safeUrl(value, base = "https://paladinscat.com") { try { const url = new URL(value, base); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url : null; } catch { return null; } }
  function external(text, href) { const link = node("a", "site-link", text); const url = safeUrl(href); if (url) { const internal = ["paladinscat.com", "paladinscat.com", "127.0.0.1", "localhost"].includes(url.hostname); link.href = internal ? url.pathname + url.search + url.hash : url.href; if (internal) link.addEventListener("click", event => { if (window.DiscoveryApp) { event.preventDefault(); window.DiscoveryApp.navigate(url.pathname + url.search + url.hash); } }); else { link.target = "_blank"; link.rel = "noopener noreferrer"; } } return link; }
  function formattedDate(value) { return window.DiscoveryLocale.formatDate(value); }
  function dateNode(value) { const el = node("time", "site-meta", formattedDate(value)); el.dataset.siteDate = value || ""; return el; }
  function updateDates() { document.querySelectorAll("[data-site-date]").forEach(el => { el.textContent = formattedDate(el.dataset.siteDate); }); }
  function activate(view) {
    for (const [name, el] of pages) { const active = name === view; el.hidden = !active; el.inert = !active; el.setAttribute("aria-hidden", String(!active)); }
    if (!names[view]) return;
    document.querySelectorAll("main, .dashboard-grid").forEach(el => { const active = el === page(view); el.inert = !active; el.setAttribute("aria-hidden", String(!active)); });
    const rail = view.startsWith("site-blog") ? blogButton : view.startsWith("site-community") || view === "site-chat" ? communityButton : view === "site-settings" ? settingsButton : view === "site-notifications" ? notificationsButton : accountButton;
    document.querySelectorAll(".rail-button").forEach(el => { const active = el === rail; el.classList.toggle("active", active); if (active) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
    document.title = (page(view).querySelector("h1")?.textContent || names[view]) + " · PaladinsCat";
  }
  function open(view) {
    if (!page(view).children.length) {
      const loaders = { "site-blog": loadBlog, "site-community": loadCommunity, "site-settings": renderSettings, "site-account": renderAccount, "site-chat": loadChat, "site-notifications": loadNotifications };
      if (loaders[view]) void loaders[view]();
    }
    const app = window.DiscoveryApp, path = view === "site-blog" ? "/blog" + (selectedCategory === "all" ? "" : "?category=" + encodeURIComponent(selectedCategory)) : view === "site-blog-post" ? selectedBlogPath : null;
    const previous = app?.snapshot(view), routeChange = Boolean(path && previous?.path && previous.path !== path), restore = Boolean(path && app?.isRestoring(path));
    if (shell.dataset.view !== view || routeChange) document.dispatchEvent(new CustomEvent("discovery:open-view", { detail: { view, routeChange, restore } }));
    if (path) app?.record(view, path);
    activate(view); window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => { if (shell.dataset.view === view && (!path || !app || app.currentPath() === path)) page(view).querySelector("h1")?.focus({ preventScroll: true }); });
  }
  function openBlogList() { if (window.DiscoveryApp) { window.DiscoveryApp.navigate("/blog"); return; } if (!page("site-blog").children.length) void loadBlog(); open("site-blog"); }
  function openBlogArticle(post) { if (window.DiscoveryApp) { window.DiscoveryApp.navigate(post.path); return; } void loadBlogPost(post); open("site-blog-post"); }
  new MutationObserver(() => activate(shell.dataset.view)).observe(shell, { attributes: true, attributeFilter: ["data-view"] });
  function bind(control, view, load, label) {
    if (!control) return;
    if (label) { siteAttribute(control, "aria-label", label); const text = control.querySelector(".rail-label"); if (text) window.DiscoveryLocale.setText(text, label); }
    if (view === "site-notifications") { control.setAttribute("aria-haspopup", "dialog"); control.setAttribute("aria-expanded", "false"); control.setAttribute("aria-controls", "dashboard-notifications-popover"); control.addEventListener("click", () => window.DiscoveryNotifications?.toggle()); return; }
    control.setAttribute("aria-controls", view + "-page");
    control.addEventListener("click", () => { if (view === "site-blog") { openBlogList(); return; } if (window.DiscoveryApp && view === "site-settings") { window.DiscoveryApp.navigate("/settings"); return; } if (!page(view).children.length) void load(); open(view); });
  }
  bind(communityButton, "site-community", loadCommunity);
  bind(blogButton, "site-blog", loadBlog, M("generated.blog.title", undefined, "Blog"));
  bind(settingsButton, "site-settings", renderSettings, M("generated.players.settings", undefined, "Settings"));
  bind(notificationsButton, "site-notifications", loadNotifications);
  // The profile trigger is owned by discovery-profile.js and follows the confirmed session.

  function applyPreferences() {
    if (!preferences) return;
    document.body.dataset.siteWallpaper = String(preferences.getWallpaperEnabled());
    document.documentElement.classList.toggle("site-lite-mode", preferences.getLiteMode());
    updateDates();
  }
  async function renderSettings(refresh = false) {
    const L = window.DiscoveryLocale;
    const englishLabels = {"generated.players.settings":"Settings","menu.appearance":"Appearance","menu.mapWallpaper":"Wallpaper","menu.liteMode":"Lite mode","nav.language":"Language","generated.account.lobbyTier":"Lobby tier","generated.wallpaper.saveSettingError":"Failed to save wallpaper setting","generated.account.timeZone":"Time Zone","generated.common.account":"Account","generated.common.accountSettings":"Account settings"};
    const t = (key, fallback) => M(key, undefined, englishLabels[key] ?? fallback);
    const view = "site-settings", host = page(view), sequence = token(view);
    disposeSettings();
    let alive = true;
    settingsCleanup.push(() => { alive = false; });
    host.replaceChildren(header(view, t("generated.players.settings", "Settings")));
    const body = node("div", "site-settings-body"); host.append(body); state(body, M("async.loading",undefined,"Loading settings…"));
    try {
      await loadSettingsModel(refresh); if (!alive || !current(view, sequence)) return;
      const appearance = section(t("menu.appearance", "Appearance"));
      function toggle(title, description, checked, change) {
        const label = node("label", "site-setting-row"); const text = node("span", ""); text.append(node("strong", "", title), paragraph(description));
        const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked; input.setAttribute("role", "switch"); siteAttribute(input, "aria-label", title);
        input.addEventListener("change", () => { change(input.checked); applyPreferences(); wallpaperSwitch.checked = preferences.getWallpaperEnabled(); L.setText(status, M("discovery.settings.saved", undefined, "Settings saved on this device.")); });
        label.append(text, input); appearance.append(label); return input;
      }
      const wallpaperSwitch = toggle(t("menu.mapWallpaper", "Wallpaper"), M("discovery.settings.wallpaperDescription", undefined, "Show the game artwork behind the dashboard."), preferences.getWallpaperEnabled(), value => preferences.setWallpaperEnabled(value));
      const liteSwitch = toggle(t("menu.liteMode", "Lite mode"), M("discovery.settings.liteDescription", undefined, "Reduce motion and turn off the wallpaper."), preferences.getLiteMode(), value => { preferences.setLiteMode(value); preferences.setWallpaperEnabled(!value); });
      const syncSwitches = () => { wallpaperSwitch.checked = preferences.getWallpaperEnabled(); liteSwitch.checked = preferences.getLiteMode(); };
      window.addEventListener('paladinscat:wallpaper-change', syncSwitches); window.addEventListener('paladinscat:lite-mode-change', syncSwitches); window.addEventListener('storage', syncSwitches);
      settingsCleanup.push(() => { window.removeEventListener('paladinscat:wallpaper-change', syncSwitches); window.removeEventListener('paladinscat:lite-mode-change', syncSwitches); window.removeEventListener('storage', syncSwitches); });
      const language = node("label", "site-field", t("nav.language", "Language")), languages = node("select", "");
      siteAttribute(languages, "aria-label", t("nav.language", "Language"));
      for (const [code, name] of L.supported) { const option = node("option", "", name); option.value = code; languages.append(option); }
      languages.value = L.locale(); languages.addEventListener("change", () => { void L.setLocale(languages.value); });
      language.append(languages); appearance.append(language);
      const tiers = window.DiscoveryLobbyTier, tierField = node('label','site-field',t('generated.account.lobbyTier','Lobby tier')), tierSelect = node('select','');
      siteAttribute(tierSelect, 'aria-label', t('generated.account.lobbyTier','Lobby tier'));
      for (const entry of tiers.LOBBY_TIER_OPTIONS) { const option = node('option','',M(entry.labelKey)); option.value = entry.value; tierSelect.append(option); }
      tierSelect.value = tiers.getStoredLobbyTierFilter();
      tierSelect.addEventListener('change',() => { try { window.DiscoveryApp.setLobbyTier(tierSelect.value); } catch { L.setText(status, t('discovery.settings.saveError','This browser could not save the setting.')); } });
      tierField.append(tierSelect); appearance.append(tierField);
      const time = section(t("generated.account.timeZone", "Date and time")); const label = node("label", "site-field", t("generated.account.ianaTimeZone", "IANA time zone")); const select = document.createElement("select"); siteAttribute(select, "aria-label", t("generated.account.ianaTimeZone", "IANA time zone"));
      preferences.getSupportedTimeZones().forEach(zone => { const option = node("option", "", zone.replaceAll("_", " ")); option.value = zone; select.append(option); });
      let preferred; try { preferred = preferences.getPreferredTimeZone(); } catch { preferred = Intl.DateTimeFormat().resolvedOptions().timeZone; }
      if (![...select.options].some(option => option.value === preferred)) { const option = node("option", "", preferred); option.value = preferred; select.append(option); } select.value = preferred;
      const offsetLabel = node('label', 'site-field', t('generated.account.fixedUtcOffset', 'Fixed UTC offset')), offset = node('select', '');
      siteAttribute(offset, 'aria-label', t('generated.account.fixedUtcOffset', 'Fixed UTC offset'));
      const iana = node('option', '', t('generated.account.useIanaTimeZone', 'Use IANA time zone')); iana.value = ''; offset.append(iana);
      for (const entry of preferences.getFixedUtcOffsetOptions()) { const option = node('option', '', entry.label); option.value = entry.value; offset.append(option); }
      offset.value = preferences.fixedUtcOffsetFromTimeZone(preferred); select.disabled = offset.value !== '';
      offset.addEventListener('change', () => { select.disabled = offset.value !== ''; });
      select.addEventListener('change', () => { offset.value = ''; select.disabled = false; });
      const saveZone = button(t('generated.account.saveTimeZone', 'Save time zone'), async () => {
        const value = offset.value !== '' ? preferences.fixedUtcOffsetToTimeZone(Number(offset.value)) : select.value;
        if (!preferences.isValidTimeZone(value)) { L.setText(status, M('generated.account.selectATimeZone', undefined, 'Select a time zone.')); return; }
        saveZone.disabled = true;
        try {
          const response = await window.DiscoveryApp.getUser(true);
          const session = response?.user ?? response?.data?.user ?? response?.data ?? response;
          if (session && Number(session.id ?? session.user_id) > 0) await window.DiscoveryApp.request('/auth/profile', { method:'PUT', body:{ time_zone:value } });
          preferences.savePreferredTimeZone(value); window.dispatchEvent(new Event('paladinscat:time-zone-change')); updateDates();
          L.setText(status, M('discovery.settings.timeZoneSaved', undefined, 'Time zone saved.'));
        } catch { L.setText(status, M('discovery.settings.timeZoneSaveFailed', undefined, 'Could not save the time zone.')); }
        finally { saveZone.disabled = false; }
      });
      label.append(select); offsetLabel.append(offset); time.append(label, offsetLabel, saveZone, paragraph(M("discovery.settings.timeZoneNote",undefined,"Dates in Community and Notifications use your selected time zone.")));
      const status = node("p", "site-meta"); status.setAttribute("role", "status");
      const wallpaper = node('div', 'site-settings-wallpaper'), account = node('div', 'site-settings-account');
      body.replaceChildren(appearance, wallpaper, time, account, status);
      const owner = window.DiscoveryCommunity;
      let accountRevision = 0;
      const syncAccount = async () => {
        const revision = ++accountRevision;
        account.replaceChildren();
        try {
          const response = await window.DiscoveryApp.getUser(true);
          const user = response?.user ?? response?.data?.user ?? response?.data ?? response;
          if (!alive || !current(view, sequence) || revision !== accountRevision || !user || !(Number(user.id ?? user.user_id) > 0)) return;
          const accountState = { body: account, current: () => alive && current(view, sequence) && revision === accountRevision, visible: () => alive && current(view, sequence) && revision === accountRevision && shell.dataset.view === view, onDispose: close => { if (alive) settingsCleanup.push(close); else close(); } };
          if (owner?.renderAccount) await owner.renderAccount(accountState);
        } catch { if (alive && current(view, sequence) && revision === accountRevision) state(account, M('async.couldNotLoad', undefined, 'Account settings could not be loaded.'), syncAccount); }
      };
      document.addEventListener('discovery:session-changed', syncAccount);
      settingsCleanup.push(() => { accountRevision++; document.removeEventListener('discovery:session-changed', syncAccount); });
      void syncAccount();
      if (owner?.accountWallpapers) {
        const wallpaperState = { current: () => alive && current(view, sequence), visible: () => alive && current(view, sequence) && shell.dataset.view === view, onDispose: close => { if (alive) settingsCleanup.push(close); else close(); } };
        try { await owner.accountWallpapers(wallpaper, wallpaperState); }
        catch { if (wallpaperState.current()) state(wallpaper, M('async.couldNotLoad', undefined, 'Wallpaper settings could not be loaded.'), () => void renderSettings(true)); }
      } else state(wallpaper, M('async.couldNotLoad', undefined, 'Wallpaper settings could not be loaded.'), () => void renderSettings(true));
    } catch { if (alive && current(view, sequence)) state(body, M("async.couldNotLoad",undefined,"Settings could not be loaded."), () => void renderSettings(true)); }
  }
  function renderAccount() {
    const view = "site-account", host = page(view); host.replaceChildren(header(view));
    const content = section("Your PaladinsCat account"); content.append(paragraph("Sign in to manage your profile and linked Paladins account."), external("Open account", "https://paladinscat.com/account")); host.append(content);
  }
  function filterBar(label, value, change) { const wrap = node("label", "site-field site-search", label); const input = document.createElement("input"); input.type = "search"; input.value = value; siteAttribute(input, "aria-label", label); siteAttribute(input, "placeholder", label); input.addEventListener("input", () => change(input.value)); wrap.append(input); return wrap; }
  function blogIndex(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const articles = [...document.querySelectorAll("article")].map(article => {
      const link = article.closest("a"), href = safeUrl(link?.getAttribute("href"));
      const title = article.querySelector("h2")?.textContent?.trim();
      if (!title || !href || !href.pathname.startsWith("/blog/")) return null;
      const metadata = [...(article.firstElementChild?.querySelectorAll("span") || [])].map(el => el.textContent.trim());
      return { title, path: href.pathname, excerpt: article.querySelector("p")?.textContent?.trim() || "", author: metadata[0] || "", date: metadata[1] || "" };
    }).filter(Boolean);
    const blogTitle = document.querySelector("h1")?.textContent?.trim();
    if (!["Blog", window.DiscoveryLocale.t("generated.blog.title", undefined, "Blog")].includes(blogTitle)) throw new Error("Invalid blog response");
    return articles;
  }
  async function loadBlog(refresh = false, path) {
    if (path) { const requested = new URL(path,location.origin).searchParams.get("category") || "all"; selectedCategory = categories.some(([value]) => value === requested) ? requested : "all"; }
    const view = "site-blog", host = page(view), sequence = token(view), category = selectedCategory;
    blogLoaded = false; blogPosts = [];
    host.replaceChildren(header(view, M("generated.blog.title",undefined,"Blog"), "Updates, guides, and stories from PaladinsCat."));
    const filters = node("div", "reference-filters site-filters"); filters.setAttribute("role", "group"); siteAttribute(filters, "aria-label", M("discovery.blog.category", undefined, "Blog category"));
    categories.forEach(([value, name]) => { const keys = {all:"generated.stats.all","public-release":"discovery.blog.categoryPublicRelease","q-and-a":"discovery.blog.categoryQuestionAndAnswer",guide:"discovery.blog.categoryGuide","operational-report":"discovery.blog.categoryOperationalReport"}; const el = button(M(keys[value], undefined, name), () => { if (window.DiscoveryApp) window.DiscoveryApp.navigate("/blog" + (value === "all" ? "" : "?category=" + value)); else { selectedCategory = value; void loadBlog(); } }); el.setAttribute("aria-pressed", String(value === category)); el.classList.toggle("is-active", value === category); filters.append(el); });
    filters.append(button(M("invitation.retry",undefined,"Refresh"), () => void loadBlog(true)));
    host.append(filters, filterBar(M("discovery.blog.search", undefined, "Search blog"), postFilter, value => { postFilter = value; drawBlog(); }));
    const list = node("div", "site-post-list"); host.append(list); state(list, M("async.loading",undefined,"Loading blog posts…")); window.DiscoveryLoading?.show(list, "rows", "site-post-card");
    try {
      await window.DiscoveryLocale.ready;
      const payload = await request("/preview/blog" + (category === "all" ? "" : "?category=" + category), refresh);
      const posts = blogIndex(payload.html); if (!current(view, sequence)) return;
      blogPosts = posts; blogLoaded = true; drawBlog();
    } catch { if (current(view, sequence)) state(list, M("async.couldNotLoad",undefined,"Blog posts could not be loaded."), () => void loadBlog(true)); }
  }
  function drawBlog() {
    if (!blogLoaded) return;
    const list = page("site-blog").querySelector(".site-post-list"); if (!list) return;
    const matches = blogPosts.filter(post => (post.title + " " + post.excerpt).toLowerCase().includes(postFilter.trim().toLowerCase()));
    list.replaceChildren();
    if (!matches.length) { state(list, M("discovery.blog.noMatches", undefined, "No blog posts match this selection.")); return; }
    matches.forEach(post => { const card = button("", () => openBlogArticle(post), "site-post-card"); card.append(node("span", "site-meta", [post.author, post.date].filter(Boolean).join(" · ")), node("h2", "", post.title), paragraph(post.excerpt), node("span", "site-link", M("discovery.blog.readArticle", undefined, "Read article →"))); list.append(card); });
  }
  function copyBlogContent(source, destination) {
    const allowed = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "PRE", "CODE", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "STRONG", "EM", "DEL", "HR", "BR", "DETAILS", "SUMMARY", "A", "IMG", "DIV", "SPAN"]);
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { destination.append(document.createTextNode(child.textContent)); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE || !allowed.has(child.tagName)) continue;
      const el = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === "A") { const url = safeUrl(child.getAttribute("href")); if (url) {
        el.href = url.href;
        if (["paladinscat.com", "paladinscat.com", "127.0.0.1", "localhost"].includes(url.hostname)) { el.href=url.pathname+url.search+url.hash; el.addEventListener("click", event => { event.preventDefault(); if(window.DiscoveryApp) window.DiscoveryApp.navigate(url.pathname+url.search+url.hash); else if(url.pathname.startsWith("/blog/")) { void loadBlogPost({ path: url.pathname, title: child.textContent }); open("site-blog-post"); } }); }
        else { el.target = "_blank"; el.rel = "noopener noreferrer"; }
      } }
      if (child.tagName === "IMG") { const url = safeUrl(child.getAttribute("src")); if (!url || !["https:", "http:"].includes(url.protocol)) continue; el.src = url.href; el.alt = child.getAttribute("alt") || ""; el.loading = "lazy"; }
      if (["TD", "TH"].includes(child.tagName)) for (const attribute of ["colspan", "rowspan"]) { const value = Number(child.getAttribute(attribute)); if (Number.isInteger(value) && value > 0 && value <= 30) el.setAttribute(attribute, String(value)); }
      copyBlogContent(child, el); destination.append(el);
    }
  }
  async function loadBlogPost(post, refresh = false) {
    const view = "site-blog-post", host = page(view), sequence = token(view);
    const url = safeUrl(post.path), articlePath = url?.pathname || String(post.path), path = articlePath + (url?.search || "") + (url?.hash || "");
    selectedBlogPath = path;
    const visible = () => current(view, sequence) && selectedBlogPath === path && shell.dataset.view === view && (!window.DiscoveryApp || window.DiscoveryApp.currentPath() === path);
    host.replaceChildren(header(view, post.title || M("generated.blog.title", undefined, "Blog")));
    const content = node("article", "site-panel site-markdown"); host.append(content); state(content, M("async.loading",undefined,"Loading article…"));
    try {
      if (!/^\/blog\/[A-Za-z0-9%_./-]+$/.test(articlePath) || articlePath.includes("..")) throw new Error("Invalid article path");
      const payload = await request("/preview" + articlePath, refresh);
      const source = new DOMParser().parseFromString(payload.html, "text/html"), article = source.querySelector("article .blog-markdown");
      if (!article) throw new Error("Article unavailable"); if (!visible()) return;
      const title = source.querySelector("article > h1")?.textContent || post.title; window.DiscoveryLocale.setText(host.querySelector("h1"), title);
      const metadata = source.querySelector("article > h1 + div")?.textContent?.trim().replace(/\s*·\s*/g, " · ");
      content.replaceChildren(); if (metadata) content.append(node("p", "site-meta", metadata)); copyBlogContent(article, content); if (shell.dataset.view === view) activate(view);
    } catch { if (current(view, sequence) && selectedBlogPath === path) state(content, M("async.couldNotLoad",undefined,"This article could not be loaded."), () => void loadBlogPost(post, true)); }
  }
  async function loadCommunity(refresh = false) {
    const view = "site-community", host = page(view), sequence = token(view);
    communityLoaded = false; communityPosts = [];
    host.replaceChildren(header(view, M("nav.community",undefined,"Community"), "Browse posts and join the conversation."));
    const actions = node("div", "site-actions"); actions.append(button(M("invitation.retry",undefined,"Refresh"), () => void loadCommunity(true)), button("Community chat", () => { void loadChat(); open("site-chat"); }), external("Write a post", "https://paladinscat.com/community/create")); host.append(actions, filterBar("Search community", communityFilter, value => { communityFilter = value; drawCommunity(); }));
    const grid = node("div", "site-community-grid"); const posts = section(M("operations.posts",undefined,"Community posts")); posts.classList.add("site-community-posts"); grid.append(posts); host.append(grid);
    state(posts, M("async.loading",undefined,"Loading community posts…")); window.DiscoveryLoading?.show(posts, "rows", "site-community-card");
    try { const data = await request("/api/v1/community/posts?limit=50", refresh); if (!Array.isArray(data)) throw new Error("Invalid posts"); if (!current(view, sequence)) return; communityPosts = data; communityLoaded = true; drawCommunity(); }
    catch { if (current(view, sequence)) state(posts, M("async.couldNotLoad",undefined,"Community posts could not be loaded."), () => void loadCommunity(true)); }
  }
  function drawCommunity() {
    if (!communityLoaded) return;
    const list = page("site-community").querySelector(".site-community-posts"); if (!list) return;
    const rows = communityPosts.filter(post => (post.title + " " + post.content).toLowerCase().includes(communityFilter.trim().toLowerCase()));
    list.replaceChildren(node("h2", "", M("operations.posts",undefined,"Community posts")));
    if (!rows.length) { list.append(paragraph("No community posts match this selection.")); return; }
    rows.forEach(post => { const el = button("", () => { void loadCommunityPost(post.id); open("site-community-post"); }, "site-community-card");
      el.append(node("h3", "", post.title), paragraph(post.content), node("span", "site-meta", "By " + post.username + " · " + Number(post.likes || 0).toLocaleString("en-US") + " likes · " + Number(post.view_count || 0).toLocaleString("en-US") + " views"), dateNode(post.created_at)); list.append(el); });
  }
  async function loadCommunityPost(id, refresh = false) {
    const view = "site-community-post", host = page(view), sequence = token(view);
    host.replaceChildren(header(view, "Community post"));
    const post = section(), comments = section("Replies"); host.append(post, comments); state(post, M("async.loading",undefined,"Loading post…"));
    try {
      const data = await request("/api/v1/community/posts/" + Number(id), refresh); if (!data.post || !Array.isArray(data.comments)) throw new Error("Invalid post"); if (!current(view, sequence)) return;
      host.querySelector("h1").textContent = data.post.title; post.replaceChildren(node("span", "site-meta", "By " + data.post.username), dateNode(data.post.created_at), node("p", "site-post-body", data.post.content));
      if (data.post.source_url) post.append(external("Open shared content", data.post.source_url));
      data.comments.forEach(comment => { const el = node("article", "site-reply"); el.append(node("strong", "", comment.username), dateNode(comment.created_at), node("p", "site-post-body", comment.content)); comments.append(el); });
      if (!data.comments.length) comments.append(paragraph("No replies yet.")); comments.append(external("Join the discussion", "https://paladinscat.com/community/" + Number(id)));
      if (shell.dataset.view === view) activate(view);
    } catch { if (current(view, sequence)) { state(post, M("async.couldNotLoad",undefined,"This post could not be loaded."), () => void loadCommunityPost(id, true)); comments.replaceChildren(); } }
  }
  async function loadChat(refresh = false) {
    const view = "site-chat", host = page(view), sequence = token(view); host.replaceChildren(header(view), button(M("invitation.retry",undefined,"Refresh"), () => void loadChat(true)));
    const list = section(); host.append(list); state(list, M("async.loading",undefined,"Loading conversation…"));
    try { const data = await request("/api/v1/community/chat", refresh); if (!Array.isArray(data.messages)) throw new Error("Invalid chat"); if (!current(view, sequence)) return;
      list.replaceChildren(); data.messages.filter(row => !row.deleted_at).forEach(row => { const el = node("article", "site-reply"); el.append(node("strong", "", row.username), dateNode(row.created_at), node("p", "site-post-body", row.content)); list.append(el); });
      if (!list.children.length) list.append(paragraph("No messages yet.")); list.append(external("Join community chat", "https://paladinscat.com/community"));
    } catch { if (current(view, sequence)) state(list, M("async.couldNotLoad",undefined,"Community chat could not be loaded."), () => void loadChat(true)); }
  }
  async function loadNotifications(refresh = false) {
    const view = "site-notifications", host = page(view), sequence = token(view); host.replaceChildren(header(view)); const list = section("Site updates"); host.append(list); state(list, M("async.loading",undefined,"Loading notifications…"));
    try { const data = await request("/api/v1/notifications?limit=20", refresh); if (!Array.isArray(data)) throw new Error("Invalid notifications"); if (!current(view, sequence)) return;
      list.replaceChildren(node("h2", "", "Site updates")); data.forEach(row => { const el = node("article", "site-reply"); el.append(node("p", "site-post-body", row.message), dateNode(row.timestamp)); if (row.href) el.append(external("Read more", row.href)); list.append(el); }); if (!data.length) list.append(paragraph("No notifications right now."));
    } catch { if (current(view, sequence)) state(list, M("async.couldNotLoad",undefined,"Notifications could not be loaded."), () => void loadNotifications(true)); }
  }
  for (const event of ["paladinscat:wallpaper-change", "paladinscat:lite-mode-change", "storage"]) window.addEventListener(event, applyPreferences);
  window.DiscoverySitePages = { open, loadBlog, loadBlogPost, renderSettings, loadNotifications };
  window.DiscoveryApp?.registerRoute('/settings', () => { void renderSettings(); open('site-settings'); });
  window.DiscoveryApp?.registerRoute('/notifications', () => window.DiscoveryNotifications?.open());
  let siteLocale = window.DiscoveryLocale.locale();
  document.addEventListener("discovery:locale-changed", () => {
    const locale = window.DiscoveryLocale.locale(), changed = locale !== siteLocale; siteLocale = locale; updateDates();
    if (changed) {
      if (shell.dataset.view === "site-settings") void renderSettings();
      else if (shell.dataset.view === "site-blog") void loadBlog(false, window.DiscoveryApp?.currentPath());
      else if (shell.dataset.view === "site-blog-post" && selectedBlogPath) void loadBlogPost({path:selectedBlogPath,title:page("site-blog-post").querySelector("h1")?.textContent});
    }
    if (["site-settings", "site-blog", "site-blog-post"].includes(shell.dataset.view)) activate(shell.dataset.view);
  });
})();
