/**
 * Render the shared image and source-link controls for user submissions.
 *
 * Routes keep their own form state and domain fields; this component keeps the
 * same bounded media UI for community posts and moderation evidence.
 *
 * refs: none
 */
"use client";

import { useLocalization } from "@/lib/localization-context";

/**
 * Render the bounded image-upload and source-link controls for a submission.
 * I/O: in `{ files: File[], sourceUrl: string, onFilesChange: (files: File[]) => void, onSourceUrlChange: (value: string) => void, onValidationError: (message: string) => void }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function SubmissionMediaFields({
  files,
  sourceUrl,
  onFilesChange,
  onSourceUrlChange,
  onValidationError,
}: {
  files: File[];
  sourceUrl: string;
  onFilesChange: (files: File[]) => void;
  onSourceUrlChange: (value: string) => void;
  onValidationError: (message: string) => void;
}) {
  const { formatNumber, t } = useLocalization();
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-pc-text-secondary">{t("moderation.imagesUpToFive")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => {
              const next = Array.from(event.target.files ?? []);
              if (next.length > 5) {
                onValidationError(t("moderation.chooseAtMostFiveImages"));
                return;
              }
              onFilesChange(next);
            }}
            className="mt-1 block w-full rounded-lg border border-pc-border bg-pc-bg px-3 py-1.5 text-sm font-normal text-pc-text file:mr-3 file:rounded file:border-0 file:bg-pc-bg-secondary file:px-2 file:py-1 file:text-xs file:text-pc-text"
          />
          <span className="block font-normal text-pc-text-muted">{t("moderation.imageFormats")}</span>
        </label>
        <label className="space-y-1 text-xs font-semibold text-pc-text-secondary">{t("moderation.sourceLink")}
          <input
            type="url"
            value={sourceUrl}
            onChange={(event) => onSourceUrlChange(event.target.value)}
            placeholder={t("moderation.sourceLinkPlaceholder")}
            className="mt-1 w-full rounded-lg border border-pc-border bg-pc-bg px-3 py-2 text-sm font-normal text-pc-text outline-none focus:border-pc-accent-mid"
          />
        </label>
      </div>
      {files.length > 0 && <p className="text-xs text-pc-text-muted">{files.length === 1 ? t("moderation.selectedImage") : t("moderation.selectedImages", { value1: formatNumber(files.length) })}</p>}
    </>
  );
}