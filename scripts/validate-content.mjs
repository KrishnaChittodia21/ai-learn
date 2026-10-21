// Structural validator for topic content. Usage:
//   node scripts/validate-content.mjs            # all topics
//   node scripts/validate-content.mjs id1 id2    # selected topics
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/content/topics');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => !wanted.length || wanted.includes(f.replace(/\.ts$/, '')));

const { gradePrompt, DEFAULT_PASS_SCORE } = await import(pathToFileURL(join(root, 'src/lib/promptChecks.ts')).href);
const CHECK_KINDS = new Set(['has-system', 'delimits', 'includes', 'excludes', 'includes-all', 'examples', 'schema', 'no-input-in-system', 'max-words']);
const MIN = { sections: 2, cheatSheet: 8, codeChallenges: 2, interviewQuestions: 5, envelopeQuestions: 2, test: 12 };
const allIds = new Map();
let failures = 0;

for (const file of files) {
  const errs = [];
  let t;
  try {
    t = (await import(pathToFileURL(join(dir, file)).href)).default;
  } catch (e) {
    console.log(`✗ ${file}: failed to import — ${e.message}`);
    failures++;
    continue;
  }
  if (!t || typeof t !== 'object') errs.push('no default export');
  else {
    if (t.id + '.ts' !== file) errs.push(`id "${t.id}" does not match filename`);
    // behavioural topics have no estimation drills and no code-reading MCQs
    const behavioral = t.phase === 'behavioral';
    const min = behavioral ? { ...MIN, envelopeQuestions: 0 } : MIN;
    for (const [k, n] of Object.entries(min)) {
      if (!Array.isArray(t[k]) || t[k].length < n) errs.push(`${k}: ${t[k]?.length ?? 0} < ${n}`);
    }
    const ids = [
      ...(t.codeChallenges ?? []),
      ...(t.interviewQuestions ?? []),
      ...(t.envelopeQuestions ?? []),
      ...(t.test ?? []),
      ...(t.promptLabs ?? []),
    ].map((x) => x.id);
    for (const id of ids) {
      if (!id) errs.push('missing id');
      else if (allIds.has(id)) errs.push(`duplicate id ${id} (also in ${allIds.get(id)})`);
      else allIds.set(id, file);
    }
    let multi = 0;
    let withCode = 0;
    const qs = new Set();
    for (const q of t.test ?? []) {
      if (!Array.isArray(q.options) || q.options.length < 4) errs.push(`${q.id}: needs ≥4 options`);
      if (!Array.isArray(q.correct) || !q.correct.length) errs.push(`${q.id}: no correct answer`);
      for (const c of q.correct ?? []) if (c < 0 || c >= q.options.length) errs.push(`${q.id}: correct index ${c} out of range`);
      if (new Set(q.correct).size !== q.correct?.length) errs.push(`${q.id}: duplicate correct index`);
      if (q.correct?.length > 1) multi++;
      if (q.code) withCode++;
      if (!q.explanation || q.explanation.length < 80) errs.push(`${q.id}: explanation too short`);
      const norm = q.question.toLowerCase().replace(/\W+/g, ' ').trim();
      if (qs.has(norm)) errs.push(`${q.id}: duplicate question text`);
      qs.add(norm);
    }
    if (multi < 3) errs.push(`only ${multi} multi-select MCQs (need ≥3)`);
    if (!behavioral && withCode < 3) errs.push(`only ${withCode} MCQs with code (need ≥3)`);
    // GenAI app: every section is practice-first — example, pros/cons with fixes, a coding exercise and a quick check
    (t.sections ?? []).forEach((s, i) => {
      const where = `section ${i + 1} "${(s.heading ?? '').slice(0, 40)}"`;
      if (!s.example || s.example.length < 80) errs.push(`${where}: missing/short example`);
      if (!s.prosCons?.pros?.length || !s.prosCons?.cons?.length) errs.push(`${where}: missing prosCons`);
      for (const c of s.prosCons?.cons ?? []) if (!c.fix || c.fix.length < 15) errs.push(`${where}: con without a fix`);
      if (!s.exercise?.solution?.code || !s.exercise?.hints?.length || !s.exercise?.prompt) errs.push(`${where}: missing exercise`);
      const qc = s.quickCheck;
      if (!qc || !Array.isArray(qc.options) || qc.options.length < 3 || !(qc.correct >= 0 && qc.correct < qc.options.length) || !qc.explanation)
        errs.push(`${where}: missing/invalid quickCheck`);
      const words = (s.body ?? '').split(/\s+/).length;
      if (words > 450) errs.push(`${where}: body ${words} words (keep ≤ 450 — less reading, more practice)`);
    });
    for (const iq of t.interviewQuestions ?? []) {
      if (!iq.followUps?.length) errs.push(`${iq.id}: no follow-ups`);
      if (!iq.modelAnswer || iq.modelAnswer.length < 300) errs.push(`${iq.id}: model answer too short`);
    }
    for (const b of t.envelopeQuestions ?? []) {
      if (!b.steps?.length || !b.assumptions?.length) errs.push(`${b.id}: missing steps/assumptions`);
    }
    // prompt labs (optional): offline-graded checks must be well-formed, the starter must fail and the model answer must score 100
    if (t.promptLabs !== undefined && !Array.isArray(t.promptLabs)) errs.push('promptLabs must be an array');
    for (const lab of Array.isArray(t.promptLabs) ? t.promptLabs : []) {
      const w = lab.id ?? '(prompt lab without id)';
      for (const k of ['title', 'scenario', 'task']) if (!lab[k]?.trim?.()) errs.push(`${w}: missing ${k}`);
      if (typeof lab.starter?.user !== 'string') errs.push(`${w}: starter.user missing`);
      const checks = Array.isArray(lab.checks) ? lab.checks : [];
      if (checks.length < 3) errs.push(`${w}: ${checks.length} checks (need ≥3)`);
      for (const c of checks) {
        if (!CHECK_KINDS.has(c.kind)) errs.push(`${w}: unknown check kind "${c.kind}"`);
        if (!(Number.isFinite(c.weight) && c.weight > 0)) errs.push(`${w}: check "${c.label}" needs a positive weight`);
        if (!c.label?.trim() || !c.why?.trim()) errs.push(`${w}: every check needs a label and a why`);
        if ((c.kind === 'includes' || c.kind === 'excludes') && !c.anyOf?.length) errs.push(`${w}: ${c.kind} check "${c.label}" has no anyOf`);
        if (c.kind === 'includes-all' && (!Array.isArray(c.allOf) || c.allOf.length < 2 || c.allOf.some((g) => (Array.isArray(g) ? !g.length : !String(g ?? '').trim()))))
          errs.push(`${w}: includes-all check "${c.label}" needs ≥2 non-empty allOf entries`);
      }
      const sum = checks.reduce((a, c) => a + (Number(c.weight) || 0), 0);
      if (sum !== 100) errs.push(`${w}: check weights sum to ${sum} (must be 100)`);
      if ((lab.hints ?? []).length < 2) errs.push(`${w}: needs ≥2 hints`);
      if ((lab.followUps ?? []).filter((f) => f?.q?.trim() && f?.a?.trim().length >= 40).length < 2) errs.push(`${w}: needs ≥2 follow-ups with answers`);
      if (!lab.modelAnswer?.why || lab.modelAnswer.why.length < 80) errs.push(`${w}: modelAnswer.why missing/short (≥80 chars)`);
      const pass = lab.passScore ?? DEFAULT_PASS_SCORE;
      const starter = gradePrompt(lab, lab.starter).score;
      const model = gradePrompt(lab, lab.modelAnswer);
      if (starter >= pass) errs.push(`${w}: starter scores ${starter} (must be below the pass score ${pass})`);
      if (model.score !== 100)
        errs.push(`${w}: model answer scores ${model.score}, failing: ${model.results.filter((r) => !r.pass).map((r) => r.check.label).join('; ')}`);
    }
    // every item must carry interviewer follow-ups, so practice mimics a real interview
    const badFollowUps = (list, min) =>
      (list ?? []).filter((x) => (x.followUps ?? []).filter((f) => f?.q?.trim() && f?.a?.trim().length >= 40).length < min).map((x) => x.id);
    const missing = [
      ...badFollowUps(t.test, 1),
      ...badFollowUps(t.envelopeQuestions, 1),
      ...badFollowUps(t.codeChallenges, 1),
      ...badFollowUps(t.interviewQuestions, 2),
    ];
    if (missing.length) errs.push(`${missing.length} item(s) without enough follow-ups (MCQ/BoE/lab ≥1, interview ≥2): ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}`);
  }
  if (errs.length) {
    failures++;
    console.log(`✗ ${file}\n  - ${errs.join('\n  - ')}`);
  } else {
    console.log(`✓ ${file}  (${t.sections.length} sections, ${t.test.length} MCQs, ${t.interviewQuestions.length} IQs)`);
  }
}
// ---------- cross-topic uniqueness ----------
// Near-duplicate questions (token Jaccard ≥ 0.4) across the whole app. With --strict (or when
// specific topic ids are given) any pair involving the checked topics fails validation.
const { allQuestions, tokenSet, jaccard } = await import('./find-similar.mjs');
const strict = process.argv.includes('--strict') || wanted.length > 0;
const pool = (await allQuestions()).map((q) => ({ ...q, set: tokenSet(q.text) }));
const checked = new Set(files.map((f) => f.replace(/\.ts$/, '')));
const dupes = [];
for (let i = 0; i < pool.length; i++) {
  for (let j = i + 1; j < pool.length; j++) {
    const a = pool[i];
    const b = pool[j];
    if (!checked.has(a.topic) && !checked.has(b.topic)) continue;
    const sim = jaccard(a.set, b.set);
    if (sim >= 0.4) dupes.push({ sim, a, b });
  }
}
if (dupes.length) {
  console.log(`\n${strict ? '✗' : '⚠'} ${dupes.length} near-duplicate question pair(s):`);
  for (const d of dupes.sort((x, y) => y.sim - x.sim)) {
    console.log(`  ${d.sim.toFixed(2)}  ${d.a.id}  ⇄  ${d.b.id}`);
    console.log(`        ${d.a.text.replace(/\s+/g, ' ').slice(0, 110)}`);
    console.log(`        ${d.b.text.replace(/\s+/g, ' ').slice(0, 110)}`);
  }
  if (strict) failures++;
}

console.log(`\n${files.length - failures}/${files.length} topic files valid${dupes.length ? ' (see duplicates above)' : ''}`);
process.exit(failures ? 1 : 0);
