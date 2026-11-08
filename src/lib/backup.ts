// Export / Import (M2): a versioned JSON backup of `Progress`. Import is a trust boundary: the file is parsed
// into fresh objects key by key (known keys only, typed, size-capped, prototype-pollution keys dropped) and
// nothing touches the current data until the learner picks Merge or Replace.
import { CERT_NAME_MAX, normalize, PLAN_LOG_MAX, SAVED_KINDS, SAVED_MAX, type DrillRecord, type McqRecord, type Progress, type PromptLabRecord, type SavedItem, type ShortRecord, type StepsRecord, type StudyPlan, type TestRecord } from './progress.ts';
import type { StoredAchievement } from '../content/achievements.ts';

export const BACKUP_APP = 'ai-learn';
export const BACKUP_VERSION = 1;
export const MAX_FILE_BYTES = 5_000_000;
const MAX_KEYS = 20_000;
const MAX_KEY_LEN = 200;
const MAX_TEXT = 50_000;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  progress: Progress;
}

export function exportBackup(p: Progress, now = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), progress: p };
}

export const backupFileName = (now = new Date()) => `ai-learn-backup-${now.toISOString().slice(0, 10)}.json`;

export interface BackupSummary {
  topicsPassed: number;
  sectionsRead: number;
  saved: number;
  labs: number;
  exportedAt: string;
}

export type ParseResult = { ok: true; progress: Progress; summary: BackupSummary } | { ok: false; error: string };

class Bad extends Error {}
const fail = (msg: string): never => {
  throw new Bad(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, path: string, max = MAX_TEXT): string => (typeof v === 'string' && v.length <= max ? v : fail(`${path} should be text`));
const num = (v: unknown, path: string, min = 0, max = 1e9): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(`${path} should be a number from ${min} to ${max}`);
const bool = (v: unknown, path: string): boolean => (typeof v === 'boolean' ? v : fail(`${path} should be true or false`));
const optStr = (v: unknown, path: string) => (v === undefined ? undefined : str(v, path, 64));
const oneOf = <T extends string>(v: unknown, opts: readonly T[], path: string): T => (opts.includes(v as T) ? (v as T) : fail(`${path} has an unknown value`));
const arr = (v: unknown, path: string, max: number): unknown[] => {
  if (!Array.isArray(v)) fail(`${path} should be a list`);
  const a = v as unknown[];
  return a.length <= max ? a : fail(`${path} has ${a.length} entries (at most ${max})`);
};

/** A string-keyed map with typed values; prototype-pollution keys are dropped, sizes capped. */
function record<V>(v: unknown, path: string, value: (x: unknown, at: string) => V): Record<string, V> {
  if (!isObj(v)) fail(`${path} should be an object`);
  const keys = Object.keys(v as object);
  if (keys.length > MAX_KEYS) fail(`${path} has too many entries`);
  const out: Record<string, V> = {};
  for (const k of keys) {
    if (BAD_KEYS.has(k)) continue;
    if (k.length > MAX_KEY_LEN) fail(`${path} has a key that is too long`);
    out[k] = value((v as Record<string, unknown>)[k], `${path}.${k}`);
  }
  return out;
}

/** Check that an object only has `allowed` keys (prototype-pollution keys are ignored). */
function known(v: Record<string, unknown>, allowed: string[], path: string) {
  for (const k of Object.keys(v)) if (!BAD_KEYS.has(k) && !allowed.includes(k)) fail(`${path} has an unknown field "${k.slice(0, 40)}"`);
}

const yes = (v: unknown, at: string) => (v === true ? (true as const) : fail(`${at} should be true`));

function testRecord(v: unknown, at: string): TestRecord {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['best', 'last', 'attempts', 'passedAt', 'history'], at);
  return {
    best: num(o.best, `${at}.best`, 0, 100),
    last: num(o.last, `${at}.last`, 0, 100),
    attempts: num(o.attempts, `${at}.attempts`, 0, 1e6),
    passedAt: optStr(o.passedAt, `${at}.passedAt`),
    history:
      o.history === undefined
        ? undefined
        : arr(o.history, `${at}.history`, 10).map((h, i) => {
            if (!isObj(h)) fail(`${at}.history[${i}] should be an object`);
            const r = h as Record<string, unknown>;
            return { at: str(r.at, `${at}.history[${i}].at`, 64), score: num(r.score, `${at}.history[${i}].score`, 0, 100) };
          }),
  };
}

