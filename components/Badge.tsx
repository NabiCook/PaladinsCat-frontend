/**
 * Badge component — reusable status/role badges (verified/supporter/ranked/mode).
 *
 * Owns the `Badge` React component plus its `BadgeVariant` type and `BadgeProps`
 * interface. Renders a pill-shaped status badge with an icon; no data fetch.
 *
 * refs: none
 */
import { BadgeCheck, Star, Trophy } from "lucide-react";

/**
 * Badge component — reusable status/role badges Pattern source: Paladins.guru (Verified/Supporter badges on user content) Variants: - verified: green accent, checkmark icon, for verified players
 * - supporter: gold accent, star icon, for supporting members
 * - ranked: teal accent, trophy icon, for ranked matches/content
 * - mode: neutral, for match mode labels (Ranked/Unranked)
 * - default: inherits from parent, no icon
 * Usage: <Badge variant="verified">{t("generated.badge.verified")}</Badge>
 * refs: none
 */

/**
 * Define badge variant as `"verified" | "supporter" | "ranked" | "mode" | "default"`.
 * refs: none
 */
export type BadgeVariant = "verified" | "supporter" | "ranked" | "mode" | "default";

/**
 * Describe badge props with variant (optional), children, className (optional).
 * refs: none
 */
export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

// Color map for badge variants — each has distinct bg + text color
// verified: green (trust), supporter: gold (premium), ranked: teal (brand), mode: neutral
const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  verified: {
    bg: "rgba(34, 197, 94, 0.1)",
    text: "oklch(0.720 0.060 145)", /* green-500 equivalent */
    border: "rgba(34, 197, 94, 0.2)",
  },
  supporter: {
    bg: "rgba(234, 179, 8, 0.1)",
    text: "oklch(0.770 0.120 75)", /* amber-400 equivalent */
    border: "rgba(234, 179, 8, 0.2)",
  },
  ranked: {
    bg: "color-mix(in srgb, var(--pc-accent) 10%, transparent)",
    text: "var(--pc-accent)",
    border: "color-mix(in srgb, var(--pc-accent) 20%, transparent)",
  },
  mode: {
    bg: "var(--pc-bg)",
    text: "var(--pc-text-muted)",
    border: "var(--pc-border)",
  },
  default: {
    bg: "var(--pc-bg)",
    text: "var(--pc-accent)",
    border: "var(--pc-border)",
  },
};

// Status badges use the same Lucide geometry as the rest of the interface.
const CheckIcon = () => (
  <BadgeCheck aria-hidden="true" size={10} className="mr-1 shrink-0" />
);

const StarIcon = () => (
  <Star aria-hidden="true" size={10} className="mr-1 shrink-0" />
);

const TrophyIcon = () => (
  <Trophy aria-hidden="true" size={10} className="mr-1 shrink-0" />
);

const iconMap: Record<string, React.ReactNode> = {
  verified: <CheckIcon />,
  supporter: <StarIcon />,
  ranked: <TrophyIcon />,
};

/**
 * Render badge.
 * refs: none
 * I/O types: `{ variant = "default", children, className = "" }: BadgeProps -> JSX.Element`.
 */
export default function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  const style = variantStyles[variant];
  const icon = iconMap[variant];

  return (
    // Badge: pill shape, inline-flex, small text, distinct bg/border per variant
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}
