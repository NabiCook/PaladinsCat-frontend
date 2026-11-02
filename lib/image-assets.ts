/**
 * Next's production static-file handler does not resolve local image paths
 * containing commas, even when the file exists in the container. Asset names
 * are therefore published without commas; normalize legacy reference data at
 * the rendering boundary as well.
 * Returns: `string`
 * refs: none
 */
/**
 * Remove commas from local /images/ asset paths to match published filenames; leave other sources unchanged.
 * I/O types: `src: string -> string`.
 * refs: none
 */
export function canonicalLocalImageUrl(src: string): string {
  return src.startsWith("/images/") ? src.replace(/,/g, "") : src;
}

/**
 * Define local image sources as `{ preferred: string; fallback: string; }`.
 * refs: none
 */
export type LocalImageSources = {
  preferred: string;
  fallback: string;
};

/**
 * Resolve local artwork to an AVIF-first source with a PNG compatibility
 * fallback. Remote, data, and blob URLs are left untouched because the site
 * does not own an alternate representation for them.
 * refs: none
 * I/O types: `src: string -> LocalImageSources`.
 */
export function localImageSources(src: string): LocalImageSources {
  const canonical = canonicalLocalImageUrl(src);
  if (!canonical.startsWith("/images/")) {
    return { preferred: canonical, fallback: canonical };
  }

  const match = canonical.match(/^(.*)\.(?:avif|png|jpe?g|webp)([?#].*)?$/i);
  if (!match) {
    return { preferred: canonical, fallback: canonical };
  }

  const [, stem, suffix = ""] = match;
  return {
    preferred: `${stem}.avif${suffix}`,
    fallback: `${stem}.png${suffix}`,
  };
}

/**
 * Return the AVIF-first local image source selected by localImageSources; external and unsupported sources pass through unchanged.
 * refs: none
 * I/O types: `src: string -> string`.
 */
export function preferredLocalImageUrl(src: string): string {
  return localImageSources(src).preferred;
}

/**
 * Return the PNG fallback selected by localImageSources; external and unsupported sources pass through unchanged.
 * refs: none
 * I/O types: `src: string -> string`.
 */
export function fallbackLocalImageUrl(src: string): string {
  return localImageSources(src).fallback;
}

/**
 * Champion data owns exact talent asset URLs. Never reconstruct a filename
 * refs: none
 * from API display text; punctuation, localization, and historic names differ.
 * I/O types: `source: string | null | undefined -> string | null`.
 */
export function getCanonicalTalentImageUrl(source: string | null | undefined): string | null {
  return source?.startsWith("/images/") ? preferredLocalImageUrl(source) : null;
}

/** Resolve the local item icon using the shared item artwork naming convention. */
export function itemIconPath(name: string): string {
  return `/images/items/${name.replace(/\s+/g, "_")}_Icon.avif`;
}
