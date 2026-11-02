// Browser-safe active-entry rule from lib/feature-feed.ts. Parsing stays on the preview server.
// Source SHA256: c20f816399b817c8c8c78180588333b25cb7c5a885bc11606339adfdfb5d82cc
export function activeNewFeatures(entries, now = new Date()) {
    const nowMs = now.getTime();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    return entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
        const published = Date.parse(entry.publishedAt);
        return published <= nowMs && nowMs < published + windowMs;
    })
        .sort((left, right) => {
        const dateOrder = Date.parse(right.entry.publishedAt) - Date.parse(left.entry.publishedAt);
        return (Number.isFinite(dateOrder) && dateOrder !== 0) ? dateOrder : left.index - right.index;
    })
        .map(({ entry }) => entry);
}
