// Generated from paladinscat-frontend-pro/lib/stat-quality.ts. Do not edit independently.
// Source SHA256: 5f308f541b9ed050e5d7aaf0d6e37667d4f5b0aeb42ec6afd5ea8e6b0d36a631
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
function hsl(h, s, l) {
    return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}
function colorForScore(score) {
    const clamped = clamp01(score);
    // Picker-band spectrum (2026-08-31): uniform S 65% / L 66% so every grade
    // renders in the dynamic-accent band; hue sweep (red -> orange -> green)
    // carries the grade semantics.
    if (clamped < 0.5) {
        const t = clamped / 0.5;
        return hsl(350 + 38 * t, 65, 66);
    }
    const t = (clamped - 0.5) / 0.5;
    return hsl(38 + 112 * t, 65, 66);
}
/**
 * Maps a bounded 0–100 percentage to the canonical red-orange-green spectrum.
 * Use low-is-good for rates where a larger percentage is worse, such as leave
 * rate. Signed or unbounded deltas must keep their directional colors instead.
 * refs: colors.md#bounded-percentage-spectrum
 * I/O types: `value: number | null | undefined; direction: "high-is-good" | "low-is-good" -> string`.
 */
export function getPercentageColor(value, direction = "high-is-good") {
    const normalized = clamp01(Number(value ?? 0) / 100);
    return colorForScore(direction === "low-is-good" ? 1 - normalized : normalized);
}
/**
 * Classifies stat confidence from win rate and pick-rate coverage.
 * refs: none
 * I/O types: `winRate: number | null | undefined; pickRate: number | null | undefined; maxPickRate: number -> StatQuality`.
 */
export function getStatQuality(winRate, pickRate, maxPickRate = 100) {
    const wr = Number(winRate ?? 0);
    const pr = Math.max(0, Number(pickRate ?? 0));
    const maxPr = Math.max(1, Number(maxPickRate || 100));
    const popularity = clamp01(pr / maxPr);
    // Win rate drives most of the quality score, while pick rate adds
    // confidence. This keeps heavily played winners green, rarely picked
    // underperformers red, and mixed cases in the amber/orange middle.
    const winScore = clamp01((wr - 42) / 16);
    const score = clamp01(winScore * 0.78 + Math.sqrt(popularity) * 0.22);
    const color = colorForScore(score);
    return {
        score,
        color,
        softColor: color.replace(")", " / 0.42)"),
        borderColor: color.replace(")", " / 0.34)"),
        background: `linear-gradient(135deg, ${color.replace(")", " / 0.18)")}, rgba(20, 22, 28, 0.34))`,
        track: `linear-gradient(90deg, ${color.replace(")", " / 0.95)")}, ${color.replace(")", " / 0.38)")})`,
        textClass: score >= 0.62 ? "text-emerald-400" : score <= 0.38 ? "text-rose-400" : score >= 0.52 ? "text-lime-300" : score <= 0.48 ? "text-orange-300" : "text-pc-text-secondary",
    };
}
