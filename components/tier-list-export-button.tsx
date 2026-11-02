/**
 * Render the tier-list PNG export action.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import { LoadingIndicator } from "@/components/async-state";
import { useLocalization } from "@/lib/localization-context";
import type { TierListMode } from "@/lib/tierlists-api";
import { Download } from "lucide-react";

type TierListExportButtonProps = {
  tierListId: number;
  mode: TierListMode;
  target: RefObject<HTMLElement | null>;
};

async function tierListPng(board: HTMLElement): Promise<string> {
  const MAX_PER_ROW = 8;
  const originalStyle = board.style.cssText;
  board.setAttribute("data-image-export", "true");
  board.style.maxWidth = "none";
  board.style.transform = "none";
  try {
    // Measure icon size, gap, and label width from the live DOM to compute
    // a board width that fits exactly MAX_PER_ROW champions per tier row.
    const tierContent = board.querySelector<HTMLElement>(".flex-wrap");
    const firstIcon = tierContent?.querySelector<HTMLElement>("img");
    const iconSize = firstIcon ? Math.round(firstIcon.getBoundingClientRect().width) : 56;
    const gap = tierContent ? parseFloat(window.getComputedStyle(tierContent).columnGap || "0") : 8;
    const padding = tierContent ? parseFloat(window.getComputedStyle(tierContent).paddingLeft || "0") : 12;
    const labelEl = board.querySelector<HTMLElement>(".grid > div");
    const labelWidth = labelEl ? Math.round(labelEl.getBoundingClientRect().width) : 68;
    const boardBorder = parseFloat(window.getComputedStyle(board).borderLeftWidth || "0");
    const contentWidth = MAX_PER_ROW * iconSize + (MAX_PER_ROW - 1) * gap;
    const exportWidth = Math.round(boardBorder * 2 + labelWidth + contentWidth + padding * 2);
    board.style.width = `${exportWidth}px`;

    await document.fonts.ready;
    await Promise.all(Array.from(board.querySelectorAll("img")).map((image) => {
      if (image.complete) return image.decode?.().catch(() => undefined) ?? Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }));
    const computedStyle = window.getComputedStyle(board);
    const exportHeight = board.clientHeight
      + parseFloat(computedStyle.borderTopWidth || "0")
      + parseFloat(computedStyle.borderBottomWidth || "0");
    const scale = 2;
    const canvasWidth = Math.round(exportWidth * scale);
    const canvasHeight = Math.round(exportHeight * scale);
    return await toPng(board, {
      width: exportWidth,
      height: exportHeight,
      canvasWidth,
      canvasHeight,
      pixelRatio: 1,
      cacheBust: false,
      backgroundColor: "var(--pc-bg-secondary)",
      style: { transform: "none", transformOrigin: "top left" },
    });
  } finally {
    board.style.cssText = originalStyle;
    board.removeAttribute("data-image-export");
  }
}

/**
 * Render a localized tier-list PNG download button.
 * I/O: in `TierListExportButtonProps` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function TierListExportButton({ tierListId, mode, target }: TierListExportButtonProps) {
  const { t } = useLocalization();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function exportImage() {
    setExporting(true);
    setMessage(null);
    try {
      const board = target.current;
      if (!board) throw new Error(t("tierLists.exportError"));
      const dataUrl = await tierListPng(board);
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `paladinscat-${mode}-tier-list-${tierListId}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setMessage(t("tierLists.exportedImage"));
    } catch (error) {
      setMessage(formatApiErrorMessage(error, t, t("tierLists.exportError")));
    } finally {
      setExporting(false);
    }
  }

  return <div className="flex items-center gap-2">
    {message && <span className="hidden text-xs text-pc-text-secondary sm:inline" role="status">{message}</span>}
    <button type="button" onClick={exportImage} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-pc-border bg-pc-bg-secondary px-3 py-1.5 text-xs font-semibold text-pc-text transition-colors hover:border-pc-accent-mid hover:text-pc-accent disabled:cursor-not-allowed disabled:opacity-60" title={t("tierLists.exportImage")}>
      <Download aria-hidden="true" size={14} />
      {exporting ? <LoadingIndicator className="gap-2" /> : t("tierLists.exportImage")}
    </button>
  </div>;
}
