// Small achievement helpers shared by the badge components and the Achievements page
// (kept out of the component files so fast refresh stays happy).
import { TIER_LABEL, type AchievementEvaluation, type EarnedTier, type StoredAchievement } from '../../content/achievements';

/** what a tier pill says: the tier name, or "Earned" for a single-step badge */
export const tierName = (tier: EarnedTier) => TIER_LABEL[tier] || 'Earned';

/** earned · in progress (started, not yet earned) · locked (not started) */
export type CardState = 'earned' | 'prog' | 'locked';
export const cardState = (stored: StoredAchievement | undefined, ev: AchievementEvaluation): CardState =>
  stored?.tier ? 'earned' : ev.value > 0 ? 'prog' : 'locked';

/** a badge unit for a count: "1 section", "1 exam passed", "1 pass in a day"; adjective units ("right", "solved") stay as they are */
export function unitFor(unit: string, n: number) {
  if (n !== 1) return unit;
  const one = (w: string) => (/(ss|x)es$|passes$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w);
  // the plural noun is the first word ("exams passed") or, failing that, the last ("perfect exams")
  const words = unit.split(' ');
  const i = one(words[0]) !== words[0] ? 0 : words.length - 1;
  words[i] = one(words[i]);
  return words.join(' ');
}

/** "12 / 50 sections → Silver" (value clamped to the goal) */
export function meterText(ev: AchievementEvaluation, unit: string) {
  if (!ev.next) return '';
  const tier = TIER_LABEL[ev.next.tier];
  return `${Math.min(ev.value, ev.next.goal)} / ${ev.next.goal} ${unitFor(unit, ev.next.goal)}${tier ? ` → ${tier}` : ''}`;
}
