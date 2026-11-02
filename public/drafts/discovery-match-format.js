// Browser logic from components/match-result/format.ts
// Source SHA256: 58191bd81c1eb2003971c52aac8d2d8c03a6b9c6402cf8add55fa9246282e490
/**
 * Formatting helpers for match-result components.
 * Centralized stat math, number formatting, and team average computation.
 * refs: none
 */
/* ── Damage math ── */
/**
 * Compute total and per-minute damage from one match player. Treat damage_done_physical as the total; expose weapon/ability breakdown only when the canonical availability tag confirms that Hi-Rez supplied it, returning null for unavailable shares or rates and guarding zero duration.
 * I/O types: `p: MatchPlayerDetail -> { totalDamage: number; weaponDamage: number; nonWeaponDamage: number | null; weaponShare: number | null; weaponPerMinute: number | null; abilityPerMinute: number | null; hasWeaponBreakdown: boolean; }`.
 * refs: doc: documents/06-reference/routes/frontend-match-detail.md
 */
export function computeDamageStats(p) {
    // The API's total player damage is stored in the historical
    // `damage_done_physical` field. Magical and in-hand values are optional
    // breakdown fields already included in that total.
    const totalDamage = p.damage_done_physical;
    const weaponDamage = p.damage_done_in_hand ?? totalDamage;
    // Explicit zero is valid. The separate tag prevents a missing provider
    // field from being mistaken for zero weapon damage and all skill damage.
    const hasWeaponBreakdown = p.damage_breakdown_available === true;
    const nonWeaponDamage = hasWeaponBreakdown
        ? Math.max(totalDamage - weaponDamage, 0)
        : null;
    const weaponShare = hasWeaponBreakdown && totalDamage > 0
        ? (weaponDamage / totalDamage) * 100
        : null;
    const minutes = p.time_in_match > 0 ? p.time_in_match / 60 : 0;
    const weaponPerMinute = hasWeaponBreakdown && minutes > 0
        ? weaponDamage / minutes
        : null;
    const abilityPerMinute = nonWeaponDamage != null && minutes > 0
        ? nonWeaponDamage / minutes
        : null;
    return {
        totalDamage,
        weaponDamage,
        nonWeaponDamage,
        weaponShare,
        weaponPerMinute,
        abilityPerMinute,
        hasWeaponBreakdown,
    };
}
/* ── Player profile helpers ── */
/**
 * Get champion-specific stats from player profile, or null if not found.
 * refs: none
 * I/O types: `profile: PlayerProfileData | null | undefined; championName: string | null | undefined -> { championName: string; wins: number; totalPlays: number; winRate: number; } | null`.
 */
export function getChampionStats(profile, championName) {
    if (!profile || !championName)
        return null;
    const tc = profile.topChampions.find((c) => c.championName === championName);
    if (!tc)
        return null;
    return {
        championName: tc.championName,
        wins: tc.wins,
        totalPlays: tc.totalPlays,
        winRate: tc.winRate,
    };
}
/**
 * Compute display-ready team averages for profile level, queue Elo, global profile win rate, and match KDA using finite observations and the supplied formatters. Return em-dash placeholders for missing metrics and null for the numeric win-rate mean when unavailable.
 * refs: doc: documents/06-reference/routes/frontend-match-detail.md
 * I/O types: `players: MatchResultPlayer[]; formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string; formatPercent: (value: number) => string -> TeamAverages`.
 */
