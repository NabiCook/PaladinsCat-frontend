/**
 * Compose metadata and child content for matches id layout.
 * Keep SEO and nesting behavior local to this layout.
 * refs: none
 */
import type { Metadata } from "next";
import { getServerLocalization } from "@/lib/server-localization";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

/**
 * Build SEO metadata for matches id layout.
 * Return the Next.js metadata object used by the page without mutating application data.
 * refs: none
 * I/O types: `{ params }: Props -> Promise<Metadata>`.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getServerLocalization();

  return {
    title: t("seo.matches.detail.title", { id }),
    description: t("seo.matches.detail.description", { id }),
    // A match URL is a share target, not an indexable page: the body is the
    // same client shell for every id, so Google would index thousands of thin
    // duplicates and dilute the single canonical /matches entry (the only
    // match route the sitemap publishes). Keep the deep link crawlable but
    // out of the index and consolidate it on the dashboard URL.
    robots: { index: false, follow: true },
    alternates: {
      canonical: "/matches",
    },
  };
}

/**
 * Pass the /matches/[id] layout children through unchanged.
 * Render the MatchDetailLayout view for matches id layout.
 * refs: none
 * I/O types: `{ children }: Props -> ReactNode`.
 */
export default function MatchDetailLayout({ children }: Props) {
  return children;
}
