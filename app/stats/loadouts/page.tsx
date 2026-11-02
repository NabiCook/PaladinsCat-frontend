/**
 * Render the champion loadout statistics directory.
 *
 * refs: none
 */
import LoadoutChampionDirectory from "@/components/loadout-champion-directory";

/**
 * Render `/stats/loadouts` from the canonical static champion roster.
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: none
 */
export default function LoadoutsPage() {
  return <LoadoutChampionDirectory />;
}
