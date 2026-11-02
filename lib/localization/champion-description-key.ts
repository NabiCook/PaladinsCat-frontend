/** Catalog key resolution for champion skill/talent/loadout description text.
 *
 * refs: none
 */
import { EN_MESSAGES, type TranslationKey } from "@/lib/localization/messages";
import { championSlug } from "@/lib/utils";

/** Resolve the catalog key for a champion description, preserving source text when absent.
 *
 * I/O: in (championName: string, section: string, entryName: string) -> out TranslationKey | null
 *
 * refs: none
 */
export function championDescriptionKey(
  championName: string,
  section: "skills" | "talents" | "loadouts",
  entryName: string,
): TranslationKey | null {
  const candidate = `champions.${championSlug(championName)}.${section}.${championSlug(entryName)}.description`;
  return candidate in EN_MESSAGES ? candidate as TranslationKey : null;
}