function mcqRecord(v: unknown, at: string): McqRecord {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['seen', 'wrong', 'lastCorrect', 'lastAt'], at);
  return { seen: num(o.seen, `${at}.seen`, 0, 1e6), wrong: num(o.wrong, `${at}.wrong`, 0, 1e6), lastCorrect: bool(o.lastCorrect, `${at}.lastCorrect`), lastAt: str(o.lastAt, `${at}.lastAt`, 64) };
}

function labRecord(v: unknown, at: string): PromptLabRecord {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['system', 'user', 'best', 'solvedAt', 'revealedAt'], at);
  return {
    system: str(o.system, `${at}.system`),
    user: str(o.user, `${at}.user`),
    best: num(o.best, `${at}.best`, 0, 100),
    solvedAt: optStr(o.solvedAt, `${at}.solvedAt`),
    revealedAt: optStr(o.revealedAt, `${at}.revealedAt`),
  };
}

const TIERS = ['standard', 'bronze', 'silver', 'gold', 'diamond'] as const;
function achievement(v: unknown, at: string): StoredAchievement {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['tier', 'earnedAt', 'tiers'], at);
  return {
    tier: oneOf(o.tier, TIERS, `${at}.tier`),
    earnedAt: num(o.earnedAt, `${at}.earnedAt`, 0, 1e15),
    tiers: o.tiers === undefined ? undefined : record(o.tiers, `${at}.tiers`, (x, p) => num(x, p, 0, 1e15)),
  };
}

function savedItem(v: unknown, at: string): SavedItem {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['kind', 'ref', 'topicId', 'addedAt', 'doneAt'], at);
  const item: SavedItem = { kind: oneOf(o.kind, SAVED_KINDS, `${at}.kind`), ref: str(o.ref, `${at}.ref`, MAX_KEY_LEN), topicId: str(o.topicId, `${at}.topicId`, MAX_KEY_LEN), addedAt: str(o.addedAt, `${at}.addedAt`, 64) };
  if (o.doneAt !== undefined) item.doneAt = str(o.doneAt, `${at}.doneAt`, 64);
  return item;
}

function shortRecord(v: unknown, at: string): ShortRecord {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['watchedAt', 'answeredAt', 'firstTry'], at);
  const r: ShortRecord = {};
  if (o.watchedAt !== undefined) r.watchedAt = str(o.watchedAt, `${at}.watchedAt`, 64);
  if (o.answeredAt !== undefined) r.answeredAt = str(o.answeredAt, `${at}.answeredAt`, 64);
  if (o.firstTry !== undefined) r.firstTry = bool(o.firstTry, `${at}.firstTry`);
  return r;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown, at: string) => (DAY_RE.test(str(v, at, 10)) ? (v as string) : fail(`${at} should be a date`));

