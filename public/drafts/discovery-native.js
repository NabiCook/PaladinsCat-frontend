/* Adapters for existing views and real homepage summaries. */
(() => {
  'use strict';
  const A=window.DiscoveryApp;if(!A)return;
  const native=(kind,name,section,detailId)=>document.dispatchEvent(new CustomEvent('discovery:native-route',{detail:{kind,name,section,detailId}}));
  A.registerRoute('/champions',()=>native('champions'));
  A.registerRoute(/^\/champions\/([a-z0-9-]+)(?:\/(cards|talents)\/([1-9]\d*))?$/,(path,m)=>native('champions',m[1],m[2],m[3]));
  for(const path of ['/game/maps','/stats/maps'])A.registerRoute(path,()=>native('maps'));
  A.registerRoute(/^\/(?:game|stats)\/maps\/([^/]+)$/,(path,m)=>native('maps',decodeURIComponent(m[1])));
  for(const path of ['/game/items','/stats/items'])A.registerRoute(path,()=>native('items'));
  A.registerRoute(/^\/(?:game|stats)\/items\/([1-9]\d*)$/,(path,m)=>native('items',null,null,m[1]));
  A.registerRoute('/game/compositions',()=>A.navigate('/stats/compositions'));
  const n=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;A.setText(el,text);return el;};
  const text=(key,fallback,values)=>A.message(key,values,fallback);
  const fmt=value=>value!=null&&value!==''&&Number.isFinite(Number(value))?A.formatNumber(Number(value)):'—';
  const attribute=(element,name,value)=>value?.discoveryMessage?window.DiscoveryLocale.bind(element,value.key,value.fallback,name,value.values,true):element.setAttribute(name,value);
  const numberText=(element,value)=>{if(!element)return;element.dataset.nativeNumber=value==null?"":String(value);A.setText(element,fmt(value));};
  let observation=null;
  function observationLabel(){const label=document.querySelector(".activity-title > div > span");if(!label||!observation)return;A.setText(label,text("discovery.home.window","{hours}-hour observation window",{hours:fmt(observation.window_hours)}));attribute(label,"title",text("moderation.lastObserved","Observed at {value1}",{value1:A.formatDate(observation.observed_at)}));}
  document.addEventListener("discovery:locale-changed",()=>{for(const element of document.querySelectorAll("[data-native-number]"))numberText(element,element.dataset.nativeNumber);observationLabel();});
  window.addEventListener("paladinscat:time-zone-change",observationLabel);
  async function homeActivity(){
    const panel=document.querySelector('.activity-strip');if(!panel)return;
    const metrics=panel.querySelectorAll('.activity-metric'),windowLabel=panel.querySelector('.activity-title > div > span'),chart=panel.querySelector('.activity-chart');
    if(windowLabel)A.setText(windowLabel,text('discovery.home.last24Hours','Last 24 hours'));
    panel.querySelectorAll('.change').forEach(el=>el.remove());
    metrics.forEach(el=>{const value=el.querySelector('strong');if(value)value.textContent='…';});
    if(chart){chart.removeAttribute('role');chart.removeAttribute('aria-label');chart.replaceChildren();const action=n('button','reference-filter',text("discovery.home.activity","View activity"));action.type='button';action.addEventListener('click',()=>A.navigate('/stats/activity'));chart.append(action);}
    try{const [presence,overview]=await Promise.all([A.request('/stats/presence?view=activity-v4'),A.request('/matches/overview?view=activity-v3')]);
      if(metrics[0]){A.setText(metrics[0].querySelector('.metric-label'),text('discovery.home.publicPlayers','Observed public players'));numberText(metrics[0].querySelector('strong'),presence.public_players);}
      if(metrics[1]){A.setText(metrics[1].querySelector('.metric-label'),text('discovery.home.matchesPlayed','Matches played'));numberText(metrics[1].querySelector('strong'),overview.hourly?.allQueuesTotal24h);}
      observation=presence;observationLabel();
    }catch{metrics.forEach(el=>{const value=el.querySelector('strong');if(value)value.textContent='—';});}
  }
  void homeActivity();
})();
