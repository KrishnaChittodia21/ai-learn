// Topic cheatsheets (C4): extra reference blocks for a topic's Cheat sheet tab, adapted from
// ai-engineering-from-scratch/cheatsheets (MIT, © 2026 Rohit Ghumare). One file per topic in
// src/content/cheatsheets/<topic-id>.ts, loaded with a dynamic import so none of it is in the startup chunk.

export type CheatBlock = { title: string; markdown: string };
export type TopicCheatsheet = {
  blocks: CheatBlock[];
  /** source cheatsheet file names, e.g. 'rag.md' */
  source: string[];
};

export const CHEAT_WORD_CAP = 350;

/** words a reader reads: tokens with a letter or digit, so table pipes and rules don't count */
export const cheatWords = (cs: TopicCheatsheet) =>
  cs.blocks
    .flatMap((b) => `${b.title} ${b.markdown}`.split(/\s+/))
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** integrity problems for one topic's cheatsheet; [] when it is fine */
export function checkCheatsheet(id: string, cs: TopicCheatsheet | undefined, topicIds: Set<string>): string[] {
  const errs: string[] = [];
  if (!topicIds.has(id)) errs.push(`"${id}" is not a topic id`);
  if (!cs || !Array.isArray(cs.blocks) || !cs.blocks.length) return [...errs, 'no blocks'];
  cs.blocks.forEach((b, i) => {
    if (!b?.title?.trim() || !b?.markdown?.trim()) errs.push(`block ${i + 1}: needs a title and markdown`);
    if (`${b?.title}${b?.markdown}`.includes('```')) errs.push(`block ${i + 1}: no fenced code blocks, use inline code`);
  });
  if (!Array.isArray(cs.source) || !cs.source.length || cs.source.some((s) => !/^[a-z0-9-]+\.md$/.test(s)))
    errs.push('source must list the source cheatsheet file names (*.md)');
  const words = cheatWords(cs);
  if (words > CHEAT_WORD_CAP) errs.push(`${words} words (keep ≤ ${CHEAT_WORD_CAP})`);
  return errs;
}
