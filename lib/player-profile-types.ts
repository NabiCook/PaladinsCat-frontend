/** Define the typed API contract consumed by player profile server and client views. · refs: none */
interface PlayerData {
  id: string;
  name: string;
  level: number;
  wins: number;
  losses: number;
  leaves: number;
  hours_played: number;
  minutes_played: number;
  mastery_level: number;
  region: string;
  platform: string;
  total_xp: string;
  total_worshippers: string;
  total_achievements: number;
  avatar_id: number;
  avatar_url: string;
  title: string;
  loading_frame: string;
  created_datetime: string;
  last_login_datetime: string;
  personal_status_message: string;
  privacy_flag: string;
  kbm_points: number;
  kbm_tier: number;
  kbm_season: number;
  kbm_wins: number;
  kbm_losses: number;
  kbm_rank: number;
  kbm_name: string;
  kbm_leaves: number;
  kbm_trend: number;
  kbm_prev_rank: number;
  total_matches: number;
  total_wins: number;
  total_losses: number;
  avg_egpm: number | null;
  avg_dpm: number | null;
  avg_hpm: number | null;
  avg_shpm: number | null;
  avg_spm: number | null;
  derived_rates?: { kpm: number | null; deaths_per_minute: number | null } | null;
  cheater: boolean;
  exploiter: boolean;
  dropper: boolean;
  afk_wintrade: boolean;
  alt_account: boolean;
  boosted: boolean;
  verified?: boolean | null;
  custom_tag?: string | null;
  custom_tag_color?: string | null;
  sus_count: number;
  weirdo_count: number;
  hall_of_fame_count: number;
  platform_name: string;
  last_seen: string;
  first_seen: string;
  hirez_profile_refreshed_at: string | null;
}

interface QueueRating {
  queue_id: number;
  mu: number;
  phi: number;
  volatility: number;
  matches_played?: number;
  wins?: number;
  losses?: number;
}

interface ChampionRating {
  champion_id: number;
  champion_name: string;
  mu: number;
  phi: number;
  matches_played: number;
  wins: number;
  losses: number;
}

/**
 * Describe the raw profile response used by the server and hydrated client.
 * I/O: API JSON object -> PlayerResponse.
 * refs: endpoints: GET /players/{id}
 */
export interface PlayerStatus {
  status: number;
  status_string?: string | null;
  [field: string]: unknown;
}

/** The raw player-profile API response shape (presence, access, player, ratings).
 *
 * refs: none
 */
export interface PlayerResponse {
  presence?: PlayerStatus | null;
  statusRefresh?: { refreshed: boolean; cached?: boolean; refreshed_at?: string | null; error?: string | null };
  historyRefresh?: { refreshed: boolean; error?: string | null };
  championStatsRefresh?: { refreshed?: boolean; error?: string | null };
  refreshQuota?: { remaining: number; reset_at: string | null; remaining_seconds: number } | null;
  access?: { fullAccess: boolean; limit: number | null; remaining: number | null; resetAtMs: number | null };
  player: PlayerData;
  queueRatings?: QueueRating[];
  championRatings?: ChampionRating[];
  profileRefresh: {
    ttl_seconds: number;
    refreshed_at: string | null;
    expires_at: string | null;
    next_refresh_at?: string | null;
    remaining_seconds: number;
    expired: boolean;
    was_expired?: boolean;
    attempted: boolean;
    refreshed: boolean;
    deferred?: boolean;
    source: "database" | "hirez" | "stale-database";
    error?: string | null;
  };
}
