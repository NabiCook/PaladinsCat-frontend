/* Missing stats destinations; metric contracts from champion-matchups-api.ts and ChampionLoadoutStats. */
(() => {
  'use strict';
  const A=window.DiscoveryApp;if(!A)return;const cache=new Map();let rosterPromise;
  const n=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;A.setText(el,text);return el;};
  const numeric=v=>v!=null&&v!==''&&Number.isFinite(Number(v));
  const text=(key,fallback,values)=>A.message(key,values,fallback);
  const attribute=(element,name,value)=>value?.discoveryMessage?window.DiscoveryLocale.bind(element,value.key,value.fallback,name,value.values,true):element.setAttribute(name,value);
  const roleLabel=value=>value==='All'?text('generated.stats.all',value):text('common.roles.'+String(value).toLowerCase(),value);
  const fmt=v=>numeric(v)?A.formatNumber(Number(v)):'—';
  const percent=v=>numeric(v)?{discoveryPercent:true,numeric:Number(v),toString:()=>A.formatNumber(Number(v),{minimumFractionDigits:2,maximumFractionDigits:2})+'%'}:'—';
  function button(text,action){const el=n('button','reference-filter',text);el.type='button';el.addEventListener('click',action);return el;}
  function link(text,path){const el=n('a','browse-link',text);el.href=path;return el;}
  function state(host,copy,retry){host.replaceChildren(n('p','discovery-copy',copy));if(retry)host.append(button(text('async.tryAgain','Try again'),retry));}
  async function roster(){if(!rosterPromise)rosterPromise=Promise.all(['/data/champion-data.json','/drafts/champion-titles.json?v=card-ids-1'].map(async path=>{const r=await fetch(path,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Champion reference unavailable');return r.json();})).then(([data,ids])=>Object.entries(data).map(([slug,c])=>({...c,slug,id:Number(ids.championIds[slug])})).sort((a,b)=>a.name.localeCompare(b.name))).catch(e=>{rosterPromise=null;throw e;});return rosterPromise;}
  async function read(path,refresh=false){path=A.scopedPath(path);if(refresh)cache.delete(path);if(!cache.has(path))cache.set(path,A.request(path).catch(e=>{cache.delete(path);throw e;}));return cache.get(path);}
  function table(host,columns,rows){const wrap=n('div','discovery-table-wrap');wrap.tabIndex=0;const t=n('table','discovery-table'),head=n('thead'),header=n('tr');columns.forEach(text=>{const cell=n('th','',text);cell.scope='col';header.append(cell);});head.append(header);const body=n('tbody');rows.forEach(values=>{const row=n('tr');values.forEach(value=>{const cell=n('td');if(value instanceof Node)cell.append(value);else {A.setText(cell,value??'—');if(value?.discoveryPercent){cell.dataset.percentageValue=String(value.numeric);cell.dataset.percentageDirection='high-is-good';}} row.append(cell);});body.append(row);});t.append(head,body);wrap.append(t);host.append(wrap);}
  function heading(host,title){host.replaceChildren(n('h1','',title));}
  function field(label,options,value,action){const wrapper=n('label','discovery-field',label),select=n('select');attribute(select,'aria-label',label);options.forEach(([v,text])=>{const option=n('option','',text);option.value=v;select.append(option);});select.value=value;select.addEventListener('change',()=>action(select.value));wrapper.append(select);return wrapper;}
  function currentMatchupRows(rows,champion,champions){
    const ownTalents=new Set(champion.talents.map(talent=>Number(talent.id)));
    const opponents=new Map(champions.filter(entry=>entry.id!==champion.id).map(entry=>[entry.id,entry]));
    return rows.flatMap(row=>{
      if(!ownTalents.has(Number(row.champion_talent_id)))return [];
      const opponent=opponents.get(Number(row.opponent_champion_id));
      const talent=opponent?.talents.find(entry=>Number(entry.id)===Number(row.opponent_talent_id));
      return talent?[{...row,opponent_champion_name:opponent.name,opponent_talent_name:talent.name}]:[];
    });
  }
  function aggregateMatchupRelationships(rows){
    const opponents=new Map();
    for(const row of rows){
      if(![row.wins,row.losses,row.samples].every(value=>numeric(value)&&Number(value)>=0))throw Error('Invalid matchup counts.');
      const id=Number(row.opponent_champion_id),entry=opponents.get(id)||{id,name:row.opponent_champion_name,wins:0,losses:0,encounters:0};
      entry.wins+=Number(row.wins);entry.losses+=Number(row.losses);entry.encounters+=Number(row.samples);opponents.set(id,entry);
    }
    return [...opponents.values()].map(row=>({...row,winRate:row.encounters>0?100*row.wins/row.encounters:null}));
  }
  function currentTalentSummaries(raw,champion){
    if(!numeric(raw?.totalMatches)||Number(raw.totalMatches)<0||!Array.isArray(raw?.talents))throw Error('Invalid talent statistics.');
    return champion.talents.map(talent=>{
      const row=raw.talents.find(entry=>Number(entry.talentId)===Number(talent.id));
      if(!row)return{id:Number(talent.id),name:talent.name,plays:null,wins:null,losses:null,winRate:null,pickRate:null};
      if(![row.totalPlays,row.wins,row.losses].every(value=>numeric(value)&&Number(value)>=0))throw Error('Invalid talent counts.');
      const plays=Number(row.totalPlays);
      return{id:Number(talent.id),name:talent.name,plays,wins:Number(row.wins),losses:Number(row.losses),winRate:cardPercent(row.winRate),pickRate:Number(raw.totalMatches)>0?100*plays/Number(raw.totalMatches):null};
    });
  }
  // Keep the same ratio/percentage normalization as lib/api-client.ts.
  function cardPercent(value){if(!numeric(value))return null;const parsed=Number(value);return Math.abs(parsed)<=1?Number((parsed*100).toFixed(2)):parsed;}
  function normalizeCardDetail(raw,champion,cardId,talentId){
    if(Number(raw?.cardId)!==cardId||Number(raw?.championId)!==champion.id||raw?.mode!=='ranked'||!Array.isArray(raw.levels)||!Array.isArray(raw.talents))throw Error('Invalid card statistics response.');
    if((raw.talentId==null?null:Number(raw.talentId))!==talentId)throw Error('Card statistics do not match the selected talent.');
    const count=value=>numeric(value)?Number(value):null;
    const metrics=row=>({plays:count(row?.plays??row?.totalPlays),wins:count(row?.wins),losses:count(row?.losses),winRate:cardPercent(row?.winRate)});
    return {cardId,cardName:String(raw.cardName||text('generated.builds.cardValue1','Card {value1}',{value1:A.formatNumber(cardId)})),...metrics(raw),
      levels:Array.from({length:5},(_,index)=>{const level=index+1;return{level,...metrics(raw.levels.find(row=>Number(row.level)===level))};}),
      talents:champion.talents.map(talent=>({id:Number(talent.id),name:talent.name,...metrics(raw.talents.find(row=>Number(row.talentId)===Number(talent.id)))}))};
  }
  function cardDescription(description,level=1){
    if(!description)return '';
    return String(description).replace(/^\s*(?:\[[^\]]+\]\s*)+/,'').replace(/\{\s*(?:scale\s*=\s*)?(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\|\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\}/gi,(_match,base,increase)=>fmt(Number(base)+Number(increase)*Math.max(0,level-1))).replace(/\{\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\}/g,(_match,value)=>fmt(Number(value)));
  }
  function cardDescriptionNode(champion,card,level=1){
    const output=n('span'),slug=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    output.dataset.analyticsCardDescription=JSON.stringify({key:'champions.'+slug(champion.name)+'.loadouts.'+slug(card.name)+'.description',fallback:card.description,level});
    updateCardDescription(output);return output;
  }
  function updateCardDescription(node){
    const {key,fallback,level}=JSON.parse(node.dataset.analyticsCardDescription);
    node.textContent=cardDescription(A.t(key,undefined,fallback),level);
  }
  document.addEventListener('discovery:locale-changed',()=>document.querySelectorAll('[data-analytics-card-description]').forEach(updateCardDescription));
  async function cardDetail(path,match){
    const slug=match[1],cardId=Number(match[2]),view='analytics-card-'+slug+'-'+cardId,host=A.createPage(view,text("discovery.analytics.cardStatistics","Card statistics"),'Stats');
    const url=new URL(path,location.origin),requested=url.searchParams.get('talentId');
    const talentId=requested==null?null:Number(requested),base='/stats/loadouts/'+slug+'/cards/'+cardId;
    heading(host,text("discovery.analytics.cardStatistics","Card statistics"),'/stats/loadouts/'+slug+(talentId?'?talentId='+talentId:''));
    const body=n('div');host.append(body);A.open(view);state(body,text("async.loading","Loading card statistics…"));
    const current=()=>body.isConnected&&A.currentPath()===path;
    try{
      const champion=(await roster()).find(entry=>entry.slug===slug);if(!current())return;
      if(!champion)throw Error('Champion not found.');
      if(requested!=null&&(!Number.isSafeInteger(talentId)||!champion.talents.some(talent=>Number(talent.id)===talentId)))throw Error('Select a current talent for this champion.');
      const destination=id=>base+(id?'?talentId='+id:'');
      const controls=n('div','discovery-toolbar'),output=n('div');body.replaceChildren(controls,output);
      controls.append(field(text("generated.champions.talent","Talent"),[['0',text("discovery.choice.allTalents","All talents")],...champion.talents.map(talent=>[String(talent.id),talent.name])],String(talentId??0),value=>A.navigate(destination(Number(value)))));
      let sequence=0;
      async function load(refresh=false){
        const seq=++sequence;state(output,text("async.loading","Loading card statistics…"));output.setAttribute('aria-busy','true');
        try{
          const raw=await read('/stats/cards/'+champion.id+'/'+cardId+'?mode=ranked'+(talentId?'&talentId='+talentId:''),refresh);
          if(seq!==sequence||!current())return;
          const detail=normalizeCardDetail(raw,champion,cardId,talentId),key=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
          const meta=(champion.loadouts||[]).find(card=>Number(card.id)===cardId)||(champion.loadouts||[]).find(card=>key(card.name)===key(detail.cardName));
          const title=text('discovery.analytics.cardTitle','{champion} · {card} · Ranked',{champion:champion.name,card:detail.cardName});A.setText(host.querySelector('h1'),title);document.title=String(title)+' · PaladinsCat';
          output.replaceChildren();const summary=n('section','discovery-panel');
          if(meta?.iconUrl){const image=n('img');image.src=meta.iconUrl;image.alt=detail.cardName;image.width=220;image.height=165;image.loading='lazy';image.style.maxWidth='100%';image.style.objectFit='contain';summary.append(image);}
          if(meta?.description){const description=n('p','discovery-copy');description.append(cardDescriptionNode(champion,meta));summary.append(description);}
          const rate=row=>Number(row.plays)>0?percent(row.winRate):'—';
          table(summary,[text("generated.stats.plays","Plays"),text("generated.stats.winRate","Win rate"),text("generated.champions.wins","Wins"),text("generated.champions.losses","Losses")],[[fmt(detail.plays),rate(detail),fmt(detail.wins),fmt(detail.losses)]]);
          summary.append(link(text('discovery.analytics.cardReference','Champion card reference'),'/champions/'+slug+'/cards/'+cardId));output.append(summary);
          const talents=n('section','discovery-panel');talents.append(n('h2','',text("generated.champions.talentPairings","Talent pairings")));
          table(talents,[text("generated.champions.talent","Talent"),text("generated.stats.plays","Plays"),text("generated.champions.wins","Wins"),text("generated.champions.losses","Losses"),text("generated.stats.winRate","Win rate")],detail.talents.map(talent=>[link(talent.name+(talent.id===talentId?' · '+String(text('generated.builds.selected','Selected')):''),destination(talent.id)),fmt(talent.plays),fmt(talent.wins),fmt(talent.losses),rate(talent)]));output.append(talents);
          const levels=n('section','discovery-panel');levels.append(n('h2','',text("generated.champions.levelBreakdown","Level breakdown")));
          table(levels,[text("generated.stats.level","Level"),text("generated.stats.plays","Plays"),text("generated.champions.wins","Wins"),text("generated.champions.losses","Losses"),text("generated.stats.winRate","Win rate"),...(meta?.description?[text("discovery.analytics.effect","Effect")]:[])],detail.levels.map(level=>[fmt(level.level),fmt(level.plays),fmt(level.wins),fmt(level.losses),rate(level),...(meta?.description?[cardDescriptionNode(champion,meta,level.level)]:[])]));
          output.append(levels);
        }catch(error){if(seq===sequence&&current())state(output,text('async.couldNotLoad','This section could not be loaded.'),()=>load(true));}
        finally{if(seq===sequence&&current())output.setAttribute('aria-busy','false');}
      }
      controls.append(button(text("generated.players.refresh","Refresh"),()=>load(true)));void load();
    }catch(error){if(current())state(body,text('async.couldNotLoad','This section could not be loaded.'),()=>cardDetail(path,match));}
  }
  async function directory(kind){const view='analytics-'+kind,host=A.createPage(view,text(kind==='matchups'?'stats.matchups.title':'stats.loadouts.title',kind==='matchups'?'Ranked champion matchups':'Ranked card statistics'),'Stats');heading(host,text(kind==='matchups'?'stats.matchups.title':'stats.loadouts.title',kind==='matchups'?'Ranked champion matchups':'Ranked card statistics'));const output=n('div');host.append(output);A.open(view);state(output,text("async.loading","Loading champions…"));try{const champions=await roster();output.replaceChildren();let role='All',query='';const controls=n('div','discovery-toolbar');const grid=n('div','browse-card-grid');const search=n('input');search.type='search';attribute(search,'placeholder',text('playerTrends.search','Search champions')); attribute(search,'aria-label',text("playerTrends.search","Search champions"));const lab=n('label','discovery-field',text("playerTrends.search","Search champions"));lab.append(search);const draw=()=>{grid.replaceChildren(...champions.filter(c=>(role==='All'||c.roles.includes(role))&&c.name.toLowerCase().includes(query.toLowerCase())).map(c=>{const card=link(c.name,kind==='matchups'?'/stats/champions/'+c.slug:'/stats/loadouts/'+c.slug);card.className='discovery-panel analytics-champion';card.append(n('span','discovery-copy',roleLabel(c.roles[0])));return card;}));};controls.append(A.roleFilter(text("generated.stats.role","Role"),['All','Frontline','Damage','Flank','Support'].map(v=>[v,roleLabel(v)]),role,v=>{role=v;draw();}),lab);search.addEventListener('input',()=>{query=search.value;draw();});output.append(controls,grid);draw();}catch(e){state(output,text('async.couldNotLoad','This section could not be loaded.'),()=>directory(kind));}}
  async function detail(kind,path,match){
    const slug=match[1],view='analytics-'+kind+'-'+slug,title=kind==='matchups'?text('stats.matchups.title','Ranked champion matchups'):text('stats.loadouts.title','Ranked card statistics');
    const host=A.createPage(view,title,'Stats');heading(host,title);const body=n('div');host.append(body);A.open(view);state(body,text('async.loading','Loading'));
    const current=()=>body.isConnected&&A.currentPath()===path;
    try{
      const champions=await roster(),champion=champions.find(entry=>entry.slug===slug);if(!current())return;
      if(!champion)throw Error('Champion not found.');
      const recordTitle=text(kind==='matchups'?'discovery.analytics.matchupsChampionTitle':'discovery.analytics.loadoutsChampionTitle',kind==='matchups'?'{champion} · Ranked champion matchups':'{champion} · Ranked card statistics',{champion:champion.name});A.setText(host.querySelector('h1'),recordTitle);document.title=String(recordTitle)+' · PaladinsCat';
      const selected=new URL(path,location.origin).searchParams.get('talentId');
      let talent=champion.talents.some(entry=>String(entry.id)===selected)?selected:'0',sort='plays',opponentQuery='',opponentRole='All',matchupRows=null;
      const controls=n('div','discovery-toolbar'),output=n('div'),identities=new Map(champions.map(entry=>[entry.id,entry]));body.replaceChildren(controls,output);
      const talentField=field(text('stats.matchups.talent','Selected talent'),[['0',text('stats.matchups.allTalents','Global · all talents')],...champion.talents.map(entry=>[String(entry.id),entry.name])],talent,value=>{talent=value;void load();});
      controls.append(talentField,field(text('generated.players.sortBy','Sort by'),kind==='matchups'?[['plays',text('stats.matchups.samples','Encounters')],['rate',text('generated.champions.winRate','Win rate')]]:[['plays',text('common.sort.totalPlays','Total Plays')],['rate',text('generated.champions.winRate','Win rate')],['name',text('generated.matches.card','Card')]],sort,value=>{sort=value;void load();}));
      if(kind==='matchups'){
        const label=text('stats.matchups.search','Search opponents'),search=n('input'),wrapper=n('label','discovery-field',label);search.type='search';attribute(search,'aria-label',label);wrapper.append(search);search.addEventListener('input',()=>{opponentQuery=search.value;drawMatchups();});
        const roles=[['All',text('generated.stats.all','All')],...['Frontline','Damage','Flank','Support'].map(role=>[role,text('common.roles.'+role.toLowerCase(),role)])];
        controls.append(wrapper,A.roleFilter(text('generated.champions.class.41ff354','Class'),roles,opponentRole,value=>{opponentRole=value;drawMatchups();}));
      }
      function drawMatchups(){
        if(!current()||!matchupRows)return;
        const visible=row=>String(row.opponent_champion_name??row.name).toLowerCase().includes(opponentQuery.trim().toLowerCase())&&(opponentRole==='All'||identities.get(Number(row.opponent_champion_id??row.id))?.roles.includes(opponentRole));
        const relationships=aggregateMatchupRelationships(matchupRows).filter(visible).sort((a,b)=>sort==='rate'?(b.winRate??-1)-(a.winRate??-1):b.encounters-a.encounters);
        const pairs=matchupRows.filter(visible).sort((a,b)=>sort==='rate'?(Number(b.samples)>0?Number(b.wins)/Number(b.samples):-1)-(Number(a.samples)>0?Number(a.wins)/Number(a.samples):-1):Number(b.samples)-Number(a.samples));
        output.replaceChildren(n('p','discovery-copy',text('stats.matchups.context','Each encounter records a team result against an opposing player, not a duel. Only known selected talents are counted; historical coverage may be partial.')));
        if(!relationships.length){output.append(n('p','discovery-copy',text('stats.matchups.empty','No opponents match these filters.')));return;}
        const overview=n('section','discovery-panel');overview.append(n('h2','',talent==='0'?text('stats.matchups.allTalents','Global · all talents'):champion.talents.find(entry=>String(entry.id)===talent)?.name));
        table(overview,[text('stats.matchups.champion','Champion'),text('stats.matchups.wins','Wins'),text('generated.champions.losses','Losses'),text('stats.matchups.samples','Encounters'),text('stats.matchups.rate','Win rate against')],relationships.map(row=>[link(row.name,'/stats/champions/'+identities.get(row.id).slug),fmt(row.wins),fmt(row.losses),fmt(row.encounters),percent(row.winRate)]));output.append(overview);
        const pairings=n('section','discovery-panel');pairings.append(n('h2','',text('generated.champions.talentPairings','Talent Pairings')));
        table(pairings,[text('stats.matchups.talent','Selected talent'),text('stats.matchups.champion','Champion'),text('generated.champions.talent','Talent'),text('stats.matchups.wins','Wins'),text('generated.champions.losses','Losses'),text('stats.matchups.samples','Encounters'),text('stats.matchups.rate','Win rate against')],pairs.map(row=>[champion.talents.find(entry=>Number(entry.id)===Number(row.champion_talent_id)).name,link(row.opponent_champion_name,'/stats/champions/'+identities.get(Number(row.opponent_champion_id)).slug),row.opponent_talent_name,fmt(row.wins),fmt(row.losses),fmt(row.samples),Number(row.samples)>0?percent(100*Number(row.wins)/Number(row.samples)):'—']));output.append(pairings);
      }
      let sequence=0;
      async function load(refresh=false){
        const seq=++sequence;state(output,text('async.loading','Loading'));output.setAttribute('aria-busy','true');
        try{
          if(kind==='matchups'){
            matchupRows=null;
            const raw=await read('/stats/champions/'+champion.id+'/matchups?queueId=486&days=30'+(talent!=='0'?'&talentId='+talent:''),refresh);
            if(seq!==sequence||!current())return;if(!Array.isArray(raw.rows))throw Error('Invalid matchup response');
            matchupRows=currentMatchupRows(raw.rows,champion,champions).filter(row=>talent==='0'||String(row.champion_talent_id)===talent);drawMatchups();
          }else{
            const results=await Promise.allSettled([read('/stats/talents/'+champion.id+'?mode=ranked',refresh),read('/stats/cards/'+champion.id+'?mode=ranked'+(talent!=='0'?'&talentId='+talent:''),refresh)]);
            if(seq!==sequence||!current())return;output.replaceChildren();
            const talents=n('section','discovery-panel');talents.append(n('h2','',text('generated.champions.talents','Talents')));output.append(talents);
            try{
              if(results[0].status!=='fulfilled')throw results[0].reason;
              const summaries=currentTalentSummaries(results[0].value,champion);
              table(talents,[text('generated.champions.talent','Talent'),text('generated.champions.winRate','Win rate'),text('generated.champions.pickRate','Pick Rate'),text('common.sort.totalPlays','Total Plays'),text('generated.champions.wins','Wins'),text('generated.champions.losses','Losses')],summaries.map(row=>{
                const filter=button(row.name,()=>{talent=talent===String(row.id)?'0':String(row.id);talentField.querySelector('select').value=talent;void load();});filter.setAttribute('aria-pressed',String(talent===String(row.id)));
                return[filter,Number(row.plays)>0?percent(row.winRate):'—',percent(row.pickRate),fmt(row.plays),fmt(row.wins),fmt(row.losses)];
              }));
            }catch{state(talents,text('generated.champions.talentStatisticsUnavailable','Talent statistics unavailable'),()=>load(true));}
            const cards=n('section','discovery-panel');output.append(cards);
            try{
              if(results[1].status!=='fulfilled')throw results[1].reason;
              const raw=results[1].value;if(!Array.isArray(raw.cards))throw Error('Invalid card statistics response');
              const flattened=raw.cards.flatMap(card=>(card.levels||[]).map(level=>({name:card.cardName??card.card_name,id:card.cardId??card.card_id,level:level.level,plays:level.plays??level.totalPlays,rate:cardPercent(level.winRate??level.win_rate)}))).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='rate'?(Number(b.rate)||0)-(Number(a.rate)||0):(Number(b.plays)||0)-(Number(a.plays)||0));
              if(!flattened.length)cards.append(n('p','discovery-copy',text('generated.champions.noCardDataForQueue','No card data is available for this queue.')));
              else table(cards,[text('generated.matches.card','Card'),text('generated.players.level','Level'),text('common.sort.totalPlays','Total Plays'),text('generated.champions.winRate','Win rate')],flattened.map(row=>[link(row.name,'/stats/loadouts/'+champion.slug+'/cards/'+row.id+(talent!=='0'?'?talentId='+talent:'')),fmt(row.level),fmt(row.plays),Number(row.plays)>0?percent(row.rate):'—']));
            }catch{state(cards,text('generated.champions.cardStatisticsUnavailable','Card statistics unavailable'),()=>load(true));}
          }
        }catch{if(seq===sequence&&current())state(output,text(kind==='matchups'?'stats.matchups.error':'async.couldNotLoad','Could not load this data'),()=>load(true));}
        finally{if(seq===sequence&&current())output.setAttribute('aria-busy','false');}
      }
      controls.append(button(text('generated.players.refresh','Refresh'),()=>load(true)));void load();
    }catch{if(current())state(body,text('async.couldNotLoad','Could not load this data'),()=>detail(kind,path,match));}
  }
  A.registerRoute('/stats/champions',()=>directory('matchups'));A.registerRoute('/stats/loadouts',()=>directory('loadouts'));
  A.registerRoute(/^\/stats\/champions\/([a-z0-9-]+)$/, (path,match)=>detail('matchups',path,match));A.registerRoute(/^\/stats\/loadouts\/([a-z0-9-]+)$/, (path,match)=>detail('loadouts',path,match));
  A.registerRoute(/^\/stats\/loadouts\/([a-z0-9-]+)\/cards\/([1-9]\d{0,8})$/,cardDetail);
  const analyticsIcons={"matchups":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-column-increasing lucide-bar-chart-4\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M13 17V9\"></path><path d=\"M18 17V5\"></path><path d=\"M3 3v16a2 2 0 0 0 2 2h16\"></path><path d=\"M8 17v-3\"></path></svg>","loadouts":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-panels-top-left lucide-layout\" aria-hidden=\"true\" focusable=\"false\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect><path d=\"M3 9h18\"></path><path d=\"M9 21V9\"></path></svg>"};
  function addHubCards(){const grid=document.querySelector('.stats-hub-grid');if(!grid||grid.querySelector('[data-analytics-link]'))return;for(const [title,path,copy]of [[text('stats.matchups.title','Champion matchups'),'/stats/champions',text('discovery.analytics.matchupsHint','Compare each champion and talent against their opponents.')],[text('stats.loadouts.title','Loadout statistics'),'/stats/loadouts',text('discovery.analytics.loadoutsHint','Explore ranked card-level usage and win rates.')]]){const card=button('',()=>A.navigate(path));card.className='stats-hub-card';card.dataset.analyticsLink=path;const top=n('div','stats-card-top'),icon=n('span','stats-icon');icon.innerHTML=analyticsIcons[path.endsWith('/champions')?'matchups':'loadouts'];top.append(icon,n('span','stats-card-arrow','→'));card.append(top,n('h2','',title),n('p','stats-copy',copy));grid.append(card);}}
  document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('.rail-button[data-navigation-key="Stats"]'))requestAnimationFrame(addHubCards);});
  new MutationObserver(addHubCards).observe(document.querySelector('.page-view-stack'),{childList:true,subtree:true});
})();
