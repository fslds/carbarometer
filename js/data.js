// Data loading and derived metrics.
//
// Index = 100 × model defect rate / class average for the same age class (lower is better; 100 = average).
// Overall score = unweighted mean of the index over the age classes a model has data for.
// Per model only the top-10 rubrics are published: a rubric outside the top 10 is known only to be
// at most the 10th value ("≤ x"), never zero.

let DB = null;

export async function loadData() {
  if (DB) return DB;
  // Embedded data (data/barometer.js) works from file://; fall back to fetching the JSON.
  const raw = window.CB_DATA || (await (await fetch("data/barometer.json")).json());
  const classAvg = {};
  for (const [age, [rate, km, rub]] of Object.entries(raw.classAvg)) classAvg[age] = { rate, km, rub };

  const models = raw.models.map((m) => {
    const ages = {};
    for (const [age, [rate, km, rub]] of Object.entries(m.a)) {
      const c = classAvg[age];
      const vals = Object.values(rub);
      ages[age] = {
        rate, km, rub,
        floor: vals.length >= 10 ? Math.min(...vals) : 0, // upper bound for rubrics outside the top 10
        idx: (100 * rate) / c.rate,
        kmIdx: km && c.km ? (100 * km) / c.km : null,
      };
    }
    return {
      slug: m.s, brand: m.b, model: m.m, name: `${m.b} ${m.m}`,
      seg: m.seg, body: m.body, pt: m.pt || "ice", ages,
    };
  });

  const rubricCodes = Object.keys(raw.rubricsNl);
  DB = {
    meta: raw.meta,
    ages: raw.ages,
    classAvg,
    rubricCodes,
    rubricsNl: raw.rubricsNl,
    rubricGroups: [...new Set(rubricCodes.map(groupOf))],
    models,
    bySlug: Object.fromEntries(models.map((m) => [m.slug, m])),
    brands: [...new Set(models.map((m) => m.brand))].sort((a, b) => a.localeCompare(b)),
    segments: ["A", "B", "C", "D", "E", "F"],
    bodies: ["hatch", "sedan", "estate", "suv", "mpv", "van", "sports"],
    powertrains: ["ice", "hybrid", "ev"],
  };
  return DB;
}

export const db = () => DB;

export function groupOf(code) {
  return code.split(".")[0];
}

/** Mean index over the requested ages (all when empty). */
export function score(m, ages) {
  const keys = (ages && ages.length ? ages : Object.keys(m.ages)).filter((a) => m.ages[a]);
  if (!keys.length) return { score: null, n: 0 };
  const s = keys.reduce((acc, a) => acc + m.ages[a].idx, 0) / keys.length;
  return { score: s, n: keys.length };
}

/** Mean defect rate over the requested ages (only meaningful within one age class). */
export function meanRate(m, ages) {
  const keys = (ages && ages.length ? ages : Object.keys(m.ages)).filter((a) => m.ages[a]);
  if (!keys.length) return null;
  return keys.reduce((acc, a) => acc + m.ages[a].rate, 0) / keys.length;
}

/** Rubric value for a model: {v, bound} (bound = not in top 10, v is an upper bound) or null. */
export function rubricValue(m, age, code) {
  const a = m.ages[age];
  if (!a) return null;
  if (code in a.rub) return { v: a.rub[code], bound: false };
  return { v: a.floor, bound: true };
}

export const groupCodes = (g) => DB.rubricCodes.filter((c) => groupOf(c) === g);

/** Class value of a category: sum of its rubrics' class averages (null if none published). */
export function classGroup(age, g) {
  const vals = groupCodes(g).map((c) => DB.classAvg[age].rub[c]).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

/**
 * Category value for a model: sum of its rubrics (defects per 100 inspections).
 * Rubrics outside the model's top 10 are unknown but at most its 10th value; they are estimated at
 * min(10th value, class average). Returns {v, lo, hi, approx} or null.
 */
export function groupValue(m, age, g) {
  const a = m.ages[age];
  if (!a) return null;
  let lo = 0, est = 0, hi = 0, any = false;
  for (const c of groupCodes(g)) {
    const ca = DB.classAvg[age].rub[c];
    if (c in a.rub) { lo += a.rub[c]; est += a.rub[c]; hi += a.rub[c]; any = true; }
    else if (ca != null) { est += Math.min(a.floor, ca); hi += a.floor; any = true; }
  }
  return any ? { v: est, lo, hi, bound: false, approx: hi > lo } : null;
}

/** A rubric code ("4.1") or a category ("g:4"), with uniform accessors. */
export function measure(code) {
  if (code.startsWith("g:")) {
    const g = code.slice(2);
    return { code, kind: "group", group: g, value: (m, a) => groupValue(m, a, g), cls: (a) => classGroup(a, g) };
  }
  return { code, kind: "rubric", group: groupOf(code), value: (m, a) => rubricValue(m, a, code), cls: (a) => DB.classAvg[a].rub[code] };
}

export const isMeasure = (code) =>
  !!code && (code.startsWith("g:") ? DB.rubricGroups.includes(code.slice(2)) : DB.rubricCodes.includes(code));

/** Rank of a model's overall score among a set (1 = best). */
export function rankAmong(m, set, ages) {
  const mine = score(m, ages).score;
  if (mine == null) return null;
  const scored = set.map((x) => score(x, ages).score).filter((s) => s != null);
  return { rank: scored.filter((s) => s < mine).length + 1, of: scored.length };
}

/** Models matching the common filter params (brand/seg/body/pt/q). */
export function filterModels(models, p) {
  const q = (p.q || "").trim().toLowerCase();
  return models.filter((m) =>
    (!p.brand.length || p.brand.includes(m.brand)) &&
    (!p.seg.length || p.seg.includes(m.seg)) &&
    (!p.body.length || p.body.includes(m.body)) &&
    (!p.pt.length || p.pt.includes(m.pt)) &&
    (!q || m.name.toLowerCase().includes(q)));
}
