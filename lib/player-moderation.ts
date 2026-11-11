/**
 * Read fresh player moderation and map every public review field.
 * Coalesce queued/running badge reads only; never retain settled player results.
 * refs: endpoints /players/bulk · /player-ext/private/bulk
 */
/**
 * Define player moderation as `{ cheater: boolean; exploiter: boolean; susCount: number; dropper: boolean; dropperVoteCount: number; afkWintrade: boolean; afkWintradeVoteCount: number; boosted: boolean; boostedMatchCount: number; altAccount: boolean; altAccountVoteCount: number; automaticAfk: boolean; automaticAfkCount: number; wallShooterCount: number; masterFeedingCount: number; tankDiffCount: number; supportDiffCount: number; dpsDiffCount: number; flankDiffCount: number; noobCount: number; hypercarryCount: number; verified: boolean; }`.
 * refs: none
 */
export type PlayerModeration = {
  cheater: boolean;
  exploiter: boolean;
  susCount: number;
  dropper: boolean;
  dropperVoteCount: number;
  afkWintrade: boolean;
  afkWintradeVoteCount: number;
  boosted: boolean;
  boostedMatchCount: number;
  altAccount: boolean;
  altAccountVoteCount: number;
  automaticAfk: boolean;
  automaticAfkCount: number;
  wallShooterCount: number;
  masterFeedingCount: number;
  tankDiffCount: number;
  supportDiffCount: number;
  dpsDiffCount: number;
  flankDiffCount: number;
  noobCount: number;
  hypercarryCount: number;
  verified: boolean;
  customTag: string | null;
  customTagColor: string | null;
};

const EMPTY: PlayerModeration = {
  cheater: false,
  exploiter: false,
  susCount: 0,
  dropper: false,
  dropperVoteCount: 0,
  afkWintrade: false,
  afkWintradeVoteCount: 0,
  boosted: false,
  boostedMatchCount: 0,
  altAccount: false,
  altAccountVoteCount: 0,
  automaticAfk: false,
  automaticAfkCount: 0,
  wallShooterCount: 0,
  masterFeedingCount: 0,
  tankDiffCount: 0,
  supportDiffCount: 0,
  dpsDiffCount: 0,
  flankDiffCount: 0,
  noobCount: 0,
  hypercarryCount: 0,
  verified: false,
  customTag: null,
  customTagColor: null,
};
const pending = new Map<number, Array<(value: PlayerModeration) => void>>();
const inFlight = new Map<number, Array<(value: PlayerModeration) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Prevent post-preference-edit callers from joining pre-edit reads; settle existing readers normally.
 *
 * I/O: in (playerId: string | number) -> out void
 *
 * refs: none
 */
export function invalidatePlayerModeration(playerId: string | number): void {
  inFlight.delete(Number(playerId));
}


// User-facing error keys — resolved at the UI layer via t()
/**
 * Expose the localization keys for public and private moderation-badge loading failures.
 * refs: none
 */
export const MODERATION_ERROR_KEYS = {
  unableToLoadBadges: "generated.moderation.unableToLoadBadges",
  unableToLoadPrivateBadges: "generated.moderation.unableToLoadPrivateBadges",
} as const;

/**
 * Keep fields already supplied by a canonical page payload over a fallback lookup. · refs: none
 * I/O types: `fallback: PlayerModeration; supplied: Partial<PlayerModeration> -> PlayerModeration`.
 */
