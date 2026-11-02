/**
 * Render the WallShootersPage view for the player wall-shooters page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import WallShooterDirectory from "@/components/wall-shooter-directory";

/**
 * Render the WallShootersPage view for the player wall-shooters page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function WallShootersPage() {
  return <WallShooterDirectory />;
}
