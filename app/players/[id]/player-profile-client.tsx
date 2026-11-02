/**
 * Render the PlayerProfileClient view for the player id player-profile-client route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";
import { ApiRequestError, formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import PlatformIcon from "@/components/platform-icon";
import CardIcon from "@/components/card-icon";
import { useRouter } from "next/navigation";
import { PlayersBackLink } from "@/components/ui/players-page-header";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { clearPlayerTag, fetchPlayerMatches, fetchPlayerEvidence, type ClearablePlayerTag, type MatchRecord, type ReportType, type ExploiterEvidenceDetail } from "@/lib/api-client";
import PlayerMatchTags from "@/components/player-match-tags";
import { getTierColor, resolveEffectiveTier, getRankIconPath } from "@/lib/tier-utils";
import { useAuth } from "@/lib/auth-context";
import { localPreviewAccessEnabled, useLocalPreviewAccess } from "@/lib/use-local-preview-access";
import { hasStatsAccess } from "@/lib/verified-access";
import ReportModal from "@/components/ReportModal";
import AltAccountRelationModal from "@/components/alt-account-relation-modal";
import { formatLocalDate, formatLocalDateTime } from "@/lib/time-format";
import { ErrorState, LoadingIndicator, LoadingOverlay, LoadingPanel } from "@/components/async-state";
import { DataTableSkeleton, RouteSkeleton } from "@/components/route-skeleton";
import { formatKda } from "@/lib/kda";
import PlayerName, { PlayerModerationTag } from "@/components/player-name";
import PlayerLoadingFrame from "@/components/player-loading-frame";
import PlayerNameHistory from "@/components/player-name-history";
import { displayLoadingFrameName } from "@/lib/loading-frame-assets";
import { fetchPlayerModeration } from "@/lib/player-moderation";
import { useLocalization } from "@/lib/localization-context";
import { parsePlayerTitle, parsePlayerTitleSegments } from "@/lib/player-title";
import { useRouteSettledLoading } from "@/lib/route-transition-context";
import { csrfHeader } from "@/lib/csrf";
import { playerAvatarProxyPath } from "@/lib/player-avatar-proxy";
import { hasMctsPrivateProfile } from "@/lib/mcts-profile-probe";
import { getPercentageColor } from "@/lib/stat-quality";
import type { PlayerResponse } from "@/lib/player-profile-types";
import { decodePlayerProfileResponse, decodePlayerLiveMatchResponse, type NormalizedPlayerProfile } from "@/lib/player-profile-response";
import PlayerPresence from "@/components/player-presence";
import PlayerRelationshipSummaryCard from "@/components/player-relationship-summary";
import PlayerTrendsPanel from "@/components/player-trends";

import { LoginRequired } from "@/components/login-required";
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, CirclePlay, Menu, RefreshCw, X } from "lucide-react";

interface RefreshFeedback {
  kind: 'warning' | 'success' | 'error';
  message: string;
}

interface PlayerRefreshActionResponse {
  presence?: PlayerResponse["presence"];
  statusRefresh?: PlayerResponse["statusRefresh"];
  profileRefresh?: PlayerResponse["profileRefresh"];
  message?: string;
  error?: {
    message?: string;
    details?: {
      retry_after_seconds?: number;
    };
  };
  historyRefresh?: { error?: string };
  championStatsRefresh?: { error?: string };
  refreshQuota?: {
    remaining?: number;
    reset_at?: string | null;
    remaining_seconds?: number;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

function trendArrow(trend: number): React.ReactNode {
  if (trend > 0) return <ArrowUp size={16} className="inline align-middle" aria-hidden="true" />;
  if (trend < 0) return <ArrowDown size={16} className="inline align-middle" aria-hidden="true" />;
  return "—";
}

function trendColor(trend: number): string {
  if (trend > 0) return "text-emerald-400";
  if (trend < 0) return "text-rose-400";
  return "text-pc-text-muted";
}

// Inline stat row: label + value
function StatRow({ label, value, color, style }: { label: string; value: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="min-w-0 break-words text-xs text-pc-text-muted">{label}</span>
      <span className={`min-w-0 break-words text-right text-xs font-mono font-medium ${color || "text-pc-text"}`} style={style}>{value}</span>
    </div>
  );
}

// Compact 2-column stat grid
function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-4 gap-y-2 min-[400px]:grid-cols-2">{children}</div>;
}

/**
 * A single row in the unified evidence section — one of a user report, a
 * system flag (win trade / talent abuse / future type), or a computed cosmetic.
 */
interface UnifiedEvidence {
  key: string;
  category: string;
  categoryTone: "reported" | "system" | "cosmetic";
  title: string;
  detail: string;
  matchId: number | null;
  sourceUrl: string | null;
  when: string | null;
}

/**
 * Classify a free-form flag reason into a display category so the evidence
 * section is not hardcoded to cosmetic evidence. Extensible: an unrecognized
 * reason falls back to the generic "system flagged" label rather than being
 * dropped.
 */
function flagCategory(reason: string, voteType: string, t: (key: any) => string): string {
  const text = `${reason} ${voteType}`.toLowerCase();
  if (text.includes("win trade") || text.includes("win-trade") || voteType === "afk_wintrade") {
    return t("moderation.evidenceWinTrade");
  }
  if (text.includes("talent") || text.includes("cosmetic")) {
    return t("moderation.evidenceTalentAbuse");
  }
  return t("moderation.evidenceSystem");
}

/**
 * Merge the portal/system evidence records, the moderation flags, and the
 * computed cosmetic evidence into one ordered list for the evidence section.
 * Returns: `UnifiedEvidence[]`.
 */
function buildUnifiedEvidence(detail: ExploiterEvidenceDetail, t: (key: any) => string): UnifiedEvidence[] {
  const rows: UnifiedEvidence[] = [];
  detail.flagEvidence.forEach((item) => {
    if (item.origin !== "player_submitted" && item.origin !== "automated") return;
    const systemFlagged = item.origin === "automated";
    rows.push({
      key: `fe-${item.id}`,
      category: systemFlagged ? t("moderation.evidenceSystem") : t("moderation.evidenceReported"),
      categoryTone: systemFlagged ? "system" : "reported",
      title: item.title || item.description || "—",
      detail: item.description || item.title || "",
      matchId: item.matchId,
      sourceUrl: item.sourceUrl,
      when: item.createdAt || null,
    });
  });
  detail.flags.forEach((flag, index) => {
    rows.push({
      key: `flag-${index}`,
      category: flagCategory(flag.reason, flag.voteType, t),
      categoryTone: "system",
      title: flag.reason || flagCategory(flag.reason, flag.voteType, t),
      detail: flag.reason || "",
      matchId: null,
      sourceUrl: null,
      when: flag.createdAt || null,
    });
  });
  detail.cosmeticEvidence.forEach((item, index) => {
    rows.push({
      key: `cos-${index}`,
      category: t("moderation.evidenceCosmetic"),
      categoryTone: "cosmetic",
      title: item.name || item.kind,
      detail: item.reason || "",
      matchId: null,
      sourceUrl: null,
      when: item.observedDate || item.accountCreatedDate || null,
    });
  });
  return rows;
}


// User-facing error keys — resolved at the UI layer via t()
/**
 * Define translation keys for failures in the player id player-profile-client view.
 * Returns the stable key map consumed by localized error messages.
 * refs: none
 */