function studyPlan(v: unknown): StudyPlan {
  if (!isObj(v)) fail('studyPlan should be an object');
  const o = v as Record<string, unknown>;
  known(o, ['dailyMinutes', 'daysPerWeek', 'goal', 'startedAt', 'baselineAt', 'baselineCovered', 'catchUp', 'warningsOff', 'log'], 'studyPlan');
  const plan: StudyPlan = {
    dailyMinutes: num(o.dailyMinutes, 'studyPlan.dailyMinutes', 5, 600),
    daysPerWeek: num(o.daysPerWeek, 'studyPlan.daysPerWeek', 1, 7),
    goal: str(o.goal, 'studyPlan.goal', MAX_KEY_LEN),
    startedAt: day(o.startedAt, 'studyPlan.startedAt'),
    baselineAt: day(o.baselineAt, 'studyPlan.baselineAt'),
    baselineCovered: num(o.baselineCovered, 'studyPlan.baselineCovered', 0, 1e7),
  };
  if (o.catchUp !== undefined) {
    if (!isObj(o.catchUp)) fail('studyPlan.catchUp should be an object');
    const c = o.catchUp as Record<string, unknown>;
    known(c, ['extraMinutes', 'until'], 'studyPlan.catchUp');
    plan.catchUp = { extraMinutes: num(c.extraMinutes, 'studyPlan.catchUp.extraMinutes', 0, 600), until: day(c.until, 'studyPlan.catchUp.until') };
  }
  if (o.warningsOff !== undefined) plan.warningsOff = bool(o.warningsOff, 'studyPlan.warningsOff');
  if (o.log !== undefined) {
    const log = record(o.log, 'studyPlan.log', (x, at) => {
      const a = arr(x, at, 2);
      if (a.length !== 2) fail(`${at} should be [covered, expected]`);
      return [num(a[0], `${at}[0]`, 0, 1e7), num(a[1], `${at}[1]`, 0, 1e7)] as [number, number];
    });
    if (Object.keys(log).length > PLAN_LOG_MAX) fail(`studyPlan.log has more than ${PLAN_LOG_MAX} days`);
    for (const d of Object.keys(log)) day(d, `studyPlan.log.${d.slice(0, 20)}`);
    plan.log = log;
  }
  return plan;
}

function stepsRecord(v: unknown, at: string): StepsRecord {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['missed', 'at'], at);
  return { missed: num(o.missed, `${at}.missed`, 0, 100), at: str(o.at, `${at}.at`, 64) };
}

function drillRecord(v: unknown, at: string): DrillRecord {
  if (!isObj(v)) fail(`${at} should be an object`);
  const o = v as Record<string, unknown>;
  known(o, ['passedAt', 'revealedAt'], at);
  const r: DrillRecord = {};
  if (o.passedAt !== undefined) r.passedAt = str(o.passedAt, `${at}.passedAt`, 64);
  if (o.revealedAt !== undefined) r.revealedAt = str(o.revealedAt, `${at}.revealedAt`, 64);
  return r;
}

const SETTINGS_KEYS = ['passMark', 'secondsPerQuestion', 'shuffle', 'theme', 'mockMinutes', 'studyLock', 'accent'];
function settings(v: unknown): Partial<Progress['settings']> {
  if (!isObj(v)) fail('settings should be an object');
  const o = v as Record<string, unknown>;
  known(o, SETTINGS_KEYS, 'settings');
  const s: Partial<Progress['settings']> = {};
  if (o.passMark !== undefined) s.passMark = num(o.passMark, 'settings.passMark', 0, 100);
  if (o.secondsPerQuestion !== undefined) s.secondsPerQuestion = num(o.secondsPerQuestion, 'settings.secondsPerQuestion', 1, 3600);
  if (o.shuffle !== undefined) s.shuffle = bool(o.shuffle, 'settings.shuffle');
  if (o.theme !== undefined) s.theme = oneOf(o.theme, ['system', 'light', 'dark'] as const, 'settings.theme');
  if (o.mockMinutes !== undefined) s.mockMinutes = num(o.mockMinutes, 'settings.mockMinutes', 1, 600);
  if (o.studyLock !== undefined) s.studyLock = oneOf(o.studyLock, ['off', 'exam', 'exam-interview'] as const, 'settings.studyLock');
  if (o.accent !== undefined) s.accent = oneOf(o.accent, ['vermilion', 'pine', 'ink', 'plum'] as const, 'settings.accent');
  return s;
}

const PROGRESS_KEYS = ['tests', 'sections', 'iq', 'boe', 'cc', 'drafts', 'company', 'mcq', 'migrations', 'activityDays', 'achievements', 'promptLabs', 'saved', 'shorts', 'studyPlan', 'steps', 'rolePath', 'certName', 'drills', 'settings'];

