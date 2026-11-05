/* Dashboard presentation uses the same published catalogs and preferences as Pro. */
(() => {
  'use strict';
  const supported = [
    ['en','English'],['de','Deutsch'],['es-419','Español (Latinoamérica)'],
    ['fr','Français'],['ja','日本語'],['ko','한국어'],['pl','Polski'],
    ['pt-BR','Português (Brasil)'],['ru','Русский'],['tr','Türkçe'],
    ['zh-CN','简体中文'],['zh-TW','繁體中文'],
  ];
  const valid = value => supported.some(([code]) => code === value);
  let language = 'en', english = {}, messages = {}, generation = 0;
  try {
    const cookie = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('paladinscat_locale='));
    const saved = cookie ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)) : localStorage.getItem('paladinscat:locale');
    if (valid(saved)) language = saved;
  } catch {}
  const interpolate = (text, values) => String(text).replace(/\{(\w+)\}/g, (match, key) => values && Object.hasOwn(values,key) ? String(values[key]) : match);
  // A single dashboard term covers observed play samples, including item and card selections.
  const playsLabels = new Set(['generated.champions.plays','generated.stats.plays','generated.stats.plays.0effba4','common.sort.totalPlays','common.count.picks','common.count.uses','generated.stats.purchases']);
  function metricLabel(key, values, fallback) {
    if (playsLabels.has(key)) return { key:'discovery.metric.plays', values, fallback:'Plays' };
    if (key === 'discovery.champion.casualPlayCount') return { key:'discovery.metric.casualPlays', values, fallback:'Casual Plays' };
    if (key === 'discovery.champion.rankedPlayCount') return { key:'discovery.metric.rankedPlays', values, fallback:'Ranked Plays' };
    if (key === 'discovery.count.plays' || key === 'discovery.champion.playsValue' || key === 'generated.stats.value1Purchases') return { key:'discovery.metric.playsCount', values:{...values,count:values?.count ?? values?.value1}, fallback:'{count} Plays' };
    if (key === 'discovery.choice.playsPrefix') return { key:'discovery.metric.playsPrefix', values, fallback:'{count} Plays · ' };
    return { key, values, fallback };
  }
  function t(key, values, fallback) { ({key,values,fallback}=metricLabel(key,values,fallback)); return interpolate(messages[key] || english[key] || fallback || key, values); }
  function labelText(key, values, fallback) { ({key,values,fallback}=metricLabel(key,values,fallback)); return interpolate((language === 'en' ? fallback : messages[key]) || fallback || english[key] || key, values); }
  function message(key, values, fallback) { return {discoveryMessage:true,key,values,fallback,toString(){return labelText(key,values,fallback);}}; }
  function textNode(element, value) {
    const text = String(value);
    const existing = [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
    if (existing) existing.nodeValue = text;
    else element.prepend(document.createTextNode(text));
  }
  function setText(element, value) {
    if (value?.discoveryMessage) bind(element,value.key,value.fallback,undefined,value.values,true);
    else {
      if (element.dataset.discoveryI18n) {
        const bindings = JSON.parse(element.dataset.discoveryI18n).filter(binding => binding.attribute !== 'textContent');
        if (bindings.length) element.dataset.discoveryI18n = JSON.stringify(bindings);
        else delete element.dataset.discoveryI18n;
      }
      element.textContent = value == null ? '' : value;
    }
    return element;
  }
  function locale() { return language; }
  function timeZone() {
    try { const zone = localStorage.getItem('pc_time_zone'); if (zone) { new Intl.DateTimeFormat(language,{timeZone:zone}); return zone; } } catch {}
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  const formatNumber = (value, options) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat(language,options).format(Number(value));
  function percentageNumber(value) {
    let text = String(value).trim().replace(/[\u200e\u200f\u061c]/g,'');
    if (!/[%٪]$/.test(text)) return null;
    text = text.slice(0,-1).trim();
    if (/^[+-]/.test(text)) return null; // Signed relative changes have their own semantic colors.
    const parts = new Intl.NumberFormat(language).formatToParts(1000.1);
    const group = parts.find(part => part.type === 'group')?.value;
    const decimal = parts.find(part => part.type === 'decimal')?.value || '.';
    const digits = Array.from({length:10},(_,digit) => new Intl.NumberFormat(language,{useGrouping:false}).format(digit));
    digits.forEach((digit,index) => { text = text.split(digit).join(String(index)); });
    if (decimal !== '.' && text.includes(decimal)) {
      if (group) text = text.split(group).join('');
      text = text.split(decimal).join('.');
    } else if (group && group !== '.' && group !== ',') text = text.split(group).join('');
    text = text.replace(/[\u00a0\u202f ]/g,'');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
  }
  function formatDate(value, options = {dateStyle:'medium',timeStyle:'short'}) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language,{timeZone:timeZone(),...options}).format(date) : '—';
  }
  // Only explicitly bound UI labels are translated. Player names and authored content are data.
  function bind(element, key, fallback, attribute, values, preserveEnglish = false) {
    const bindings = JSON.parse(element.dataset.discoveryI18n || '[]');
    const target = attribute || 'textContent';
    const entry = {key,fallback,attribute:target,values,preserveEnglish};
    const old = bindings.findIndex(binding => binding.attribute === target);
    if (old < 0) bindings.push(entry); else bindings[old] = entry;
    element.dataset.discoveryI18n = JSON.stringify(bindings);
    const text = preserveEnglish ? labelText(key,values,fallback) : t(key,values,fallback);
    if (target === 'textContent') textNode(element,text);
    else element.setAttribute(target,text);
    return element;
  }
  function updateLabels(root = document) {
    for (const element of root.querySelectorAll('[data-discovery-i18n]')) {
      for (const binding of JSON.parse(element.dataset.discoveryI18n)) {
        const text = binding.preserveEnglish ? labelText(binding.key,binding.values,binding.fallback) : t(binding.key,binding.values,binding.fallback);
        if (binding.attribute === 'textContent') textNode(element,text);
        else element.setAttribute(binding.attribute,text);
      }
    }
  }
  function sourceLabel(element) {
    if (!element?.dataset.discoveryI18n) return element?.textContent || '';
    return JSON.parse(element.dataset.discoveryI18n).map(binding => english[binding.key] || binding.fallback || '').join(' ');
  }
  const catalogs = new Map();
  let modulesPromise;
  const draftMessages = fetch('/app/discovery-ui-messages.json?localizationAudit=1&saveLink=1&scrollTop=1&v=surgical-4&match=1&plays=1',{signal:AbortSignal.timeout(10000)}).then(response => response.ok ? response.json() : {}).catch(() => ({}));
  async function catalog(code) {
    if (!catalogs.has(code)) catalogs.set(code,(async () => {
      modulesPromise ||= fetch('/locales/modules.json',{signal:AbortSignal.timeout(10000)}).then(response => { if (!response.ok) throw Error('Locale modules unavailable'); return response.json(); });
      const modules = await modulesPromise;
      const ordered = ['generated/ui',...modules.filter(module => module !== 'generated/ui')];
      const parts = await Promise.all(ordered.map(async module => {
        try {
          const response = await fetch('/locales/'+encodeURIComponent(code)+'/'+module+'.json',{signal:AbortSignal.timeout(10000)});
          if (!response.ok) return {};
          const data = await response.json();
          return Object.fromEntries(Object.entries(data).filter(([key,value]) => typeof value === 'string' && value.length <= 1000 && (code === 'en' || Object.hasOwn(english,key))));
        } catch { return {}; }
      }));
      return Object.assign({},...parts);
    })().catch(error => { catalogs.delete(code); throw error; }));
    return catalogs.get(code);
  }
  async function load(initial = false) {
    const seq = ++generation, selected = language;
    try {
      const [base,extra] = await Promise.all([catalog('en'),draftMessages]);
      english = {...base,...(extra.en || {})};
      const translated = selected === 'en' ? {} : await catalog(selected);
      if (seq !== generation) return;
      messages = {...translated,...Object.fromEntries(Object.entries(extra[selected] || {}).filter(([key,value]) => Object.hasOwn(english,key) && typeof value === 'string' && value.length <= 1000))};
    } catch { if (seq !== generation) return; messages = {}; }
    if (initial && document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    if (seq !== generation) return;
    document.documentElement.lang = language;
    updateLabels();
    document.dispatchEvent(new CustomEvent('discovery:locale-changed',{detail:{locale:language,initial}}));
  }
  async function setLocale(code) {
    if (!valid(code)) return;
    language = code;
    try { localStorage.setItem('paladinscat:locale',code); } catch {}
    document.cookie = 'paladinscat_locale='+encodeURIComponent(code)+'; Path=/; Max-Age=31536000; SameSite=Lax';
    return load();
  }
  window.DiscoveryLocale = {t,message,setText,locale,timeZone,formatNumber,formatDate,percentageNumber,sourceLabel,bind,updateLabels,setLocale,supported,ready:load(true)};
})();
