/**
 * Render table pagination.
 * refs: none
 */
"use client";

import { useLocalization } from "@/lib/localization-context";

/**
 * Offer the supported row counts for table pagination.
 * refs: none
 */
export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;
/**
 * Define table page size as `(typeof TABLE_PAGE_SIZES)[number]`.
 * refs: none
 */
export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];

interface TablePaginationProps {
  page: number;
  pageSize: TablePageSize;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: TablePageSize) => void;
  fixedPageSize?: boolean;
}

/**
 * Render table pagination.
 * refs: none
 * I/O types: `{ page, pageSize, totalItems, onPageChange, onPageSizeChange, }: TablePaginationProps -> JSX.Element`.
 */
export default function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  fixedPageSize = false,
}: TablePaginationProps) {
  const { t , formatNumber} = useLocalization();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-pc-border px-3 py-2.5"
      aria-label={t("generated.changelog.pagination")}
    >
      <span className="text-xs text-pc-text-muted">
        {t("skins.showingStatus", { start, end, total: formatNumber(totalItems) })}
      </span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!fixedPageSize && <label className="flex items-center gap-2 text-xs text-pc-text-secondary">
          {t("skins.rowsPerPage")}
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value) as TablePageSize)}
            className="rounded-lg border border-pc-border bg-pc-bg-secondary px-2 py-1.5 text-xs text-pc-text"
          >
            {TABLE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>}
        <span className="min-w-20 text-center text-xs text-pc-text-muted">
          {t("skins.pageStatus", { page, total: totalPages })}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="rounded-lg border border-pc-border px-2.5 py-1.5 text-xs text-pc-text-secondary transition-colors hover:border-pc-accent-mid hover:text-pc-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("skins.previous")}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="rounded-lg border border-pc-border px-2.5 py-1.5 text-xs text-pc-text-secondary transition-colors hover:border-pc-accent-mid hover:text-pc-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("skins.next")}
        </button>
      </div>
    </nav>
  );
}
