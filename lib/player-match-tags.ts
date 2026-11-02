/** Canonical per-match earning keys; these are evidence, not profile totals.
 *
 * refs: none
 */
/** The fixed set of per-match earning evidence tags (canonical keys).
 *
 * refs: none
 */
export const PERFORMANCE_MATCH_TAGS = [
  "wall_shooter", "master_feeding", "tank_diff", "support_diff", "dps_diff",
  "flank_diff", "noob", "hypercarry", "automatic_afk",
] as const;
/** A single per-match earning evidence tag key.
 *
 * refs: none
 */
export type PerformanceMatchTag = typeof PERFORMANCE_MATCH_TAGS[number];

/** Coerce an unknown value into a deduplicated list of valid matching evidence tags.
 *
 * I/O: in (value: unknown) -> out PerformanceMatchTag[]
 *
 * refs: none
 */
export function normalizeMatchPerformanceTags(value: unknown): PerformanceMatchTag[] {
  return Array.isArray(value) ? [...new Set(value.filter((tag): tag is PerformanceMatchTag =>
    PERFORMANCE_MATCH_TAGS.includes(tag),
  ))] : [];
}
