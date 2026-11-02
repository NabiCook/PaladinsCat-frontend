/**
 * Render community-post media returned by the shared submission pipeline.
 *
 * refs: none
 */
"use client";

import { ExternalLink } from "lucide-react";
import type { Post } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import ExternalVideoConsent from "@/components/ExternalVideoConsent";

function imageUrl(url: string, format: "avif" | "original") {
  return `${url}${url.includes("?") ? "&" : "?"}format=${format}`;
}

/**
 * Render a community post's images, embedded video, and source link.
 * I/O: in `{ post: Post }` -> out `JSX.Element | null`.
 *
 * refs: none
 */
export default function CommunityPostMedia({ post }: { post: Post }) {
  const { formatNumber, t } = useLocalization();
  if (post.imageUrls.length === 0 && !post.embedUrl && !post.sourceUrl) return null;
  return (
    <div className="mt-4 space-y-3">
      {post.imageUrls.length > 0 && <div className={`grid gap-px overflow-hidden rounded-xl border border-pc-border bg-pc-border ${post.imageUrls.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        {post.imageUrls.map((url, index) => <picture key={url} className="block aspect-video bg-pc-bg"><source srcSet={imageUrl(url, "avif")} type="image/avif" /><img src={imageUrl(url, "original")} alt={t("community.postImageAlt", { value1: formatNumber(index + 1), value2: post.title })} loading="lazy" decoding="async" className="h-full w-full object-contain" /></picture>)}
      </div>}
      {post.embedUrl && (post.provider === "medal" || post.provider === "discord") ? (
        <ExternalVideoConsent provider={post.provider} src={post.embedUrl} title={t("community.postClipTitle", { value1: post.provider === "discord" ? "Discord" : "Medal", value2: post.title })} directVideo />
      ) : post.embedUrl ? (
        <ExternalVideoConsent provider={post.provider || "external"} src={post.embedUrl} title={t("community.postVideoTitle", { value1: post.provider || "Video", value2: post.title })} />
      ) : null}
      {post.sourceUrl && <a href={post.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-pc-accent hover:text-pc-accent-secondary"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{t("community.openSource")}</a>}
    </div>
  );
}
