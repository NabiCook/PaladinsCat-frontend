/* Match and leaderboard views reuse app/matches, app/players and lib/api-client.ts contracts. */
(() => {
  'use strict';
  const A = window.DiscoveryApp; if (!A) return;
  const message = (key, fallback, values) => A.message(key, values, fallback);
  function attribute(node, name, value) { if (value?.discoveryMessage) window.DiscoveryLocale.bind(node, value.key, value.fallback, name, value.values, true); else node.setAttribute(name, value); }
  const roleLabel=role=>['Global','Frontline','Damage','Flank','Support'].includes(role)?message('common.roles.'+role.toLowerCase(),role):role;
  const reads = new Map(), sequences = new WeakMap();
  let rosterRequest;
  const el = (tag, cls = '', text = '') => { const n = document.createElement(tag); n.className = cls; A.setText(n, text); return n; };
  // Share the champion directory's class buttons with the migrated filters.
  A.roleFilter = (label, entries, value, change, fieldClass = 'discovery-field') => {
    const wrapper = el('div', fieldClass), caption = el('span', '', label), group = el('div', 'champion-role-filter');
    group.setAttribute('role', 'group'); attribute(group, 'aria-label', label);
    const buttons = entries.map(([key, text]) => {
      const control = el('button', 'champion-role-button'); control.type = 'button';
      if (['Frontline', 'Damage', 'Flank', 'Support'].includes(key)) {
        const image = el('img'); image.src = '/images/icons/Class_' + (key === 'Frontline' ? 'Front_Line' : key) + '_Icon.avif';
        image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.width = 20; image.height = 20; control.append(image);
      }
      control.append(el('span', '', text));
      control.addEventListener('click', () => { setValue(key); change(key); });
      group.append(control); return [key, control];
    });
    function setValue(selected) { for (const [key, control] of buttons) { const active = key === selected; control.classList.toggle('is-active', active); control.setAttribute('aria-pressed', String(active)); } }
    setValue(value); wrapper.append(caption, group); return wrapper;
  };
  const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
  const fmt = (v, digits = 0) => numeric(v) ? A.formatNumber(Number(v), { maximumFractionDigits: digits }) : '—';
  const pct = v => numeric(v) ? A.formatNumber(Number(v), {minimumFractionDigits:2,maximumFractionDigits:2}) + '%' : '—';
  const duration = value => numeric(value) ? message('common.format.durationShort','{minutes}m {seconds}s',{minutes:fmt(Math.floor(Number(value)/60)),seconds:fmt(Math.round(Number(value)%60))}) : '—';
  function button(label, action, cls = 'reference-filter') { const n = el('button', cls, label); n.type = 'button'; n.addEventListener('click', action); return n; }
  function link(label, path) { const n = el('a', 'browse-link', label); n.href = path; return n; }
  function playerLink(row, name, path) { const node=link(name,path);if(window.DiscoveryPlayerName)window.DiscoveryPlayerName.prepare(node,String(name),{player_id:row.player_id??row.playerId??row.id});return node; }
  function field(label, type, value = '') { const n = el('label', 'discovery-field', label), input = el('input'); input.type = type; input.value = value; attribute(input, 'aria-label', label); n.append(input); return { n, input }; }
  function select(label, entries, value, change) { const n = el('label', 'discovery-field', label), input = el('select'); attribute(input, 'aria-label', label); for (const [v, text] of entries) { const option = el('option', '', text); option.value = v; input.append(option); } input.value = value; if (change) input.addEventListener('change', () => change(input.value)); n.append(input); return { n, input }; }
  function heading(host, title) { host.replaceChildren(el('h1', '', title)); attribute(host, 'aria-label', title); }
  function state(host, copyValue, retry) { host.replaceChildren(el('p', 'discovery-copy', copyValue)); if (retry) host.append(button(message("async.tryAgain","Try again"), retry)); host.classList.add('discovery-state'); }
  function table(host, columns, rows, sorting) { const wrap = el('div', 'discovery-table-wrap'); wrap.tabIndex = 0; const t = el('table', 'discovery-table'), head = el('thead'), tr = el('tr'); columns.forEach((col, index) => { const th = el('th', '', col); th.scope = 'col'; if (sorting?.index === index) th.setAttribute('aria-sort', sorting.direction === 'asc' ? 'ascending' : 'descending'); tr.append(th); }); head.append(tr); const body = el('tbody'); for (const values of rows) { const row = el('tr'); values.forEach(value => { const td = el('td'); if (value instanceof Node) td.append(value); else A.setText(td, value ?? '—'); row.append(td); }); body.append(row); } t.append(head, body); wrap.append(t); host.append(wrap); }
  async function read(path, refresh = false) { path=A.scopedPath(path); if (refresh) reads.delete(path); const old = reads.get(path); if (old && Date.now() - old.time < 60000) return old.promise; if (reads.size > 64) reads.delete(reads.keys().next().value); const promise = A.request(path).catch(error => { reads.delete(path); throw error; }); reads.set(path, { time: Date.now(), promise }); return promise; }
  async function roster() { if (!rosterRequest) rosterRequest = Promise.all(['/data/champion-data.json', '/app/champion-titles.json?v=card-ids-1'].map(async path => { const r = await fetch(path, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw Error('Champion reference unavailable'); return r.json(); })).then(([data, ids]) => Object.entries(data).map(([slug, champion]) => ({ ...champion, slug, id: Number(ids.championIds[slug]) })).sort((a,b) => a.name.localeCompare(b.name))).catch(error => { rosterRequest = null; throw error; }); return rosterRequest; }
  function rows(raw) { if (Array.isArray(raw)) return raw; if (Array.isArray(raw?.data)) return raw.data; throw Error('Invalid directory response'); }
  function date(value) { if (!value) return '—'; const d = new Date(value); return Number.isFinite(d.getTime()) ? A.formatDate(d, {dateStyle:"medium",timeStyle:"short"}) : '—'; }
  function pager(host, page, total, change) { const n = el('div', 'discovery-toolbar browse-pagination'); const prev = button(message("skins.previous","Previous"), () => change(page - 1)); prev.disabled = page <= 1; const next = button(message("skins.next","Next"), () => change(page + 1)); next.disabled = page >= total; n.append(prev, el('span', 'discovery-copy', message('skins.pageStatus','Page {page} of {total}',{page:fmt(page),total:fmt(Math.max(1,total))})), next); host.append(n); }
  function begin(host, message) { const seq = (sequences.get(host) || 0) + 1; sequences.set(host, seq); host.setAttribute('aria-busy', 'true'); state(host, message); return seq; }
  const latest = (host, seq) => sequences.get(host) === seq;

  // Match snapshots use the same persisted/display aliases as lib/api-client.ts.
  function normalizeRatingSnapshot(row) {
    const numberOrNull = value => numeric(value) ? Number(value) : null;
    const before = numberOrNull(row.mu_before) ?? numberOrNull(row.queue_mu_pre);
    const after = numberOrNull(row.mu_after) ?? numberOrNull(row.queue_mu_post);
    return { ...row, mu_before: before, mu_after: after,
      phi_before: numberOrNull(row.phi_before) ?? numberOrNull(row.queue_phi_pre),
      phi_after: numberOrNull(row.phi_after) ?? numberOrNull(row.queue_phi_post),
      mu_change: numberOrNull(row.mu_change) ?? (before != null && after != null ? Math.round((after - before) * 100) / 100 : null) };
  }

  const matchNav = el('button', 'rail-button'); matchNav.type = 'button'; attribute(matchNav,'aria-label',message("nav.matches",'Matches')); matchNav.setAttribute('aria-controls', 'matches-directory-page'); matchNav.dataset.discoveryGroup = 'Matches'; matchNav.dataset.navigationKey='Matches';
  matchNav.insertAdjacentHTML('afterbegin', '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-swords" aria-hidden="true" focusable="false"><path d="m13 19 6-6"></path><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"></path><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"></path><path d="m16 16 4 4"></path><path d="m19 21 2-2"></path><path d="m5 14 4 4"></path><path d="m5 21-2-2"></path><path d="M7.5 16.5 4 20"></path></svg>'); const navText = el('span', 'rail-label', message("nav.matches","Matches")); navText.setAttribute('aria-hidden', 'true'); matchNav.append(navText);
  const matchAnchor=document.querySelector('.rail-main [aria-label="Players"]')||document.querySelector('.rail-main [aria-label="Leaderboard"]');
  if(matchAnchor)matchAnchor.after(matchNav);else document.querySelector('.rail-main')?.append(matchNav);
  matchNav.addEventListener('click', () => A.navigate('/matches'));

  let matchState;
  function matches() {
    const host = A.createPage('matches-directory', message("nav.matches","Matches"), 'Matches');
    if (!matchState) {
      heading(host, message("nav.matches","Matches")); const form = el('form', 'discovery-toolbar browse-match-filters');
      const id = field(message("generated.matches.matchId","Match ID"), 'text'), champion = select(message("generated.matches.champion","Champion"), [['',message("generated.stats.allChampions","All champions")]], ''), region = select(message("generated.matches.region","Region"), [['',message("generated.matches.all","All regions")],['NA',message('discovery.region.northAmerica','North America')],['EU',message('discovery.region.europe','Europe')]], ''), day = field(message("generated.matches.date.eb9a4bc","Date"), 'date'), hour = select(message("generated.matches.localTime","Hour"), [['',message("generated.matches.allHours","All hours")], ...Array.from({ length:24 },(_,v) => [String(v),String(v).padStart(2,'0') + ':00'])], '');
      id.input.inputMode = 'numeric'; hour.input.disabled = true; day.input.addEventListener('change', () => { hour.input.disabled = !day.input.value; if (!day.input.value) hour.input.value = ''; });
      const search = el('button', 'reference-filter is-active', message("generated.search.search","Search")); search.type = 'submit'; const error = el('p', 'discovery-copy'); error.setAttribute('role','status'); const output = el('div');
      const reset = button(message("generated.matches.reset","Reset"), () => { form.reset(); hour.input.disabled = true; error.textContent = ''; matchState.filtered = false; matchState.page = 1; void loadMatches(); });
      form.append(id.n,champion.n,region.n,day.n,hour.n,search,reset); host.append(form,error,output);
      matchState = { host, form, id:id.input,champion:champion.input,region:region.input,day:day.input,hour:hour.input,error,output,page:1,filtered:false };
      form.addEventListener('submit', event => { event.preventDefault(); const value = id.input.value.trim(); if (value) { if (!/^[1-9]\d{0,11}$/.test(value)) { A.setText(error,message('matches.invalidMatchId','Enter a valid positive match ID.')); return; } A.navigate('/matches/' + value); return; } error.textContent = ''; matchState.filtered = true; matchState.page = 1; void loadMatches(); });
      void roster().then(data => data.forEach(c => { const option = el('option','',c.name); option.value = String(c.id); champion.input.append(option); })).catch(() => { champion.input.disabled = true; });
      void loadMatches();
    }
    A.open('matches-directory');
  }
  async function loadMatches(refresh = false) {
    const s = matchState; s.result=null; const seq = begin(s.output, message("async.loading","Loading matches…")); window.DiscoveryLoading?.show(s.output,"table");
    let path = '/matches/overview';
    if (s.filtered) { const q = new URLSearchParams({ queueId:'486',page:String(s.page),perPage:'20',timeZone:A.timeZone() }); for (const [key,value] of [['championId',s.champion.value],['region',s.region.value],['date',s.day.value],['hour',s.hour.value]]) if(value) q.set(key,value); path = '/matches/search?' + q; }
    try { const raw = await read(path,refresh); if (!latest(s.output,seq)) return; const entries = s.filtered ? rows(raw) : raw.recent; if(!Array.isArray(entries)) throw Error('Invalid match list'); s.result={raw,entries}; renderMatches(s); }
    catch(error) { if(latest(s.output,seq)) state(s.output,message('async.couldNotLoad',error.message),()=>void loadMatches(true)); }
    finally { if(latest(s.output,seq)) s.output.setAttribute('aria-busy','false'); }
  }

  function renderMatches(s) {
    if(!s.result)return;const {raw,entries}=s.result;
    s.output.replaceChildren();s.output.classList.remove('discovery-state');
    if(!entries.length)s.output.append(el('p','discovery-copy',message('generated.matches.noMatchingGames','No matches meet these filters.')));
    else {if(s.filtered)s.output.append(el('p','discovery-copy',message('common.summary.valueMetric','{value} matching Ranked Siege matches',{value:fmt(raw.total),metric:String(message('generated.matches.ranked','Ranked Siege'))+' '+String(message('generated.matches.matches','matches'))})));table(s.output,[message("generated.players.match.0335207","Match"),message("generated.matches.map","Map"),message("generated.players.time","Started"),message("generated.matches.duration","Duration"),message("generated.matches.region","Region")],entries.map(m=>[link(String(m.match_id),'/matches/'+m.match_id),m.map,date(m.entry_datetime),duration(m.duration_seconds),m.region]));}
    if(s.filtered)pager(s.output,s.page,Number(raw.page?.totalPages)||1,page=>{s.page=page;void loadMatches();});
  }

  let scoreboardModule;
  function loadScoreboard() { return scoreboardModule ||= import('./discovery-scoreboard.js?v=11').catch(error => { scoreboardModule = null; throw error; }); }

  async function matchDetail(path, match) {
    const id = match[1], view = 'match-detail-' + id, host = A.createPage(view,message('generated.players.matchValue1','Match {value1}',{value1:id}),'Matches'); window.DiscoveryScoreboard?.destroy(host.querySelector('[data-scoreboard-root]')); heading(host,message('generated.players.matchValue1','Match {value1}',{value1:id})); host.querySelector('h1').classList.add('dashboard-match-heading'); const output = el('div'); host.append(output); A.open(view);
    const load = async refresh => { window.DiscoveryScoreboard?.destroy(output.querySelector('[data-scoreboard-root]')); const seq=begin(output,message("async.loading","Loading match…")); try { const [raw,identity] = await Promise.all([A.request('/matches/'+id,{timeoutMs:130000}),A.getUser(true),loadScoreboard()]); if(!latest(output,seq)||!output.isConnected||A.currentPath()!==path)return; let detail = await window.DiscoveryMatchFeatures.prepare(raw); if(!latest(output,seq)||!output.isConnected||A.currentPath()!==path)return; if(!detail?.match||!Array.isArray(detail.players)) throw Error('Match data is unavailable.'); detail = await window.DiscoveryScoreboard.withCurrentStoredModeration(detail).catch(()=>detail); if(!latest(output,seq)||!output.isConnected||A.currentPath()!==path)return; const access=window.DiscoveryMatchFeatures.access(detail,identity); output.replaceChildren(); output.classList.remove('discovery-state'); const scoreboard=el('div','dashboard-match-scoreboard'); scoreboard.dataset.scoreboardRoot=''; output.append(scoreboard); if (!window.DiscoveryScoreboard) throw Error('Scoreboard unavailable.'); window.DiscoveryScoreboard.mount(scoreboard,detail,identity);
      if(access.loadouts) await window.DiscoveryMatchFeatures.renderLoadouts(output,detail,()=>latest(output,seq)&&output.isConnected&&A.currentPath()===path); if(!latest(output,seq)||!output.isConnected||A.currentPath()!==path)return;
      if(access.fullDetails) await window.DiscoveryMatchFeatures.render(output,detail,()=>latest(output,seq)&&output.isConnected&&A.currentPath()===path); if(!latest(output,seq)||!output.isConnected||A.currentPath()!==path)return;
      const snapshots=access.fullDetails ? detail.snapshots||detail.rating_snapshots||detail.ratingSnapshots||[] : [];
      if(snapshots.length){
        const section=el('section','discovery-panel match-detail-section match-ratings'),ratingFmt=value=>value==null?'—':A.formatNumber(value,{minimumFractionDigits:2,maximumFractionDigits:2});
        const change=value=>value==null?'—':(Number(value)>=0?'+':'')+ratingFmt(value);
        const ratingPlayer=row=>Number(row.player_id)>0?playerLink(row,row.player_name||String(row.player_id),'/players/'+row.player_id):el('span','',row.player_name||'—');
        section.append(el('h2','',message('generated.matches.ratingChangesGlicko2','Rating changes (Glicko-2)')));
        const normalized=snapshots.map(normalizeRatingSnapshot),desktop=el('div','match-ratings-table');
        table(desktop,[message('generated.players.player','Player'),message('generated.matches.before','Before (μ)'),message('generated.matches.after','After (μ)'),'Δμ',message('generated.matches.before.a76e1e6','Before (φ)'),message('generated.matches.after.fb704e3','After (φ)')],normalized.map(r=>[ratingPlayer(r),ratingFmt(r.mu_before),ratingFmt(r.mu_after),change(r.mu_change),ratingFmt(r.phi_before),ratingFmt(r.phi_after)]));section.append(desktop);
        const mobile=el('div','match-ratings-mobile');for(const row of normalized){const card=el('article','match-rating-card'),header=el('div','match-rating-header');header.append(ratingPlayer(row),el('strong','',change(row.mu_change)));card.append(header);const list=el('dl','match-rating-grid');for(const [key,fallback,before,after] of [['generated.matches.rating','Rating',row.mu_before,row.mu_after],['generated.matches.deviation','Deviation',row.phi_before,row.phi_after]]){const item=el('div');item.append(el('dt','',message(key,fallback)),el('dd','',ratingFmt(before)+' → '+ratingFmt(after)));list.append(item);}card.append(list);mobile.append(card);}section.append(mobile);output.append(section);
      }
      if(detail.access?.remaining != null){const remaining=el('p','discovery-copy');remaining.setAttribute('role','status');A.setText(remaining,message('matches.freeLookupsRemaining','{count} free match lookups remaining',{count:detail.access.remaining}));output.append(remaining);}
      A.setText(host.querySelector('h1'),message('generated.players.matchValue1','Match {value1}',{value1:id}));
    }catch(error){if(latest(output,seq)&&output.isConnected&&A.currentPath()===path)state(output,message('async.couldNotLoad',error.message),()=>void load(true));}finally{if(latest(output,seq)&&output.isConnected&&A.currentPath()===path)output.setAttribute('aria-busy','false');} };void load(false);
  }

  A.registerRoute('/matches', matches);
  A.registerRoute(/^\/matches\/([1-9]\d{0,11})$/, matchDetail);

  const leaderboardDefinitions = [
    ['/players/leaderboard',message("generated.players.ranked","Ranked"),'ranked'],['/players/elo/account',message("generated.players.accountElo","Account ELO"),'elo-account'],['/players/elo/champion',message("generated.players.championElo","Champion ELO"),'elo-champion'],['/players/performance',message("generated.players.performanceStats","Match performance"),'performance-match'],['/players/performance/account',message("generated.players.performanceStats","Account performance"),'performance-account'],['/players/performance/champion',message("stats.portal.performance","Champion performance"),'performance-champion'],['/players/levels/account',message("generated.players.account","Account level"),'levels-account'],['/players/levels/champion',message("generated.players.champion","Champion level"),'levels-champion'],
  ];
  let leaderboardProPending;
  function openProLeaderboard(path) {
    const pathname=new URL(path,location.origin).pathname,definition=leaderboardDefinitions.find(d=>d[0]===pathname);if(!definition)return;
    const [,title,key]=definition;
    if(window.DiscoveryLeaderboardPro){window.DiscoveryLeaderboardPro.open(key,path);return;}
    const view='leaderboard-'+key,host=A.createPage(view,title,'Leaderboard');host.setAttribute('aria-busy','true');
    const loading=el('p','discovery-copy',message('async.loading','Loading…'));loading.setAttribute('role','status');host.replaceChildren(loading);A.open(view);
    leaderboardProPending ||= import('./discovery-leaderboard-pro.js?v=4').catch(error=>{leaderboardProPending=null;throw error;});
    leaderboardProPending.then(()=>{if(A.currentPath()===path){host.removeAttribute('aria-busy');window.DiscoveryLeaderboardPro.open(key,path);}}).catch(()=>{if(A.currentPath()!==path)return;host.removeAttribute('aria-busy');state(host,message('async.couldNotLoad','This section could not be loaded.'),()=>openProLeaderboard(path));});
  }
  leaderboardDefinitions.forEach(([path])=>A.registerRoute(path,openProLeaderboard));
  // The native hub keeps its saved four-column preview and current ranked data.
  function previewRankTier(value,rank){
    if(!numeric(value)||!Number.isInteger(Number(value))||Number(value)<0||Number(value)>27)return{name:'—',icon:null};
    const tier=Number(value),effective=tier===26&&Number(rank)>0&&Number(rank)<=100?27:tier;
    if(effective===0)return{name:'Unranked',icon:'/images/rank-tiers/qualifying/RankIcon_Qualifying.avif'};
    if(effective>=26){const name=effective===27?'Grandmaster':'Master';return{name,icon:'/images/rank-tiers/'+name.toLowerCase()+'/RankIcon_'+name+'.avif'};}
    const group=Math.floor((effective-1)/5),name=['Bronze','Silver','Gold','Platinum','Diamond'][group],sub=5-(effective-1)%5;
    return{name:name+' '+['','I','II','III','IV','V'][sub],icon:'/images/rank-tiers/'+name.toLowerCase()+'/RankIcon_'+name+'_'+sub+'.avif'};
  }
  function previewRankedRows(raw){
    return rows(raw).map(row=>{
      const id=String(row.player_id??''),name=String(row.name??row.player_name??'').trim();
      if(!/^[1-9]\d{0,11}$/.test(id)||!name)throw Error('Invalid ranked player identity.');
      return{id,name,rank:numeric(row.rank)&&Number(row.rank)>0?Number(row.rank):null,tier:row.tier,points:row.points};
    }).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)).slice(0,10);
  }
  function previewMessage(body,copyValue,retry){
    const row=el('tr'),cell=el('td');cell.colSpan=4;cell.append(el('span','',copyValue));if(retry)cell.append(document.createTextNode(' '),button(message("async.tryAgain","Try again"),retry));row.append(cell);body.replaceChildren(row);
  }
  const nativeLeaderboardHub=document.querySelector('#leaderboard-page'),nativeLeaderboardShell=document.querySelector('.dashboard-shell');
  if(nativeLeaderboardHub && window.DiscoveryLocale){
    const bindings=[
      ['#leaderboard-page-title','menu.leaderboards','Leaderboards'],
      ['.leaderboard-directory','discovery.leaderboard.categories','Leaderboard categories','aria-label'],
      ['.leaderboard-category[href="/players/leaderboard"] .leaderboard-category-title','generated.players.ranked','Ranked'],
      ['.leaderboard-category[href="/players/elo/account"] .leaderboard-category-title','generated.players.accountElo','Account ELO'],
      ['.leaderboard-category[href="/players/elo/champion"] .leaderboard-category-title','generated.players.championElo','Champion ELO'],
      ['.leaderboard-category[href="/players/performance/account"] .leaderboard-category-title','discovery.leaderboard.accountPerformance','Account performance'],
      ['.leaderboard-category[href="/players/performance/champion"] .leaderboard-category-title','stats.portal.performance','Champion performance'],
      ['.leaderboard-category[href="/players/levels/account"] .leaderboard-category-title','discovery.leaderboard.accountLevel','Account Lv.'],
      ['.leaderboard-category[href="/players/levels/champion"] .leaderboard-category-title','discovery.leaderboard.championLevel','Champion Lv.'],
      ['#leaderboard-preview-title','discovery.leaderboard.topPlayers','Top players'],
      ['.leaderboard-view-all','discovery.leaderboard.viewFull','View full leaderboard '],
    ];
    for(const [selector,key,fallback,attribute] of bindings)nativeLeaderboardHub.querySelectorAll(selector).forEach(element=>window.DiscoveryLocale.bind(element,key,fallback,attribute,undefined,true));
    const headings=[['generated.players.rank','Rank'],['generated.players.player','Player'],['generated.players.tier','Tier'],['generated.players.points.4b2a6a3','Points']];
    nativeLeaderboardHub.querySelectorAll('.leaderboard-table').forEach(table=>table.querySelectorAll('thead th').forEach((th,index)=>{if(headings[index])window.DiscoveryLocale.bind(th,...headings[index],undefined,undefined,true);}));
    const eyebrow=nativeLeaderboardHub.querySelector('.leaderboard-preview-eyebrow'),parts=eyebrow&&[...eyebrow.childNodes].filter(child=>child.nodeType===3);
    const updateEyebrow=()=>{if(parts?.length>=2){parts[0].nodeValue=String(message('generated.players.ranked','RANKED')).trimEnd()+' ';parts[parts.length-1].nodeValue=' '+String(message('discovery.leaderboard.allRegions','ALL REGIONS')).trimStart();}};
    updateEyebrow();document.addEventListener('discovery:locale-changed',updateEyebrow);
  }
  let previewLoading=false,previewLoadedAt=0,previewEntries=null;
  async function loadNativeLeaderboardPreview(refresh=false){
    if(nativeLeaderboardShell?.dataset.view==='leaderboard')window.DiscoveryStatsProLoader?.mountLeaderboardTiers();
    if(nativeLeaderboardShell?.dataset.view!=='leaderboard'||previewLoading||(!refresh&&previewLoadedAt&&Date.now()-previewLoadedAt<60000))return;
    const body=nativeLeaderboardHub?.querySelector('[data-leaderboard-preview-rows]');if(!body)return;
    previewLoading=true;body.setAttribute('aria-busy','true');body.setAttribute('aria-live','polite');previewMessage(body,message("async.loading","Loading rankings…"));
    try{
      const entries=previewRankedRows(await read('/stats/ranked-leaderboard?tier=26&top=100',refresh));
      if(body!==nativeLeaderboardHub.querySelector('[data-leaderboard-preview-rows]'))return;
      previewEntries=entries;renderNativeLeaderboardPreview(body,entries);
      previewLoadedAt=Date.now();
    }catch(error){if(body===nativeLeaderboardHub.querySelector('[data-leaderboard-preview-rows]'))previewMessage(body,message("async.couldNotLoad","Rankings could not be loaded."),()=>loadNativeLeaderboardPreview(true));}
    finally{previewLoading=false;body.setAttribute('aria-busy','false');}
  }
  function renderNativeLeaderboardPreview(body,entries){
      body.replaceChildren();
      const secondary=nativeLeaderboardHub.querySelector('[data-leaderboard-preview-rows-secondary]');
      secondary?.replaceChildren();
      const headings=[['generated.players.rank','Rank'],['generated.players.player','Player'],['generated.players.tier','Tier'],['generated.players.points.4b2a6a3','Points']];
      nativeLeaderboardHub.querySelectorAll('.leaderboard-table').forEach(table=>table.querySelectorAll('thead th').forEach((th,index)=>{if(headings[index])A.setText(th,message(...headings[index]));}));
      if(!entries.length)previewMessage(body,message("generated.players.noRankedPlayersFoundForThisTier","No ranked players are available."));
      for(const [index,entry] of entries.entries()){
        const row=el('tr'),place=el('td'),player=el('td'),tier=el('td'),points=el('td','numeric',fmt(entry.points));
        place.append(el('span','leaderboard-place'+({1:' leaderboard-place-gold',2:' leaderboard-place-silver',3:' leaderboard-place-bronze'}[entry.rank]||''),entry.rank==null?'—':A.formatNumber(entry.rank,{minimumIntegerDigits:2,useGrouping:false})));
        const identity=link('','/players/'+entry.id);identity.className='leaderboard-player';identity.style.textDecoration='none';const name=el('strong','',entry.name);if(window.DiscoveryPlayerName)window.DiscoveryPlayerName.prepare(name,entry.name,entry);identity.append(name);player.append(identity);
        const rank=previewRankTier(entry.tier,entry.rank),label=el('span','leaderboard-tier');
        if(rank.icon){const image=el('img');image.src=rank.icon;image.alt='';image.width=22;image.height=22;label.append(image);}
        label.append(document.createTextNode(''));A.setText(label,rankMessage(entry.tier,entry.rank,rank.name));tier.append(label);row.append(place,player,tier,points);(index<5||!secondary?body:secondary).append(row);
      }
  }
  function rankMessage(tier,rank,fallback){const effective=Number(tier)===26&&Number(rank)>0&&Number(rank)<=100?27:Number(tier);if(!Number.isInteger(effective)||effective<0||effective>27)return fallback;const keys=['unranked',...['bronze','silver','gold','platinum','diamond'].flatMap(name=>[5,4,3,2,1].map(sub=>name+sub)),'master','grandmaster'];return message(effective===0?'generated.players.unranked':'common.tiers.'+keys[effective],fallback);}
  document.addEventListener('discovery:locale-changed',()=>{if(matchState?.result)renderMatches(matchState);if(previewEntries){const body=nativeLeaderboardHub?.querySelector('[data-leaderboard-preview-rows]');if(body)renderNativeLeaderboardPreview(body,previewEntries);}});
  if(nativeLeaderboardShell)new MutationObserver(()=>{void loadNativeLeaderboardPreview();}).observe(nativeLeaderboardShell,{attributes:true,attributeFilter:['data-view']});
  if(nativeLeaderboardShell?.dataset.view==='leaderboard')void loadNativeLeaderboardPreview();
})();
