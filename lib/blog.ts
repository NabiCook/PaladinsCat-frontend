/**
 * Defines blog's shared contracts and runtime helpers.
 * Keep behavior aligned with its callers and browser/server boundary.
 * refs: none
 */
import matter from "gray-matter";
import { unstable_cache } from "next/cache";

const GITHUB_REPO = process.env.BLOG_GITHUB_REPO || "NabiCook/PaladinsCat";
const BLOG_GITHUB_PATH = (process.env.BLOG_GITHUB_PATH || "docs/blog").replace(/^\/+|\/+$/g, "");
const BLOG_GITHUB_REF = process.env.BLOG_GITHUB_REF || "main";
const GITHUB_API_BASE = "https://api.github.com/repos";
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${BLOG_GITHUB_REF}/${BLOG_GITHUB_PATH}`;
const BLOG_FETCH_TIMEOUT_MS = 10_000;

/**
 * Defines the  b l o g_ c a t e g o r i e s contract used by this module.
 * refs: none
 */
export const BLOG_CATEGORIES = ["public-release", "q-and-a", "guide", "operational-report"] as const;
/**
 * Defines the  blog category contract used by this module.
 * refs: none
 */
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

/**
 * Narrow a string to BlogCategory only when it occurs in BLOG_CATEGORIES.
 * refs: none
 * I/O types: `value: string | undefined -> value is BlogCategory`.
 */
export function isBlogCategory(value: string | undefined): value is BlogCategory {
  return BLOG_CATEGORIES.includes(value as BlogCategory);
}

/**
 * Defines the  blog post contract used by this module.
 * refs: none
 */
export interface BlogPost {
  slug: string;
  sourcePath: string;
  category: BlogCategory;
  title: string;
  date: string;
  publishedAt: string;
  author: string;
  excerpt: string;
  content: string;
  rawContent: string;
  coverImage?: string;
}

function deriveMetadata(content: string): { title: string; date: string; excerpt: string } {
  const visibleContent = content.replace(/<!--[\s\S]*?-->/g, "").trim();
  const titleMatch = visibleContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/[🔴🟠🟡🟢🔵🟣💡⚠️❗❓]/g, "").trim() : "Untitled Post";

  const dateMatch = visibleContent.match(/\*\*Published:\*\*\s*(.+?)\s*(?:\s*&nbsp;|\s*\||\s*$)/m);
  const date = dateMatch ? dateMatch[1].trim() : "N/A";

  const lines = visibleContent.split(/\r?\n/);
  let excerpt = "";
  let codeFence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const fence = line.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (!codeFence) codeFence = fence[1];
      else if (fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length) codeFence = null;
      continue;
    }
    if (codeFence || !line) continue;
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      do {
        quoteLines.push(lines[index].trim().replace(/^>\s*/, ""));
        index += 1;
      } while (index < lines.length && lines[index].trim().startsWith(">"));
      index -= 1;
      const quote = quoteLines.join(" ").replace(/\s+/g, " ").trim();
      if (quote && !quote.startsWith("[!")) {
        excerpt = quote.replace(/\*\*/g, "");
        break;
      }
      continue;
    }
    if (line.startsWith("#") || line.startsWith("|") || line.startsWith("---")) continue;
    if (/^\*\*Published:\*\*/i.test(line)) continue;
    const paragraphLines = [line];
    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1].trim();
      if (!nextLine || /^(?:[#>|]|-{3,}|`{3,}|~{3,})/.test(nextLine)) break;
      paragraphLines.push(nextLine);
      index += 1;
    }
    excerpt = paragraphLines.join(" ").replace(/\*\*/g, "").trim();
    break;
  }
  return { title, date, excerpt };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function sourcePathRelativeToRoot(sourcePath: string): string | null {
  const prefix = `${BLOG_GITHUB_PATH}/`;
  return sourcePath.startsWith(prefix) ? sourcePath.slice(prefix.length) : null;
}

function sourcePathToSlug(sourcePath: string): string | null {
  const sourceRelativePath = sourcePathRelativeToRoot(sourcePath);
  if (!sourceRelativePath || !sourceRelativePath.toLowerCase().endsWith(".md")) return null;
  const relativePath = sourceRelativePath.slice(0, -3);
  const segments = relativePath.split("/");
  if (isBlogCategory(segments[0])) segments.shift();
  return segments.length > 0 ? segments.join("/") : null;
}

