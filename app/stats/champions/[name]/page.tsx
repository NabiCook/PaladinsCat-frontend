/**
 * Render a shareable champion-specific statistics view.
 *
 * refs: none
 */
import ChampionMatchups from "@/components/champion-matchups";
/**
 * Resolve the promised route slug and render champion matchups.
 * I/O types: `{params: Promise<{name: string}>}` -> `Promise<React.JSX.Element>`.
 * refs: none
 */
export default async function Page({params}: {params: Promise<{name: string}>}): Promise<React.JSX.Element> {
  const {name} = await params;
  return <ChampionMatchups key={name} initialSlug={name} />;
}
