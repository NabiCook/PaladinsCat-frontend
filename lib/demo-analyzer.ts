/** Browser bridge types. Reconstruction and metric calculations belong to Rust. */
export const DEMO_MAX_BYTES = 64 * 1024 * 1024;
export type MetricSummary = { count: number; mean: number | null; min: number | null; max: number | null; std: number | null };
export type DemoShot = { kind: "aim_at_fire"; time_s: number; frame: number; actor: [number, number]; sequence: number; target_player: number; target_name?: string | null; slot: string; x: number; y: number; zone: "head" | "body" | "leg" | "miss"; distance: number; deviation_deg: number; aim_point: number[]; aim_origin: number[]; aim_direction: number[]; aim_source: string; aim_age_s: number; origin_source: string; target_position: number[]; target_position_source: string; target_position_age_s: number; target_source: string };
export type DemoImpact = { time_s: number; frame: number; actor: [number, number]; sequence: number; target_player: number; target_name?: string | null; target_actor: [number, number]; slot: string; x: number; y: number; zone: "head" | "body" | "leg" | "miss"; distance: number; location: number[]; world_offset: number[]; projection_basis: "shooter_at_hit"; target_position: number[]; target_position_source: string; target_position_age_s: number; confirmed_hit_event: true; fire_sequence: null; fire_time_s: null; flight_time_s: null; damage_amount: number | null };
export interface DemoMetrics {
  combat: { in_combat_s: number | null; known_s: number; in_combat_pct: number | null; damage: number | null; dpm: number | null; healing: number | null; hpm: number | null; shielding: number | null; shielding_per_min: number | null; credits: number | null; credits_per_min: number | null; kills: number | null; deaths: number | null; assists: number | null; objective_assists: number | null };
  aim: { base_kit_fires: number | null; fires_per_min: number | null; fire_events_observed: number; multi_projectile_fires: number; successful_hit_events: number; fire_evidence: "not_observed" | "per_shot"; aim_samples: number; aim_known_s: number; tracking_mean_deviation_deg: number | null; resolved_geometry: number; unplaced_fires: number; confirmed_hit_accuracy_pct: null; fire_aim_proxy: { hits: number; misses: number; head: number; body: number; leg: number; on_target_pct: number | null; head_pct: number | null }; mean_deviation_deg: number | null; tracking_pct: number | null; tracking_known_s: number; flicks: number | null; snap_ms: MetricSummary; initial_flick_deviation_deg: number | null; retention_1s_pct: number | null; retention_windows: number; jitter_deg: number | null; reaction_ms: MetricSummary; encounters: number; first_fire_aim_pct: number | null; first_fire_aim_samples: number };
  shots: DemoShot[];
  impacts: DemoImpact[];
  shot_coverage: { fire_events: number; mapped_aim: number; unmapped_aim: number; hit_events: number; mapped_impacts: number; friendly_hit_events: number; unmapped_impacts: number; projectile_launches: number; fire_hit_pairing: "not_inferred" };
  skills: { slot: string; ability_name: string | null; base_cd_s: number | null; cooldown_kind: "fixed" | "none" | "unknown"; ability_uses: number | null; uses_source: "recorded_discharge" | "owner_cooldown_start" | "native_ability_start" | "not_observed"; avg_cd_s: number | null; shortest_cd_s: number | null; hit_signals: number }[];
  ultimate: { spend_episodes: number | null; spend_times: number[]; charge_gained: number | null; active_s: number; charge_per_s: number | null; charge_equivalent_ults: number | null; budget_consistent: boolean | null; detector: string };
  movement: { remaining_speed: MetricSummary; p95_u_s: number | null; ability_exclusions_complete: false };
}
export interface DemoPlayer {
  observed_devices: { slot: number; device_id: number | null; name: string | null; kind: "loadout_card" | "base_ability" | "ability_support" | "talent" | "item" | "utility" | "device" | "cosmetic" | "unknown"; reference_champion_id: number | null; signals: number; starts: number; fires: number; hits: number; positive_hits: number | null }[];
  index: number;
  name: string | null;
  aim: [number, number, number][];
  ultimate_charge: [number, number, number][];
  position_count: number;
  movement: [number, number, number, number][];
  movement_excluded_intervals: number;
  identity: { pawn_id: number | null; pawn_class: string | null; champion_name: string | null; profile_ids: number[]; champion_name_source: "pri_profile" | "pawn_profile" | "verified_pawn_class" | "unresolved"; level: number | null; team_actor: number | null; passive_id: number | null; credits_spent: number | null; items: { id: number; rank: number | null; name: string | null }[] };
  metrics: DemoMetrics;
}
export interface DemoAnalysis {
  pipeline: "demo-direct-results";
  metric_integration: "partial";
  output_kind: "demo_metrics";
  format_version: number;
  duration_s: number;
  frames: number;
  input_bytes: number;
  decode_errors: Record<string, number>;
  players: DemoPlayer[];
}
export type DemoWorkerMessage =
  | { type: "progress"; message: string }
  | { type: "result"; result: DemoAnalysis; elapsed_ms: number }
  | { type: "error"; message: string; detail?: string };
