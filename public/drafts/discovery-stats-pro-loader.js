/* Register the Pro layouts before legacy routes; fetch their bundle only when opened. */
(() => {
  'use strict';
  const app=window.DiscoveryApp;if(!app)return;
  const pages={tiers:['stats-tiers','stats.tiers.title','Rank distribution'],performance:['stats-performance','menu.performanceOverview','Performance'],skins:['stats-skins','menu.skinStats','Skins'],compositions:['stats-compositions','menu.teamCompositions','Team compositions'],ecpm:['stats-ecpm','generated.stats.effectiveCreditsPerMinute','Effective credits'],winrate:['stats-winRate','common.sort.winRate','Win rate'],banrate:['stats-banRate','common.metrics.banRate','Ban rate'],champions:['analytics-matchups','stats.matchups.title','Ranked champion matchups'],loadouts:['analytics-loadouts','stats.loadouts.title','Ranked card statistics']};
  let pending;
  function load(){return pending ||= import('./discovery-stats-pro.js?v=4').catch(error=>{pending=null;throw error;});}
  let tierMountPending=false;
  function mountLeaderboardTiers(){
    const host=document.querySelector('[data-leaderboard-tier-host]');
    if(!host||host.dataset.mounted==='true'||tierMountPending)return;
    tierMountPending=true;host.setAttribute('aria-busy','true');
    const loading=document.createElement('p');loading.className='stats-copy';loading.setAttribute('role','status');loading.textContent=app.t('async.loading',undefined,'Loading…');host.replaceChildren(loading);
    load().then(()=>{if(!host.isConnected)return;host.replaceChildren();window.DiscoveryStatsPro.mountTierDistribution(host);host.dataset.mounted='true';host.removeAttribute('aria-busy');}).catch(()=>{host.removeAttribute('aria-busy');const message=document.createElement('p'),retry=document.createElement('button');message.className='stats-copy';message.textContent=app.t('async.couldNotLoad',undefined,'This section could not be loaded.');retry.className='reference-filter';retry.type='button';retry.textContent=app.t('async.tryAgain',undefined,'Try again');retry.addEventListener('click',mountLeaderboardTiers);host.replaceChildren(message,retry);}).finally(()=>{tierMountPending=false;});
  }
  window.DiscoveryStatsProLoader={mountLeaderboardTiers};
  function open(kind,path){
    if(window.DiscoveryStatsPro){window.DiscoveryStatsPro.open(kind,path);return;}
    const [view,key,fallback]=pages[kind],host=app.createPage(view,app.t(key,undefined,fallback),'Stats');host.classList.add('stats-page');host.classList.remove('discovery-page');host.setAttribute('aria-busy','true');
    const loading=document.createElement('p');loading.className='stats-copy';loading.setAttribute('role','status');loading.textContent=app.t('async.loading',undefined,'Loading…');host.replaceChildren(loading);app.open(view);
    load().then(()=>{if(app.currentPath()===path)window.DiscoveryStatsPro.open(kind,path);}).catch(()=>{if(app.currentPath()!==path)return;host.removeAttribute('aria-busy');const message=document.createElement('p'),retry=document.createElement('button');message.className='stats-copy';message.textContent=app.t('async.couldNotLoad',undefined,'This section could not be loaded.');retry.className='reference-filter';retry.type='button';retry.textContent=app.t('async.tryAgain',undefined,'Try again');retry.addEventListener('click',()=>open(kind,path));host.replaceChildren(message,retry);});
  }
  for(const kind of Object.keys(pages))app.registerRoute('/stats/'+kind,path=>open(kind,path));
  if(document.querySelector('.dashboard-shell')?.dataset.view==='leaderboard')mountLeaderboardTiers();
  window.addEventListener('pageshow',()=>{if(document.querySelector('.dashboard-shell')?.dataset.view==='leaderboard')mountLeaderboardTiers();});
})();
