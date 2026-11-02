/** Row shapes for a private-account profile captured over MCTS.
 * The Hi-Rez API refuses these accounts, so every row here is capture data:
 * XP and level are profile facts, never match statistics.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */

/** One capture-time champion row for the account. */
export interface MctsChampionRow {
  profile_id: number;
  champion_id: number | null;
  /** Empty when the capture did not resolve a catalog name. */
  champion_name: string;
  character_id: number | null;
  xp: number;
  level: number;
  ownership_type: number | null;
}

/** One item slot inside a captured loadout. */
export interface MctsLoadoutItem {
  item_id: number;
  count: number;
}

/** One captured loadout deck. */
export interface MctsLoadout {
  loadout_id: number;
  champion_id: number | null;
  talent_id: number | null;
  name: string;
  sort_order: number;
  items: MctsLoadoutItem[];
}

/** One captured inventory row. */
export interface MctsInventoryRow {
  item_id: number;
  character_id: number | null;
  is_owned: boolean;
  is_transient: boolean;
  instance_count: number;
  item_level: number;
  remaining_seconds: number;
}

/** Which capture run produced this profile. */
export interface MctsProvenance {
  run_id: string;
  member: string;
  status: string;
}

/** Row counters reported by the capture, not recomputed by the client. */
export interface MctsCounts {
  champions: number;
  loadouts: number;
  inventory: number;
}

/** A private-account profile captured over MCTS. */
export interface MctsProfileResponse {
  player_id: number;
  source: string;
  private: boolean;
  privacy_flag: number;
  name: string;
  gamer_tag: string;
  identity_status: string;
  xp_level: number;
  account_level: number | null;
  captured_at: string | null;
  provenance: MctsProvenance | null;
  counts: MctsCounts;
  champions: MctsChampionRow[];
  loadouts: MctsLoadout[];
  inventory: MctsInventoryRow[];
  currency: unknown[];
  stats_available: boolean;
  stats_note: string;
}
