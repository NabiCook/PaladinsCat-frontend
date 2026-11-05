import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadoutSuggestions, championBaseline, optimizeLoadout, wilson, quantile, normalCritical, PRESET_POLICIES } from '../public/app/discovery-loadout-model.js';
function fixture(scale=1, rare=false) {
  const cards=Array.from({length:7},(_,i)=>({id:i+1,name:'Card '+(i+1),iconUrl:''}));
  const decks=[{cards:[[1,3],[2,3],[3,3],[4,3],[5,3]],w:48*scale,l:52*scale},
    {cards:[[1,1],[2,2],[3,3],[4,4],[6,5]],w:55*scale,l:45*scale}];
  if(rare) decks.push({cards:[[1,3],[2,3],[3,3],[4,1],[7,5]],w:7,l:0});
  const rows=cards.map(card=>({cardId:card.id,cardName:card.name,totalPlays:0,wins:0,losses:0,levels:[]}));
  for(const deck of decks) for(const [id,level] of deck.cards) {
    const row=rows[id-1]; let cell=row.levels.find(x=>x.level===level);
    if(!cell) {cell={level,plays:0,wins:0,losses:0};row.levels.push(cell);}
    cell.plays+=deck.w+deck.l;cell.wins+=deck.w;cell.losses+=deck.l;
    row.totalPlays+=deck.w+deck.l;row.wins+=deck.w;row.losses+=deck.l;
  }
  return {cards,payload:{totalMatches:decks.reduce((s,d)=>s+d.w+d.l,0),talentId:1,cards:rows},
    baseline:championBaseline({wins:460*scale,losses:540*scale})};
}
test('Wilson agrees with NIST example and handles zero/perfect outcomes',()=>{
  const ci=wilson(8,30); assert.ok(Math.abs(ci.low-.14182663319596317)<1e-10);assert.ok(Math.abs(ci.high-.4444796169518888)<1e-10);
  assert.equal(wilson(0,0),null);for(const [w,n] of [[0,7],[7,7],[0,1],[1,1]]) {const r=wilson(w,n);assert.ok(r.low>=0&&r.high<=1&&r.low<=r.high);}
  assert.equal(quantile([1,2,3,4],.25),1.75);
});
test('champion reference uses counted outcomes and preserves zero percent',()=>{
  const b=championBaseline({wins:'46',losses:'54',win_rate:'99'});assert.equal(b.rate,.46);
  assert.equal(championBaseline({wins:0,losses:10}).rate,0);assert.equal(championBaseline({wins:0,losses:0}),null);
  assert.equal(championBaseline({wins:'',losses:1}),null);
});
test('presets have five distinct cards, exactly15 points and no synthetic joint metrics',()=>{
  const result=buildLoadoutSuggestions(fixture()); assert.equal(result.status,'ready');assert.equal(result.presets.length,3);
  for(const preset of result.presets) {assert.equal(preset.cards.length,5);assert.equal(new Set(preset.cards.map(c=>c.cardId)).size,5);assert.equal(preset.cards.reduce((s,c)=>s+c.level,0),15);assert.ok(preset.cards.every(c=>c.eligible));assert.equal(preset.winRate,undefined);assert.equal(preset.plays,undefined);}
});
test('sample requirements adapt; a seven-play perfect card is excluded',()=>{
  const a=buildLoadoutSuggestions(fixture(1,true)), b=buildLoadoutSuggestions(fixture(100,true));
  assert.notEqual(a.minimumPlays,b.minimumPlays);assert.equal(b.choices.find(c=>c.cardId===7).eligible,false);
  assert.ok(b.presets.every(p=>p.cards.every(c=>c.cardId!==7)));
});
test('relative lift is positive below50% when champion baseline is46%',()=>{
  const input=fixture(), result=buildLoadoutSuggestions(input);const c=result.choices.find(c=>c.cardId===1&&c.level===3);
  assert.equal(c.rate,.48);assert.ok(Math.abs(c.lift-.02)<1e-12);
  const other=buildLoadoutSuggestions({...input,baseline:championBaseline({wins:580,losses:420})});
  assert.ok(other.choices.find(c=>c.cardId===1&&c.level===3).lift<0);
});
test('malformed, sparse, empty and mismatched cohorts do not fabricate recommendations',()=>{
  for(const mutate of [x=>{x.payload.cards[0].levels[0].wins=-1;},x=>{x.payload.cards[0].levels.push(x.payload.cards[0].levels[0]);},x=>{x.payload.totalMatches--;},x=>{x.payload.cards.pop();},x=>{x.cards[0].id=2;},x=>{x.payload.cards[0].levels[0].level=6;},x=>{x.baseline=null;},x=>{x.baseline=championBaseline({wins:1,losses:1});}]) {
    const x=fixture();mutate(x);assert.equal(buildLoadoutSuggestions(x).status,'unavailable');
  }
  const x=fixture();x.payload.totalMatches=0;assert.equal(buildLoadoutSuggestions(x).status,'unavailable');
});
test('input order is immaterial, inputs stay untouched and identical presets are acknowledged',()=>{
  const x=fixture(), before=JSON.stringify(x), a=buildLoadoutSuggestions(x);assert.equal(JSON.stringify(x),before);
  const y=structuredClone(x);y.cards.reverse();y.payload.cards.reverse();for(const row of y.payload.cards)row.levels.reverse();const b=buildLoadoutSuggestions(y);
  const signatures=r=>r.presets.map(p=>p.cards.map(c=>c.cardId+':'+c.level).sort().join(','));assert.deepEqual(signatures(a),signatures(b));
  const seen=new Set();for(const p of a.presets){const s=p.cards.map(c=>c.cardId+':'+c.level).sort().join(',');if(seen.has(s))assert.ok(p.sameAs);seen.add(s);}
});
test('optimizer matches independent exhaustive oracle and weighting favors its declared objective',()=>{
  const choices=Array.from({length:6},(_,i)=>Array.from({length:5},(_,j)=>({cardId:i+1,level:j+1,eligible:true,popularityScore:((i+2)*13+(j+1)*7)%31/30,performanceScore:((i+3)*11+(j+1)*17)%37/36}))).flat();
  function oracle(weight){let best=-Infinity;function visit(id,cards,points,score){if(cards===5){if(points===15)best=Math.max(best,score/5);return;}if(id>6||points>15||cards+7-id<5)return;visit(id+1,cards,points,score);for(const c of choices.filter(c=>c.cardId===id))visit(id+1,cards+1,points+c.level,score+weight*c.popularityScore+(1-weight)*c.performanceScore);}visit(1,0,0,0);return best;}
  const outputs=PRESET_POLICIES.map(p=>optimizeLoadout(choices,p.popularityWeight));for(let i=0;i<outputs.length;i++)assert.ok(Math.abs(outputs[i].score-oracle(PRESET_POLICIES[i].popularityWeight))<1e-12);
  const mean=(x,k)=>x.cards.reduce((s,c)=>s+c[k],0)/5;assert.ok(mean(outputs[0],'popularityScore')>=mean(outputs[1],'popularityScore'));assert.ok(mean(outputs[1],'performanceScore')>=mean(outputs[0],'performanceScore'));
  assert.equal(optimizeLoadout(choices,-1),null);assert.equal(optimizeLoadout(choices.slice(0,5),.5),null);
});

test('partial coverage is disclosed and never completed with invented samples',()=>{
  const x=fixture();x.payload.totalMatches++;const r=buildLoadoutSuggestions(x);assert.equal(r.status,'ready');assert.ok(Math.abs(r.dataCoverage-200/201)<1e-12);assert.ok(r.presets.every(p=>p.limitedEvidence));assert.equal(r.totalMatches,201);assert.equal(r.choices.reduce((s,c)=>s+c.plays,0),1000);
});

test('comparison-adjusted screening uses normal critical values and protects sparse relative lift',()=>{
  assert.ok(Math.abs(normalCritical(.975)-1.95996398454)<1e-5);assert.ok(Math.abs(normalCritical(.999)-3.090232306)<1e-4);const r=buildLoadoutSuggestions(fixture());assert.ok(r.screeningZ>1.95996398454);assert.equal(r.choices.find(c=>c.cardId===1&&c.level===3).tag,'Neutral');
});
