/* Publisher-supplied public embed identifiers. No advertising API credential is held here. */
(() => {
  'use strict';
  const shell=document.querySelector('.dashboard-shell'),workspace=document.querySelector('.workspace');
  if(!shell||!workspace||window.DiscoveryAds)return;
  const units=[
    {id:'32203491',w:728,h:90,key:'c6db89b56177a18b90f50d44f08a4010'},
    {id:'32203486',w:468,h:60,key:'8845c9fc7e854b8d30e35f0d3d336660'},
    {id:'32203490',w:320,h:50,key:'5c8b4ed95610f942e89896985dea3fdf'},
    {id:'32203487',w:300,h:250,key:'b01221531dcbe80a7ec990300848978a'},
    {id:'32203488',w:160,h:600,key:'528226d82297db3196f138a351cec609'},
    {id:'32203489',w:160,h:300,key:'e71f605c66e6171f96c4ad602c8f5d4f'}
  ];
  const preview=['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('adPreview')==='1';
  const root=document.documentElement,rail=document.querySelector('.rail'),banner=document.querySelector('[data-home-banner]');
  const homeColumn=document.querySelector('.secondary-column'),homeGrid=document.querySelector('.dashboard-grid');
  const search=document.getElementById('search-page'),heroSlide=document.querySelector('[data-banner-ad]');
  let scheduled=0,disposed=false,dockDismissed=false,heroFailed=false,sequence=0,writerRequest;
  try{dockDismissed=sessionStorage.getItem('pc-ad-dock-dismissed')==='1';}catch{}
  const text=(key,fallback)=>{const value=window.DiscoveryLocale?.t(key);return value&&value!==key?value:fallback;};
  const make=(tag,cls='')=>{const node=document.createElement(tag);node.className=cls;return node;};
  const innerWidth=el=>{const s=getComputedStyle(el);return Math.max(0,el.getBoundingClientRect().width-parseFloat(s.paddingLeft||0)-parseFloat(s.paddingRight||0)-parseFloat(s.borderLeftWidth||0)-parseFloat(s.borderRightWidth||0));};
  const slots=[];
  function createSlot(host,name){
    host.classList.add('pc-ad-slot');host.dataset.adPlacement=name;host.setAttribute('aria-label','Advertisement');
    const canvas=make('div','pc-ad-canvas'),creative=make('div','pc-ad-creative'),placeholder=make('div','pc-ad-placeholder');
    creative.append(placeholder);canvas.append(creative);host.append(canvas);
    const slot={host,name,creative,placeholder,unit:null,token:0,timeout:0,visible:false,active:false,failed:false,state:'idle'};
    slots.push(slot);return slot;
  }
  const homeHost=document.querySelector('[data-ad-placement="home-right"]'),heroHost=document.querySelector('[data-ad-placement="home-hero"]'),searchHost=document.querySelector('[data-ad-placement="search-rail"]');
  const home=homeHost?createSlot(homeHost,'home-right'):null,hero=heroHost?createSlot(heroHost,'home-hero'):null,searchSlot=searchHost?createSlot(searchHost,'search-rail'):null;
  const dockHost=make('aside','pc-ad-dock');dockHost.hidden=true;const dock=createSlot(dockHost,'bottom');
  const close=make('button','pc-ad-close');close.type='button';close.textContent=text('generated.components.close','Close');close.setAttribute('aria-label','Hide advertisement for this session');dockHost.append(close);
  const spacer=make('div','pc-ad-spacer');spacer.hidden=true;spacer.setAttribute('aria-hidden','true');workspace.append(dockHost,spacer);
  function fallback(slot,message){slot.placeholder.replaceChildren();const line=make('span');line.textContent=message;slot.placeholder.append(line);slot.placeholder.hidden=false;}
  function teardown(slot){
    clearTimeout(slot.timeout);slot.token=0;
    slot.creative.replaceChildren(slot.placeholder);slot.state='idle';
  }
  function choose(slot,unit,active){
    if(!slot)return;
    const changed=slot.unit?.id!==unit?.id;
    if(changed){teardown(slot);slot.failed=false;slot.unit=unit||null;}
    slot.active=Boolean(active&&unit);slot.host.hidden=!slot.active;
    if(!slot.active){if(slot.name!=='home-hero'||shell.dataset.view!=='dashboard')teardown(slot);return;}
    slot.host.dataset.adUnit=unit.id;
    slot.creative.style.setProperty('--pc-ad-width',unit.w+'px');slot.creative.style.setProperty('--pc-ad-height',unit.h+'px');
    slot.host.style.setProperty('--pc-ad-width',unit.w+'px');slot.host.style.setProperty('--pc-ad-height',unit.h+'px');
    if(changed||slot.state==='idle')fallback(slot,text('async.loading','Loading…'));
    mount(slot);
  }
  // Postscribe preserves parser-order/document.write behavior in the SPA without
  // adding a publisher iframe. The vendor receives the supplied native options.
  function writer(){
    if(window.postscribe)return Promise.resolve(window.postscribe);
    if(!writerRequest)writerRequest=new Promise((resolve,reject)=>{
      const script=make('script');
      script.src='https://cdnjs.cloudflare.com/ajax/libs/postscribe/2.0.8/postscribe.min.js';
      script.integrity='sha384-pojMXilfEgorjtWzSw/Vs8lxOfhlNdEEZDHGECbzEHXolojlD+1JRKLpNSuGMW4C';script.crossOrigin='anonymous';
      script.onload=()=>window.postscribe?resolve(window.postscribe):reject(Error('Ad writer unavailable'));
      script.onerror=()=>reject(Error('Ad writer unavailable'));document.head.append(script);
    });
    return writerRequest;
  }
  function mount(slot){
    if(!slot.active||!slot.unit||slot.state==='loading'||slot.state==='loaded'||slot.failed||document.hidden||document.querySelector('dialog[open]'))return;
    if(slot.name==='bottom'&&slot.host.dataset.suspended==='true')return;
    if(slot.name==='home-hero'&&heroSlide?.dataset.active!=='true')return;
    if(!slot.visible)return;
    if(preview){
      if(slot.state==='preview')return;
      const size=make('strong'),caption=make('span');size.textContent=slot.unit.w+' × '+slot.unit.h;caption.textContent='Local preview · Unit '+slot.unit.id;slot.placeholder.replaceChildren(size,caption);slot.placeholder.hidden=false;slot.state='preview';slot.host.dataset.adState='preview';return;
    }
    const token=++sequence,unit=slot.unit;slot.token=token;slot.state='loading';slot.host.dataset.adState='loading';
    slot.timeout=setTimeout(()=>{if(slot.token===token)fail(slot);},15000);
    writer().then(postscribe=>{
      if(slot.token!==token||!slot.active)return;
      // Postscribe 2.0.8's active-stream cancel calls an unavailable abort API.
      // Detach this attempt on teardown; stale queued writes then become no-ops.
      const attempt=make('div');slot.creative.replaceChildren(slot.placeholder,attempt);
      postscribe(attempt,function(doc){
        if(slot.token!==token||!slot.active)return;
        window.atOptions={key:unit.key,format:'iframe',height:unit.h,width:unit.w,params:{}};
        doc.write('<script src="https://bauval.org/22/'+unit.key+'"></script>');
      },{
        done(){if(slot.token!==token)return;const frame=attempt.querySelector('iframe');if(!frame){fail(slot);return;}clearTimeout(slot.timeout);slot.placeholder.hidden=true;slot.state='loaded';slot.host.dataset.adState='loaded';},
        error(){if(slot.token===token)fail(slot);}
      });
    }).catch(()=>{if(slot.token===token)fail(slot);});
  }
  function fail(slot){
    teardown(slot);slot.failed=true;slot.state='error';slot.host.dataset.adState='error';fallback(slot,'Advertisement unavailable');
    if(slot===hero){heroFailed=true;schedule();}
  }
  const intersection=new IntersectionObserver(entries=>{for(const entry of entries){const slot=slots.find(s=>s.host===entry.target);if(slot){slot.visible=entry.isIntersecting;mount(slot);}}},{threshold:.01});slots.forEach(slot=>intersection.observe(slot.host));
  function set(name,value){if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value);}
  function sync(){
    scheduled=0;if(disposed)return;
    const phone=window.innerWidth<=600,view=shell.dataset.view,docWidth=root.clientWidth;
    homeGrid?.classList.toggle('pc-home-ad-stacked',innerWidth(homeGrid)<720);
    const work=workspace.getBoundingClientRect(),style=getComputedStyle(root),gutter=parseFloat(homeGrid?getComputedStyle(homeGrid).paddingLeft:'24')||24,max=parseFloat(style.getPropertyValue('--pc-page-max-width'))||1120;
    const available=phone?docWidth-16:Math.min(work.width,max)-2*gutter;
    const format=units.slice(0,3).find(u=>u.w<=available-2),dockWidth=format?format.w+2:0;
    const left=phone?(docWidth-dockWidth)/2:Math.max(0,work.left)+(work.width-dockWidth)/2;
    const bottom=16;
    dockHost.dataset.edge=phone?'top':'bottom';
    set('--pc-ad-dock-left',left+'px');set('--pc-ad-dock-width',dockWidth+'px');set('--pc-ad-dock-bottom',bottom+'px');
    const hasDock=Boolean(format&&!dockDismissed);
    const keyboard=window.visualViewport&&window.visualViewport.height<window.innerHeight*.75&&document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
    const suspended=Boolean(document.querySelector('dialog[open]')||document.querySelector('.rail-mobile-more[aria-expanded="true"]')||keyboard);
    dockHost.dataset.suspended=String(suspended);dockHost.inert=suspended;
    choose(dock,format,hasDock);
    const dockHeight=hasDock?dockHost.getBoundingClientRect().height:0;
    set('--pc-ad-dock-height',dockHeight+'px');set('--pc-ad-dock-space',hasDock?(dockHeight+(phone?16:32))+'px':'0px');set('--pc-ad-scroll-space',(dockHeight+bottom+16)+'px');
    root.classList.toggle('pc-ads-docked',hasDock);spacer.hidden=!hasDock;
    if(home&&homeColumn)choose(home,homeColumn.getBoundingClientRect().width>=302?units[3]:units[5],view==='dashboard');
    if(hero&&banner){
      const fits=banner.getBoundingClientRect().width>=302&&!heroFailed;
      if(heroSlide.dataset.adEligible!==String(fits)){heroSlide.dataset.adEligible=String(fits);banner.dispatchEvent(new CustomEvent('discovery:ad-availability'));}
      banner.classList.toggle('pc-home-ad-hero',fits);
      banner.classList.toggle('pc-home-ad-showing',view==='dashboard'&&heroSlide.dataset.active==='true');
      choose(hero,units[3],view==='dashboard'&&fits);
    }
    if(searchSlot&&search){
      const top=Math.max(24,search.getBoundingClientRect().top+parseFloat(getComputedStyle(search).paddingTop||0)),room=window.innerHeight-top-(hasDock?dockHeight+bottom:16)-24;
      const show=view==='search'&&!phone&&innerWidth(search)>=858&&room>=302;
      search.classList.toggle('pc-ad-search-layout',show);
      choose(searchSlot,room>=602?units[4]:units[5],show);
    }
    slots.forEach(mount);
  }
  function schedule(){if(!scheduled&&!disposed)scheduled=requestAnimationFrame(sync);}
  close.addEventListener('click',()=>{dockDismissed=true;try{sessionStorage.setItem('pc-ad-dock-dismissed','1');}catch{}schedule();});
  homeColumn?.classList.add('pc-home-ad-column');homeGrid?.classList.add('pc-home-ad-layout');
  const resize=new ResizeObserver(schedule);[workspace,rail,banner,homeColumn,search,...slots.map(s=>s.creative)].filter(Boolean).forEach(el=>resize.observe(el));
  const state=new MutationObserver(schedule);state.observe(shell,{attributes:true,attributeFilter:['data-view','data-route','data-menu-size']});
  const navigation=new MutationObserver(schedule);if(rail)navigation.observe(rail,{subtree:true,attributes:true,attributeFilter:['hidden','aria-expanded']});
  const dialogs=new MutationObserver(schedule);dialogs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  const events=['resize','scroll'];events.forEach(name=>window.addEventListener(name,schedule,{passive:true}));
  document.addEventListener('visibilitychange',schedule);document.addEventListener('discovery:view-changed',schedule);banner?.addEventListener('discovery:home-banner-change',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;cancelAnimationFrame(scheduled);slots.forEach(teardown);intersection.disconnect();resize.disconnect();state.disconnect();navigation.disconnect();dialogs.disconnect();events.forEach(name=>window.removeEventListener(name,schedule));document.removeEventListener('visibilitychange',schedule);document.removeEventListener('discovery:view-changed',schedule);banner?.removeEventListener('discovery:home-banner-change',schedule);window.visualViewport?.removeEventListener('resize',schedule);});
  window.DiscoveryAds=Object.freeze({syncLayout:schedule,snapshot:()=>slots.map(s=>({placement:s.name,edge:s===dock?dockHost.dataset.edge:null,unit:s.unit?.id||null,width:s.unit?.w||0,height:s.unit?.h||0,active:s.active,visible:s.visible,state:s.state,preview}))});
  schedule();
})();
