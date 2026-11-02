/**
 * Render the layout for the player class role layout route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import type { Metadata } from "next";
import { getServerLocalization } from "@/lib/server-localization";

type Props = {
  children: React.ReactNode;
  params: Promise<{ role: string }>;
};

function titleCaseRole(role: string) {
  return role
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Build SEO metadata for the player class role layout route.
 * refs: none
 * I/O types: `{ params }: Props -> Promise<Metadata>`.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role } = await params;
  const displayRole = titleCaseRole(role);
  const { t } = await getServerLocalization();

  return {
    title: t("seo.players.class.title", { role: displayRole }),
    description: t("seo.players.class.description", { role: displayRole }),
    alternates: {
      canonical: `/players/class/${role}`,
    },
  };
}

/**
 * Render the layout for the player class role layout route.
 * refs: none
 * I/O types: `{ children }: Props -> ReactNode`.
 */
export default function PlayerClassLayout({ children }: Props) {
  return children;
}
