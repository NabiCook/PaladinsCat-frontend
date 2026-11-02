/** Historical confirmed-cheater directory. · refs: endpoints: GET /cheaters/inactive */

"use client";

import ModerationPlayerDirectory from "@/components/moderation-player-directory";
import { fetchInactiveCheaters } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";

/** Render inactive cheaters in backend-provided last-observed order. */
export default function InactiveCheatersPage() {
  const { formatNumber, t } = useLocalization();
  return (
    <ModerationPlayerDirectory
      title={t("moderation.inactiveCheaterDatabase")}
      searchLabel={t("moderation.searchPlayerNameOrId")}
      countLabel={(total) => t("moderation.historicalRecords", { value1: formatNumber(total) })}
      errorLabel={t("moderation.inactiveDirectoryLoadFailed")}
      emptyLabel={t("moderation.noInactiveCheaters")}
      fallbackReason={t("moderation.confirmedCheater")}
      fetchPage={fetchInactiveCheaters}
      accent="violet"
      inactive
    />
  );
}
