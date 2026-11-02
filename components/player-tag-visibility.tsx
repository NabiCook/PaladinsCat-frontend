/**
 * Self-service tag-visibility panel for a verified player's own profile.
 *
 * Shows only the automatic cosmetic tags the player owns (hide-only) and the
 * single admin-approved custom-tag request; renders only for the verified
 * linked owner, and the backend re-enforces the gate on every write.
 * refs:
 *   endpoints: GET /players/:id/tag-visibility · POST /players/:id/tag-visibility · POST /players/:id/custom-tag · DELETE /players/:id/custom-tag
 *   migrations: 241, 243
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelCustomTag,
  setCustomTagColor,
  fetchTagVisibility,
  setTagVisibility,
  submitCustomTag,
  type CosmeticTagKey,
  type PlayerCustomTag,
  type PlayerTagVisibility,
} from "@/lib/api-client";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useLocalization } from "@/lib/localization-context";
import { invalidatePlayerModeration } from "@/lib/player-moderation";

const TAG_LABELS: Record<CosmeticTagKey, string> = {
  wall_shooter: "Wall",
  master_feeding: "Feeding",
  tank_diff: "Tank",
  support_diff: "Sup",
  dps_diff: "DPS",
  flank_diff: "Flank",
  noob: "Noob",
  hypercarry: "Carry",
};

interface PlayerTagVisibilityPanelProps {
  playerId: string;
  /** True only when this is the viewer's own verified profile. */
  isOwnVerified: boolean;
  /** Bump to re-fetch (e.g. after a profile refresh). */
  refreshKey?: number;
}

/**
 * Render the self-service tag-visibility panel; writes are re-gated by the backend.
 * I/O: in `PlayerTagVisibilityPanelProps { playerId: string, isOwnVerified: boolean, refreshKey?: number }` -> out `JSX.Element | null`.
 *
 * refs:
 *   endpoints: GET /players/:id/tag-visibility · POST /players/:id/tag-visibility · POST /players/:id/custom-tag · DELETE /players/:id/custom-tag
 *   migrations: 241, 243
 */
