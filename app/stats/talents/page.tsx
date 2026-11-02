/**
 * Preserve the former talent directory as an alias of Champion Loadouts.
 *
 * refs: none
 */
import { redirect } from "next/navigation";

/**
 * Redirect the duplicate talent directory to its canonical statistics owner.
 * I/O: in () -> out `never`.
 *
 * refs: none
 */
export default function LegacyTalentStatsPage() {
  redirect("/stats/loadouts");
}
