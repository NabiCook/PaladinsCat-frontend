/* Missing match sections use dashboard tables and source-owned metric math. */
(() => {
  'use strict';
  const App = window.DiscoveryApp;
  if (!App) return;
  let logic;
  function loadLogic() { return logic ||= import('./discovery-match-format.js').catch(error => { logic = null; throw error; }); }
  const node = (tag, cls = '', text = '') => { const el = document.createElement(tag); el.className = cls; el.textContent = text; return el; };
  const t = (key, fallback) => App.t(key, undefined, fallback);
  const fmt = value => App.formatNumber(value,{maximumFractionDigits:2});
  const rate = value => value == null ? '—' : App.formatNumber(Number(value)/100,{style:'percent',maximumFractionDigits:2});
  function activity(value) {
    if (value == null || !Number.isFinite(value)) return '—';
    const key = value >= 120 ? 'generated.stats.egpm.engaged' : value >= 110 ? 'common.activity.possibleDisconnect' : value >= 90 ? 'generated.stats.egpm.disconnected' : value >= 70 ? 'generated.stats.egpm.partialAfk' : 'generated.stats.egpm.fullAfk';
    return App.t(key);
  }
  function rankValue(player,profile) {
    const raw=profile?.kbmTier ?? player.tier ?? player.league_tier;
    if(raw==null || raw==='') return '—';
    const value=Number(raw); if(!Number.isFinite(value) || value<0) return String(player.league_tier || '—');
    let tier=Math.min(27,Math.round(value)),rank=profile?.kbmRank>0?profile.kbmRank:0;
    if(tier===26 && rank>0 && rank<=100)tier=27;
    const names=['Unranked','Bronze V','Bronze IV','Bronze III','Bronze II','Bronze I','Silver V','Silver IV','Silver III','Silver II','Silver I','Gold V','Gold IV','Gold III','Gold II','Gold I','Platinum V','Platinum IV','Platinum III','Platinum II','Platinum I','Diamond V','Diamond IV','Diamond III','Diamond II','Diamond I','Master','Grandmaster'];
    const group=Math.floor((tier-1)/5),folders=['bronze','silver','gold','platinum','diamond'],bases=['Bronze','Silver','Gold','Platinum','Diamond'];
    const icon=tier===0?'/images/rank-tiers/qualifying/RankIcon_Qualifying.avif':tier>=26?'/images/rank-tiers/'+(tier===27?'grandmaster/RankIcon_Grandmaster':'master/RankIcon_Master')+'.avif':'/images/rank-tiers/'+folders[group]+'/RankIcon_'+bases[group]+'_'+(5-(tier-1)%5)+'.avif';
    const keys=['unranked',...['bronze','silver','gold','platinum','diamond'].flatMap(name=>[5,4,3,2,1].map(sub=>name+sub)),'master','grandmaster'];
    const wrap=node('span'),image=node('img');image.src=icon;image.alt='';image.width=24;image.height=24;wrap.append(image,document.createTextNode(t(tier===0?'generated.players.unranked':'common.tiers.'+keys[tier],names[tier])+(tier===26 && rank>100?' #'+(rank-100):tier===27 && rank>0?' #'+rank:'')));return wrap;
  }
  function table(host, headers, values) {
    const wrap = node('div','discovery-table-wrap'); wrap.tabIndex = 0;
    const grid = node('table','discovery-table'), head = node('thead'), row = node('tr');
    for (const label of headers) { const cell = node('th','',label); cell.scope = 'col'; row.append(cell); }
    head.append(row); const body = node('tbody');
    for (const cells of values) { const row = node('tr'); cells.forEach((value,index) => { const cell = node(index ? 'td' : 'th'); if (!index) cell.scope = 'row'; if (value instanceof Node) cell.append(value); else cell.textContent = value ?? '—'; row.append(cell); }); body.append(row); }
    grid.append(head,body); wrap.append(grid); host.append(wrap);
  }
  function playerLink(player) {
    const id = Number(player.player_id), name = player.private_account_display_name || player.player_name || String(id);
    const privateId = Number(player.private_player_id);
    const href = id > 0 ? '/players/'+id : id === 0 && Number.isInteger(privateId) && privateId > 0 ? '/players/private-accounts/'+privateId : null;
    if (!href) return name;
    const link = node('a','browse-link',name); link.href = href;if(window.DiscoveryPlayerName)window.DiscoveryPlayerName.prepare(link,name,{...(player.profile_snapshot||{}),player_id:id});return link;
  }
  function panel(title) { const section = node('section','discovery-panel'); section.append(node('h2','',title)); return section; }
  // MatchDetailClient uses the backend grant when present; identity is its fallback.
  function access(detail, identity) {
    const user = identity?.user || ((identity?.id ?? identity?.user_id) != null ? identity : null);
    const viewer = (user?.linkedPlayerId ?? user?.linked_player_id) != null ? 'verified' : user ? 'account' : 'guest';
    const supplied = detail?.access?.tier;
    const tier = ['guest','account','verified'].includes(supplied) ? supplied : viewer;
    return {tier,loadouts:tier !== 'guest',fullDetails:tier === 'verified'};
  }
  async function prepare(raw) {
    const detail = raw.matches?.[0];
    if (!detail?.match || !Array.isArray(detail.players)) return null;
    const {deriveMissingMatchCreditRates} = await loadLogic();
    return deriveMissingMatchCreditRates({...detail,
      access:detail.access ?? raw.access,
      storageStatus:detail.storageStatus ?? raw.storageStatus ?? raw.storage_status,
      dataStatus:detail.dataStatus ?? raw.dataStatus,
      dataHash:detail.dataHash ?? raw.dataHash,
    });
  }
  function addIdentity(host, player) {
    const image = node('img','match-player-avatar'); image.src = window.DiscoveryScoreboard.championIcon(player.champion_name); image.alt = player.champion_name || t('generated.matches.champion','Champion'); image.loading = 'lazy'; image.addEventListener('error',()=>{image.src='/images/champions/Champion_Generic_Icon.avif';},{once:true});
    const info=node('div','match-player-identity'), name=playerLink(player); if(name instanceof Node)info.append(name);else info.append(node('span','',name));
    if(player.champion_name){const champion=node('a','match-player-champion',player.champion_name); champion.href='/champions/'+slug(player.champion_name);info.append(champion);}
    host.append(image,info);
  }
  function factFor(player, facts) {
    return facts.find(f=>String(f.player_id)===String(player.player_id) && (Number(player.player_id)>0 || Number(f.private_player_id ?? 0)===Number(player.private_player_id ?? 0)) && (!f.champion_id || Number(f.champion_id)===Number(player.champion_id))) || {player_id:player.player_id,private_player_id:player.private_player_id,champion_id:player.champion_id,champion_name:player.champion_name,talents:[],cards:[],items:[]};
  }
  function assetGroup(items, resolve, kind, onCard) {
    const group=node('div','match-build-assets');
    for(const item of items){const asset=node('span','match-build-asset'), name=item.talent_name || item.card_name || item.item_name || t('generated.matches.item','Item'), icon=resolve(item); asset.title=name;
      if(icon && /^\/(?!\/)/.test(icon)){const img=node('img');img.src=icon;img.alt=name;img.loading='lazy';asset.append(img);}else{const missing=node('span','match-asset-fallback',name);asset.append(missing);}
      const raw=kind==='item'?item.item_level:item.card_level; const level=raw==null?null:Number(raw)+(kind==='item'?1:0);if(kind!=='talent' && Number.isFinite(level)){const badge=node('span','match-asset-level',fmt(level));asset.append(badge);}if(kind==='card' && onCard){const holder=node('span','match-build-card'),trends=node('span','match-card-trends');holder.append(asset,trends);group.append(holder);onCard(item,trends);}else group.append(asset);
    }
    if(!items.length)group.append(node('span','discovery-copy','—'));return group;
  }
  async function renderLoadouts(host, detail, current) {
    const facts=detail.fact?.players || (Array.isArray(detail.loadouts)?detail.loadouts:detail.loadouts?.players) || (Array.isArray(detail.facts)?detail.facts:detail.facts?.players) || [];
    const [champions,activeItems]=await Promise.all([reference('/data/champion-data.json?v=ultimate-slots-2').catch(()=>({})),reference('/data/paladins-active-items.json').catch(()=>({items:[]}))]);if(!current())return;
    const section=panel(t('generated.matches.itemsLoadouts','Items and loadouts'));section.classList.add('match-detail-section','match-builds');
    const note=node('p','discovery-copy'); label(note,'generated.matches.talentAndCardsPurchasedItemsExpandARowForDescriptions','Talent and cards, purchased items. Expand a row for descriptions.');section.append(note);
    const headings=node('div','match-build-head'); for(const [key,fallback] of [['generated.matches.championPlayer','Champion / Player'],['generated.matches.loadout','Loadout'],['generated.matches.items','Items']]){const text=node('span');label(text,key,fallback);headings.append(text);}section.append(headings);
    for(const team of [1,2]) {
      if(team===2){const heading=node('h3','match-team-divider');label(heading,'generated.matches.opposingTeam','Opposing team');section.append(heading);}
      for(const player of detail.players.filter(p=>Number(p.task_force)===team)) {
        const fact=factFor(player,facts), champion=champions[slug(player.champion_name)]||{}, row=node('div','match-build-row'), identity=node('div','match-build-player');addIdentity(identity,player);
        const loadout=node('div','match-build-group'),cardTrends=[];const loadoutLabel=node('span','match-build-mobile-label');label(loadoutLabel,'generated.matches.talentCards','Talent and cards');loadout.append(loadoutLabel,assetGroup(fact.talents||[],x=>matching(champion.talents,x.talent_id,x.talent_name)?.iconUrl || x.icon_url || x.fallback_icon_url,'talent'),assetGroup(fact.cards||[],x=>matching(champion.loadouts,x.card_id,x.card_name,cardKey)?.iconUrl || x.icon_url || x.fallback_icon_url,'card',(card,trends)=>cardTrends.push({card,trends})));bindCardTrends(row,player,fact,cardTrends,current);
        const items=node('div','match-build-group'),itemLabel=node('span','match-build-mobile-label');label(itemLabel,'generated.matches.purchasedItems','Purchased items');items.append(itemLabel,assetGroup(fact.items||[],x=>{const ref=(activeItems.items||[]).find(i=>nameKey(i.name)===nameKey(x.item_name));return ref?'/images/items/'+ref.name.replace(/\s+/g,'_').replace(/,/g,'')+'_Icon.avif':x.icon_url||x.fallback_icon_url;},'item'));
        const summary=node('div','match-build-summary');summary.append(identity,loadout,items);decorateLoadout(row,detail,fact,current,summary);section.append(row);
      }
    }
    host.append(section);for(const ref of trendRows){const row=ref.deref();if(row?.isConnected && section.contains(row))void row.discoveryRefreshTrends();}
  }
  async function render(host, detail, current) {
    const {computeDamageStats,computeTeamAverages,storedProfileForMatch} = await loadLogic(); if(!current())return;
    const columns=[['generated.matches.player','Player'],['generated.matches.credits','Credits'],['common.metrics.cpm','CPM'],['common.metrics.ecpm','ECPM'],['common.metrics.kda','KDA'],['generated.matches.objective','Objective'],['generated.matches.damage','Damage'],['common.metrics.dpm','DPM'],['generated.matches.weapon','Weapon'],['common.metrics.wpm','WPM'],['generated.match.stats.abil','Ability'],['common.metrics.apm','APM'],['generated.matches.taken','Taken'],['generated.matches.shielding','Shielding'],['common.metrics.spm','SPM'],['generated.matches.healing','Healing'],['common.metrics.hpm','HPM'],['generated.match.stats.self','Self healing'],['common.metrics.afk','AFK']];
    const players=[1,2].flatMap(team=>detail.players.filter(p=>Number(p.task_force)===team));
    function values(player){const damage=computeDamageStats(player);return [fmt(player.gold_earned),fmt(player.gold_per_minute),fmt(player.egpm),fmt(player.kda),fmt(player.objective_assists),fmt(damage.totalDamage),fmt(player.damage_per_minute),fmt(damage.hasWeaponBreakdown?damage.weaponDamage:null),fmt(damage.weaponPerMinute),fmt(damage.nonWeaponDamage),fmt(damage.abilityPerMinute),fmt(player.damage_taken),fmt(player.damage_mitigated),fmt(player.mitigation_per_minute),fmt(player.healing),fmt(player.healing_per_minute),fmt(player.healing_self),activity(player.egpm)];}
    const statistics=panel(t('generated.matches.playerMetrics','Match statistics'));statistics.classList.add('match-detail-section','match-statistics');
    const groups=[{key:'discovery.match.totalMetrics',fallback:'Total metrics',indices:[0,1,4,5,6,8,10,12,13,15,17,18]},{key:'discovery.match.perMinuteMetrics',fallback:'Per-minute metrics',indices:[0,2,3,7,9,11,14,16]}];
    const desktop=node('div','match-statistics-table');for(const group of groups){const heading=node('h3','match-metric-heading');label(heading,group.key,group.fallback);desktop.append(heading);table(desktop,group.indices.map(i=>t(...columns[i])),players.map(player=>{const identity=node('div','match-stat-player');addIdentity(identity,player);const all=[identity,...values(player)];return group.indices.map(i=>all[i]);}));}statistics.append(desktop);
    const mobile=node('div','match-statistics-mobile');for(const team of [1,2]){const labelNode=node('h3','match-team-divider');label(labelNode,'generated.matches.team'+team,'Team '+team);mobile.append(labelNode);for(const player of players.filter(p=>Number(p.task_force)===team)){const card=node('article','match-stat-card'),identity=node('div','match-stat-player');addIdentity(identity,player);card.append(identity);const vals=values(player);for(const group of groups){const heading=node('h4','match-metric-heading');label(heading,group.key,group.fallback);card.append(heading);const list=node('dl','match-stat-grid');for(const i of group.indices.slice(1)){const [key,fallback]=columns[i],cell=node('div'),name=node('dt');label(name,key,fallback);cell.append(name,node('dd','',vals[i-1]));list.append(cell);}card.append(list);}mobile.append(card);}}statistics.append(mobile);host.append(statistics);
    const matchup=panel(t('generated.matches.playerMatchup','Player matchup'));matchup.classList.add('match-detail-section','match-matchup');const sorting=node('select','match-sort');sorting.setAttribute('aria-label',t('generated.matches.playerMatchup','Player matchup'));for(const [value,key,fallback] of [['player','generated.match.matchup.playerName','Player name'],['tier','generated.match.matchup.tier','Tier'],['tp','common.metrics.tp','TP'],['record','common.playerChampions.winsLosses','W / L']]){const option=node('option');option.value=value;label(option,key,fallback);sorting.append(option);}matchup.append(sorting);const result=node('div','match-matchup-teams');matchup.append(result);
    function record(labelKey,fallback,wins,losses,elo,eloKey){const row=node('div','match-record'),title=node('span','discovery-copy');label(title,labelKey,fallback);const value=wins!=null&&losses!=null?fmt(wins)+' / '+fmt(losses):'—';row.append(title,node('strong','',value));const rateValue=wins!=null&&losses!=null&&Number(wins)+Number(losses)>0?Number(wins)/(Number(wins)+Number(losses))*100:null;const bar=node('span','match-record-bar'),fill=node('span','match-record-fill');fill.style.width=(rateValue==null?50:Math.max(0,Math.min(100,rateValue)))+'%';bar.setAttribute('aria-hidden','true');bar.append(fill);row.append(bar,node('span','discovery-copy',rate(rateValue)));const eloLabel=node('span','discovery-copy');label(eloLabel,eloKey,'Elo');row.append(eloLabel,node('strong','',fmt(elo)));return row;}
    const draw=()=>{result.replaceChildren();for(const team of [1,2]){if(team===2){const divider=node('div','match-versus');label(divider,'generated.matches.vs','VS');result.append(divider);}const teamNode=node('div','match-matchup-team'),teamHeading=node('h3','match-team-heading');label(teamHeading,'generated.matches.team'+team,'Team '+team);teamNode.append(teamHeading);const enriched=players.filter(p=>Number(p.task_force)===team).map(player=>({matchData:player,profileData:storedProfileForMatch(player)}));const ordered=[...enriched].sort((a,b)=>sorting.value==='tier'?String(b.matchData.league_tier??'').localeCompare(String(a.matchData.league_tier??''),undefined,{numeric:true}):sorting.value==='tp'?(b.profileData?.kbmPoints??-1)-(a.profileData?.kbmPoints??-1):sorting.value==='record'?(b.profileData?.winRate??-1)-(a.profileData?.winRate??-1):String(a.matchData.player_name??'').localeCompare(String(b.matchData.player_name??'')));const cards=node('div','match-matchup-grid');for(const {matchData:player,profileData:profile} of ordered){const card=node('article','match-matchup-card'),identity=node('div','match-matchup-identity');addIdentity(identity,player);card.append(identity);const party=Number(player.party ?? player.party_number ?? 0);if(Number.isFinite(party)&&party>0){const badge=node('span','match-party',fmt(Math.trunc(party)));badge.title=App.message('common.party.queuedTogether',{number:Math.trunc(party)},'Queued together: {number}');badge.setAttribute('aria-label',App.message('common.party.label',{number:Math.trunc(party)},'Party {number}'));card.append(badge);}const rank=node('div','match-matchup-rank');rank.append(rankValue(player,profile));if(profile?.level!=null){const level=node('span','discovery-copy');label(level,'common.playerChampions.level','Lv. {level}',{level:fmt(profile.level)});rank.append(level);}if(profile?.kbmPoints!=null)rank.append(node('span','discovery-copy',fmt(profile.kbmPoints)+' '+t('common.metrics.tp','TP')));card.append(rank);const champion=profile?.topChampions?.find(c=>c.championName===player.champion_name);card.append(record('generated.matches.champion','Champion',champion?.wins,champion?champion.totalPlays-champion.wins:null,profile?.championElo,'common.metrics.championElo'),record('generated.matches.global','Global',profile?.globalWins,profile?.globalLosses,profile?.queueElo,'common.metrics.playerElo'));cards.append(card);}teamNode.append(cards);const averageTitle=node('h4','match-averages-title');label(averageTitle,'generated.matches.teamAverages','Team averages');teamNode.append(averageTitle);const averages=computeTeamAverages(enriched,App.formatNumber,rate),summary=node('dl','match-team-averages');for(const [key,fallback,value] of [['generated.matches.avgLevel','Avg level',averages.avgLevel],['generated.matches.avgWr','Avg win rate',averages.avgWinRate],['generated.matches.avgPlayerElo','Avg player Elo',averages.avgEloPlus],['generated.matches.avgKda','Avg KDA',averages.avgKDA]]){const pair=node('div'),name=node('dt');label(name,key,fallback);pair.append(name,node('dd','',value));summary.append(pair);}teamNode.append(summary);result.append(teamNode);}};
    sorting.addEventListener('change',draw);draw();host.append(matchup);
  }

  // Scope is part of the cache key: a different lobby range must never reuse a sample.
  const reads = new Map();
  function cached(key, loader, ttl = 300000) {
    const old = reads.get(key);
    if (old && Date.now() - old.time < ttl) return old.promise;
    const promise = Promise.resolve().then(loader).catch(error => { if (reads.get(key)?.promise === promise) reads.delete(key); throw error; });
    reads.set(key, {time:Date.now(),promise}); return promise;
  }
  const api = path => { const key = App.scopedPath(path); return cached(key, () => App.request(key)); };
  const reference = path => cached(path, async () => { const response = await fetch(path,{signal:AbortSignal.timeout(10000)}); if (!response.ok) throw Error('Reference unavailable'); return response.json(); }, 86400000);
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const nameKey = value => String(value || '').toLowerCase().replace(/[’']/g,'').replace(/guerrilla/g,'guerilla').replace(/[^a-z0-9]+/g,'');
  const cardKey = value => String(value || '').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\bguerrilla\b/g,'guerilla').replace(/\b([a-z0-9]{3,})s\b/g,'$1').replace(/\s+/g,'');
  const displayPercent = value => { if(value==null || !Number.isFinite(Number(value)))return null; const n=Number(value);return Math.abs(n)<=1?Number((n*100).toFixed(2)):n; };
  function normalizeCards(raw) { const unique=new Map();for(const card of Array.isArray(raw?.cards)?raw.cards:[]){const key=String(card.cardName ?? 'Unknown').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');const old=unique.get(key);if(!old || Number(card.totalPlays||0)>Number(old.totalPlays||0))unique.set(key,card);}return [...unique.values()]; }
  const label = (el,key,fallback,values) => App.setText(el,App.message(key,values,fallback));
  function scaled(description,level) {
    if (!description) return t('common.fallback.descriptionUnavailable','Description unavailable');
    return String(description).replace(/^\s*(?:\[[^\]]+\]\s*)+/, '').replace(/\{\s*(?:scale\s*=\s*)?(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\|\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\}/gi,(_,base,step)=>fmt(Number(base)+Number(step)*Math.max(0,level-1))).replace(/\{\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\}/g,(_,value)=>fmt(Number(value)));
  }
  function matching(rows,id,name,key = nameKey) { return (rows || []).find(row=>Number(row.id ?? row.itemId ?? row.cardId ?? row.talentId)===Number(id)) || (rows || []).find(row=>key(row.name ?? row.itemName ?? row.cardName ?? row.talentName) && key(row.name ?? row.itemName ?? row.cardName ?? row.talentName)===key(name)); }
  function itemMetric(item, rows, details) {
    const row = (rows || []).find(r=>Number(r.item_id)===Number(item.item_id)) || (rows || []).find(r=>nameKey(r.item_name) && nameKey(r.item_name)===nameKey(item.item_name));
    if (!row) return null;
    let breakdown = row.breakdown || [];
    const detail = details.get(Number(item.item_id));
    if (!breakdown.length && detail) breakdown = (detail.breakdown || []).map(x=>({...x,pick_rate:Number(detail.total_uses)>0 ? Number(row.pick_rate || 0)*Number(x.total_uses)/Number(detail.total_uses) : 0}));
    const entry = breakdown.find(x=>Number(x.slot)===Number(item.slot) && Number(x.item_level)===Number(item.item_level ?? 0));
    if (!entry) return null;
    return {winRate:entry.win_rate,pickRate:entry.pick_rate ?? (Number(row.total_uses ?? row.total_usage)>0 ? Number(row.pick_rate || 0)*Number(entry.total_uses)/Number(row.total_uses ?? row.total_usage) : 0),plays:entry.total_uses};
  }
  function entry(host, name, href, description, metric, usesKey, icon, qualifier) {
    const article = node('article','match-build-entry');
    if (icon && /^\/(?!\/)/.test(icon)) { const img=node('img','match-entry-icon'); img.src=icon; img.alt=''; img.loading='lazy'; img.width=36; img.height=36; article.append(img); }
    const content=node('div','match-entry-content'), header=node('div','match-entry-header');
    const title=node('a','browse-link',name);title.href=href;header.append(title);if(qualifier){const detail=node('span','match-entry-qualifier');label(detail,qualifier.key,qualifier.fallback,qualifier.values);header.append(detail);}content.append(header,node('p','discovery-copy',description));
    const metrics=node('p','discovery-copy match-entry-metrics');if(metric?.errorKey)label(metrics,metric.errorKey,metric.errorFallback);else if(!metric || [metric.winRate,metric.pickRate,metric.plays].some(value=>value==null || !Number.isFinite(Number(value))))label(metrics,'generated.matches.noRankedSampleInThisLobbyScope','No ranked sample in this lobby scope.');else {const wr=node('span','match-entry-rate'),pr=node('span','match-entry-rate'),wrLabel=node('span'),prLabel=node('span'),count=node('span');label(wrLabel,'generated.matches.wr','WR');label(prLabel,'generated.matches.pr','PR');wr.append(wrLabel,document.createTextNode(' '+rate(metric.winRate)));pr.append(prLabel,document.createTextNode(' '+rate(metric.pickRate)));const color=window.DiscoveryChampionCards?.metricColor; if(color){wr.style.color=color(metric.winRate)||'';pr.style.color=color(metric.pickRate)||'';}label(count,usesKey,usesKey==='common.count.uses'?'uses':usesKey==='generated.stats.plays.0effba4'?'plays':'picks');metrics.append(wr,document.createTextNode(' · '),pr,document.createTextNode(' · '+fmt(metric.plays)+' '),count);}content.append(metrics);article.append(content);host.append(article);
  }
  const openDetails = new Set(), trendRows = new Set();
  function bindCardTrends(row,player,fact,entries,current) {
    if(!entries.length || !window.DiscoveryChampionCards)return;
    const renderer=window.DiscoveryChampionCards,championId=Number(player.champion_id),talentId=Number(fact.talents?.[0]?.talent_id)||null;
    const cardPath='/stats/cards/'+championId+'?mode=ranked'+(talentId?'&talentId='+talentId:'');let sequence=0;
    const paint=rows=>{for(const {card,trends} of entries){const sample=matching(rows,card.card_id,card.card_name,cardKey),levels=Array.from({length:5},(_,i)=>renderer.cardMetricsAtLevel(sample,i+1)),level=Math.max(1,Math.min(5,Number(card.card_level)||1));trends.replaceChildren(renderer.renderCardLevelTrend(levels,'plays',level),renderer.renderCardLevelTrend(levels,'winRate',level));}};
    row.discoveryRefreshTrends=async()=>{const seq=++sequence,scope=App.scopedPath(cardPath);paint([]);try{const [payload]=await Promise.all([api(cardPath),renderer.loadCardPercentageColors()]);if(!current()||!row.isConnected||seq!==sequence||scope!==App.scopedPath(cardPath))return;if(!Array.isArray(payload?.cards)||(talentId && Number(payload.talentId)!==talentId))throw Error('Card metric filter mismatch');paint(normalizeCards(payload));}catch{if(current()&&row.isConnected&&seq===sequence&&scope===App.scopedPath(cardPath))paint([]);}};
    trendRows.add(new WeakRef(row));
  }
  for(const event of ['discovery:lobby-tier-changed','discovery:locale-changed']) document.addEventListener(event,()=>{for(const ref of openDetails){const disclosure=ref.deref();if(!disclosure?.isConnected){openDetails.delete(ref);continue;}if(disclosure.open)disclosure.discoveryRefresh();}for(const ref of trendRows){const row=ref.deref();if(!row?.isConnected){trendRows.delete(ref);continue;}row.discoveryRefreshTrends();}});
  function decorateLoadout(host, detail, fact, current, summaryContent) {
    const player = (detail.players || []).find(p=>Number(p.player_id)===Number(fact.player_id) && (Number(p.player_id)>0 || Number(p.private_player_id)===Number(fact.private_player_id)) && (!fact.champion_id || Number(p.champion_id)===Number(fact.champion_id)));
    const championId=Number(player?.champion_id ?? fact.champion_id), championName=player?.champion_name || fact.champion_name || '', championSlug=slug(championName);
    const talents=fact.talents || [], cards=fact.cards || [], items=fact.items || [];
    const disclosure=node('details','match-build-disclosure'), summary=node('summary','match-build-toggle');
    if(summaryContent)summary.append(summaryContent);else label(summary,'generated.matches.details','Details');
    const updateSummaryLabel=()=>summary.setAttribute('aria-label',App.t('generated.matches.value1ItemsAndLoadoutDetailsForValue2',{value1:disclosure.open?t('generated.matches.collapse','Collapse'):t('generated.matches.expand','Expand'),value2:player?.player_name || championName},'{value1} items and loadout details for {value2}'));updateSummaryLabel();const arrow=node('span','match-build-arrow'),icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','2');icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');icon.setAttribute('aria-hidden','true');path.setAttribute('d','m6 9 6 6 6-6');icon.append(path);arrow.append(icon);arrow.setAttribute('aria-hidden','true');summary.append(arrow);disclosure.append(summary);host.append(disclosure);
    let sequence=0;
    const weak=new WeakRef(disclosure);openDetails.add(weak);
    disclosure.discoveryRefresh=async()=>{
      const seq=++sequence;disclosure.querySelectorAll(':scope > div').forEach(el=>el.remove());if (!disclosure.open || !current()) return;
      const body=node('div','match-build-details'); disclosure.append(body); const loading=node('p','discovery-copy'); label(loading,'async.loading','Loading…'); body.append(loading);
      if (!(championId>0) || !championSlug || !(talents.length || cards.length || items.length)) { body.replaceChildren(); const empty=node('p','discovery-copy'); label(empty,'generated.matches.noTalentOrLoadoutCardsWereRecorded','No talent or loadout cards were recorded.'); body.append(empty); return; }
      const talentId=Number(talents[0]?.talent_id) || null;
      const itemPath='/stats/items?mode=ranked&limit=200&championId='+championId;
      const talentPath='/stats/talents/'+championId+'?mode=ranked';
      const cardPath='/stats/cards/'+championId+'?mode=ranked'+(talentId?'&talentId='+talentId:'');
      const scope=[itemPath,talentPath,cardPath].map(App.scopedPath).join('|');
      const valid=()=>seq===sequence && disclosure.open && host.isConnected && current() && App.currentPath().split(/[?#]/,1)[0]==='/matches/'+detail.match.match_id && scope===[itemPath,talentPath,cardPath].map(App.scopedPath).join('|');
      try {
        const [champions,activeItems,itemResult,talentResult,cardResult] = await Promise.all([
          reference('/data/champion-data.json?v=ultimate-slots-2').catch(()=>({})),reference('/data/paladins-active-items.json').catch(()=>({items:[]})),
          items.length?api(itemPath).catch(()=>null):Promise.resolve([]),talents.length?api(talentPath).catch(()=>null):Promise.resolve({talents:[]}),cards.length?api(cardPath).catch(()=>null):Promise.resolve({cards:[]}),window.DiscoveryChampionCards?.loadCardPercentageColors().catch(()=>null)
        ]);
        if (!valid()) return;
        const itemRows=Array.isArray(itemResult)?itemResult:[], missing=itemResult?[...new Set(items.filter(item=>!((itemRows.find(row=>Number(row.item_id)===Number(item.item_id))?.breakdown || []).length)).map(item=>Number(item.item_id)).filter(id=>id>0))]:[];
        const details=new Map(await Promise.all(missing.map(async id=>[id,await api('/stats/items/'+id+'?mode=ranked&championId='+championId).catch(()=>null)])));
        if (!valid()) return;
        const champion=champions[championSlug] || {}, target='/stats/loadouts/'+championSlug, returnTo='/matches/'+detail.match.match_id, suffix='returnTo='+encodeURIComponent(returnTo);
        body.replaceChildren(); const header=node('div','match-build-details-header'),title=node('h3');label(title,'generated.matches.rankedPerformance','Ranked performance');header.append(title);body.append(header);
        const tier=window.DiscoveryLobbyTier, filter=tier?.getStoredLobbyTierFilter(), definition=tier?.LOBBY_TIER_FILTERS?.[filter]; if (definition) {const scopeLabel=node('p','discovery-copy');label(scopeLabel,definition.labelKey,'All');header.append(scopeLabel);}
        const grid=node('div','match-build-details-grid'),loadoutSection=node('section','match-build-detail-column'),itemSection=node('section','match-build-detail-column'),loadoutTitle=node('h3');label(loadoutTitle,'generated.matches.talentLoadoutCards','Talent and loadout cards');loadoutSection.append(loadoutTitle);grid.append(loadoutSection,itemSection);body.append(grid);const explain=node('p','discovery-copy'); if(talentId){explain.append(document.createTextNode(t('generated.matches.cardMetricsAreFilteredBy','Card metrics are filtered by')+' '+(talents[0].talent_name || '')+' '+t('generated.matches.andUseEachRecordedCardLevel','and use each recorded card level')));} else label(explain,'generated.matches.noSelectedTalentWasRecordedCardMetricsIncludeAllTalents','No selected talent was recorded. Card metrics include all talents.'); loadoutSection.append(explain);
        for(const talent of talents){const ref=matching(champion.talents,talent.talent_id,talent.talent_name), sample=matching(talentResult?.talents,talent.talent_id,talent.talent_name); const plays=Number(sample?.totalPlays); const metric=!talentResult?{errorKey:'generated.champions.talentStatisticsUnavailable',errorFallback:'Talent statistics unavailable'}:sample?{winRate:displayPercent(sample.winRate),pickRate:plays/Math.max(1,Number(talentResult.totalMatches)||0)*100,plays}:null; const name=talent.talent_name || ref?.name || String(talent.talent_id); const desc=ref?.description && App.t('champions.'+championSlug+'.talents.'+slug(ref.name)+'.description',undefined,ref.description); entry(loadoutSection,name,target+'?talentId='+talent.talent_id+'&'+suffix,scaled(desc,1),metric,'generated.stats.plays.0effba4',ref?.iconUrl || talent.icon_url || talent.fallback_icon_url,{key:'generated.matches.talent',fallback:'Talent'});}
        for(const card of cards){const ref=matching(champion.loadouts,card.card_id,card.card_name,cardKey),level=Math.max(1,Number(card.card_level)||1),name=card.card_name || ref?.name || String(card.card_id),sample=matching(normalizeCards(cardResult),card.card_id,card.card_name,cardKey),levelSample=sample?.levels?.find(row=>Number(row.level)===level),plays=Number(levelSample?.plays),metric=!cardResult?{errorKey:'generated.champions.cardStatisticsUnavailable',errorFallback:'Card statistics unavailable'}:levelSample?{winRate:displayPercent(levelSample.winRate),pickRate:plays/Math.max(1,Number(cardResult.totalMatches)||0)*100,plays}:null;const desc=ref?.description && App.t('champions.'+championSlug+'.loadouts.'+slug(ref.name)+'.description',undefined,ref.description);entry(loadoutSection,name,target+'/cards/'+card.card_id+'?'+(talentId?'talentId='+talentId+'&':'')+suffix,scaled(desc,level),metric,'common.count.picks',ref?.iconUrl || card.icon_url || card.fallback_icon_url,{key:'common.match.cardLevel',fallback:'Card · level {level}',values:{level}});}
        if(!talents.length && !cards.length){const empty=node('p','discovery-copy');label(empty,'generated.matches.noTalentOrLoadoutCardsWereRecorded','No talent or loadout cards were recorded.');loadoutSection.append(empty);}const itemTitle=node('h3');label(itemTitle,'generated.matches.purchasedItems','Purchased items');itemSection.append(itemTitle);
        for(const item of items){const ref=(activeItems.items || []).find(row=>nameKey(row.name)===nameKey(item.item_name)),level=Math.max(1,Number(item.item_level ?? 0)+1),name=item.item_name || ref?.name || String(item.item_id),description=ref?.tiers?.find(tier=>Number(tier.level)===Math.max(1,Math.min(3,Math.round(level))))?.description || item.description,icon=ref?'/images/items/'+ref.name.replace(/\s+/g,'_').replace(/,/g,'')+'_Icon.avif':item.icon_url || item.fallback_icon_url;entry(itemSection,name,'/game/items/'+item.item_id+'?'+suffix,scaled(description,ref?1:level),itemResult?itemMetric(item,itemRows,details):{errorKey:'generated.stats.itemStatsUnavailable',errorFallback:'Item stats unavailable.'},'common.count.uses',icon,{key:'common.match.itemSlotLevel',fallback:'Item · slot {slot} · level {level}',values:{slot:item.slot,level}});}if(!items.length){const empty=node('p','discovery-copy');label(empty,'generated.matches.noPurchasedItemsWereRecorded','No purchased items were recorded.');itemSection.append(empty);}
      } catch(error) {if(valid()){body.replaceChildren();const message=node('p','discovery-copy');label(message,'generated.champions.cardStatisticsUnavailable','Card statistics unavailable');body.append(message);}}
    };
    disclosure.addEventListener('toggle',()=>{updateSummaryLabel();void disclosure.discoveryRefresh();});
  }
  function decorateScoreboard(host, match, current, detail, access) {
    const flags=node('p','discovery-copy');const statuses=[[match.is_ranked,'generated.matches.ranked','Ranked'],[!match.is_ranked && (match.is_custom || match.stats_scope==='custom' || match.participant_model==='custom'),'generated.operations.projectsCustom','Custom'],[!match.is_ranked && !(match.is_custom || match.stats_scope==='custom' || match.participant_model==='custom'),'generated.matches.casual','Casual'],[match.limited,'generated.matches.limited','Limited'],[match.broken && !match.recovered && !match.limited,'generated.matches.broken','Broken'],[match.recovered,'generated.matches.recovered','Recovered'],[match.private,'generated.matches.private','Private']];for(const [show,key,fallback] of statuses){if(!show)continue;if(flags.childNodes.length)flags.append(document.createTextNode(' · '));const span=node('span');label(span,key,fallback);flags.append(span);}if(match.limited_reason)flags.title=match.limited_reason;host.append(flags);
    void loadLogic().then(({computeDamageStats,storedProfileForMatch})=>{if(!current() || !host.isConnected)return;const players=detail?.players || [];for(const team of [1,2]){const rows=players.filter(p=>Number(p.task_force ?? (Number(p.team_id)+1))===team).slice(0,5);if(!rows.length)continue;const section=panel(t('generated.matches.team'+team,'Team '+team));const sum=key=>rows.reduce((total,p)=>total+(Number.isFinite(Number(p[key]))?Number(p[key]):0),0);table(section,[t('generated.matches.player','Player'),t('generated.matches.party','Party'),t('generated.match.matchup.tier','Tier'),t('generated.matches.level','Level'),t('common.metrics.playerElo','Player Elo')],rows.map(p=>{const profile=access?.fullDetails?storedProfileForMatch(p):null, party=Number(p.party ?? p.party_number ?? 0);return [playerLink(p),Number.isFinite(party)&&party>0?fmt(Math.trunc(party)):'—',rankValue(p,profile),fmt(profile?.level),fmt(profile?.queueElo)];}));const total=node('dl','players-metrics');for(const [key,fallback,value] of [['generated.matches.totalCredits','Total credits',sum('gold_earned')],['generated.matches.teamKDA','Team KDA',[sum('kills'),sum('deaths'),sum('assists')].map(fmt).join(' / ')],['generated.matches.totalObjectiveTime','Total objective time',sum('objective_assists')],['generated.matches.totalDamage','Total damage',rows.reduce((n,p)=>n+computeDamageStats(p).totalDamage,0)],['generated.matches.totalDamageTaken','Total damage taken',sum('damage_taken')],['generated.matches.totalShielding','Total shielding',sum('damage_mitigated')],['generated.matches.totalHealing','Total healing',sum('healing')]]){const pair=node('div'),name=node('dt');label(name,key,fallback);pair.append(name,node('dd','',typeof value==='string'?value:fmt(value)));total.append(pair);}section.append(total);host.append(section);}}).catch(()=>{});
    const button=node('button','browse-link');button.type='button';label(button,'generated.matches.saveImage','Save image');const status=node('span','discovery-copy');status.setAttribute('role','status');host.before(button,status);
    button.addEventListener('click',async()=>{button.disabled=true;status.textContent='';try{await import('./discovery-community-export.js?v=1');if(!window.htmlToImage?.toPng)throw Error('Export unavailable');await document.fonts.ready;const data=await window.htmlToImage.toPng(host,{pixelRatio:2,cacheBust:false,filter:element=>element.tagName!=='BUTTON'});if(!current())return;if(!data.startsWith('data:image/png;base64,'))throw Error('Invalid PNG');const link=node('a','browse-link');label(link,'generated.matches.saveImage','Save image');link.href=data;link.download='paladinscat-match-'+match.match_id+'.png';status.replaceChildren(document.createTextNode('PNG · '),link);status.dataset.pngReady='true';link.click();}catch(error){console.warn('Match image export failed',error);if(current())label(status,'generated.components.matchResult.matchExportButton.couldNotSaveMatchImage','Could not save the match image');}finally{button.disabled=false;}});
  }
  window.DiscoveryMatchFeatures = {access,prepare,renderLoadouts,render,decorateLoadout,decorateScoreboard};
})();