export function mergePlayerModeration(
  fallback: PlayerModeration,
  supplied: Partial<PlayerModeration>,
): PlayerModeration {
  return {
    cheater: supplied.cheater === undefined ? fallback.cheater : Boolean(supplied.cheater),
    exploiter: supplied.exploiter === undefined ? fallback.exploiter : Boolean(supplied.exploiter),
    susCount: supplied.susCount === undefined ? fallback.susCount : Number(supplied.susCount) || 0,
    dropper: supplied.dropper === undefined ? fallback.dropper : Boolean(supplied.dropper),
    dropperVoteCount: supplied.dropperVoteCount === undefined ? fallback.dropperVoteCount : Number(supplied.dropperVoteCount) || 0,
    afkWintrade: supplied.afkWintrade === undefined ? fallback.afkWintrade : Boolean(supplied.afkWintrade),
    afkWintradeVoteCount: supplied.afkWintradeVoteCount === undefined ? fallback.afkWintradeVoteCount : Number(supplied.afkWintradeVoteCount) || 0,
    boosted: supplied.boosted === undefined ? fallback.boosted : Boolean(supplied.boosted),
    boostedMatchCount: supplied.boostedMatchCount === undefined ? fallback.boostedMatchCount : Number(supplied.boostedMatchCount) || 0,
    altAccount: supplied.altAccount === undefined ? fallback.altAccount : Boolean(supplied.altAccount),
    altAccountVoteCount: supplied.altAccountVoteCount === undefined ? fallback.altAccountVoteCount : Number(supplied.altAccountVoteCount) || 0,
    automaticAfk: supplied.automaticAfk === undefined ? fallback.automaticAfk : Boolean(supplied.automaticAfk),
    automaticAfkCount: supplied.automaticAfkCount === undefined ? fallback.automaticAfkCount : Number(supplied.automaticAfkCount) || 0,
    wallShooterCount: supplied.wallShooterCount === undefined ? fallback.wallShooterCount : Number(supplied.wallShooterCount) || 0,
    masterFeedingCount: supplied.masterFeedingCount === undefined ? fallback.masterFeedingCount : Number(supplied.masterFeedingCount) || 0,
    tankDiffCount: supplied.tankDiffCount === undefined ? fallback.tankDiffCount : Number(supplied.tankDiffCount) || 0,
    supportDiffCount: supplied.supportDiffCount === undefined ? fallback.supportDiffCount : Number(supplied.supportDiffCount) || 0,
    dpsDiffCount: supplied.dpsDiffCount === undefined ? fallback.dpsDiffCount : Number(supplied.dpsDiffCount) || 0,
    flankDiffCount: supplied.flankDiffCount === undefined ? fallback.flankDiffCount : Number(supplied.flankDiffCount) || 0,
    noobCount: supplied.noobCount === undefined ? fallback.noobCount : Number(supplied.noobCount) || 0,
    hypercarryCount: supplied.hypercarryCount === undefined ? fallback.hypercarryCount : Number(supplied.hypercarryCount) || 0,
    verified: supplied.verified === undefined ? fallback.verified : Boolean(supplied.verified),
    customTag: supplied.customTag === undefined ? fallback.customTag : supplied.customTag,
    customTagColor: supplied.customTagColor === undefined ? fallback.customTagColor : supplied.customTagColor,
  };
}

type BulkPlayer = {
  id: string | number;
  cheater?: boolean;
  exploiter?: boolean;
  sus_count?: number;
  dropper?: boolean;
  dropper_vote_count?: number;
  afk_wintrade?: boolean;
  afk_wintrade_vote_count?: number;
  boosted?: boolean;
  boosted_match_count?: number;
  alt_account?: boolean;
  alt_account_vote_count?: number;
  automatic_afk?: boolean;
  automatic_afk_count?: number;
  automatic_tag_expires_at?: number | null;
  wall_shooter_count?: number;
  master_feeding_count?: number;
  tank_diff_count?: number;
  support_diff_count?: number;
  dps_diff_count?: number;
  flank_diff_count?: number;
  noob_count?: number;
  hypercarry_count?: number;
  verified?: boolean;
  custom_tag?: string | null;
  custom_tag_color?: string | null;
};

function moderationRows(json: { data?: { players?: BulkPlayer[] }; players?: BulkPlayer[] }): BulkPlayer[] {
  return json.data?.players ?? json.players ?? [];
}

function moderationFromRow(player: BulkPlayer): PlayerModeration {
  return {
    cheater: Boolean(player.cheater),
    exploiter: Boolean(player.exploiter),
    susCount: Number(player.sus_count ?? 0),
    dropper: Boolean(player.dropper),
    dropperVoteCount: Number(player.dropper_vote_count ?? 0),
    afkWintrade: Boolean(player.afk_wintrade),
    afkWintradeVoteCount: Number(player.afk_wintrade_vote_count ?? 0),
    boosted: Boolean(player.boosted),
    boostedMatchCount: Number(player.boosted_match_count ?? 0),
    altAccount: Boolean(player.alt_account),
    altAccountVoteCount: Number(player.alt_account_vote_count ?? 0),
    automaticAfk: Boolean(player.automatic_afk),
    automaticAfkCount: Number(player.automatic_afk_count ?? 0),
    wallShooterCount: Number(player.wall_shooter_count ?? 0),
    masterFeedingCount: Number(player.master_feeding_count ?? 0),
    tankDiffCount: Number(player.tank_diff_count ?? 0),
    supportDiffCount: Number(player.support_diff_count ?? 0),
    dpsDiffCount: Number(player.dps_diff_count ?? 0),
    flankDiffCount: Number(player.flank_diff_count ?? 0),
    noobCount: Number(player.noob_count ?? 0),
    hypercarryCount: Number(player.hypercarry_count ?? 0),
    verified: Boolean(player.verified),
    customTag: player.custom_tag ?? null,
    customTagColor: player.custom_tag_color ?? null,
  };
}

