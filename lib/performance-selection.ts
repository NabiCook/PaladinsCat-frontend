/** Share URL metric selectors while keeping ranked and casual populations separate.
 * refs: endpoints: GET /stats/performance-metrics · migrations: 169
 */
/**
 * Name supported populations. I/O: type only; refs: endpoints: GET /stats/performance-metrics
 */
export type PerformanceScope = "ranked" | "casual";
/**
 * Name selectable metrics, preserving damage DPM and explicit deaths/min.
 * I/O: type only; refs: migrations: 169
 */
export type GamePerformanceMetric = "dpm" | "wpm" | "apm" | "hpm" | "shpm" | "gpm" | "egpm" | "spm" | "kda" | "kpm" | "deaths_per_minute";
/**
 * List stable metric query keys. I/O: readonly string tuple; refs: endpoints: GET /stats/performance-metrics
 */
export const GAME_PERFORMANCE_METRICS = ["dpm", "wpm", "apm", "hpm", "shpm", "gpm", "egpm", "spm", "kda", "kpm", "deaths_per_minute"] as const;

/**
 * Normalize URL selectors to a supported scope/metric pair without side effects.
 * I/O: string|null|undefined, string|null|undefined -> {scope:PerformanceScope,metric:GamePerformanceMetric}.
 * refs: endpoints: GET /stats/performance-metrics
 * I/O types: `scope?: string | null; metric?: string | null -> { scope: PerformanceScope; metric: GamePerformanceMetric; }`.
 */
export function performanceSelection(scope?: string | null, metric?: string | null, queue?: string | null) {
  const aliases: Record<string, string> = { wdpm: "wpm", sdpm: "apm", ecpm: "egpm", cpm: "gpm", depm: "deaths_per_minute" };
  metric = metric ? aliases[metric.toLowerCase()] ?? metric : metric;
  const selectedScope: PerformanceScope = scope === "casual" ? "casual" : "ranked";
  const selectedMetric: GamePerformanceMetric = GAME_PERFORMANCE_METRICS.includes(metric as GamePerformanceMetric)
 ? metric as GamePerformanceMetric : "dpm";
  const queueId = selectedScope === "ranked" ? 486 : [424, 452, 469].includes(Number(queue)) ? Number(queue) : 424;
  return { scope: selectedScope, metric: selectedMetric, queueId };
}

/** Return the short display alias for a performance metric (falling back to the key).
 *
 * I/O: in (metric: GamePerformanceMetric) -> out string
 *
 * refs: none
 */
export function performanceMetricName(metric: GamePerformanceMetric): string {
  return ({ gpm: "cpm", wpm: "wdpm", apm: "sdpm", egpm: "ecpm", deaths_per_minute: "depm" } as Partial<Record<GamePerformanceMetric, string>>)[metric] ?? metric;
}

/** The fixed set of casual (unranked) performance-queue modes (queueId + label key).
 *
 * refs: none
 */
export const CASUAL_PERFORMANCE_MODES = [{ queueId: 424, labelKey: "stats.performance.siege" }, { queueId: 452, labelKey: "stats.performance.onslaught" }, { queueId: 469, labelKey: "stats.performance.tdm" }] as const;