export const PLAYER_PROFILE_ERROR_KEYS = {
  failedToLoadProfile: "generated.players.failedToLoadProfile",
  failedToRefreshProfile: "generated.players.failedToRefreshProfile",
  failedToFetchLiveMatchData: "generated.players.failedToFetchLiveMatchData",
} as const;

/**
 * Render the PlayerProfileClient view for the player id player-profile-client route.
 * refs: none
 * I/O types: `{ id: string, initialResponse: PlayerResponse | null, isPro?: boolean }` -> `JSX.Element`.
 */
export default function PlayerProfileClient({
  id,
  initialResponse,
  isPro = false,
}: {
  id: string;
  initialResponse: PlayerResponse | null;
  isPro?: boolean;
}) {
  const { t, formatDuration, formatNumber, formatPercent , formatDate, formatDateTime} = useLocalization();
  const formatLargeNumber = (value: string | number | null | undefined) => formatNumber(value == null ? null : Number(value));
  const formatMatchDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds || 0));
    return t("common.format.clock", {
      minutes: formatNumber(Math.floor(total / 60), { minimumIntegerDigits: 2, useGrouping: false }),
      seconds: formatNumber(total % 60, { minimumIntegerDigits: 2, useGrouping: false }),
    });
  };
  const displayMatchMap = (mapName: string, queueId: number | null) => {
    const resolved = mapName || t("generated.app.players.[id].page.unknownmap");
    return queueId === 486 ? resolved.replace(/^Ranked\s+/i, "") : resolved;
  };
  const formatHours = (hours: number) => {
    if (!hours) return "—";
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return days > 0
      ? t("common.format.daysHoursShort", { days: formatNumber(days), hours: formatNumber(remainingHours) })
      : t("common.format.hoursShort", { hours: formatNumber(remainingHours) });
  };
  const formatCooldown = (remainingMs: number) => formatDuration(Math.ceil(remainingMs / 1000));
  const router = useRouter();
  const { user, isLoading: authLoading, isLoggedIn, isAdmin, isApproved } = useAuth();
  const localPreview = useLocalPreviewAccess();

  const initialProfile = initialResponse === null ? null : decodePlayerProfileResponse(initialResponse);
  const [response, setResponse] = useState<NormalizedPlayerProfile | null>(() => initialProfile?.ok ? initialProfile.value : null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [matchesError, setMatchesError] = useState<Error | null>(null);
  const [evidence, setEvidence] = useState<ExploiterEvidenceDetail | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(initialResponse === null);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const displayProfileLoading = useRouteSettledLoading(profileLoading && (authLoading || !!user));
  const [error, setError] = useState<string | null>(() => initialProfile !== null && !initialProfile.ok
    ? t(PLAYER_PROFILE_ERROR_KEYS.failedToLoadProfile) : null);
  const fullAccess = hasStatsAccess(user) && response?.access?.fullAccess !== false;

  // Button states
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<RefreshFeedback | null>(null);
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState<number | null>(null);
  const [refreshClock, setRefreshClock] = useState(() => Date.now());
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [showCurrentMatch, setShowCurrentMatch] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [historyFetchKey, setHistoryFetchKey] = useState(0);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [verifiedFallback, setVerifiedFallback] = useState<boolean | null>(null);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAltRelationModal, setShowAltRelationModal] = useState(false);
  const [reportType, setReportType] = useState<Exclude<ReportType, 'approve'>>('suspicious');
  const [clearingTag, setClearingTag] = useState<ClearablePlayerTag | null>(null);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [id, response?.player.avatar_url]);

  // Older API deployments may omit `player.verified` from the profile
  // response even though the bulk moderation endpoint exposes it. Keep the
  // profile badge working across both response shapes.
  useEffect(() => {
    if (!fullAccess) return;
    const directValue = response?.player.verified;
    if (typeof directValue === "boolean") {
      setVerifiedFallback(directValue);
      return;
    }

    let active = true;
    setVerifiedFallback(null);
    fetchPlayerModeration(id).then(({ verified }) => {
      if (active) setVerifiedFallback(verified);
    });
    return () => { active = false; };
  }, [fullAccess, id, response?.player.verified]);

  // Suspicious reports use the shared evidence portal; other moderation actions
  // continue through the report modal.
  const openReportModal = useCallback((type: Exclude<ReportType, 'approve'>) => {
    if (type === 'suspicious') {
      const evidencePath = `/evidence/submit?playerId=${encodeURIComponent(id)}`;
      if (!isLoggedIn) {
        router.push(`/auth/login?redirect=${encodeURIComponent(evidencePath)}`);
        return;
      }
      router.push(evidencePath);
      return;
    }
    if (!isLoggedIn) {
      router.push(`/auth/login?redirect=/players/${id}`);
      return;
    }
    setReportType(type);
    setShowReportModal(true);
  }, [isLoggedIn, router, id]);

  const closeReportModal = useCallback(() => {
    setShowReportModal(false);
    setReportType('suspicious');
  }, []);

  const openAltRelationModal = useCallback(() => {
    if (!isLoggedIn) {
      router.push(`/auth/login?redirect=/players/${id}`);
      return;
    }
    setShowAltRelationModal(true);
  }, [id, isLoggedIn, router]);

  const handleReportSuccess = useCallback(() => {
    setShowReportModal(false);
    setFetchKey(k => k + 1);
  }, []);

  const clearModerationTag = useCallback(async (tag: ClearablePlayerTag) => {
    if (!isAdmin) return;
    const confirmation = tag === 'cheater'
      ? t("moderation.confirmClearCheaterTag")
      : tag === 'exploiter'
        ? t("moderation.confirmClearModerationTag")
      : tag === 'suspicious'
        ? t("moderation.confirmClearSuspiciousTag")
        : t("moderation.confirmClearModerationTag");
    if (!window.confirm(confirmation)) return;

    setClearingTag(tag);
    try {
      await clearPlayerTag(id, tag);
      setActionMenuOpen(false);
      setFetchKey((key) => key + 1);
    } catch (err) {
      setRefreshFeedback({ kind: 'error', message: formatApiErrorMessage(err, t, t('moderation.clearTagFailed', { tag })) });
    } finally {
      setClearingTag(null);
    }
  }, [id, isAdmin, t]);

  // The server renders the first public profile response so the browser can
  // discover the avatar in the initial HTML. Browser fetches remain the
  // fallback for server failures and the source of truth after a refresh.
  useEffect(() => {
    if (!id || authLoading || (!user && !localPreviewAccessEnabled()) || (fetchKey === 0 && initialResponse)) return;
    let cancelled = false;
    setProfileLoading(true);

    fetch(`${API_BASE}/players/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(65_000) })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401 && !localPreviewAccessEnabled()) router.replace(`/auth/login?redirect=${encodeURIComponent(`/players/${id}`)}`);
        if (res.status === 403 && data?.error?.code === "VERIFICATION_REQUIRED") router.replace("/link-account");
        if (res.status === 403 && data?.error?.code === "INVITATION_REQUIRED") router.replace("/account#invitation");
        if (res.status === 404 && await hasMctsPrivateProfile(id)) {
          // The Hi-Rez API hides this account; its capture page is the real profile.
          if (!cancelled) router.replace(`/players/${id}/private`);
          return null;
        }
        if (!res.ok) throw new Error(data?.error?.message || PLAYER_PROFILE_ERROR_KEYS.failedToLoadProfile);
        const decoded = decodePlayerProfileResponse(data);
        if (!decoded.ok) throw new Error(PLAYER_PROFILE_ERROR_KEYS.failedToLoadProfile);
        return decoded.value;
      })
      .then((data) => {
        if (!cancelled && data) {
          const now = Date.now();
          setResponse(data);
          setRefreshClock(now);
          setError(null);
          setProfileLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatApiErrorMessage(err, t, "Failed to load player profile"));
          setResponse(null);
          setProfileLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [authLoading, fetchKey, id, initialResponse, router, user]);

  useEffect(() => {
    if (!refreshCooldownUntil) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRefreshClock(now);
      if (now >= refreshCooldownUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [refreshCooldownUntil]);

  useEffect(() => {
    if (!actionMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionMenuOpen]);

  const showRefreshCooldown = useCallback((
    expiresAt: string | null | undefined,
    remainingSeconds: number | null | undefined,
    kind: RefreshFeedback['kind'] = 'warning',
    message = 'Profile is current. Next refresh available in',
  ) => {
    const parsedExpiry = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
    const fallbackExpiry = Date.now() + Math.max(0, Number(remainingSeconds) || 0) * 1000;
    setRefreshCooldownUntil(Number.isFinite(parsedExpiry) ? parsedExpiry : fallbackExpiry);
    setRefreshClock(Date.now());
    setRefreshFeedback({ kind, message });
  }, []);

  useEffect(() => {
    const quota = response?.refreshQuota;
    if (response?.profileRefresh?.deferred && quota?.remaining === 0) {
      showRefreshCooldown(quota.reset_at, quota.remaining_seconds, 'warning', t("common.playerRefresh.limitReached"));
    }
  }, [response?.profileRefresh?.deferred, response?.refreshQuota, showRefreshCooldown, t]);

  // One Refresh bypasses the shared TTL and updates the whole provider bundle.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshFeedback(null);
    try {
      const csrf = csrfHeader(document.cookie, 'POST');
      const res = await fetch(`${API_BASE}/players/${id}/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
        signal: AbortSignal.timeout(65_000),
      });
      let data: PlayerRefreshActionResponse;
      const responseBody = await res.text();
      try {
        data = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        // Gateways and reverse proxies may replace an upstream 5xx JSON body
        // with an HTML/text error page. Never surface JSON.parse internals (or
        // markup) to the player; report the action failure consistently.
        throw new Error(t(PLAYER_PROFILE_ERROR_KEYS.failedToRefreshProfile));
      }
      if (res.status === 429) {
        const details = data.error?.details || {};
        const retryAfter = Number(
          details.retry_after_seconds
          ?? res.headers.get('Retry-After')
          ?? 0,
        );
        showRefreshCooldown(
          null,
          retryAfter,
          'warning',
          t("common.playerRefresh.limitReached"),
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error?.message || PLAYER_PROFILE_ERROR_KEYS.failedToRefreshProfile);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)
        || (data.message != null && typeof data.message !== 'string')) {
        throw new Error(PLAYER_PROFILE_ERROR_KEYS.failedToRefreshProfile);
      }
      const decoded = decodePlayerProfileResponse({ ...response,
        presence: data.presence, statusRefresh: data.statusRefresh,
        historyRefresh: data.historyRefresh, championStatsRefresh: data.championStatsRefresh,
        profileRefresh: data.profileRefresh ?? response?.profileRefresh,
        refreshQuota: data.refreshQuota,
      });
      if (!decoded.ok) throw new Error(PLAYER_PROFILE_ERROR_KEYS.failedToRefreshProfile);
      const refreshed = decoded.value;
      const relatedRefreshError = refreshed.profileRefresh?.error || refreshed.historyRefresh?.error
        || refreshed.championStatsRefresh?.error || refreshed.statusRefresh?.error;
      setResponse(previous => previous ? { ...previous,
        presence: refreshed.presence, statusRefresh: refreshed.statusRefresh,
        profileRefresh: refreshed.profileRefresh,
        refreshQuota: refreshed.refreshQuota,
      } : previous);
      if (!data.refreshQuota) {
        setRefreshCooldownUntil(null);
        setRefreshFeedback({ kind: relatedRefreshError ? 'warning' : 'success', message: relatedRefreshError || data.message || t("common.playerRefresh.success", { remaining: formatNumber(5) }) });
        setFetchKey(k => k + 1);
        setHistoryFetchKey((key) => key + 1);
        return;
      }
      const remaining = Math.max(0, Number(data?.refreshQuota?.remaining ?? 0));
      if (remaining === 0) {
        showRefreshCooldown(
          data?.refreshQuota?.reset_at,
          data?.refreshQuota?.remaining_seconds,
          relatedRefreshError ? 'warning' : 'success',
          [relatedRefreshError, t("common.playerRefresh.limitReached")].filter(Boolean).join(' '),
        );
      } else {
        setRefreshCooldownUntil(null);
        setRefreshFeedback({
          kind: relatedRefreshError ? 'warning' : 'success',
          message: relatedRefreshError || t(
            relatedRefreshError
              ? "common.playerRefresh.partial"
              : "common.playerRefresh.success",
            { remaining: formatNumber(remaining) },
          ),
        });
      }
      setFetchKey(k => k + 1);
      setHistoryFetchKey((key) => key + 1);
    } catch (err) {
      setRefreshCooldownUntil(null);
      setRefreshFeedback({
        kind: 'error',
        message: formatApiErrorMessage(err, t, t(PLAYER_PROFILE_ERROR_KEYS.failedToRefreshProfile)),
      });
    } finally {
      setRefreshing(false);
    }
  }, [formatNumber, id, response, showRefreshCooldown, t]);

  // Current match handler
  const handleCurrentMatch = useCallback(async () => {
    setShowCurrentMatch(true);
    setCurrentMatch(null);
    try {
      const res = await fetch(`${API_BASE}/live/players/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || PLAYER_PROFILE_ERROR_KEYS.failedToFetchLiveMatchData);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)
        || (data.error != null && typeof data.error !== 'string')
        || (data.pending != null && typeof data.pending !== 'boolean')) {
        throw new Error(PLAYER_PROFILE_ERROR_KEYS.failedToFetchLiveMatchData);
      }
      if (data.match != null) {
        const decoded = decodePlayerLiveMatchResponse(data);
        if (!decoded.ok) throw new Error(PLAYER_PROFILE_ERROR_KEYS.failedToFetchLiveMatchData);
        setCurrentMatch(decoded.value);
      } else {
        setCurrentMatch({ error: data.error, pending: data.pending, match: null });
      }
    } catch (error) {
      const failure = error instanceof Error && error.name === 'TimeoutError'
        ? new ApiRequestError(PLAYER_PROFILE_ERROR_KEYS.failedToFetchLiveMatchData, undefined, {
          kind: 'timeout', method: 'GET', endpoint: `/live/players/${id}`, timeoutMs: 60_000,
        }) : error;
      setCurrentMatch({
        error: formatApiErrorMessage(failure, t, t(PLAYER_PROFILE_ERROR_KEYS.failedToFetchLiveMatchData)),
      });
    }
  }, [id]);

  // Fetch matches independently — doesn't block profile rendering
  useEffect(() => {
    if (!id || !response || error) return;
    let cancelled = false;
    setMatchesLoading(true);
    setMatchesError(null);

    fetchPlayerMatches(id, { limit: "10" })
      .then((data) => {
        if (!cancelled) setMatches(data);
      })
      .catch((failure) => {
        if (!cancelled) setMatchesError(failure instanceof Error ? failure : new Error("Could not load recent matches"));
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, historyFetchKey, response, error]);

  // Fetch the player's published evidence independently — doesn't block profile
  // rendering. Only players with published evidence (or a public exploiter tag)
  // return data; others get an empty payload and the section is hidden.
  useEffect(() => {
    if (!id || !response || error) return;
    let cancelled = false;
    setEvidenceLoading(true);
    fetchPlayerEvidence(id)
      .then((data) => { if (!cancelled) setEvidence(data); })
      .catch(() => { if (!cancelled) setEvidence(null); })
      .finally(() => { if (!cancelled) setEvidenceLoading(false); });
    return () => { cancelled = true; };
  }, [id, response, error]);

  if (!authLoading && !user && !localPreview) {
    return <LoginRequired returnPath={`/players/${id}`} />;
  }

  if (displayProfileLoading) {
    return <RouteSkeleton variant="profile" />;
  }

  if (error || !response) {
    return (
      <div className="space-y-4">
        <ErrorState
          title={response ? t("generated.players.couldNotRefreshThisProfile") : t("generated.players.playerProfileUnavailable")}
          message={error || t("generated.app.players.[id].page.theplayercouldnotbefound")}
          onRetry={() => setFetchKey((key) => key + 1)}
        />
        <PlayersBackLink />
      </div>
    );
  }

  const { player, queueRatings = [] } = response;
  // Win-chance is owned by the backend live read-model (single source, R-A/R-C).
  // The frontend only formats the backend-provided team_one/two_win_chance fields.
  const currentMatchWinChance =
    currentMatch?.team_one_win_chance != null && currentMatch?.team_two_win_chance != null
      ? {
          teamOne: Number(currentMatch.team_one_win_chance),
          teamTwo: Number(currentMatch.team_two_win_chance),
        }
      : null;
  // `wins`/`losses` are the account-wide Hi-Rez totals. The denormalized
  // `total_*` columns are ranked-ingest aggregates and must not drive the
  // global profile performance summary.
  const globalWins = Number(player.wins ?? 0);
  const globalLosses = Number(player.losses ?? 0);
  const globalMatches = globalWins + globalLosses;
  const winRate = globalMatches > 0 ? (globalWins / globalMatches) * 100 : 0;
  const kbmRating = (queueRatings ?? []).find((r) => r.queue_id === 486);
  const kbmMu = kbmRating ? Number(kbmRating.mu) : null;
  const effectiveTier = resolveEffectiveTier(player.kbm_tier, player.kbm_rank);
  const rankedTierLabel = effectiveTier.isGrandmaster ? "GM" : effectiveTier.displayName;
  const tierColor = getTierColor(effectiveTier.displayTier);
  const rankIcon = getRankIconPath(player.kbm_tier, player.kbm_rank);
  const kbmWr = player.kbm_wins + player.kbm_losses > 0
    ? formatNumber(((player.kbm_wins / (player.kbm_wins + player.kbm_losses)) * 100), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : "—";
  const refreshRemainingMs = refreshCooldownUntil
    ? Math.max(0, refreshCooldownUntil - refreshClock)
    : 0;
  const refreshDisabled = refreshing || refreshRemainingMs > 0;
  const refreshFeedbackColor = refreshFeedback?.kind === 'error'
    ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : refreshFeedback?.kind === 'success'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
      : 'text-amber-300 bg-amber-500/10 border-amber-500/20';
  const avatarUrl = !avatarLoadFailed
    ? playerAvatarProxyPath(player.avatar_id, player.avatar_url)
    : null;
  const loadingFrameName = displayLoadingFrameName(player.loading_frame);
  // Hi-Rez titles arrive as `<font color="...">text</font>` markup (possibly
    // several concatenated tags for multi-color titles). Parse it so each
    // segment's color is applied as a style and only plain text is rendered.
    const titleSegments = parsePlayerTitleSegments(player.title ?? '');
    const parsedTitle = parsePlayerTitle(player.title ?? '');

  return (
    <div className="space-y-5">
      <PlayersBackLink />

      <div className="pc-content-2-3 mx-auto space-y-5">
      {/* ── Header ── */}
      <div className={`pc-card relative self-start ${actionMenuOpen ? 'z-40' : 'z-10'}`}>
        <LoadingOverlay visible={refreshing} />
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-6">
        {/* Keep live/refresh controls visible; consolidate voting and moderation. */}
        <div ref={actionMenuRef} className="relative order-2 flex shrink-0 flex-wrap items-center justify-end gap-2 self-stretch lg:self-center">
          {isPro && <PlayerPresence status={response.presence} error={response.statusRefresh?.error} loading={refreshing} />}
          <button
            type="button"
            onClick={handleCurrentMatch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-pc-border/70 bg-pc-bg-secondary/90 px-3 py-2 text-xs font-semibold text-pc-text transition-colors hover:border-pc-accent-mid hover:text-pc-accent"
            title={t("generated.players.checkCurrentMatch")}
          >
            <CirclePlay aria-hidden="true" size={15} />
            {t("generated.players.current")}</button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshDisabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-pc-border/70 bg-pc-bg-secondary/90 px-3 py-2 text-xs font-semibold text-pc-text transition-colors hover:border-pc-accent-mid hover:text-pc-accent disabled:cursor-not-allowed disabled:opacity-50"
            title={t("common.playerRefresh.quotaTitle")}
          >
            <RefreshCw aria-hidden="true" size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? t("generated.players.refreshing") : refreshRemainingMs > 0 ? t("generated.players.refreshInValue1", { value1: formatCooldown(refreshRemainingMs) }) : t("generated.players.refresh")}
          </button>

          <button
            type="button"
            onClick={() => {
              setRefreshFeedback(null);
              setActionMenuOpen((open) => !open);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-pc-border/70 bg-pc-bg-secondary/90 px-3 py-2 text-xs font-semibold text-pc-text transition-colors hover:border-pc-accent-mid hover:text-pc-accent"
            aria-haspopup="menu"
            aria-expanded={actionMenuOpen}
          >
            <Menu aria-hidden="true" size={15} />
            {t("generated.players.actions")}</button>

          {actionMenuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-pc-border bg-pc-bg-secondary p-2 shadow-lg"
              role="menu"
              aria-label={t("generated.players.playerActions")}
            >
              <div className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-widest text-pc-text-muted">{t("generated.players.community")}</div>
              <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); openReportModal('suspicious'); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-amber-400 transition-colors hover:bg-amber-500/10">
                <span>{t("generated.players.reportSuspicious")}</span>
                {player.sus_count > 0 && <span className="text-xs tabular-nums">{player.sus_count}</span>}
              </button>
              <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); openReportModal('weirdo'); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-violet-300 transition-colors hover:bg-violet-500/10">
                <span>{t("generated.players.voteWeirdo")}</span>
                {player.weirdo_count > 0 && <span className="text-xs tabular-nums">{player.weirdo_count}</span>}
              </button>
              <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); openReportModal('hall_of_fame'); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-emerald-300 transition-colors hover:bg-emerald-500/10">
                <span>{t("generated.players.voteHallOfFame")}</span>
                {player.hall_of_fame_count > 0 && <span className="text-xs tabular-nums">{player.hall_of_fame_count}</span>}
              </button>
              <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); openAltRelationModal(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-fuchsia-300 transition-colors hover:bg-fuchsia-500/10">
                {t("moderation.voteAltAccount")}</button>

              {(isAdmin || isApproved) && (
                <>
                  <div className="my-2 border-t border-pc-border/70" />
                  <div className="px-2 pb-1 text-xs font-bold uppercase tracking-widest text-pc-text-muted">{t("generated.players.moderation")}</div>
                  <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); openReportModal('cheater'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10">
                    {t("generated.players.flagAsCheater")}</button>
                  {isAdmin && (
                    <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); openReportModal('exploiter'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-orange-400 transition-colors hover:bg-orange-500/10">
                      {t("moderation.flagExploiter")}</button>
                  )}
                  {isAdmin && player.cheater && (
                    <button type="button" role="menuitem" disabled={clearingTag !== null} onClick={() => clearModerationTag('cheater')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                      {clearingTag === 'cheater' ? t("generated.components.submitting") : t("moderation.clearCheaterTag")}
                    </button>
                  )}
                  {isAdmin && player.exploiter && (
                    <button type="button" role="menuitem" disabled={clearingTag !== null} onClick={() => clearModerationTag('exploiter')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-orange-300 transition-colors hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                      {clearingTag === 'exploiter' ? t("generated.components.submitting") : t("moderation.clearExploiterTag")}
                    </button>
                  )}
                  {isAdmin && player.sus_count > 0 && (
                    <button type="button" role="menuitem" disabled={clearingTag !== null} onClick={() => clearModerationTag('suspicious')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-amber-300 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                      {clearingTag === 'suspicious' ? t("generated.components.submitting") : t("moderation.clearSuspiciousTag")}
                    </button>
                  )}
                  {isAdmin && player.dropper && (
                    <button type="button" role="menuitem" disabled={clearingTag !== null} onClick={() => clearModerationTag('dropper')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-rose-200 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                      {clearingTag === 'dropper' ? t("generated.components.submitting") : t("moderation.clearDropperTag")}
                    </button>
                  )}
                  {isAdmin && player.afk_wintrade && (
                    <button type="button" role="menuitem" disabled={clearingTag !== null} onClick={() => clearModerationTag('afk_wintrade')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-sky-200 transition-colors hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                      {clearingTag === 'afk_wintrade' ? t("generated.components.submitting") : t("moderation.clearAfkWintradeTag")}
                    </button>
                  )}
                  {isAdmin && player.alt_account && (
                    <button type="button" role="menuitem" disabled={clearingTag !== null} onClick={() => clearModerationTag('alt_account')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-fuchsia-200 transition-colors hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                      {clearingTag === 'alt_account' ? t("generated.components.submitting") : t("moderation.clearAltAccountTag")}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {!actionMenuOpen && refreshFeedback && (
            <div
              className={`pointer-events-none absolute left-0 top-1/2 z-20 w-max max-w-[calc(100%-7rem)] -translate-y-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-lg md:left-auto md:right-0 md:top-full md:mt-2 md:max-w-[min(24rem,calc(100vw-3rem))] md:translate-y-0 md:px-3 md:py-2 ${refreshFeedbackColor}`}
              role="status"
              aria-live="polite"
            >
              <span className="md:hidden">
                {refreshCooldownUntil
                  ? refreshRemainingMs > 0
                    ? t("generated.players.refreshInValue1.5356e91", { value1: formatCooldown(refreshRemainingMs) })
                    : t("generated.players.refreshAvailable")
                  : refreshFeedback.message}
              </span>
              <span className="hidden md:inline">
                {refreshCooldownUntil
                  ? refreshRemainingMs > 0
                    ? t("generated.players.value1Value2", { value1: refreshFeedback.message, value2: formatCooldown(refreshRemainingMs) })
                    : t("generated.players.profileCanNowBeRefreshed")
                  : refreshFeedback.message}
              </span>
            </div>
          )}
        </div>

        <div className="order-1 min-w-0 flex-1">
        <div className="flex flex-col items-start gap-4 min-[420px]:flex-row min-[420px]:items-center">
          <PlayerLoadingFrame
            loadingFrame={player.loading_frame}
            avatarUrl={avatarUrl}
            avatarAlt={t("generated.players.value1SPaladinsAvatar", { value1: player.name })}
            onAvatarError={() => setAvatarLoadFailed(true)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <PlatformIcon platform={player.platform} />
              <h1 className="min-w-0 break-words text-2xl font-bold leading-tight text-pc-text sm:text-3xl">
                {player.name}
              </h1>
              <PlayerNameHistory key={`${id}:${player.name}:${fetchKey}`} playerId={id} />
              <PlayerModerationTag
                playerId={player.id}
                cheater={player.cheater}
                exploiter={player.exploiter}
                susCount={player.sus_count}
                dropper={player.dropper}
                afkWintrade={player.afk_wintrade}
                boosted={player.boosted}
                altAccount={player.alt_account}
                verified={Boolean(player.verified ?? verifiedFallback)}
                customTag={player.custom_tag ?? null}
                customTagColor={player.custom_tag_color ?? null}
              />
            </div>
            {/* Title + loading frame */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {player.title && (
                              <span className="text-sm text-pc-text-secondary sm:text-base">
                                {titleSegments
                                  ? titleSegments.map((segment, index) => (
                                      <span
                                        key={index}
                                        style={segment.color ? { color: segment.color } : undefined}
                                      >
                                        {segment.text}
                                      </span>
                                    ))
                                  : parsedTitle.text}
                              </span>
                            )}
              <span className="text-sm font-medium text-pc-accent/80 sm:text-base"><ChevronRight aria-hidden="true" size={12} className="inline shrink-0 align-middle" /> {loadingFrameName}</span>
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>

      {/* Quick links: Loadouts + Champion Stats side by side */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href={`/players/${id}/loadouts`} className="group flex items-center gap-3 rounded-xl border border-pc-border bg-pc-bg-elevated p-3 transition-colors hover:border-pc-accent-mid hover:bg-pc-bg-secondary">
          <CardIcon name="loadouts" className="ml-3 text-[var(--pc-title)]" />
          <div className="min-w-0 flex-1 text-sm font-semibold text-pc-text group-hover:text-pc-accent">{t("generated.players.playerLoadouts")}</div>
          <span className="text-pc-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-pc-accent" aria-hidden="true"><ArrowRight aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>
        </Link>
        <Link href={`/players/${id}/champions`} className="group flex items-center gap-3 rounded-xl border border-pc-border bg-pc-bg-elevated p-3 transition-colors hover:border-pc-accent-mid hover:bg-pc-bg-secondary">
          <CardIcon name="champion-stats" className="ml-3 text-[var(--pc-title)]" />
          <div className="min-w-0 flex-1 text-sm font-semibold text-pc-text group-hover:text-pc-accent">{t("common.playerChampions.title")}</div>
          <span className="text-pc-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-pc-accent" aria-hidden="true"><ArrowRight aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>
        </Link>
      </div>

      {/* Account + Recent Matches */}
      <div className="space-y-5">
          {/* Account Overview */}
          <div>
            <div className="pc-card">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(12rem,0.65fr)]">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-pc-border/50 pb-3">
                    <span className={`flex items-center gap-1 rounded bg-pc-bg px-1.5 py-0.5 text-xs font-semibold ${tierColor}`}>
                      <img src={rankIcon} alt={effectiveTier.displayName} className="h-4 w-4 object-contain" />
                      {effectiveTier.displayName}
                    </span>
                    {player.kbm_points > 0 && (
                      <span className="font-mono text-xs text-pc-text-muted">{player.kbm_points} {t("generated.players.tp")}</span>
                    )}
                    <span className="text-pc-border">·</span>
                    <span className="text-xs text-pc-text-muted">{player.region}</span>
                    <span className="text-pc-border">·</span>
                    <span className="text-xs text-pc-text-muted">{player.platform}</span>
                    {player.platform_name && (
                      <span className="text-xs text-pc-text-muted">({player.platform_name})</span>
                    )}
                    <span className="text-pc-border">·</span>
                    <span className="text-xs text-pc-text-muted">{t("generated.players.lvl")}{" "}{player.level}</span>
                    <span className="text-pc-border">·</span>
                    <span className="text-xs text-pc-text-muted">{t("generated.players.mastery")}{" "}{player.mastery_level}</span>
                  </div>
                  <StatGrid>
                    <StatRow label={t("generated.players.created")} value={formatDate(player.created_datetime)} />
                    <StatRow label={t("generated.players.lastLogin")} value={formatDateTime(player.last_login_datetime)} />
                    <StatRow label={t("generated.players.playtime")} value={formatHours(player.hours_played)} />
                    <StatRow label={t("generated.players.totalXp")} value={formatLargeNumber(player.total_xp)} />
                    <StatRow label={t("generated.players.achievements")} value={formatNumber(player.total_achievements)} />
                    <StatRow label={t("generated.players.championXp")} value={formatLargeNumber(player.total_worshippers)} />
                  </StatGrid>
                  {isPro && player.personal_status_message && (
                    <div className="mt-3 border-t border-pc-border/50 pt-3">
                      <span className="text-xs text-pc-text-muted">{t("generated.players.status")}{" "}</span>
                      <span className="text-xs text-pc-text-secondary italic">{player.personal_status_message}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-pc-border/50 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <div className="mb-1.5 text-xs uppercase tracking-wider text-pc-text-muted">{t("generated.players.overall")}</div>
                  <div className="grid grid-cols-1 gap-y-1.5">
                    <StatRow label={t("generated.players.totalMatches")} value={formatNumber(globalMatches)} />
                    <StatRow label={t("generated.players.casualDeserted")} value={formatNumber(player.leaves)} />
                    <StatRow label={t("generated.players.totalWins")} value={formatNumber(globalWins)} color="text-emerald-400" />
                    <StatRow label={t("generated.players.totalLosses")} value={formatNumber(globalLosses)} color="text-rose-400" />
                    <StatRow label={t("generated.players.winRate")} value={formatPercent(winRate)} style={{ color: getPercentageColor(winRate) }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Glicko Rating — Pro surface only */}
          {isPro && (
          <div>
            <div className="pc-card">
              {kbmRating ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-pc-accent font-mono">{formatNumber(Number(kbmRating.mu), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                    <div className="text-xs text-pc-text-muted mt-0.5">{t("generated.players.glicko2Rating")}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-center min-[400px]:grid-cols-2">
                    <div className="p-2">
                      <div className="text-xs text-pc-text-muted">{t("generated.players.deviation")}</div>
                      <div className="text-xs font-mono text-pc-text">{formatNumber(Number(kbmRating.phi), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="p-2">
                      <div className="text-xs text-pc-text-muted">{t("generated.players.volatility")}</div>
                      <div className="text-xs font-mono text-pc-text">{formatNumber(Number(kbmRating.volatility), { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 border-t border-pc-border/50 pt-2 text-center min-[360px]:grid-cols-3">
                    <div>
                      <div className="text-xs text-pc-text-muted">{t("common.result.winShort")}</div>
                      <div className="text-xs font-mono text-emerald-400">{Number.isFinite(Number(kbmRating.wins)) ? formatNumber(Number(kbmRating.wins)) : "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-pc-text-muted">{t("common.result.lossShort")}</div>
                      <div className="text-xs font-mono text-rose-400">{Number.isFinite(Number(kbmRating.losses)) ? formatNumber(Number(kbmRating.losses)) : "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-pc-text-muted">{t("generated.players.wr.a175495")}</div>
                      <div className="text-xs font-mono text-pc-text">
                        {Number.isFinite(Number(kbmRating.wins)) && Number(kbmRating.matches_played) > 0
                          ? t("generated.players.value1", { value1: formatNumber(((Number(kbmRating.wins) / Number(kbmRating.matches_played)) * 100), { minimumFractionDigits: 0, maximumFractionDigits: 0 }) })
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-pc-text-muted text-sm text-center py-4">{t("generated.players.noRankedRatingYet")}</p>
              )}
            </div>
          </div>
          )}

          {/* Consolidated performance summary — Pro surface only */}
          {isPro && (
          <div>
            <div className="pc-card p-3">
              <div className="mb-1.5 text-xs uppercase tracking-wider text-pc-text-muted">{t("generated.players.averages")}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <StatRow label={t("generated.players.damageMin")} value={player.avg_dpm != null ? formatNumber(player.avg_dpm) : "—"} color="text-red-400" />
                <StatRow label={t("common.metrics.kpm")} value={player.derived_rates?.kpm != null ? formatNumber(Number(player.derived_rates.kpm), { maximumFractionDigits: 2 }) : "—"} />
                <StatRow label={t("common.metrics.deathsPerMinute")} value={player.derived_rates?.deaths_per_minute != null ? formatNumber(Number(player.derived_rates.deaths_per_minute), { maximumFractionDigits: 2 }) : "—"} />
                <StatRow label={t("generated.players.healingMin")} value={player.avg_hpm != null ? formatNumber(player.avg_hpm) : "—"} color="text-emerald-400" />
                <StatRow label={t("generated.players.shieldingMin")} value={player.avg_spm != null ? formatNumber(player.avg_spm) : "—"} color="text-sky-400" />
                <StatRow label={t("generated.players.creditsMin")} value={player.avg_egpm != null ? formatNumber(player.avg_egpm) : "—"} color="text-yellow-400" />
                {player.avg_shpm != null && (
                  <StatRow label={t("common.metrics.shpm")} value={formatNumber(player.avg_shpm)} color="text-violet-400" />
                )}
              </div>
            </div>
          </div>
          )}

          {/* Queue Ratings (if multiple queues) */}
          {queueRatings.length > 1 && (
            <div>
              <div className="pc-card">
                <div className="space-y-2">
                  {queueRatings.map((qr) => (
                    <div key={qr.queue_id} className="flex items-center justify-between py-1.5 border-b border-pc-border/30 last:border-0">
                      <span className="text-xs text-pc-text-muted">{t("generated.players.queue")}{" "}{qr.queue_id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-pc-accent">{formatNumber(Number(qr.mu), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span className="text-xs text-pc-text-muted">φ{formatNumber(Number(qr.phi), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Evidence — published reports, system flags, and cosmetic evidence */}
          {evidence && (evidence.flagEvidence.length > 0 || evidence.flags.length > 0 || evidence.cosmeticEvidence.length > 0) && (() => {
            const unified = buildUnifiedEvidence(evidence, t);
            return (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-pc-text">{t("moderation.evidenceTitle")}</h2>
                  <span className="text-xs text-pc-text-muted">{formatNumber(unified.length)} {t("moderation.evidence")}</span>
                </div>
                <p className="mb-3 text-xs text-pc-text-muted">{t("moderation.evidenceDescription")}</p>
                <div className="pc-card-flush overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-pc-border text-left text-xs text-pc-text-muted">
                        <th className="px-3 py-1.5">{t("moderation.evidenceSource")}</th>
                        <th className="px-3 py-1.5">{t("moderation.evidenceReason")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.match.0335207")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.played")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unified.map((item) => (
                        <tr key={item.key} className="border-b border-pc-border/60 last:border-0">
                          <td className="px-3 py-1.5">
                            <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${
                              item.categoryTone === "reported"
                                ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-200"
                                : item.categoryTone === "cosmetic"
                                  ? "border-amber-400/30 bg-amber-400/15 text-amber-200"
                                  : "border-violet-400/30 bg-violet-400/15 text-violet-200"
                            }`}>{item.category}</span>
                          </td>
                          <td className="max-w-md px-3 py-1.5">
                            <div className="font-semibold text-pc-text">{item.title || "—"}</div>
                            {item.detail && item.detail !== item.title && (
                              <div className="text-xs text-pc-text-muted">{item.detail}</div>
                            )}
                            {item.sourceUrl && (
                              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-pc-accent hover:underline">{item.sourceUrl}</a>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {item.matchId != null ? (
                              <Link href={`/matches/${item.matchId}`} className="font-mono text-xs text-pc-accent hover:text-pc-accent-secondary">#{item.matchId}</Link>
                            ) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-xs text-pc-text-muted">{item.when ? formatDate(item.when) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          {/* Recent Matches */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-pc-text">{t("generated.players.recentMatches")}</h2>
            </div>
            <div>
              {matchesLoading ? (
                <DataTableSkeleton rows={6} className="border-0" />
              ) : matchesError ? (
                <ErrorState
                  title={t("generated.players.recentMatches")}
                  message={formatApiErrorMessage(matchesError, t, t("generated.matches.weCouldnTLoadMatchDataRightNowPleaseTry"))}
                  onRetry={() => setHistoryFetchKey((key) => key + 1)}
                />
              ) : matches.length === 0 ? (
                <p className="text-pc-text-muted text-sm">{t("generated.players.noMatchesRecordedYet")}</p>
              ) : (
                <>
                <div className="space-y-2 lg:hidden">
                  {matches.map((match) => <Link key={match.matchId} href={`/matches/${match.matchId}`} className="pc-mobile-panel flex min-w-0 items-center gap-3 p-3">
                    <img src={getChampionIconSafe(match.championName)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
                    <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="font-mono text-xs text-pc-accent">#{match.matchId}</span><PlayerMatchTags tags={match.performanceTags} /></div><div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-pc-text">{match.championName || t("generated.matches.unknown")}</span><span className={`shrink-0 text-xs font-bold ${match.isWinner ? "text-emerald-400" : "text-rose-400"}`}>{match.isWinner ? t("generated.players.win") : t("generated.players.loss")}</span></div><div className="truncate text-xs text-pc-text-muted">{match.queueId === 486 ? t("generated.players.ranked") : t("generated.players.casual")} · {displayMatchMap(match.mapGame, match.queueId)}</div><div className="mt-1 text-xs text-pc-text-muted">{formatDateTime(match.entryDatetime)}</div></div>
                    <div className="shrink-0 text-right"><div className="font-mono text-sm font-bold text-pc-text">{match.kills}/{match.deaths}/{match.assists}</div><div className="text-xs uppercase text-pc-text-muted">{formatKda(match.kills, match.deaths, match.assists)} {t("generated.players.kda")}</div><div className="mt-1 font-mono text-xs text-pc-text-secondary">{formatMatchDuration(match.duration)}</div></div>
                  </Link>)}
                </div>
                <div className="pc-card-flush hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-pc-border text-pc-text-muted text-left text-xs">
                        <th className="px-3 py-1.5">{t("generated.players.match.0335207")}</th>
                        <th className="px-3 py-1.5 capitalize">{t("generated.players.flags")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.champion")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.queue")}</th>
                        <th className="px-3 py-1.5">{t("common.playerChampions.killsShort")}</th>
                        <th className="px-3 py-1.5">{t("common.playerChampions.deathsShort")}</th>
                        <th className="px-3 py-1.5">{t("common.playerChampions.assistsShort")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.kda")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.result")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.time")}</th>
                        <th className="px-3 py-1.5">{t("generated.players.played")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((m) => {
                        const kda = formatKda(m.kills, m.deaths, m.assists);
                        return (
                          <tr key={m.matchId} className="border-b border-pc-border/30 hover:bg-pc-bg-secondary/50 transition-colors">
                            <td className="px-3 py-1.5">
                              <Link href={`/matches/${m.matchId}`} className="text-pc-accent hover:text-pc-accent-secondary text-xs font-mono">
                                #{m.matchId}
                              </Link>
                            </td>
                            <td className="px-3 py-1.5"><PlayerMatchTags tags={m.performanceTags} /></td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <img src={getChampionIconSafe(m.championName)} alt={m.championName || ""} className="w-5 h-5 rounded object-contain" />
                                <span className="text-xs text-pc-text">{m.championName || t("generated.matches.unknown")}</span>
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="text-xs text-pc-text-secondary">
                                {m.queueId === 486 ? t("generated.players.ranked") : m.queueId ? t("generated.players.casual") : t("generated.players.unknown")}
                              </div>
                              <div className="max-w-28 truncate text-xs text-pc-text-muted" title={displayMatchMap(m.mapGame, m.queueId)}>{displayMatchMap(m.mapGame, m.queueId)}</div>
                            </td>
                            <td className="px-3 py-1.5 text-xs font-mono text-pc-text">{m.kills}</td>
                            <td className="px-3 py-1.5 text-xs font-mono text-pc-text">{m.deaths}</td>
                            <td className="px-3 py-1.5 text-xs font-mono text-pc-text">{m.assists}</td>
                            <td className="px-3 py-1.5 text-xs font-mono text-pc-text">{kda}</td>
                            <td className="px-3 py-1.5">
                              <span className={`text-xs font-medium ${m.isWinner ? "text-emerald-400" : "text-rose-400"}`}>
                                {m.isWinner ? t("common.result.winShort") : t("common.result.lossShort")}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-xs font-mono text-pc-text-secondary">{formatMatchDuration(m.duration)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-pc-text-muted">{formatDateTime(m.entryDatetime)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Current Match Modal ── */}
      {showCurrentMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pc-glass-dark" onClick={() => setShowCurrentMatch(false)}>
          <div className="pc-card mx-3 max-h-[calc(100vh-1.5rem)] w-full max-w-7xl overflow-y-auto p-5 sm:mx-6 sm:p-6 lg:p-7" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-pc-text sm:text-2xl">{t("generated.players.currentMatch")}</h3>
              <button onClick={() => setShowCurrentMatch(false)} className="text-pc-text-muted hover:text-pc-text transition-colors">
                <X aria-hidden="true" size={22} />
              </button>
            </div>
            {!currentMatch ? (
              <LoadingPanel compact />
            ) : currentMatch.error ? (
              <div className="text-center py-8 text-pc-text-muted text-sm">{currentMatch.error}</div>
            ) : currentMatch.pending ? (
              <div className="py-8 text-center"><LoadingIndicator /></div>
            ) : !currentMatch.match ? (
              <div className="text-center py-8">
                <div className="text-pc-text-muted text-sm mb-2">{t("generated.players.notInALiveMatch")}</div>
                <div className="text-xs text-pc-text-muted/60">{t("generated.players.thisPlayerIsNotCurrentlyPlayingATrackedMatch")}</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pc-border/70 bg-pc-bg-secondary/60 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5 text-sm">
                    <span className="text-pc-text-muted">{t("generated.players.match.0335207")}</span>
                    <Link href={`/matches/${currentMatch.match.match_id}`} className="font-mono text-pc-accent hover:text-pc-accent-secondary">
                      #{currentMatch.match.match_id}
                    </Link>
                    <span className="truncate text-pc-text-secondary">{currentMatch.match.map || t("generated.players.unknownMap")}</span>
                  </div>
                  <span className={`text-sm font-semibold ${currentMatch.match.status === 'active' ? 'text-emerald-400' : 'text-pc-text-muted'}`}>
                    {currentMatch.match.status}
                  </span>
                </div>
                {currentMatch.players && currentMatch.players.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 border-t border-pc-border/50 pt-4 md:grid-cols-2">
                    {[1, 2].map((taskForce) => {
                      const team = currentMatch.players.filter((p: any) => Number(p.task_force) === taskForce);
                      return (
                        <section key={taskForce} className="overflow-hidden rounded-xl border border-pc-border/70 bg-pc-bg-secondary/40">
                          <div className={`flex items-center justify-between gap-3 border-b border-pc-border/60 px-4 py-3 text-sm font-semibold ${taskForce === 1 ? 'text-sky-300' : 'text-rose-300'}`}>
                            <span>{t("generated.players.team")}{" "}{taskForce}</span>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {currentMatchWinChance && (
                                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${taskForce === 1 ? 'border-sky-400/25 bg-sky-400/10' : 'border-rose-400/25 bg-rose-400/10'}`} style={{ color: getPercentageColor(taskForce === 1 ? currentMatchWinChance.teamOne : currentMatchWinChance.teamTwo) }}>
                                  {t("liveMatch.estimatedWinChance", {
                                    percent: formatNumber(taskForce === 1 ? currentMatchWinChance.teamOne : currentMatchWinChance.teamTwo),
                                  })}
                                </span>
                              )}
                              <span className="text-xs font-normal text-pc-text-muted">{team.length} {t("generated.players.players.2912fa5")}</span>
                            </div>
                          </div>
                          <div className="divide-y divide-pc-border/50">
                            {team.map((p: any) => {
                              const rankedMatches = Number(p.ranked_matches ?? 0);
                              const profileMatches = Number(p.profile_matches ?? 0);
                              const indexedMatches = Number(p.total_matches ?? 0);
                              const indexedWins = Number(p.total_wins ?? 0);
                              const isRankedLobby = Number(currentMatch.match.queue_id) === 486;
                              const useRankedMetrics = isRankedLobby && rankedMatches > 0;
                              const metricMatches = useRankedMetrics
                                ? rankedMatches
                                : profileMatches > 0
                                  ? profileMatches
                                  : indexedMatches;
                              const storedWinRate = useRankedMetrics
                                ? Number(p.ranked_win_rate)
                                : profileMatches > 0
                                  ? Number(p.profile_win_rate)
                                  : indexedMatches > 0
                                    ? (indexedWins / indexedMatches) * 100
                                    : Number.NaN;
                              const winRate = Number.isFinite(storedWinRate) ? `${formatPercent(storedWinRate)} ${t("generated.players.wr.a175495")}` : t("generated.app.players.[id].page.nowinratedata");
                              const metricScope = useRankedMetrics ? t("common.scope.ranked") : profileMatches > 0 ? t("common.scope.profile") : t("common.scope.indexed");
                              const tier = Number(p.kbm_tier ?? p.live_tier ?? 0);
                              const rank = Number(p.kbm_rank ?? 0);
                              const tierName = tier > 0 ? resolveEffectiveTier(tier, rank).displayName : t("generated.app.players.[id].page.unranked");
                              const level = p.profile_level ?? p.account_level ?? "—";
                              const mastery = Number(p.profile_mastery_level ?? p.mastery_level ?? 0);
                              const profileDetails = [
                                p.champion_name || t("generated.app.players.[id].page.unknownchampion"),
                                t("common.format.levelValue", { level }),
                                mastery > 0 ? t("common.format.masteryValue", { mastery: formatNumber(mastery) }) : null,
                                p.profile_platform || null,
                              ].filter(Boolean).join(" · ");
                              const sampleSummary = metricMatches > 0
                                ? t("common.summary.sampleMatches", { count: formatNumber(metricMatches), scope: metricScope })
                                : p.has_profile
                                  ? t("generated.app.players.[id].page.profilecachedlocally")
                                  : t("generated.app.players.[id].page.nolocalprofile");
                              const performanceSummary = p.avg_dpm != null
                                ? t("common.summary.metricValue", { summary: sampleSummary, value: formatNumber(Math.round(Number(p.avg_dpm))), metric: t("common.metrics.dpm") })
                                : sampleSummary;
                              return (
                                <div key={p.player_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3.5">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <img src={getChampionIconSafe(p.champion_name || "")} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain sm:h-11 sm:w-11" />
                                    <div className="min-w-0">
                                      {Number(p.player_id) > 0 ? (
                                        <Link href={`/players/${p.player_id}`} className="block truncate text-sm font-semibold text-pc-text hover:text-pc-accent sm:text-base">
                                          <PlayerName playerId={p.player_id}>{p.player_name || t("generated.players.value1.e7f351a", { value1: p.player_id })}</PlayerName>
                                        </Link>
                                      ) : (
                                        <span className="block truncate text-sm font-semibold text-pc-text-muted sm:text-base">
                                          {p.player_name || t("generated.players.privateAccount")}
                                        </span>
                                      )}
                                      <div className="truncate text-xs text-pc-text-muted">{profileDetails}</div>
                                    </div>
                                  </div>
                                  <div className="text-right text-xs leading-5">
                                    <div className="font-mono text-sm text-pc-accent">
                                      {p.queue_elo != null ? t("generated.players.value1Elo", { value1: Math.round(Number(p.queue_elo)) }) : p.has_profile ? t("generated.players.localProfile") : t("generated.players.noRating")}
                                    </div>
                                    <div className="font-medium text-pc-text-secondary">{tierName} · <span style={Number.isFinite(storedWinRate) ? { color: getPercentageColor(storedWinRate) } : undefined}>{winRate}</span></div>
                                    <div className="text-pc-text-muted">{performanceSummary}</div>
                                  </div>
                                </div>
                              );
                            })}
                            {team.length === 0 && <div className="px-4 py-6 text-center text-sm text-pc-text-muted">{t("generated.players.noPlayersRecordedYet")}</div>}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
                {currentMatchWinChance && (
                  <p className="text-center text-xs leading-5 text-pc-text-muted">{t("liveMatch.estimateMethod")}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Report Modal ── */}
      {showReportModal && (
        <ReportModal
          playerId={id}
          type={reportType}
          onClose={closeReportModal}
          onSuccess={handleReportSuccess}
        />
      )}
      {showAltRelationModal && (
        <AltAccountRelationModal
          playerId={id}
          playerName={player.name}
          onClose={() => setShowAltRelationModal(false)}
          onSuccess={() => setFetchKey((key) => key + 1)}
        />
      )}
    </div>
  );
}
