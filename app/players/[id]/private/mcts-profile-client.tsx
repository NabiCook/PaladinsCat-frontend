/** Render the MCTS capture that replaces the public profile for an API-hidden account.
 * These accounts have no match data, so the page shows capture rows (XP and level)
 * and a labelled statistics placeholder instead of charts or zeroes.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ContentFade, EmptyState, ErrorState, LoadingPanel } from "@/components/async-state";
import { LoginRequired } from "@/components/login-required";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth-context";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { useLocalization } from "@/lib/localization-context";
import { decodeMctsProfileResponse } from "@/lib/mcts-profile-response";
import type { MctsChampionRow, MctsInventoryRow, MctsLoadout, MctsProfileResponse } from "@/lib/mcts-profile-types";
import { localPreviewAccessEnabled } from "@/lib/use-local-preview-access";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Render the capture-only profile for a private player id.
 * I/O types: `{ id, initialResponse }: { id: string; initialResponse: MctsProfileResponse | null } -> JSX.Element`.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
export default function MctsProfileClient({
  id,
  initialResponse,
}: {
  id: string;
  initialResponse: MctsProfileResponse | null;
}) {
  const { t, formatNumber } = useLocalization();
  const { user, isLoading: authLoading } = useAuth();
  const [response, setResponse] = useState<MctsProfileResponse | null>(initialResponse);
  const [notCaptured, setNotCaptured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // The server renders the first capture so the browser has it in the initial
  // HTML; browser fetches remain the fallback and the source of truth on retry.
  useEffect(() => {
    if (!id || authLoading || (!user && !localPreviewAccessEnabled())) return;
    if (retryKey === 0 && initialResponse) return;
    let cancelled = false;

    fetch(`${API_BASE}/players/${encodeURIComponent(id)}/mcts-profile`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) {
          let message = t("mctsProfile.loadFailed");
          try {
            const body: unknown = await res.json();
            const candidate = (body as { error?: { message?: unknown } } | null)?.error?.message;
            if (typeof candidate === "string" && candidate.length > 0) message = candidate;
          } catch {
            // Keep the localized fallback when the error body is not JSON.
          }
          throw new Error(message);
        }
        return res.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (cancelled) return;
        if (raw === null) {
          setNotCaptured(true);
          return;
        }
        const decoded = decodeMctsProfileResponse(raw);
        if (!decoded.ok) throw new Error(t("mctsProfile.loadFailed"));
        setResponse(decoded.value);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setResponse(null);
        setError(formatApiErrorMessage(cause, t, t("mctsProfile.loadFailed")));
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, id, initialResponse, retryKey, t, user]);

  const summary = useMemo(() => {
    const inventory = response?.inventory ?? [];
    const championNames = new Map<number, string>();
    for (const row of response?.champions ?? []) {
      if (row.champion_id != null && row.champion_name.trim()) championNames.set(row.champion_id, row.champion_name);
    }
    return {
      ownedPermanent: inventory.filter((row) => row.is_owned && !row.is_transient).length,
      ownedTransient: inventory.filter((row) => row.is_owned && row.is_transient).length,
      unowned: inventory.filter((row) => !row.is_owned).length,
      instances: inventory.reduce((total, row) => total + row.instance_count, 0),
      championNames,
    };
  }, [response]);

  if (!authLoading && !user && !localPreviewAccessEnabled()) {
    return <LoginRequired returnPath={`/players/${id}/private`} />;
  }

  const isLoading = response === null && error === null && !notCaptured;
  if (isLoading) return <LoadingPanel />;
  if (notCaptured) {
    return (
      <EmptyState
        title={t("mctsProfile.notPrivate")}
        description={t("mctsProfile.notPrivateBody")}
        action={
          <Link href={`/players/${id}`} prefetch={false} className="pc-btn-secondary inline-flex">
            {t("mctsProfile.viewPublicProfile")}
          </Link>
        }
      />
    );
  }

  if (error && !response) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null);
          setNotCaptured(false);
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  if (!response) return null;

  const levelOf = (row: MctsProfileResponse): number | null => {
    if (row.account_level != null) return row.account_level;
    const xp = Number(row.xp_level);
    if (!Number.isFinite(xp) || xp < 0) return null;
    // T(L) = 10,000 x L x (L+3) XP to reach L+1, capped at 999.
    return Math.min(999, 1 + Math.floor((Math.sqrt(9 + xp / 2500) - 3) / 2));
  };
  const level = levelOf(response);
  const headline = response.gamer_tag.trim() || response.name.trim() || t("mctsProfile.playerId", { value1: response.player_id });
  const championLabel = (row: MctsChampionRow) =>
    row.champion_name.trim() || t("mctsProfile.championFallback", { value1: row.profile_id });
  const championNameById = (championId: number | null) =>
    championId == null ? null : summary.championNames.get(championId) ?? t("mctsProfile.championFallback", { value1: championId });
  const itemChips = (loadout: MctsLoadout) =>
    loadout.items.length > 0
      ? loadout.items.map((item) => t("mctsProfile.loadoutItemChip", { value1: item.count, value2: item.item_id })).join(" · ")
      : t("mctsProfile.noLoadoutItems");
  const inventoryRows: MctsInventoryRow[] = response.inventory;

  return (
    <ContentFade className="space-y-6">
      <PlayersPageHeader
        title={headline}
        meta={
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="pc-badge">{t("mctsProfile.badge")}</span>
            <span className="pc-badge">
              {t("mctsProfile.accountLevel")} {formatNumber(level)}
            </span>
            <span className="pc-badge">{t("mctsProfile.playerId", { value1: response.player_id })}</span>
          </div>
        }
      />

      <section aria-labelledby="mcts-champions">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="mcts-champions" className="pc-card-title">
            {t("mctsProfile.championsTitle")}
          </h2>
        </div>
        {response.champions.length === 0 ? (
          <EmptyState title={t("mctsProfile.noChampions")} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {response.champions.map((row) => (
              <article
                key={row.profile_id}
                className="flex items-center gap-3 rounded-xl border border-pc-border bg-pc-bg-elevated p-2.5"
              >
                {row.champion_name.trim() ? (
                  <img
                    src={getChampionIconSafe(row.champion_name)}
                    alt=""
                    loading="lazy"
                    className="h-9 w-9 shrink-0 rounded object-contain"
                  />
                ) : (
                  <div aria-hidden="true" className="h-9 w-9 shrink-0 rounded border border-pc-border/60 bg-pc-bg" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-pc-text">{championLabel(row)}</div>
                  <div className="text-xs text-pc-text-muted">
                    {t("mctsProfile.profileId")} {row.profile_id}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold tabular-nums text-pc-text-secondary">
                    {formatNumber(row.xp)} {t("mctsProfile.championXp")}
                  </div>
                  <div className="text-xs text-pc-text-muted">
                    {t("mctsProfile.championLevel")} {formatNumber(row.level)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="mcts-loadouts">
        <h2 id="mcts-loadouts" className="pc-card-title">
          {t("mctsProfile.loadoutsTitle")}
        </h2>
        {response.loadouts.length === 0 ? (
          <EmptyState title={t("mctsProfile.noLoadouts")} />
        ) : (
          <div className="pc-card-flush divide-y divide-pc-border">
            {response.loadouts.map((loadout) => (
              <div key={loadout.loadout_id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-pc-text">
                    {loadout.name.trim() || t("mctsProfile.loadoutFallback", { value1: loadout.loadout_id })}
                  </div>
                  <div className="text-xs text-pc-text-muted">
                    {t("mctsProfile.loadoutChampion")} {championNameById(loadout.champion_id) ?? t("mctsProfile.noChampion")} ·{" "}
                    {t("mctsProfile.loadoutTalent")} {loadout.talent_id ?? t("mctsProfile.noTalent")}
                  </div>
                </div>
                <div className="min-w-0 text-xs text-pc-text-secondary sm:text-right">
                  <span className="text-pc-text-muted">{t("mctsProfile.loadoutItems")} </span>
                  {itemChips(loadout)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="mcts-inventory">
        <h2 id="mcts-inventory" className="pc-card-title">
          {t("mctsProfile.inventoryTitle")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            [t("mctsProfile.inventoryOwned"), formatNumber(summary.ownedPermanent)],
            [t("mctsProfile.inventoryTransient"), formatNumber(summary.ownedTransient)],
            [t("mctsProfile.inventoryUnowned"), formatNumber(summary.unowned)],
            [t("mctsProfile.inventoryInstances"), formatNumber(summary.instances)],
          ] as const).map(([label, value]) => (
            <div key={label} className="pc-glass rounded-xl p-3">
              <div className="text-xs uppercase tracking-wide text-pc-text-muted">{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-pc-text">{value}</div>
            </div>
          ))}
        </div>
        {inventoryRows.length === 0 ? (
          <EmptyState className="mt-3" title={t("mctsProfile.noInventory")} />
        ) : (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-pc-accent">
              {t("mctsProfile.inventoryShow", { value1: formatNumber(inventoryRows.length) })}
            </summary>
            <div className="pc-card-flush mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-pc-text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("mctsProfile.inventoryItem")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("mctsProfile.inventoryCharacter")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("mctsProfile.inventoryOwnership")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("mctsProfile.inventoryType")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t("mctsProfile.inventoryCount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pc-border">
                  {inventoryRows.map((row) => (
                    <tr key={row.item_id}>
                      <td className="px-3 py-1.5 font-mono text-pc-text-secondary">{row.item_id}</td>
                      <td className="px-3 py-1.5 text-pc-text-muted">
                        {row.character_id == null
                          ? t("mctsProfile.inventoryAccountWide")
                          : championNameById(row.character_id) ?? t("mctsProfile.championFallback", { value1: row.character_id })}
                      </td>
                      <td className="px-3 py-1.5 text-pc-text-secondary">
                        {row.is_owned ? t("mctsProfile.inventoryOwned") : t("mctsProfile.inventoryUnowned")}
                      </td>
                      <td className="px-3 py-1.5 text-pc-text-muted">
                        {row.is_transient ? t("mctsProfile.inventoryTransient") : t("mctsProfile.inventoryPermanent")}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-pc-text-secondary">
                        {formatNumber(row.instance_count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </ContentFade>
  );
}
