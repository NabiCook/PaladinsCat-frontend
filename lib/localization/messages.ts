/** Defines localized message payloads and message lookup types.
 * The module owns the existing URL, context, or locale-message boundary.
 * refs: none
 */
import asyncMessages from "./catalog/ui/async.json";
import footerMessages from "./catalog/ui/footer.json";
import navigationMessages from "./catalog/ui/navigation.json";
import commonMessages from "./catalog/ui/common.json";
import moderationMessages from "./catalog/ui/moderation.json";
import communityMessages from "./catalog/pages/community.json";
import playerFriendsMessages from "./catalog/pages/player-friends.json";
import championMatchupsMessages from "./catalog/pages/champion-matchups.json";
import matchMessages from "./catalog/pages/matches.json";
import playerTrendsMessages from "./catalog/pages/player-trends.json";
import playerMctsProfileMessages from "./catalog/pages/player-mcts-profile.json";
import itemMessages from "./catalog/game/items.json";
import mapMessages from "./catalog/game/maps.json";
import talentMessages from "./catalog/game/talents.json";
import homeMessages from "./catalog/pages/home.json";
import featureMessages from "./catalog/pages/features.json";
import localizationMessages from "./catalog/pages/localization.json";
import diminishingReturnsMessages from "./catalog/pages/diminishing-returns.json";
import paladinsCatBotMessages from "./catalog/pages/paladinscat-bot.json";
import adminEmailMessages from "./catalog/pages/admin-email.json";
import statusMessages from "./catalog/system/status.json";
import generatedUiMessages from "./catalog/generated/ui.json";
import seoMessages from "./catalog/seo/metadata.json";
import championMessages from "./catalog/game/champions.json";

/**
 * Apply EN_MESSAGES to lobby-tier or localization inputs.
 * Contract: returns the normalized route, context state, or message value while preserving existing browser behavior.
 * refs: none
 */
export const EN_MESSAGES = {
  // Generated strings are a fallback-only catalog. Keep them first so curated
  // modules remain authoritative when a key exists in both catalogs.
  ...generatedUiMessages,
  ...navigationMessages,
  ...commonMessages,
  ...moderationMessages,
  ...communityMessages,
  ...playerFriendsMessages,
  ...championMatchupsMessages,
  ...matchMessages,
  ...playerTrendsMessages,
  ...playerMctsProfileMessages,
  ...footerMessages,
  ...asyncMessages,
  ...homeMessages,
  ...featureMessages,
  ...localizationMessages,
  ...diminishingReturnsMessages,
  ...paladinsCatBotMessages,
  ...adminEmailMessages,
  ...statusMessages,
  ...talentMessages,
  ...itemMessages,
  ...mapMessages,
  ...seoMessages,
  ...championMessages,
};
/**
 * Define translation key as `keyof typeof EN_MESSAGES`.
 * refs: none
 */
export type TranslationKey = keyof typeof EN_MESSAGES;
/**
 * Define translation values as `Record<string, string | number>`.
 * refs: none
 */
export type TranslationValues = Record<string, string | number>;
/**
 * Define locale messages as `Partial<Record<TranslationKey, string>>`.
 * refs: none
 */
export type LocaleMessages = Partial<Record<TranslationKey, string>>;

/**
 * Apply sanitizeLocaleMessages to lobby-tier or localization inputs.
 * Contract: returns the normalized route, context state, or message value while preserving existing browser behavior.
 * refs: none
 * I/O types: `payload: unknown -> LocaleMessages`.
 */
export function sanitizeLocaleMessages(payload: unknown): LocaleMessages {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  const messages: LocaleMessages = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key in EN_MESSAGES && typeof value === "string" && value.length <= 1_000) {
      messages[key as TranslationKey] = value;
    }
  }
  return messages;
}

/**
 * Apply formatMessage to lobby-tier or localization inputs.
 * Contract: returns the normalized route, context state, or message value while preserving existing browser behavior.
 * refs: none
 * I/O types: `message: string; values?: TranslationValues -> string`.
 */
export function formatMessage(
  message: string,
  values?: TranslationValues,
) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) => (
    key in values ? String(values[key]) : placeholder
  ));
}

/**
 * Apply translate to lobby-tier or localization inputs.
 * Contract: returns the normalized route, context state, or message value while preserving existing browser behavior.
 * refs: none
 * I/O types: `messages: LocaleMessages; key: TranslationKey; values?: TranslationValues -> string`.
 */
export function translate(
  messages: LocaleMessages,
  key: TranslationKey,
  values?: TranslationValues,
) {
  return formatMessage(messages[key] ?? EN_MESSAGES[key], values);
}
