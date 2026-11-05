/* The existing Pro analyzer is mounted lazily inside the dashboard. */
(() => {
  "use strict";
  const app=window.DiscoveryApp, rail=document.querySelector(".rail-main");
  if (!app || !rail) return;
  const nav=document.createElement("button");
  nav.type="button"; nav.className="rail-button"; nav.dataset.navigationKey="Demo analysis"; nav.dataset.demoAnalysisTrigger="";
  window.DiscoveryLocale.bind(nav,"discovery.home.demoAnalysis","Demo analysis","aria-label"); window.DiscoveryLocale.bind(nav,"discovery.home.demoAnalysis","Demo analysis","title"); nav.setAttribute("aria-controls", "demo-analyzer-page");
  nav.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-replay" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 8-8H6"/><path d="m9 1-3 3 3 3"/><path d="m10 9 5 3-5 3z"/></svg><span class="rail-label" aria-hidden="true">Demo analysis</span>';
  window.DiscoveryLocale.bind(nav.querySelector('.rail-label'),"discovery.home.demoAnalysis","Demo analysis");
  const anchor=rail.querySelector('[data-navigation-key="Matches"]');
  if(anchor) anchor.after(nav); else rail.append(nav);
  nav.addEventListener("click",()=>app.navigate("/analyze"));
  let pending;
  function load(){ return pending ||= import("./discovery-demo-analyzer-pro.js?v=8").catch(error=>{pending=null;throw error;}); }
  function open(path){
    if(window.DiscoveryDemoAnalyzer){window.DiscoveryDemoAnalyzer.open();return;}
    const host=app.createPage("demo-analyzer","Demo analysis","Demo analysis");
    window.DiscoveryLocale.bind(host,"discovery.home.demoAnalysis","Demo analysis","aria-label");
    host.setAttribute("aria-busy","true");
    const loading=document.createElement("p"); loading.className="discovery-copy"; loading.setAttribute("role","status"); loading.textContent=app.t("async.loading",undefined,"Loading…"); host.replaceChildren(loading); app.open("demo-analyzer");
    load().then(()=>{if(app.currentPath()!==path)return;host.removeAttribute("aria-busy");window.DiscoveryDemoAnalyzer.open();}).catch(()=>{if(app.currentPath()!==path)return;host.removeAttribute("aria-busy");const message=document.createElement("p"),retry=document.createElement("button");message.className="discovery-copy";message.textContent=app.t("async.couldNotLoad",undefined,"This section could not be loaded.");retry.className="reference-filter";retry.type="button";retry.textContent=app.t("async.tryAgain",undefined,"Try again");retry.addEventListener("click",()=>open(path));host.replaceChildren(message,retry);});
  }
  app.registerRoute("/analyze",open);
})();