export default function PlayerTagVisibilityPanel({
  playerId,
  isOwnVerified,
  refreshKey = 0,
}: PlayerTagVisibilityPanelProps) {
  const { t } = useLocalization();
  const [tags, setTags] = useState<PlayerTagVisibility[] | null>(null);
  const [customTag, setCustomTag] = useState<PlayerCustomTag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTag, setSavingTag] = useState<CosmeticTagKey | null>(null);

  // Custom-tag form state
  const [customInput, setCustomInput] = useState("");
  const [customColor, setCustomColor] = useState("#c4b5fd");
  const [customReason, setCustomReason] = useState("");
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOwnVerified) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTagVisibility(playerId);
      setTags(data.tags);
      setCustomTag(data.customTag);
      setCustomColor(data.customTag?.tagColor ?? "#c4b5fd");
    } catch (err) {
      setError(formatApiErrorMessage(err, t, t("moderation.tagVisibilitySaveFailed")));
    } finally {
      setLoading(false);
    }
  }, [isOwnVerified, playerId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!isOwnVerified) return null;

  const toggle = async (tag: CosmeticTagKey, visible: boolean) => {
    setSavingTag(tag);
    setError(null);
    try {
      await setTagVisibility(playerId, tag, visible);
      invalidatePlayerModeration(playerId);
      setTags((prev) =>
        prev
          ? prev.map((row) =>
              row.tag === tag ? { ...row, visible: !visible } : row
            )
          : prev
      );
    } catch (err) {
      setError(formatApiErrorMessage(err, t, t("moderation.tagVisibilitySaveFailed")));
    } finally {
      setSavingTag(null);
    }
  };

  const submitCustom = async () => {
    const text = customInput.trim();
    if (!text) return;
    setCustomBusy(true);
    setCustomError(null);
    try {
      await submitCustomTag(playerId, text, customReason.trim() || undefined, customColor);
      setCustomInput("");
      setCustomReason("");
      const data = await fetchTagVisibility(playerId);
      setTags(data.tags);
      setCustomTag(data.customTag);
    } catch (err) {
      setCustomError(formatApiErrorMessage(err, t, t("moderation.customTagSubmitFailed")));
    } finally {
      setCustomBusy(false);
    }
  };

  const saveCustomColor = async () => {
    if (!customTag) return;
    setCustomBusy(true);
    setCustomError(null);
    try {
      const saved = await setCustomTagColor(playerId, customColor);
      setCustomTag({ ...customTag, tagColor: saved.tagColor });
      invalidatePlayerModeration(playerId);
    } catch (err) {
      setCustomError(formatApiErrorMessage(err, t, t("moderation.tagVisibilitySaveFailed")));
    } finally {
      setCustomBusy(false);
    }
  };

  const cancelCustom = async () => {
    setCustomBusy(true);
    setCustomError(null);
    try {
      await cancelCustomTag(playerId);
      invalidatePlayerModeration(playerId);
      const data = await fetchTagVisibility(playerId);
      setTags(data.tags);
      setCustomTag(data.customTag);
    } catch (err) {
      setCustomError(formatApiErrorMessage(err, t, t("moderation.tagVisibilitySaveFailed")));
    } finally {
      setCustomBusy(false);
    }
  };

  const toggleCustom = async () => {
    if (!customTag || customTag.status !== "approved") return;
    setCustomBusy(true);
    setCustomError(null);
    try {
      await setTagVisibility(playerId, "custom", customTag.visible);
      invalidatePlayerModeration(playerId);
      setCustomTag({ ...customTag, visible: !customTag.visible });
    } catch (err) {
      setCustomError(formatApiErrorMessage(err, t, t("moderation.tagVisibilitySaveFailed")));
    } finally {
      setCustomBusy(false);
    }
  };

  return (
    <div className="pc-card space-y-4">
      <div>
        <h2 className="text-base font-semibold text-pc-text">
          {t("moderation.tagVisibilityTitle")}
        </h2>
        <p className="mt-1 text-xs text-pc-text-muted">
          {t("moderation.tagVisibilityDescription")}
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && tags === null ? (
        <div className="py-2 text-xs text-pc-text-muted">…</div>
      ) : tags && tags.length === 0 ? (
        <div className="rounded-lg border border-pc-border/50 px-3 py-2 text-xs text-pc-text-muted">
          {t("moderation.tagVisibilityNone")}
        </div>
      ) : (
        <ul className="divide-y divide-pc-border/40">
          {tags?.map((row) => (
            <li key={row.tag} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-pc-text">
                {TAG_LABELS[row.tag] ?? row.tag}
                {row.count != null && row.count > 0 && (
                  <span className="ml-1.5 text-xs text-pc-text-muted">×{row.count}</span>
                )}
              </span>
              <button
                type="button"
                disabled={savingTag === row.tag}
                onClick={() => void toggle(row.tag, row.visible)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                  row.visible
                    ? "border-pc-border/60 text-pc-text-secondary hover:border-pc-accent/60"
                    : "border-violet-400/50 text-violet-300"
                }`}
                aria-pressed={!row.visible}
              >
                {savingTag === row.tag
                  ? "…"
                  : row.visible
                    ? t("moderation.hideTag")
                    : t("moderation.showTag")}
                <span className="ml-1.5 text-xs uppercase tracking-wide text-pc-text-muted">
                  {row.visible ? t("moderation.tagVisible") : t("moderation.tagHidden")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-pc-border/50 pt-4">
        <h3 className="text-sm font-semibold text-pc-text">
          {t("moderation.customTagSectionTitle")}
        </h3>
        <p className="mt-1 text-xs text-pc-text-muted">
          {t("moderation.customTagDescription")}
        </p>

        {customError && (
          <div role="alert" className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {customError}
          </div>
        )}

        {customTag && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-pc-border/50 px-3 py-2">
            <span className="rounded border px-1.5 py-0.5 text-xs font-medium" style={{ color: customColor, borderColor: `${customColor}80` }}>
              {customTag.tagText}
            </span>
            <span
              className={`text-xs ${
                customTag.status === "approved"
                  ? "text-emerald-400"
                  : customTag.status === "pending"
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            >
              {customTag.status === "approved"
                ? t("moderation.customTagApproved")
                : customTag.status === "pending"
                  ? t("moderation.customTagPending")
                  : t("moderation.customTagRejected")}
            </span>
            {customTag.status === "approved" && (
              <button
                type="button"
                disabled={customBusy}
                onClick={() => void toggleCustom()}
                className={`ml-auto rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                  customTag.visible
                    ? "border-pc-border/60 text-pc-text-secondary hover:border-pc-accent/60"
                    : "border-violet-400/50 text-violet-300"
                }`}
                aria-pressed={!customTag.visible}
              >
                {customTag.visible ? t("moderation.hideTag") : t("moderation.showTag")}
                <span className="ml-1.5 text-xs uppercase tracking-wide text-pc-text-muted">
                  {customTag.visible ? t("moderation.tagVisible") : t("moderation.tagHidden")}
                </span>
              </button>
            )}
            {(customTag.status === "pending" || customTag.status === "approved") && (
              <button
                type="button"
                disabled={customBusy}
                onClick={() => void cancelCustom()}
                className={`${customTag.status === "pending" ? "ml-auto " : ""}rounded-md border border-pc-border/60 px-2.5 py-1 text-xs text-pc-text-secondary hover:border-pc-accent/60 disabled:opacity-50`}
              >
                {customTag.status === "approved" ? t("generated.account.remove") : t("moderation.customTagCancel")}
              </button>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-pc-text-secondary">
            {t("moderation.customTagColor")}
            <input type="color" value={customColor} disabled={customBusy} onChange={(event) => setCustomColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded border border-pc-border/60 bg-pc-bg" />
          </label>
          <span className="text-xs text-pc-text-muted">{customColor}</span>
          {customTag && <button type="button" disabled={customBusy || customColor === customTag.tagColor} onClick={() => void saveCustomColor()} className="rounded-md border border-pc-border/60 px-2.5 py-1 text-xs text-pc-text-secondary hover:border-pc-accent/60 disabled:opacity-50">{t("moderation.customTagSaveColor")}</button>}
        </div>

        {customTag?.status !== "approved" && <div className="mt-3 space-y-2">
          <input
            type="text"
            value={customInput}
            maxLength={24}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder={t("moderation.customTagPlaceholder")}
            className="w-full rounded-md border border-pc-border/60 bg-pc-bg px-3 py-1.5 text-sm text-pc-text placeholder:text-pc-text-muted focus:border-pc-accent/60 focus:outline-none"
          />
          <input
            type="text"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder={t("moderation.customTagReason")}
            className="w-full rounded-md border border-pc-border/60 bg-pc-bg px-3 py-1.5 text-sm text-pc-text placeholder:text-pc-text-muted focus:border-pc-accent/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={customBusy || customInput.trim().length === 0}
            onClick={() => void submitCustom()}
            className="rounded-md bg-pc-accent/90 px-3 py-1.5 text-xs font-semibold text-pc-bg hover:bg-pc-accent disabled:opacity-50"
          >
            {customBusy ? "…" : t("moderation.customTagSubmit")}
          </button>
        </div>}
      </div>
    </div>
  );
}
