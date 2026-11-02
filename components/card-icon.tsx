/**
 * Card icon map — stable topic keys sharing Lucide geometry.
 *
 * Owns the `CardIcon` component and the `CardIconName` type. Maps topic keys to
 * Lucide icons and renders a decorative inline SVG. No data fetch.
 *
 * refs: none
 */
import {
  Activity, ArrowRight, Badge, Bot, BrickWall, Calculator, ChartColumn,
  ChartColumnIncreasing, ChartNoAxesColumnIncreasing, ChartNoAxesCombined,
  CircleHelp, Clock, Copy, Cross, Crown, Gauge, GraduationCap,
  Layers, LockKeyhole, MapPin, Medal, MessagesSquare, Newspaper,
  PanelsTopLeft, Rocket, Search, Shield, ShieldAlert, Skull, Sparkles,
  Sword, Swords, Target, TrendingUp, Unplug, UserRoundPlus, Users,
  UsersRound, VenetianMask, Waypoints, Zap, Trophy,
} from "lucide-react";

/** Stable topic keys share Lucide geometry with interface actions. */
const icons = {
  lock: LockKeyhole,
  "users-alt": UsersRound,
  "shield-exclamation": ShieldAlert,
  rocket: Rocket,
  "search-alt": Search,
  alien: VenetianMask,
  crown: Crown,
  ban: Unplug,
  clock: Clock,
  "block-brick": BrickWall,
  skull: Skull,
  shield: Shield,
  "heart-rate": Cross,
  target: Target,
  interrogation: CircleHelp,
  bolt: Zap,
  copy: Copy,
  "ranking-star": ChartNoAxesColumnIncreasing,
  badge: Badge,
  "chart-user": Gauge,
  "chart-line-up": ChartNoAxesCombined,
  "user-graduate": GraduationCap,
  stairs: TrendingUp,
  sparkles: Sparkles,
  users: Users,
  comments: MessagesSquare,
  sword: Sword,
  "chess-knight": Swords,
  "chart-histogram": ChartColumn,
  robot: Bot,
  trophy: Trophy,
  pulse: Activity,
  medal: Medal,
  layers: Layers,
  "map-marker": MapPin,
  calculator: Calculator,
  newspaper: Newspaper,
  "arrow-right": ArrowRight,
  loadouts: PanelsTopLeft,
  "champion-stats": ChartColumnIncreasing,
  friends: UserRoundPlus,
  relationships: Waypoints,
} as const;

/**
 * Topic icon key — union of the supported `icons` map keys.
 *
 * refs: none
 */
export type CardIconName = keyof typeof icons;

/**
 * Decorative inline SVG. Labels remain in the card text; color inherits its topic accent.
 * I/O: in `{ name: CardIconName, className?: string, size?: number }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function CardIcon({ name, className = "", size = 32 }: {
  name: CardIconName;
  className?: string;
  size?: number;
}) {
  const Icon = icons[name];
  return (
    <Icon aria-hidden="true" focusable="false" data-card-icon={name} size={size}
      className={`block shrink-0 ${className}`} />
  );
}
