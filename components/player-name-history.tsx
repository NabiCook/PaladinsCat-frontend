/**
 * Player name history — latest previous name plus observed history intervals.
 *
 * Owns the `PlayerNameHistory` component. Fetches paginated name-history
 * intervals from the API; display only, restricted history stays hidden.
 *
 * refs: none
 */
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { History, X } from "lucide-react";
import { useLocalization } from "@/lib/localization-context";

interface NameInterval {
  id: number;
  name: string;
  used_from: string;
  used_to: string | null;
}

const PAGE_SIZE = 20;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

/**
 * Show the latest previous name and the API's observed history intervals.
 * I/O: in `{ playerId: string | number }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function PlayerNameHistory({ playerId }: { playerId: string | number }) {
  const { t, formatDateTime } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const helpId = useId();
  const [rows, setRows] = useState<NameInterval[]>([]);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/player-ext/name-history/${encodeURIComponent(playerId)}?page=${page}&perPage=${PAGE_SIZE}`, {
      signal: controller.signal,
    }).then(async (response) => {
      // Keep the existing API access policy; do not expose restricted history.
      if (response.status === 401 || response.status === 403) return [];
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error();
      return data as NameInterval[];
    }).then((data) => {
      if (controller.signal.aborted) return;
      setRows((previous) => page === 1 ? data : [...previous, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setFailed(false);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [playerId, page, attempt]);

  const previous = rows.filter((row) => row.used_to !== null);
  const retry = () => { setLoading(true); setAttempt((value) => value + 1); };
  if (!previous.length) {
    return failed ? (
      <button type="button" onClick={retry} disabled={loading} className="text-xs text-pc-text-secondary underline">
        {t("common.nameHistory.retry")}
      </button>
    ) : null;
  }

  return (
    <>
      <span className="min-w-0 break-words text-xs font-normal text-pc-text-secondary">
        {t("common.nameHistory.previous", { name: previous[0].name })}
      </span>
      {previous.length > 1 && (
        <>
          <button type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-pc-text-secondary hover:bg-pc-bg hover:text-pc-text focus-visible:outline-2 focus-visible:outline-offset-2">
            <History aria-hidden="true" className="h-3.5 w-3.5" />
            {t("common.nameHistory.history")}
          </button>
          <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={helpId}
            onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
            className="fixed inset-0 m-auto max-h-[80dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-pc-border bg-pc-bg-elevated p-0 text-pc-text shadow-xl backdrop:bg-black/60">
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id={titleId} className="text-lg font-semibold">{t("common.nameHistory.title")}</h2>
                <button type="button" autoFocus onClick={() => dialog.current?.close()}
                  aria-label={t("generated.components.close")} className="rounded p-2 hover:bg-pc-bg">
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <p id={helpId} className="mb-4 mt-2 text-xs text-pc-text-secondary">{t("common.nameHistory.observed")}</p>
              <ol className="divide-y divide-pc-border">
                {previous.map((row) => (
                  <li key={row.id} className="py-3">
                    <div className="break-words text-sm font-medium">{row.name}</div>
                    <div className="mt-1 text-xs text-pc-text-secondary">
                      <time dateTime={row.used_from}>{formatDateTime(row.used_from)}</time>
                      {" – "}
                      <time dateTime={row.used_to!}>{formatDateTime(row.used_to)}</time>
                    </div>
                  </li>
                ))}
              </ol>
              {failed && <p role="alert" className="mt-3 text-xs text-pc-text-secondary">{t("common.nameHistory.failed")}</p>}
              {(hasMore || failed) && (
                <button type="button" disabled={loading}
                  onClick={() => { if (failed) retry(); else { setLoading(true); setPage((value) => value + 1); } }}
                  className="mt-3 rounded border border-pc-border px-3 py-2 text-xs disabled:opacity-50">
                  {t(loading ? "common.nameHistory.loading" : failed ? "common.nameHistory.retry" : "common.nameHistory.more")}
                </button>
              )}
            </div>
          </dialog>
        </>
      )}
    </>
  );
}