/**
 * One database-only moderation read for data surfaces that already have player profiles. · refs: none
 * I/O types: `playerIds: Array<string | number> -> Promise<Map<number, PlayerModeration>>`.
 */
export async function fetchPlayerModerationBatch(playerIds: Array<string | number>): Promise<Map<number, PlayerModeration>> {
  const ids = [...new Set(playerIds
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
    .slice(0, 50);
  if (ids.length === 0) return new Map();

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "/api"}/players/bulk?ids=${ids.join(",")}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(MODERATION_ERROR_KEYS.unableToLoadBadges);
  const json = await response.json() as { data?: { players?: BulkPlayer[] }; players?: BulkPlayer[] };
  const results = new Map<number, PlayerModeration>();
  for (const player of moderationRows(json)) {
    const id = Number(player.id);
    const value = moderationFromRow(player);
    results.set(id, value);
  }
  return results;
}

/**
 * Read moderation for canonical private identities without mixing their serial
 * IDs into the public Hi-Rez player-ID cache.
 * refs: none
 * I/O types: `privateIds: Array<string | number> -> Promise<Map<number, PlayerModeration>>`.
 */
export async function fetchPrivateAccountModerationBatch(
  privateIds: Array<string | number>,
): Promise<Map<number, PlayerModeration>> {
  const ids = [...new Set(privateIds
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
    .slice(0, 50);
  if (ids.length === 0) return new Map();

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "/api"}/player-ext/private/bulk?ids=${ids.join(",")}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(MODERATION_ERROR_KEYS.unableToLoadPrivateBadges);
  const json = await response.json() as {
    accounts?: Array<{ id: string | number; cheater?: boolean; sus_count?: number }>;
  };
  return new Map((json.accounts ?? []).map((account) => [Number(account.id), {
    cheater: Boolean(account.cheater),
    exploiter: false,
    susCount: Number(account.sus_count ?? 0),
    dropper: false,
    dropperVoteCount: 0,
    afkWintrade: false,
    afkWintradeVoteCount: 0,
    boosted: false,
    boostedMatchCount: 0,
    altAccount: false,
    altAccountVoteCount: 0,
    automaticAfk: false,
    automaticAfkCount: 0,
    wallShooterCount: 0,
    masterFeedingCount: 0,
    tankDiffCount: 0,
    supportDiffCount: 0,
    dpsDiffCount: 0,
    flankDiffCount: 0,
    noobCount: 0,
    hypercarryCount: 0,
    verified: false,
    customTag: null,
    customTagColor: null,
  }]));
}

async function flush() {
  timer = null;
  const ids = [...pending.keys()].slice(0, 50);
  if (ids.length === 0) return;
  const readers = new Map<number, Array<(value: PlayerModeration) => void>>();
  for (const id of ids) {
    const resolvers = pending.get(id)!;
    readers.set(id, resolvers);
    inFlight.set(id, resolvers);
    pending.delete(id);
  }
  if (pending.size > 0 && !timer) timer = setTimeout(() => void flush(), 0);

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/players/bulk?ids=${ids.join(",")}`, { cache: "no-store" });
    if (!response.ok) throw new Error(MODERATION_ERROR_KEYS.unableToLoadBadges);
    const json = await response.json() as { data?: { players?: BulkPlayer[] }; players?: BulkPlayer[] };
    const results = new Map(moderationRows(json).map((player) => [Number(player.id), moderationFromRow(player)]));
    for (const id of ids) {
      const value = results.get(id) ?? EMPTY;
      const resolvers = readers.get(id)!;
      if (inFlight.get(id) === resolvers) inFlight.delete(id);
      resolvers.forEach((resolve) => resolve(value));
    }
  } catch {
    for (const id of ids) {
      const resolvers = readers.get(id)!;
      if (inFlight.get(id) === resolvers) inFlight.delete(id);
      resolvers.forEach((resolve) => resolve(EMPTY));
    }
  }

  if (pending.size > 0 && !timer) timer = setTimeout(() => void flush(), 0);
}

/**
 * Batch visible badge lookups and join only reads that have not settled. · refs: /players/bulk
 * I/O types: `playerId: string | number -> Promise<PlayerModeration>`.
 */
export function fetchPlayerModeration(playerId: string | number): Promise<PlayerModeration> {
  const id = Number(playerId);
  if (!Number.isSafeInteger(id) || id <= 0) return Promise.resolve(EMPTY);

  return new Promise((resolve) => {
    const running = inFlight.get(id);
    if (running) {
      running.push(resolve);
      return;
    }
    const resolvers = pending.get(id) ?? [];
    resolvers.push(resolve);
    pending.set(id, resolvers);
    if (!timer) timer = setTimeout(() => void flush(), 0);
  });
}
