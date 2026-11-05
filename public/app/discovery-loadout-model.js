/**
 * Card-evidence loadout suggestions for the standalone dashboard.
 * These utilities do NOT estimate joint deck plays or deck win rate.
 * Empirical-Bayes point shrinkage uses a method-of-moments dispersion estimate;
 * the 80/20 and 50/50 weights express product preferences, not fitted optimality.
 * Ref: https://mc-stan.org/rstanarm/articles/pooling
 */
export const PRESET_POLICIES = Object.freeze([
  { id: 'popular', name: 'Most Played', popularityWeight: .8, description: 'Favors common card choices.' },
  { id: 'win-rate', name: 'Win Rate', popularityWeight: .2, description: 'Favors supported win-rate performance.' },
  { id: 'optimal', name: 'Optimal', popularityWeight: .5, description: 'Balances popularity and performance.' },
]);
const key = value => String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const integer = value => value === null || value === undefined || String(value).trim() === ''
  ? null : Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function quantile(values, fraction) {
  const sorted = [...values].sort((a,b) => a-b);
  if (!sorted.length) return null;
  const position = (sorted.length-1)*fraction, low = Math.floor(position);
  return sorted[low]+(sorted[Math.ceil(position)]-sorted[low])*(position-low);
}
export function wilson(wins, plays, z = 1.959963984540054) {
  if (!plays || wins < 0 || wins > plays) return null;
  const p = wins/plays, zz = z*z, d = 1+zz/plays;
  const center = (p+zz/(2*plays))/d;
  const radius = z*Math.sqrt(p*(1-p)/plays+zz/(4*plays*plays))/d;
  return { low: Math.max(0,center-radius), high: Math.min(1,center+radius) };
}
// Invert an erf-based normal CDF by bounded bisection (about1e-7 CDF accuracy).
export function normalCritical(probability) {
  if (!(probability > .5 && probability < 1)) return NaN;
  const cdf = z => {
    const x = z/Math.SQRT2, t = 1/(1+.3275911*x);
    const erf = 1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);
    return (1+erf)/2;
  };
  let low = 0, high = 8;
  for (let i=0;i<60;i++) { const middle=(low+high)/2; if(cdf(middle)<probability) low=middle; else high=middle; }
  return (low+high)/2;
}
export function championBaseline(row) {
  const wins = integer(row?.wins), losses = integer(row?.losses);
  if (wins === null || losses === null || !Number.isSafeInteger(wins+losses) || wins+losses < 1) return null;
  // Counts are the canonical facts; a stale precomputed win_rate must not change the reference.
  return { wins, losses, plays: wins+losses, rate: wins/(wins+losses), interval: wilson(wins,wins+losses,2.241402727604947) };
}
export function optimizeLoadout(candidates, popularityWeight) {
  // Multiple-choice knapsack: at most one level per card, exactly five cards/15 points.
  if (!Number.isFinite(popularityWeight) || popularityWeight < 0 || popularityWeight > 1) return null;
  const groups = new Map();
  for (const choice of candidates) {
    if (!choice.eligible) continue;
    if (!groups.has(choice.cardId)) groups.set(choice.cardId,[]);
    groups.get(choice.cardId).push(choice);
  }
  let states = new Map([['0:0',{ count:0, points:0, score:0, cards:[] }]]);
  for (const [,choices] of [...groups].sort((a,b)=>a[0]-b[0])) {
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.count >= 5) continue;
      for (const choice of [...choices].sort((a,b)=>a.level-b.level)) {
        const points = state.points+choice.level;
        if (points > 15) continue;
        const count = state.count+1, id = count+':'+points;
        const score = state.score+popularityWeight*choice.popularityScore+(1-popularityWeight)*choice.performanceScore;
        const previous = next.get(id);
        if (!previous || score > previous.score+1e-12) next.set(id,{ count, points, score, cards:[...state.cards,choice] });
      }
    }
    states = next;
  }
  const best = states.get('5:15');
  return best ? { points:15, score:best.score/5, cards:best.cards } : null;
}
export function buildLoadoutSuggestions({ cards, payload, baseline }) {
  const unavailable = reason => ({ status:'unavailable', reason, presets:[], choices:[] });
  const totalMatches = integer(payload?.totalMatches);
  if (!Array.isArray(cards) || !Array.isArray(payload?.cards) || !totalMatches) return unavailable('Card evidence is unavailable.');
  if (!baseline || !Number.isFinite(baseline.rate) || baseline.rate < 0 || baseline.rate > 1 || !baseline.interval) return unavailable('Champion baseline is unavailable.');
  const seenCanonical = new Set(), seenRows = new Set(), choices = [];
  for (const card of cards) {
    if (!Number.isSafeInteger(Number(card.id)) || Number(card.id) < 1 || seenCanonical.has(Number(card.id))) return unavailable('Card references are ambiguous.');
    seenCanonical.add(Number(card.id));
    const matches = payload.cards.filter(row => Number(row.cardId) === Number(card.id));
    const named = matches.length ? matches : payload.cards.filter(row => key(row.cardName) === key(card.name));
    if (named.length !== 1) return unavailable('Card evidence is incomplete.');
    const row = named[0];
    if (seenRows.has(row)) return unavailable('Card references are ambiguous.');
    seenRows.add(row);
    const total = integer(row.totalPlays), wins = integer(row.wins), losses = integer(row.losses);
    if (total === null || wins === null || losses === null || total !== wins+losses || !Array.isArray(row.levels)) return unavailable('Card counts are inconsistent.');
    let levelTotal = 0, levelWins = 0, levelLosses = 0;
    const levels = new Set();
    for (const entry of row.levels) {
      const level = integer(entry.level), plays = integer(entry.plays), w = integer(entry.wins), l = integer(entry.losses);
      if (!level || level > 5 || levels.has(level) || plays === null || w === null || l === null || plays !== w+l) return unavailable('Card level counts are inconsistent.');
      levels.add(level); levelTotal += plays; levelWins += w; levelLosses += l;
      if (plays > 0) choices.push({ cardId:Number(card.id), name:card.name, iconUrl:card.iconUrl, level, plays, wins:w, losses:l, rate:w/plays, pickRate:plays/totalMatches });
    }
    if (total !== levelTotal || wins !== levelWins || losses !== levelLosses) return unavailable('Card level evidence is incomplete.');
  }
  const totalUses = choices.reduce((sum,c)=>sum+c.plays,0);
  const totalWins = choices.reduce((sum,c)=>sum+c.wins,0);
  const totalPoints = choices.reduce((sum,c)=>sum+c.plays*c.level,0);
  if (!totalUses || totalUses > totalMatches*5 || totalPoints !== totalUses*3 || totalWins%5 !== 0 || totalUses%5 !== 0) return unavailable('The card-selection totals are inconsistent.');
  const dataCoverage = totalUses/(totalMatches*5);
  // Selection-weighted cohort mean; coverage below1 is disclosed, never filled with zeroes.
  const evidenceEquivalent = totalUses/5;
  const talentRate = totalWins/totalUses;
  // Bonferroni screening across every observed card-level rate plus two baselines.
  // Wilson coverage remains approximate; these tags are observational, not causal.
  const screeningZ = normalCritical(1-.05/(2*(choices.length+2)));
  const baselineInterval = wilson(baseline.wins,baseline.plays,screeningZ);
  const talentInterval = wilson(totalWins/5,evidenceEquivalent,screeningZ);
  if (totalMatches > baseline.plays || totalWins/5 > baseline.wins || (totalUses-totalWins)/5 > baseline.losses) return unavailable('Champion and talent snapshots do not match.');
  const variance = choices.reduce((sum,c)=>sum+c.plays*(c.rate-talentRate)**2,0)/totalUses;
  const samplingNoise = talentRate*(1-talentRate)*choices.length/totalUses;
  const betweenVariance = Math.max(0,variance-samplingNoise);
  const concentration = Math.max(1,Math.min(evidenceEquivalent,betweenVariance > 0 ? talentRate*(1-talentRate)/betweenVariance-1 : evidenceEquivalent));
  // Require at least 20% observed-data weight in the shrunken point estimate,
  // and exclude the bottom positive-count quartile. Both yield a cohort-specific count.
  const minimumPlays = Math.max(1,Math.ceil(quantile(choices.map(c=>c.plays),.25)),Math.ceil(concentration/4));
  const maxPlays = Math.max(...choices.map(c=>c.plays));
  const scale = Math.max(Math.sqrt(betweenVariance),Math.sqrt(talentRate*(1-talentRate)/totalMatches),1/totalMatches);
  for (const c of choices) {
    c.estimatedRate = (c.wins+concentration*talentRate)/(c.plays+concentration);
    c.observedDataWeight = c.plays/(c.plays+concentration);
    c.lift = c.rate-baseline.rate;
    c.talentLift = c.estimatedRate-talentRate;
    c.interval = wilson(c.wins,c.plays,screeningZ);
    // Simultaneous screening envelopes avoid an independent-sample assumption
    // for overlapping champion/card cohorts. Repeated-player confounding remains.
    c.liftEnvelope = { low:c.interval.low-baselineInterval.high, high:c.interval.high-baselineInterval.low };
    c.popularityScore = Math.log1p(c.plays)/Math.log1p(maxPlays);
    c.performanceScore = .5+.5*Math.tanh(c.talentLift/scale);
    c.eligible = c.plays >= minimumPlays;
    c.tag = c.eligible ? 'Neutral' : 'Insufficient evidence';
  }
  const eligible = choices.filter(c=>c.eligible);
  const highPopularity = quantile(eligible.map(c=>c.plays),.75);
  for (const c of eligible) {
    const common = c.plays >= highPopularity;
    if (c.liftEnvelope.high < 0) c.tag = common ? 'Avoid' : 'Below baseline';
    else if (c.liftEnvelope.low > 0 && c.interval.low > talentInterval.high) c.tag = common ? 'OP' : 'Underrated';
    else if (common && eligible.some(other=>other.cardId!==c.cardId && other.level===c.level && other.plays<c.plays && other.interval.low>c.interval.high)) c.tag = 'Overrated';
  }
  const presets = PRESET_POLICIES.map(policy=>({ ...policy, ...optimizeLoadout(choices,policy.popularityWeight) }));
  if (presets.some(p=>!p.cards)) return { status:'insufficient', reason:'Not enough supported card levels to form a 15-point loadout.', presets:[], choices, totalMatches, dataCoverage, talentRate, baseline, minimumPlays, concentration };
  const signatures = new Map();
  for (const preset of presets) {
    const signature = preset.cards.map(c=>c.cardId+':'+c.level).sort().join(',');
    preset.sameAs = signatures.get(signature) || null;
    signatures.set(signature,preset.name);
    preset.limitedEvidence = dataCoverage < 1 || preset.cards.some(c=>c.interval.high-c.interval.low>.10);
  }
  return { status:'ready', presets, choices, totalMatches, dataCoverage, talentRate, baseline, minimumPlays, concentration, betweenVariance, highPopularity, screeningZ, method:'card-evidence-v1', evidenceNotice:'Card-based suggestions; complete-deck play counts and win rates are not measured.' };
}
