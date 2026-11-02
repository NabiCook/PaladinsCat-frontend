/**
 * Catalog the built-in full-scene wallpapers and their AVIF/PNG variants.
 *
 * This module exposes local asset paths only; it does not include tactical maps or perform network work.
 * refs: none
 */
/**
 * Define built in wallpaper as `{ avif: string; png: string }`.
 * refs: none
 */
export type BuiltInWallpaper = { avif: string; png: string };

const WALLPAPER_IDS = [
  "Frog_Isle_Loading",
  "Frozen_Guard_Loading",
  "Match_Snowfall_Junction",
  "Warders_Gate_Loading",
  "Match_Bazaar",
  "Ascension_Peak_Loading",
  "Match_Frostbite_Cavern",
  "Ice_Mines_Loading",
  "Jaguar_Falls_Loading",
  "Brightmarsh_Loading",
] as const;

// Full-scene artwork only. Tactical overhead map layouts remain available to
// map-specific views but are intentionally excluded from the site wallpaper.
/**
 * Build the default wallpaper asset list from the checked-in artwork IDs.
 *
 * Returns local AVIF and PNG paths without network, authentication, cache, or persistence effects.
 * refs: none
 */
export const DEFAULT_WALLPAPERS: BuiltInWallpaper[] = WALLPAPER_IDS.map((id) => ({
  avif: `/images/wallpaper-new/${id}.avif`,
  png: `/images/wallpaper-new/${id}.png`,
}));

/**
 * Randomize built-in wallpapers while ensuring the client does not start on the SSR fallback.
 *
 * I/O: in (wallpapers: readonly BuiltInWallpaper[], random: () => number) -> out BuiltInWallpaper[]
 * refs: none
 */
export function randomizeWallpaperOrder(
  wallpapers: readonly BuiltInWallpaper[],
  random: () => number = Math.random,
): BuiltInWallpaper[] {
  const randomized = [...wallpapers];
  for (let index = randomized.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [randomized[index], randomized[swapIndex]] = [randomized[swapIndex], randomized[index]];
  }

  if (randomized.length > 1 && randomized[0] === wallpapers[0]) {
    const swapIndex = 1 + Math.floor(random() * (randomized.length - 1));
    [randomized[0], randomized[swapIndex]] = [randomized[swapIndex], randomized[0]];
  }

  return randomized;
}
