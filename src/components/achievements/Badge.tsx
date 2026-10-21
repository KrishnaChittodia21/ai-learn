import {
  Award,
  BadgeCheck,
  BookOpen,
  Calculator,
  CalendarCheck,
  CircleCheck,
  CodeXml,
  Coffee,
  Cpu,
  Database,
  Eraser,
  FlaskConical,
  Flame,
  Gem,
  GraduationCap,
  Hammer,
  Lock,
  MessageSquare,
  Mic,
  Moon,
  Network,
  Orbit,
  Rainbow,
  RefreshCw,
  Rocket,
  Sparkles,
  Sprout,
  Target,
  Terminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { EarnedTier } from '../../content/achievements';

/** glyph keys used by src/content/achievements.ts → lucide icons */
const ART: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  terminal: Terminal,
  zap: Zap,
  check: CircleCheck,
  book: BookOpen,
  cap: GraduationCap,
  stars: Orbit,
  'level-1': Sprout,
  'level-2': Database,
  'level-3': Cpu,
  rainbow: Rainbow,
  flask: FlaskConical,
  code: CodeXml,
  calculator: Calculator,
  message: MessageSquare,
  network: Network,
  target: Target,
  'badge-check': BadgeCheck,
  gem: Gem,
  mic: Mic,
  eraser: Eraser,
  refresh: RefreshCw,
  flame: Flame,
  calendar: CalendarCheck,
  moon: Moon,
  coffee: Coffee,
  rocket: Rocket,
  hammer: Hammer,
};

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface BadgeProps {
  art: string;
  tier?: EarnedTier;
  locked?: boolean;
  size?: BadgeSize;
  /** exposes the badge as an image with this name; otherwise it is decorative */
  label?: string;
  className?: string;
}

/**
 * Achievement medallion (achievements.css `.ach-orb`): a round glowing glass orb whose ring and glow
 * follow the tier: bronze = solar amber, silver = ion ice, gold = a shimmering aurora ring,
 * diamond = an iridescent conic ring that slowly spins, standard (single step) = nebula.
 * Locked = a dim etched dashed outline with a lock.
 */
export default function Badge({ art, tier = 'standard', locked = false, size = 'md', label, className = '' }: BadgeProps) {
  const Glyph = ART[art] ?? Award;
  const t = locked ? 'locked' : tier;
  return (
    <span className={`ach-orb ach-${t} ach-${size} ${className}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <span className="ach-orb-core">
        <Glyph strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="ach-orb-gloss" />
      {locked && size !== 'xs' && (
        <span className="ach-orb-lock">
          <Lock strokeWidth={2.2} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
