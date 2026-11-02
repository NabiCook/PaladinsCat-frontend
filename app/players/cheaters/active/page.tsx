/** Recent confirmed-cheater directory. · refs: endpoints: GET /cheaters/active */

"use client";

import ModerationPlayerDirectory from "@/components/moderation-player-directory";
import { fetchActiveCheaters } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";

/** Render active cheaters in backend-provided newest-activity order. */
export default function ActiveCheatersPage() {
  const { formatNumber, t } = useLocalization();
  return (
    <ModerationPlayerDirectory
      title={t("moderation.activeCheaters")}
      searchLabel={t("moderation.searchPlayerNameOrId")}
      countLabel={(total) => t("moderation.activeRecords", { value1: formatNumber(total) })}
      errorLabel={t("moderation.activeDirectoryLoadFailed")}
      emptyLabel={t("moderation.noRecentActiveCheaters")}
      fallbackReason={t("moderation.confirmedCheater")}
      fetchPage={fetchActiveCheaters}
      accent="red"
    />
  );
}