/** Validate the `progress` object of a backup into a fresh, typed Partial<Progress>. */
function progressFrom(v: unknown): Partial<Progress> {
  if (!isObj(v)) fail('The file has no progress in it');
  const o = v as Record<string, unknown>;
  known(o, PROGRESS_KEYS, 'progress');
  const out: Partial<Progress> = {};
  if (o.tests !== undefined) out.tests = record(o.tests, 'tests', testRecord);
  if (o.sections !== undefined) out.sections = record(o.sections, 'sections', (x, at) => arr(x, at, 500).map((i, j) => num(i, `${at}[${j}]`, 0, 10_000)));
  if (o.iq !== undefined) out.iq = record(o.iq, 'iq', (x, at) => oneOf(x, ['nailed', 'partial', 'missed'] as const, at));
  if (o.boe !== undefined) out.boe = record(o.boe, 'boe', yes);
  if (o.cc !== undefined) out.cc = record(o.cc, 'cc', yes);
  if (o.company !== undefined) out.company = record(o.company, 'company', yes);
  if (o.drafts !== undefined) out.drafts = record(o.drafts, 'drafts', (x, at) => str(x, at));
  if (o.mcq !== undefined) out.mcq = record(o.mcq, 'mcq', mcqRecord);
  if (o.migrations !== undefined) out.migrations = arr(o.migrations, 'migrations', 100).map((x, i) => str(x, `migrations[${i}]`, 100));
  if (o.activityDays !== undefined)
    out.activityDays = arr(o.activityDays, 'activityDays', 120).map((x, i) => {
      const d = str(x, `activityDays[${i}]`, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fail(`activityDays[${i}] should be a date`);
    });
  if (o.achievements !== undefined) out.achievements = record(o.achievements, 'achievements', achievement);
  if (o.promptLabs !== undefined) out.promptLabs = record(o.promptLabs, 'promptLabs', labRecord);
  if (o.saved !== undefined) {
    const items = arr(o.saved, 'saved', SAVED_MAX).map((x, i) => savedItem(x, `saved[${i}]`));
    const seen = new Set<string>();
    out.saved = items.filter((s) => !seen.has(`${s.kind}|${s.ref}`) && !!seen.add(`${s.kind}|${s.ref}`));
  }
  if (o.shorts !== undefined) out.shorts = record(o.shorts, 'shorts', shortRecord);
  if (o.studyPlan !== undefined) out.studyPlan = studyPlan(o.studyPlan);
  if (o.steps !== undefined) out.steps = record(o.steps, 'steps', stepsRecord);
  if (o.drills !== undefined) out.drills = record(o.drills, 'drills', drillRecord);
  // a role id (unknown ids are ignored where it is read) and the certificate name (plain text, rendered as text)
  if (o.rolePath !== undefined) out.rolePath = /^[a-z0-9-]+$/.test(str(o.rolePath, 'rolePath', 64)) ? (o.rolePath as string) : fail('rolePath should be a path id');
  if (o.certName !== undefined) out.certName = str(o.certName, 'certName', CERT_NAME_MAX).trim();
  if (o.settings !== undefined) out.settings = settings(o.settings) as Progress['settings'];
  return out;
}

export function summarize(p: Progress, exportedAt = ''): BackupSummary {
  return {
    topicsPassed: Object.values(p.tests).filter((t) => t.passedAt).length,
    sectionsRead: Object.values(p.sections).reduce((n, s) => n + s.length, 0),
    saved: p.saved?.length ?? 0,
    labs: Object.keys(p.cc).length + Object.values(p.promptLabs ?? {}).filter((l) => l.solvedAt).length,
    exportedAt,
  };
}

/** Parse and validate a backup file's text. Never throws; never touches the current data. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) return { ok: false, error: 'This file is too large to be an ai-learn backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON. Pick the .json file that Export saved.' };
  }
  try {
    if (!isObj(raw)) fail('This file is not an ai-learn backup.');
    const o = raw as Record<string, unknown>;
    if (o.app !== BACKUP_APP) fail('This file is not an ai-learn backup (it is from another app or was edited).');
    if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1) fail('The backup has no valid version.');
    if ((o.version as number) > BACKUP_VERSION) fail('This backup is from a newer version of ai-learn. Update the app, then import it.');
    known(o, ['app', 'version', 'exportedAt', 'progress'], 'The file');
    const exportedAt = str(o.exportedAt, 'exportedAt', 64);
    const progress = normalize(progressFrom(o.progress));
    return { ok: true, progress, summary: summarize(progress, exportedAt) };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message.startsWith('This') || e.message.startsWith('The') ? e.message : `The backup is damaged: ${e.message}.` };
    return { ok: false, error: 'The backup could not be read.' };
  }
}

const union = <T>(a: T[] = [], b: T[] = []) => [...new Set([...a, ...b])];
const earliest = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : (a ?? b));

/**
 * Merge an imported record into the current one. Nothing learned is lost: read sections, done flags and days
 * are unions, scores keep the best, dates keep the earliest pass; where both sides hold a draft or a rating the
 * current device wins. Settings stay as they are on this device.
 */
export function mergeProgress(cur: Progress, inc: Progress): Progress {
  const tests: Progress['tests'] = { ...inc.tests };
  for (const [id, a] of Object.entries(cur.tests)) {
    const b = tests[id];
    if (!b) {
      tests[id] = a;
      continue;
    }
    const history = [...(a.history ?? []), ...(b.history ?? [])]
      .filter((h, i, all) => all.findIndex((x) => x.at === h.at) === i)
      .sort((x, y) => x.at.localeCompare(y.at))
      .slice(-10);
    const newer = (a.history?.at(-1)?.at ?? '') >= (b.history?.at(-1)?.at ?? '') ? a : b;
    tests[id] = { best: Math.max(a.best, b.best), last: newer.last, attempts: Math.max(a.attempts, b.attempts), passedAt: earliest(a.passedAt, b.passedAt), history: history.length ? history : undefined };
  }
  const sections: Progress['sections'] = { ...inc.sections };
  for (const [id, a] of Object.entries(cur.sections)) sections[id] = union(a, sections[id]).sort((x, y) => x - y);
  const mcq: Progress['mcq'] = { ...inc.mcq };
  for (const [id, a] of Object.entries(cur.mcq)) if (!mcq[id] || a.lastAt >= mcq[id].lastAt) mcq[id] = a;
  const promptLabs: NonNullable<Progress['promptLabs']> = { ...inc.promptLabs };
  for (const [id, a] of Object.entries(cur.promptLabs ?? {})) {
    const b = promptLabs[id];
    promptLabs[id] = b ? { ...a, best: Math.max(a.best, b.best), solvedAt: earliest(a.solvedAt, b.solvedAt), revealedAt: earliest(a.revealedAt, b.revealedAt) } : a;
  }
  const achievements: Record<string, StoredAchievement> = { ...inc.achievements };
  for (const [id, a] of Object.entries(cur.achievements ?? {})) {
    const b = achievements[id];
    achievements[id] = !b || TIERS.indexOf(a.tier) >= TIERS.indexOf(b.tier) ? a : b;
  }
  // shorts: watched / answered keep the earliest time; the first answer's firstTry goes with it
  const shorts: NonNullable<Progress['shorts']> = { ...inc.shorts };
  for (const [id, a] of Object.entries(cur.shorts ?? {})) {
    const b = shorts[id];
    if (!b) {
      shorts[id] = a;
      continue;
    }
    // '~' sorts after any ISO time, so a missing answer never wins
    const first = (a.answeredAt ?? '~') <= (b.answeredAt ?? '~') ? a : b;
    const watchedAt = earliest(a.watchedAt, b.watchedAt);
    shorts[id] = { ...(watchedAt && { watchedAt }), ...(first.answeredAt && { answeredAt: first.answeredAt, firstTry: first.firstTry }) };
  }
  // saved: current items first, then imported ones not already there; keep the newest SAVED_MAX, dropping done ones first
  const key = (s: SavedItem) => `${s.kind}|${s.ref}`;
  const have = new Set((cur.saved ?? []).map(key));
  let saved = [...(cur.saved ?? []), ...(inc.saved ?? []).filter((s) => !have.has(key(s)))].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  while (saved.length > SAVED_MAX) {
    const i = saved.findIndex((s) => s.doneAt);
    saved = saved.filter((_, j) => j !== (i >= 0 ? i : 0));
  }
  // the plan: this device's plan wins (its settings are current); the imported log fills days this device lacks
  const plan = cur.studyPlan ?? inc.studyPlan;
  const logDays = { ...inc.studyPlan?.log, ...cur.studyPlan?.log };
  const keep = Object.keys(logDays).sort().slice(-PLAN_LOG_MAX);
  const studyPlan = plan && (Object.keys(logDays).length ? { ...plan, log: Object.fromEntries(keep.map((d) => [d, logDays[d]])) } : plan);
  // steps: the latest run of each section
  const steps: NonNullable<Progress['steps']> = { ...inc.steps };
  for (const [k, a] of Object.entries(cur.steps ?? {})) if (!steps[k] || a.at >= steps[k].at) steps[k] = a;
  // drills: the earliest pass and the earliest reveal
  const drills: NonNullable<Progress['drills']> = { ...inc.drills };
  for (const [k, a] of Object.entries(cur.drills ?? {})) {
    const passedAt = earliest(a.passedAt, drills[k]?.passedAt);
    const revealedAt = earliest(a.revealedAt, drills[k]?.revealedAt);
    drills[k] = { ...(passedAt && { passedAt }), ...(revealedAt && { revealedAt }) };
  }
  return {
    ...cur,
    tests,
    sections,
    iq: { ...inc.iq, ...cur.iq },
    boe: { ...inc.boe, ...cur.boe },
    cc: { ...inc.cc, ...cur.cc },
    company: { ...inc.company, ...cur.company },
    drafts: { ...inc.drafts, ...cur.drafts },
    mcq,
    migrations: union(cur.migrations, inc.migrations),
    activityDays: union(cur.activityDays, inc.activityDays).sort().slice(-120),
    achievements: cur.achievements === undefined && inc.achievements === undefined ? undefined : achievements,
    promptLabs,
    saved,
    shorts: cur.shorts === undefined && inc.shorts === undefined ? undefined : shorts,
    ...(studyPlan && { studyPlan }),
    ...(cur.steps === undefined && inc.steps === undefined ? {} : { steps }),
    ...(cur.drills === undefined && inc.drills === undefined ? {} : { drills }),
    // the path being followed and the certificate name: this device wins, the import fills a gap
    ...(cur.rolePath || inc.rolePath ? { rolePath: cur.rolePath || inc.rolePath } : {}),
    ...(cur.certName || inc.certName ? { certName: cur.certName || inc.certName } : {}),
    settings: cur.settings,
  };
}

const DAY = 86_400_000;
export const BACKUP_NUDGE_DAYS = 14;

/**
 * The gentle "Export a backup" reminder: there is progress newer than the last export, the last export (or the
 * first study day) is 14+ days old, and it was not dismissed in the last 14 days.
 */
export function backupDue(p: Progress, lastExportAt: string | undefined, dismissedAt: string | undefined, now = new Date()): boolean {
  const days = p.activityDays ?? [];
  if (!days.length) return false;
  const since = lastExportAt ? Date.parse(lastExportAt) : Date.parse(`${days[0]}T00:00:00`);
  if (now.getTime() - since < BACKUP_NUDGE_DAYS * DAY) return false;
  if (lastExportAt && Date.parse(`${days[days.length - 1]}T23:59:59`) < since) return false;
  if (dismissedAt && now.getTime() - Date.parse(dismissedAt) < BACKUP_NUDGE_DAYS * DAY) return false;
  return true;
}
