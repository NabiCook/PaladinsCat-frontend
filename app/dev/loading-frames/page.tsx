/**
 * Loopback-only inspection of the actual player-frame component and full asset catalog.
 *
 * refs: none
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PlayerLoadingFrame from "@/components/player-loading-frame";
import { localPreviewAccessAllowed } from "@/lib/local-preview-access";
import { getServerLocalization } from "@/lib/server-localization";
import manifest from "@/public/images/loading-frames/manifest.json";

/**
 * Render the loopback-only loading-frame preview grid.
 * I/O: in () -> out `Promise<JSX.Element>`.
 *
 * refs: none
 */
export default async function LoadingFramePreview() {
  const { t } = await getServerLocalization();
  const host = (await headers()).get("host") ?? "";
  let hostname = "";
  try { hostname = new URL(`http://${host}`).hostname; } catch { notFound(); }
  if (!localPreviewAccessAllowed(process.env.NODE_ENV, process.env.NEXT_PUBLIC_LOCAL_AUTH_BYPASS, hostname)) notFound();
  return <main className="p-6">
    <h1>{t("common.dev.loadingFrameVerification")}</h1>
    <div className="grid grid-cols-4 gap-6">
      {manifest.frames.map(frame => <article key={frame.slug} data-frame-slug={frame.slug}>
        <h2>{frame.name}</h2>
        <PlayerLoadingFrame loadingFrame={frame.name} avatarUrl={null} avatarAlt={t("common.dev.previewAvatar")} />
      </article>)}
    </div>
  </main>;
}