function sourcePathToCategory(sourcePath: string): BlogCategory {
  const prefix = `${BLOG_GITHUB_PATH}/`;
  const firstSegment = sourcePath.startsWith(prefix)
    ? sourcePath.slice(prefix.length).split("/", 1)[0]
    : undefined;
  return isBlogCategory(firstSegment) ? firstSegment : "public-release";
}

function normalizeSlug(slug: string): string | null {
  const normalized = slug.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (!normalized || segments.some(segment => !segment || segment === "." || segment === ".." || segment.includes("\0"))) {
    return null;
  }
  return segments.join("/");
}

function parsePost(sourcePath: string, rawContent: string): BlogPost | null {
  const slug = sourcePathToSlug(sourcePath);
  if (!slug) return null;
  const { data, content } = matter(rawContent);

  const { title, date, excerpt } = deriveMetadata(content);
  const renderedContent = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*#\s+.+(?:\r?\n)+/, "")
    .trim();
  const metadataDate = (data as any).publishedAt ?? (data as any).date;
  const publishedAt = metadataDate instanceof Date
    ? metadataDate.toISOString()
    : typeof metadataDate === "string" && metadataDate.trim()
      ? metadataDate.trim()
      : date;

  return {
    slug,
    sourcePath,
    category: sourcePathToCategory(sourcePath),
    title: (data as any).title ?? title,
    date: (data as any).date ?? date,
    publishedAt,
    author: (data as any).author ?? "PaladinsCat Team",
    excerpt: (data as any).excerpt ?? excerpt,
    content: renderedContent,
    rawContent: rawContent,
    coverImage: (data as any).coverImage ?? undefined,
  };
}

