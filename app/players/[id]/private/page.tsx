/**
 * Define the private-account profile route surface.
 * The Hi-Rez API refuses these accounts, so the route loads the MCTS capture
 * that stands in for the public profile and leaves rendering to the client.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
import type { Metadata } from "next";
import { getServerLocalization } from "@/lib/server-localization";
import { getServerMctsProfile } from "@/lib/mcts-profile-server";
import type { MctsProfileResponse } from "@/lib/mcts-profile-types";
import MctsProfileClient from "./mcts-profile-client";

/**
 * Select dynamic rendering for the private player profile route.
 * Returns the framework rendering mode constant used by this route.
 * refs: none
 */
export const dynamic = "force-dynamic";

/**
 * Build metadata for a capture-only profile: never indexed, canonical to itself.
 * refs: none
 * I/O types: `{ params }: { params: Promise<{ id: string }>; } -> Promise<Metadata>`.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getServerLocalization();
  return {
    title: t("mctsProfile.metaTitle", { value1: id }),
    description: t("mctsProfile.explanation"),
    robots: { index: false, follow: false },
    alternates: { canonical: `/players/${id}/private` },
  };
}

/**
 * Render the private player profile page, falling back to a browser fetch when SSR has no capture.
 * refs: endpoints: GET /players/{id}/mcts-profile
 * I/O types: `{ params }: { params: Promise<{ id: string }>; } -> Promise<JSX.Element>`.
 */
export default async function PrivatePlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let initialResponse: MctsProfileResponse | null = null;

  try {
    initialResponse = await getServerMctsProfile(id);
  } catch (error) {
    console.error(`[players/${id}/private] Server MCTS profile fetch failed; using browser fallback`, error);
  }

  return <MctsProfileClient key={id} id={id} initialResponse={initialResponse} />;
}
