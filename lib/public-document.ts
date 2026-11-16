/** Render public SPA documents from the same content owners as the client views.
 * No account state, caller origin or crawler detection enters this public output.
 * refs: doc: 06-reference-seo · see: lib/sitemap-data.ts · lib/spa-seo.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { getAllPosts, getPostLink, resolveBlogAssetUrl, resolveBlogLink } from "./blog";
import type { ChampionData } from "./champion-data";
import { getFeatureDocument, type FeatureDocument } from "./feature-document";
import seo from "./localization/catalog/seo/metadata.json";
import homeCopy from "./localization/catalog/pages/home.json";
import featureCopy from "./localization/catalog/pages/features.json";
import { fetchServerJsonStatic } from "./server-api";
import { SITE_NAME } from "./seo";
import { STATIC_CHAMPIONS } from "./static-champions";
import { championSlug } from "./utils";

type PublicDocument = { title: string; description: string; html: string; data?: { features: FeatureDocument } };
type SourcePage = { html: string; source: string; sourceSha256: string };
type MatchSummary = { match_id: string | number; map: string; entry_datetime: string; region: string };
type Release = { component: string; componentVersion?: string; version: string; deployedAt: string; changelog: string };
let sourcePages: Record<string, SourcePage> | undefined;
let championData: Record<string, ChampionData> | undefined;

/** Escape text and attribute values, including source-owned Markdown URLs. */
export const escapePublicHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);
const paragraph = (value: string) => `<p>${escapePublicHtml(value)}</p>`;
const link = (href: string, text: string) => `<a href="${escapePublicHtml(href)}">${escapePublicHtml(text)}</a>`;
const list = (items: string[]) => `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
const section = (title: string, body: string) => `<section><h2>${escapePublicHtml(title)}</h2>${body}</section>`;
const document = (title: string, description: string, body: string, heading = title): PublicDocument => ({
  title: [title, SITE_NAME].join(" | "), description,
  html: `<h1>${escapePublicHtml(heading)}</h1>${body}`,
});
const plainText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|quot|#39|lt|gt);/g, entity => ({
  "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">",
})[entity]!).replace(/\s+/g, " ").trim();

/** Read the committed source-derived HTML already consumed by static SPA pages.
 * Parse its JSON export as data; never execute the browser module on the server.
 */
function staticSourcePages(): Record<string, SourcePage> {
  if (!sourcePages) {
    const source = readFileSync(join(process.cwd(), "public/app/discovery-community-content.js"), "utf8");
    const exported = source.match(/export const sourcePages\s*=\s*(\{.*\});?\s*$/s);
    if (!exported) throw new Error("Public page source unavailable");
    sourcePages = JSON.parse(exported[1]) as Record<string, SourcePage>;
  }
  return sourcePages;
}

/** Render safe CommonMark/GFM with the blog owner's relative link/asset rules.
 * Raw HTML and dangerous protocols retain micromark's safe defaults.
 */
function markdown(content: string, sourcePath?: string): string {
  const html = micromark(content, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  if (!sourcePath) return html;
  return html.replace(/\b(href|src)="([^"]*)"/g, (_attribute, kind: string, encoded: string) => {
    const value = encoded.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
    const resolved = kind === "href" ? resolveBlogLink(value, sourcePath) : resolveBlogAssetUrl(value, sourcePath);
    return `${kind}="${escapePublicHtml(resolved)}"`;
  });
}

// Public, session-free reads use the existing API transport and five-minute cache.
// Failure rejects rather than generating an indexable empty or invented feed.
const matchOverview = unstable_cache(() => fetchServerJsonStatic<{ recent: MatchSummary[] }>(
  "/matches/overview", { timeoutMs: 700 }), ["public-document-matches-v1"], { revalidate: 300 });
const releaseHistory = unstable_cache(() => fetchServerJsonStatic<{ data: Release[] }>(
  "/meta/changelog?page=1&perPage=10", { timeoutMs: 700 }), ["public-document-releases-v1"], { revalidate: 300 });

/** Produce visible initial content for an inventoried public path.
 * Static HTML, champion reference JSON, blogs and features keep their owners.
 * Return null for unsupported paths; callers apply the inventory/access gate first.
 */
export async function getPublicDocument(path: string): Promise<PublicDocument | null> {
  const champion = STATIC_CHAMPIONS.find(entry => path === `/champions/${championSlug(entry.name)}`);
  if (champion) {
    championData ??= JSON.parse(readFileSync(join(process.cwd(), "public/data/champion-data.json"), "utf8"));
    const data = championData![championSlug(champion.name)];
    if (!data) throw new Error("Champion reference unavailable");
    const description = seo["seo.champions.detail.description"].replace("{name}", champion.name);
    const stats = data.stats;
    const body = paragraph(champion.roles.join(" / ")) + paragraph(description)
      + `<dl><dt>Health</dt><dd>${escapePublicHtml(stats.health)}</dd><dt>Movement speed</dt><dd>${escapePublicHtml(stats.speedUnits || stats.speed)}</dd><dt>Range</dt><dd>${escapePublicHtml(stats.range)}</dd></dl>`
      + section("Abilities", data.skills.map(skill => `<h3>${escapePublicHtml(skill.name)}</h3>`
        + paragraph([skill.key, skill.damage && `Damage: ${skill.damage}`, skill.healing && `Healing: ${skill.healing}`, skill.cooldown && `Cooldown: ${skill.cooldown}`].filter(Boolean).join(" · "))
        + paragraph(skill.description || "")).join(""))
      + section("Talents", data.talents.map(talent => `<h3>${escapePublicHtml(talent.name)}</h3>${paragraph(talent.description)}`).join(""))
      + section("Loadout cards", (data.loadouts || data.cards || []).map(card => `<h3>${escapePublicHtml(card.name)}</h3>`
        + paragraph("description" in card ? card.description : (card.values || []).join(" / "))).join(""))
      + paragraph("") + link("/champions", "All Paladins champions");
    return document(seo["seo.champions.detail.title"].replace("{name}", champion.name), description, body, champion.name);
  }
  if (path === "/champions") {
    const body = paragraph(seo["seo.champions.description"]) + list(STATIC_CHAMPIONS.map(entry =>
      link(`/champions/${championSlug(entry.name)}`, entry.name) + ` — ${escapePublicHtml(entry.roles.join(" / "))}`));
    return document(seo["seo.champions.title"], seo["seo.champions.description"], body, "Paladins Champions");
  }
  if (path === "/blog" || path.startsWith("/blog/") || path === "/") {
    const posts = await getAllPosts({ throwOnError: true });
    if (path.startsWith("/blog/")) {
      const post = posts.find(entry => getPostLink(entry.slug) === path);
      if (!post) return null;
      return document(post.title, post.excerpt, '<div class="text-sm text-pc-text-muted mb-8"><span>'
        + escapePublicHtml(post.author) + '</span> · <span>' + escapePublicHtml(post.date) + '</span></div>'
        + '<div class="blog-markdown">' + markdown(post.content, post.sourcePath) + '</div>'
        + link("/blog", "All PaladinsCat articles"));
    }
    const articles = posts.map(post => '<article data-blog-category="' + escapePublicHtml(post.category) + '"><div><span>'
      + escapePublicHtml(post.author) + '</span> · <span>' + escapePublicHtml(post.date) + '</span></div><h2>'
      + link(getPostLink(post.slug), post.title) + '</h2>' + paragraph(post.excerpt) + '</article>').join("");
    if (path === "/blog") return document("PaladinsCat Blog", "PaladinsCat guides, research, news, and updates.", articles, "Blog");
    return document(seo["seo.home.hub.title"], seo["seo.home.hub.description"], paragraph(seo["seo.home.hub.description"])
      + `<nav aria-label="Public PaladinsCat pages">${list([["/champions", "Champions"], ["/matches", "Recent matches"], ["/blog", "Guides and research"], ["/features", "New features"], ["/about", "About PaladinsCat"]].map(([href, title]) => link(href, title)))}</nav>`
      + articles);
  }
  if (path === "/features") {
    const feed = await getFeatureDocument();
    if (!feed) throw new Error("Feature document unavailable");
    const introduction = homeCopy["home.newFeaturesIntro"];
    const description = feed.entries[0]?.summary || introduction;
    const entries = feed.entries.map(entry => `<article><h2>${entry.href ? link(entry.href, entry.title) : escapePublicHtml(entry.title)}</h2>`
      + paragraph(entry.summary) + paragraph(`${entry.kind} · ${entry.category} · ${entry.status}`) + "</article>").join("");
    return { ...document(homeCopy["home.newFeatures"], description, paragraph(introduction)
      + (entries || paragraph(featureCopy["features.empty"]))), data: { features: feed } };
  }
  if (path === "/matches") {
    const feed = await matchOverview();
    if (!Array.isArray(feed.recent)) throw new Error("Match overview unavailable");
    return document(seo["seo.matches.title"], seo["seo.matches.description"], paragraph(seo["seo.matches.description"])
      + list(feed.recent.slice(0, 20).map(match => link(`/matches/${encodeURIComponent(String(match.match_id))}`, `Match ${match.match_id}`)
        + ` — ${escapePublicHtml(match.map)} · ${escapePublicHtml(match.region)} · ${escapePublicHtml(match.entry_datetime)}`)), "Recent Paladins Matches");
  }
  if (path === "/changelog") {
    const feed = await releaseHistory();
    if (!Array.isArray(feed.data)) throw new Error("Release history unavailable");
    return document("PaladinsCat Changelog", "PaladinsCat release history and published changes.", feed.data.map(release =>
      `<article><h2>${escapePublicHtml(release.component)} ${escapePublicHtml(release.componentVersion || release.version)}</h2>`
      + paragraph(release.deployedAt) + markdown(release.changelog.replace(/\\n/g, "\n")) + "</article>").join(""));
  }
  const titles: Record<string, string> = { "/about": "About PaladinsCat", "/contact": "Contact PaladinsCat", "/privacy": "Privacy Policy", "/terms": "Terms of Use", "/localization": "Translate PaladinsCat" };
  if (Object.hasOwn(titles, path)) {
    const source = staticSourcePages()[path];
    if (!source?.html.includes("<h1")) throw new Error("Public page content unavailable");
    const paragraphs = [...source.html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gs)].map(match => plainText(match[1]));
    return { title: [titles[path], SITE_NAME].join(" | "), description: paragraphs.find(text => text.length >= 60) || titles[path],
      html: `<div class="footer-pro-source">${source.html.replace(/^<main\b[^>]*>|<\/main>$/g, "")}</div>` };
  }
  return null;
}