type GitHubTreeEntry = {
  path?: string;
  type?: string;
};

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "PaladinsCat-Blog",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function discoverMarkdownFilesUncached(): Promise<string[]> {
  const treeUrl = `${GITHUB_API_BASE}/${GITHUB_REPO}/git/trees/${encodeURIComponent(BLOG_GITHUB_REF)}?recursive=1`;
  const response = await fetch(treeUrl, {
    headers: githubHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${response.statusText}`);

  const result = await response.json() as { tree?: GitHubTreeEntry[]; truncated?: boolean };
  if (!Array.isArray(result.tree)) throw new Error("GitHub blog tree was not an array");
  if (result.truncated) throw new Error("GitHub repository tree was truncated");

  const prefix = `${BLOG_GITHUB_PATH}/`;
  return result.tree
    .filter((entry): entry is Required<GitHubTreeEntry> => (
      entry.type === "blob"
      && typeof entry.path === "string"
      && entry.path.startsWith(prefix)
      && entry.path.toLowerCase().endsWith(".md")
    ))
    .map(entry => entry.path);
}

// Blog content is public and changes only when the source repository changes.
// Keep the GitHub tree lookup out of the request path after the first read;
// this also prevents every post page from repeating the same API call.
const discoverMarkdownFiles = unstable_cache(
  discoverMarkdownFilesUncached,
  ["blog-markdown-tree-v1"],
  { revalidate: 300, tags: ["blog"] },
);

async function fetchPostFromGitHub(sourcePath: string): Promise<BlogPost | null> {
  const prefix = `${BLOG_GITHUB_PATH}/`;
  if (!sourcePath.startsWith(prefix)) return null;
  const relativePath = sourcePath.slice(prefix.length);
  const response = await fetch(`${GITHUB_RAW_BASE}/${encodePath(relativePath)}`, {
    headers: { "User-Agent": "PaladinsCat-Blog" },
    cache: "no-store",
    signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub article ${response.status}: ${response.statusText}`);
  return parsePost(sourcePath, await response.text());
}

async function fetchPostsFromGitHub(): Promise<BlogPost[]> {
  const sourcePaths = await discoverMarkdownFiles();
  const posts = await Promise.all(sourcePaths.map(fetchPostFromGitHub));
  const validPosts = posts.filter((post): post is BlogPost => post !== null);

  const seen = new Set<string>();
  for (const post of validPosts) {
    if (seen.has(post.slug)) {
      throw new Error(`Duplicate GitHub blog slug: ${post.slug}`);
    }
    seen.add(post.slug);
  }
  return validPosts;
}

function dateValue(d: string): number {
  const t = Date.parse(d);
  return isNaN(t) ? 0 : t;
}

const getCachedPosts = unstable_cache(
  fetchPostsFromGitHub,
  ["blog-posts-v3"],
  { revalidate: 300, tags: ["blog"] },
);

let postsInFlight: Promise<BlogPost[]> | null = null;

async function loadCachedPosts(): Promise<BlogPost[]> {
  if (postsInFlight) return postsInFlight;

  const request = getCachedPosts();
  postsInFlight = request;
  try {
    return await request;
  } finally {
    if (postsInFlight === request) postsInFlight = null;
  }
}

/**
 * Load cached posts sorted newest first. Existing callers retain the empty-state
 * fallback; indexing callers can reject an outage instead of publishing removals.
 * refs: none
 * I/O types: `{ throwOnError?: boolean } -> Promise<BlogPost[]>`.
 */
export async function getAllPosts({ throwOnError = false }: { throwOnError?: boolean } = {}): Promise<BlogPost[]> {
  try {
    const posts = await loadCachedPosts();
    return [...posts].sort((a, b) => {
      const newestFirst = dateValue(b.publishedAt) - dateValue(a.publishedAt);
      return newestFirst || a.slug.localeCompare(b.slug);
    });
  } catch (error) {
    if (throwOnError) throw error;
    // A GitHub outage or rate limit must not turn /blog into a server error.
    console.error("[blog] unable to load GitHub posts", error);
    return [];
  }
}

/**
 * Normalize the requested slug and find it in cached blog posts. Return null for invalid or missing slugs; log loading failures and return null.
 * refs: none
 * I/O types: `slug: string -> Promise<BlogPost | null>`.
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;

  try {
    const posts = await loadCachedPosts();
    return posts.find((post) => post.slug === normalizedSlug) ?? null;
  } catch (error) {
    console.error(`[blog] unable to load post ${slug}`, error);
    return null;
  }
}

/**
 * Normalize and path-encode a post slug into /blog/<slug>, falling back to /blog when the slug is invalid.
 * refs: none
 * I/O types: `slug: string -> string`.
 */
export function getPostLink(slug: string): string {
  const normalizedSlug = normalizeSlug(slug);
  return normalizedSlug ? `/blog/${encodePath(normalizedSlug)}` : "/blog";
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

function resolveSourcePath(reference: string, currentSourcePath: string): string | null {
  try {
    const base = new URL(`https://repository.invalid/${encodePath(currentSourcePath)}`);
    const resolved = new URL(reference, base);
    return decodeURIComponent(resolved.pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
}

/**
 * Map any relative Markdown-document reference onto its matching public blog route. · refs: none
 * I/O types: `href: string | undefined; currentSourcePath: string -> string | undefined`.
 */
export function resolveBlogLink(href: string | undefined, currentSourcePath: string): string | undefined {
  if (!href || href.startsWith("#") || href.startsWith("/") || hasUrlScheme(href)) return href;
  const suffixIndex = href.search(/[?#]/);
  const reference = suffixIndex === -1 ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : href.slice(suffixIndex);
  if (!reference.toLowerCase().endsWith(".md")) return href;

  const sourcePath = resolveSourcePath(reference, currentSourcePath);
  const slug = sourcePath ? sourcePathToSlug(sourcePath) : null;
  return slug ? `${getPostLink(slug)}${suffix}` : href;
}

/**
 * Resolve repository-relative images against the public raw-content tree. · refs: none
 * I/O types: `src: string | undefined; currentSourcePath: string -> string | undefined`.
 */
export function resolveBlogAssetUrl(src: string | undefined, currentSourcePath: string): string | undefined {
  if (!src || src.startsWith("/") || src.startsWith("#") || hasUrlScheme(src)) return src;
  try {
    const relativeSourcePath = sourcePathRelativeToRoot(currentSourcePath);
    if (!relativeSourcePath) return src;
    return new URL(src, `${GITHUB_RAW_BASE}/${encodePath(relativeSourcePath)}`).toString();
  } catch {
    return src;
  }
}
