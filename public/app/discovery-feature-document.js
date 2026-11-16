// Browser-safe public feed loader; owning logic is lib/feature-document.ts.
import {activeNewFeatures} from './discovery-feature-feed.js?v=server-parser-1';
const sourceUrl="https://github.com/PaladinsCat/PaladinsCat/blob/main/docs/features/new-features.md",rawUrl="https://raw.githubusercontent.com/PaladinsCat/PaladinsCat/main/docs/features/new-features.md";
let cached=null,expires=0;
export async function getFeatureDocument(refresh=false){
  if(refresh){cached=null;expires=0;}
  if(!cached||Date.now()>expires){
    expires=Date.now()+300000;
    cached=window.DiscoveryApp.readPublicDocument('/features',{refresh}).then(source=>{
      const document=source.data?.features;
      if(!document||!Array.isArray(document.entries))throw Error('Feature document unavailable');
      return document;
    }).catch(()=>{cached=null;return null;});
  }
  const data=await cached;
  return data?{...data,entries:activeNewFeatures(data.entries)}:null;
}
export const resolveFeatureLink=href=>!href||href.startsWith('#')||href.startsWith('/')||/^[a-z][a-z0-9+.-]*:/i.test(href)||href.startsWith('//')||!href.split(/[?#]/,1)[0].toLowerCase().endsWith('.md')?href:new URL(href,sourceUrl).href;
export const resolveFeatureAssetUrl=src=>!src||src.startsWith('/')||src.startsWith('#')||/^[a-z][a-z0-9+.-]*:/i.test(src)||src.startsWith('//')?src:new URL(src,rawUrl).href;
