/**
 * Render an external video only after the viewer explicitly chooses to contact its provider.
 *
 * refs: none
 */
"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { useLocalization } from "@/lib/localization-context";

function providerLabel(provider: string): string {
  if (provider.toLowerCase() === "youtube") return "YouTube";
  if (provider.toLowerCase() === "vimeo") return "Vimeo";
  if (provider.toLowerCase() === "twitch") return "Twitch";
  if (provider.toLowerCase() === "medal") return "Medal";
  if (provider.toLowerCase() === "discord") return "Discord";
  return provider || "external provider";
}

function resolvedEmbedUrl(src: string, provider: string): string {
  if (provider.toLowerCase() !== "twitch") return src;
  try {
    const url = new URL(src);
    url.searchParams.set("parent", window.location.hostname);
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * Render a click-to-load external iframe or direct provider-hosted video.
 * I/O types: `{ provider: string, src: string, title: string, directVideo?: boolean } -> JSX.Element`.
 *
 * refs: none
 */
export default function ExternalVideoConsent({
  provider,
  src,
  title,
  directVideo = false,
}: {
  provider: string;
  src: string;
  title: string;
  directVideo?: boolean;
}) {
  const { t } = useLocalization();
  const [loaded, setLoaded] = useState(false);
  const label = providerLabel(provider);

  if (loaded) {
    const resolved = resolvedEmbedUrl(src, provider);
    return directVideo ? (
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <video controls autoPlay playsInline preload="metadata" src={resolved} title={title} className="h-full w-full object-contain" />
      </div>
    ) : (
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <iframe src={resolved} title={title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-pc-border bg-black/80 p-6 text-center">
      <p className="max-w-xl text-sm leading-6 text-pc-text-secondary">{t("common.media.externalVideoPrivacy", { value1: label })}</p>
      <button type="button" onClick={() => setLoaded(true)} className="pc-btn-secondary inline-flex items-center gap-2">
        <Play className="h-4 w-4" aria-hidden="true" />
        {t("common.media.loadExternalVideo", { value1: label })}
      </button>
    </div>
  );
}