/* ── Team averages ── */
export function computeTeamAverages(players, formatNumber, formatPercent) {
    if (players.length === 0) {
        return {
            avgLevel: "—",
            avgEloPlus: "—",
            avgWinRate: "—",
            avgWinRateValue: null,
            avgKDA: "—",
        };
    }
    // KDA average
    let kdaSum = 0;
    let kdaCount = 0;
    // Global in-game win rate (from Hi-Rez profile wins/losses, not tracked matches).
    let winRateSum = 0;
    let winRateCount = 0;
    // Account level is profile data; it is unrelated to the ranked tier.
    let levelSum = 0;
    let levelCount = 0;
    for (const p of players) {
        const md = p.matchData;
        // KDA
        if (Number.isFinite(md.kda)) {
            kdaSum += md.kda;
            kdaCount++;
        }
        // Profile-based stats
        if (p.profileData) {
            if (p.profileData.level != null && Number.isFinite(p.profileData.level)) {
                levelSum += p.profileData.level;
                levelCount++;
            }
            if (p.profileData.globalWinRate != null && Number.isFinite(p.profileData.globalWinRate)) {
                winRateSum += p.profileData.globalWinRate;
                winRateCount++;
            }
        }
    }
    return {
        avgLevel: levelCount > 0 ? formatNumber(levelSum / levelCount, { maximumFractionDigits: 0 }) : "—",
        avgEloPlus: (() => {
            const values = players.map((player) => player.profileData?.queueElo).filter((value) => value != null && Number.isFinite(value));
            return values.length > 0 ? formatNumber(values.reduce((sum, value) => sum + value, 0) / values.length, { maximumFractionDigits: 0 }) : "—";
        })(),
        // globalWinRate is already expressed in percentage points (0–100).
        avgWinRate: winRateCount > 0 ? formatPercent(winRateSum / winRateCount) : "—",
        avgWinRateValue: winRateCount > 0 ? winRateSum / winRateCount : null,
        avgKDA: kdaCount > 0 ? formatNumber(kdaSum / kdaCount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—",
    };
}

// Snapshot projection from app/matches/[id]/match-detail-client.tsx
function finiteNumber(value) {
    if (value == null || value === "")
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
export function storedProfileForMatch(player) {
    const playerId = Number(player.player_id);
    const privateId = Number(player.private_player_id ?? 0);
    if (playerId <= 0 && privateId <= 0)
        return null;
    const snapshot = player.profile_snapshot;
    if (!snapshot)
        return null;
    const globalWins = finiteNumber(snapshot.global_wins);
    const globalLosses = finiteNumber(snapshot.global_losses);
    const globalMatches = globalWins != null && globalLosses != null
        ? globalWins + globalLosses
        : 0;
    const championWins = finiteNumber(snapshot.champion_wins);
    const championLosses = finiteNumber(snapshot.champion_losses);
    const championMatches = championWins != null && championLosses != null
        ? championWins + championLosses
        : null;
    return {
        id: playerId > 0 ? String(playerId) : `private:${privateId}`,
        name: playerId > 0
            ? player.player_name
            : player.private_account_display_name || player.private_account_alias || `P-${String(privateId).padStart(6, "0")}`,
        level: finiteNumber(snapshot.level),
        platform: snapshot.platform ?? player.platform ?? "",
        region: snapshot.region ?? player.region ?? "",
        kbmTier: finiteNumber(snapshot.kbm_tier),
        kbmPoints: finiteNumber(snapshot.kbm_points),
        kbmRank: finiteNumber(snapshot.kbm_rank),
        queueElo: finiteNumber(snapshot.queue_elo),
        championElo: finiteNumber(snapshot.champion_elo),
        globalWins,
        globalLosses,
        globalWinRate: globalMatches > 0 && globalWins != null
            ? (globalWins / globalMatches) * 100
            : null,
        rankedWins: finiteNumber(snapshot.kbm_wins),
        rankedLosses: finiteNumber(snapshot.kbm_losses),
        capturedAt: snapshot.captured_at,
        snapshotSource: snapshot.source,
        cheater: snapshot.cheater === true,
        exploiter: snapshot.exploiter === true,
        susCount: finiteNumber(snapshot.sus_count) ?? 0,
        verified: snapshot.verified === true,
        totalMatches: globalMatches,
        totalWins: globalWins ?? 0,
        winRate: globalMatches > 0 && globalWins != null
            ? (globalWins / globalMatches) * 100
            : null,
        totalPlays: globalMatches,
        topChampions: championMatches != null ? [{
                championName: player.champion_name,
                championId: player.champion_id,
                wins: championWins ?? 0,
                totalPlays: championMatches,
                winRate: championMatches > 0 && championWins != null
                    ? (championWins / championMatches) * 100
                    : 0,
            }] : [],
    };
}

// Exact credit fallback from lib/api-client.ts
export function deriveMissingMatchCreditRates(detail) {
    return {
        ...detail,
        players: detail.players.map((player) => {
            const credits = Number(player.gold_earned ?? 0);
            const seconds = Number(detail.match.duration_seconds ?? 0);
            const storedCpm = Number(player.gold_per_minute ?? 0);
            const storedEcpm = Number(player.egpm ?? 0);
            if ((storedCpm > 0 && storedEcpm > 0) || credits <= 0 || seconds <= 0)
                return player;
            return {
                ...player,
                gold_per_minute: storedCpm > 0
                    ? player.gold_per_minute
                    : Math.round((credits * 60 / seconds) * 100) / 100,
                egpm: storedEcpm > 0
                    ? player.egpm
                    : Math.round(((credits - 500) * 60 / seconds) * 100) / 100,
            };
        }),
    };
}
