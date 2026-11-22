// Compare: up to 8 models side by side across age classes and defect rubrics.
import { reader, update, go } from "../state.js";
import { score, rankAmong, rubricValue, groupValue, classGroup, groupOf } from "../data.js";
import { chart, tokens } from "../charts.js";
import { MAX_COMPARE } from "./ranking.js";
import { esc, t, fmt, pct, km, idxPill, heatCell, nameCell, segButtons, wireToggles, modelCombo, ageLabel, segName, rubricName, groupName, rubricCell, rangeTitle } from "../ui.js";

const PRESETS = [
  { key: "compact", m: ["volkswagen-golf", "ford-focus", "opel-astra", "peugeot-308", "renault-megane", "toyota-auris", "skoda-octavia"] },
  { key: "suvC", m: ["volkswagen-tiguan", "nissan-qashqai", "peugeot-3008", "kia-sportage", "hyundai-tucson", "toyota-c-hr", "volvo-xc40", "bmw-x1"] },
  { key: "small", m: ["volkswagen-polo", "renault-clio", "peugeot-208", "ford-fiesta", "toyota-yaris", "opel-corsa", "skoda-fabia"] },
  { key: "ev", m: ["tesla-model-3", "tesla-model-y", "volkswagen-id-3", "volkswagen-id-4", "polestar-2", "audi-e-tron", "bmw-ix3"] },
  { key: "premium", m: ["bmw-3-serie", "audi-a4", "mercedes-benz-c-klasse", "volvo-v60", "jaguar-xe", "alfa-romeo-giulia"] },
];

export function render(root, route, db) {
  const r = reader(route.params);
  const picks = r.list("m").filter((s) => db.bySlug[s]).slice(0, MAX_COMPARE);
  const models = picks.map((s) => db.bySlug[s]);
  const T = tokens();
  const color = (i) => T.series[i % 8];
  const yMode = r.str("y", "rate");

  // Default rubric age: the class most selected models have data for (youngest on ties).
  const counts = db.ages.map((a) => models.filter((m) => m.ages[a]).length);
  const bestAge = db.ages[counts.indexOf(Math.max(...counts, 0))] || db.ages[0];
  const age = db.ages.includes(r.str("age")) ? r.str("age") : bestAge;

  const head = `<div class="page-head"><div><h1>${t("cmp.title")}</h1><p class="sub">${t("cmp.sub", { n: MAX_COMPARE })}</p></div></div>
    <div class="filters">
      <div class="field grow"><span>${t("cmp.add")}</span><div id="combo"></div></div>
      <div class="field" style="flex:2 1 300px"><span>${t("cmp.selection")}</span><div class="chips">${models.map((m, i) =>
        `<span class="pill"><span class="dot" style="background:${color(i)}"></span><a href="#/model/${m.slug}">${esc(m.name)}</a><button type="button" data-unpick="${m.slug}" aria-label="${esc(t("ui.remove"))}">×</button></span>`).join("") || `<span class="muted">${t("cmp.none")}</span>`}</div></div>
      ${models.length ? `<div class="field"><span>&nbsp;</span><button class="btn small" id="clear">${t("ui.clear")}</button></div>` : ""}
    </div>`;

  if (!models.length) {
    root.innerHTML = head + `<section class="card"><h2>${t("cmp.presets")}</h2><p class="card-sub">${t("cmp.presetsHelp")}</p>
      <div class="chips" style="margin-top:8px">${PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.key}">${t("preset." + p.key)}</button>`).join("")}</div></section>`;
    wire();
    root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () =>
      update({ m: PRESETS.find((p) => p.key === b.dataset.preset).m.filter((s) => db.bySlug[s]) })));
    return;
  }

  // Summary rows.
  const summary = models.map((m, i) => {
    const s = score(m);
    const all = rankAmong(m, db.models.filter((x) => Object.keys(x.ages).length >= 1));
    const inSeg = rankAmong(m, db.models.filter((x) => x.seg === m.seg && x.body === m.body));
    return `<tr>
      <td><span class="pill" style="background:none;padding:0"><span class="dot" style="background:${color(i)}"></span></span></td>
      <td>${nameCell(m)}</td>
      <td class="num">${idxPill(s.score)}</td>
      <td class="num">${all ? `${all.rank} / ${all.of}` : "–"}</td>
      <td class="num" title="${esc(segName(m.seg))}">${inSeg ? `${inSeg.rank} / ${inSeg.of}` : "–"}</td>
      ${db.ages.map((a) => (m.ages[a] ? heatCell(pct(m.ages[a].rate), m.ages[a].idx, `title="${esc(t("avg.age", { age: ageLabel(a) }))}: ${pct(db.classAvg[a].rate)}"`) : `<td class="na">·</td>`)).join("")}
    </tr>`;
  }).join("");

  // Category table for the chosen age; optionally with the rubrics (union of the models' top 10s) under each.
  const showRubrics = r.str("dv") === "all";
  const codes = db.rubricCodes.filter((c) => models.some((m) => m.ages[age] && c in m.ages[age].rub));
  const groups = db.rubricGroups.filter((g) => classGroup(age, g) != null && models.some((m) => groupValue(m, age, g)));
  const rubRows = groups.map((g) => {
    const cg = classGroup(age, g);
    const head = `<tr class="group-row"><td><b>${esc(g)} · ${esc(groupName(g))}</b></td><td class="num muted">${pct(cg, 2)}</td>
      ${models.map((m) => rubricCell(groupValue(m, age, g), cg)).join("")}</tr>`;
    if (!showRubrics) return head;
    const sub = codes.filter((c) => groupOf(c) === g).sort((a, b) => (db.classAvg[age].rub[b] || 0) - (db.classAvg[age].rub[a] || 0));
    return head + sub.map((c) => {
      const ca = db.classAvg[age].rub[c];
      return `<tr class="sub-row"><td>${esc(c)} ${esc(rubricName(c))}</td><td class="num muted">${pct(ca, 2)}</td>
        ${models.map((m) => {
          const rv = rubricValue(m, age, c);
          return rubricCell(rv, ca, rv?.bound ? `title="${esc(t("cmp.boundHelp"))}"` : "");
        }).join("")}</tr>`;
    }).join("");
  }).join("");
  const radarGroups = groups.filter((g) => g !== "B");
  // Side by side only while the table is narrow; expanded rubrics or many models get the full width.
  const wide = showRubrics || models.length > 3;

  root.innerHTML = head + `
    <div class="grid">
      <section class="card span-12">
        <h2>${t("cmp.summary")}</h2>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>${t("col.model")}</th><th class="num" title="${esc(t("metric.indexHelp"))}">${t("rank.score")}</th><th class="num">${t("cmp.rankAll")}</th><th class="num">${t("cmp.rankSeg")}</th>
          ${db.ages.map((a) => `<th class="num">${esc(ageLabel(a, true))}</th>`).join("")}</tr></thead>
          <tbody>${summary}
          <tr><td></td><td class="muted">${t("avg.sameAge")}</td><td class="num muted">100</td><td></td><td></td>${db.ages.map((a) => `<td class="num muted">${pct(db.classAvg[a].rate)}</td>`).join("")}</tr>
          </tbody></table></div>
        <div class="legend-inline"><span>${t("legend.better")}<span class="scale"></span>${t("legend.worse")}</span><span>· = ${t("legend.na")}</span></div>
      </section>
      <section class="card span-7">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <h2 style="margin:0">${yMode === "idx" ? t("cmp.chartIdx") : t("cmp.chartRate")}</h2>
          ${segButtons("y", ["rate", "idx"], yMode, (v) => (v === "idx" ? t("metric.index") : t("metric.rate")))}
        </div>
        <p class="card-sub">${yMode === "idx" ? t("metric.indexHelp") : t("cmp.chartRateHelp")}</p>
        <div class="chart" id="c-rate"></div>
      </section>
      <section class="card span-5">
        <h2>${t("cmp.chartKm")}</h2>
        <p class="card-sub">${t("cmp.chartKmHelp")}</p>
        <div class="chart" id="c-km"></div>
      </section>
      <div class="span-12" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <h2 style="margin:0">${t("cmp.categories")}</h2>
        ${segButtons("age", db.ages, age, (a) => ageLabel(a))}
      </div>
      <section class="card ${wide ? "span-12" : "span-5"}">
        <h2>${t("cmp.radar")}</h2>
        <p class="card-sub">${t("cmp.radarHelp")}</p>
        ${radarGroups.length ? `<div class="chart" id="c-radar" style="height:460px"></div>` : `<div class="empty">${t("cmp.noAge")}</div>`}
      </section>
      <section class="card ${wide ? "span-12" : "span-7"}">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <h2 style="margin:0">${showRubrics ? t("cmp.rubrics") : t("cmp.categoryTable")}</h2>
          ${segButtons("dv", ["cat", "all"], showRubrics ? "all" : "cat", (v) => t(v === "all" ? "cmp.viewAll" : "cmp.viewCat"))}
        </div>
        <p class="card-sub">${t("cmp.categoriesHelp")}</p>
        ${groups.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t("col.category")}</th><th class="num">${t("avg.age", { age: ageLabel(age) })}</th>${models.map((m, i) => `<th class="num"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color(i)}"></span> ${esc(m.name)}</th>`).join("")}</tr></thead>
          <tbody><tr><td><b>${t("metric.rate")}</b></td><td class="num muted">${pct(db.classAvg[age].rate)}</td>${models.map((m) => m.ages[age] ? heatCell(`<b>${pct(m.ages[age].rate)}</b>`, m.ages[age].idx) : `<td class="na">·</td>`).join("")}</tr>
          ${rubRows}</tbody></table></div>
          <div class="legend-inline"><span>${t("legend.better")}<span class="scale"></span>${t("legend.worse")}</span><span>≈ = ${t("legend.approx")}</span>${showRubrics ? `<span>≤ = ${t("legend.bound")}</span>` : ""}</div>` : `<div class="empty">${t("cmp.noAge")}</div>`}
      </section>
    </div>`;
  wire();
  wireToggles(root, (name, v) => update({ [name]: (name === "y" && v === "rate") || (name === "dv" && v === "cat") ? "" : v }));

  // Radar: category index per model (100 = class average; further out = more defects).
  if (radarGroups.length) {
    const idx = (m, g) => { const v = groupValue(m, age, g), c = classGroup(age, g); return v && c ? (100 * v.v) / c : null; };
    // Cap the scale so one extreme value doesn't flatten the others; the tooltip keeps the true value.
    const maxIdx = Math.max(150, ...models.flatMap((m) => radarGroups.map((g) => idx(m, g) || 0)));
    const cap = Math.min(250, Math.ceil(maxIdx / 50) * 50);
    const wrap = (txt) => txt.replace(/(.{1,18})(\s+|$)/g, "$1\n").trim();
    chart(root.querySelector("#c-radar"), {
      legend: { bottom: 0, top: "auto" },
      tooltip: { trigger: "item", formatter: (p) => `<b>${esc(p.name)}</b><br>` + radarGroups.map((g, i) => {
        const m = models.find((x) => x.name === p.name);
        const v = m ? idx(m, g) : p.value[i];
        return `${esc(g)} · ${esc(groupName(g))}: <b>${v == null ? "–" : fmt(v, 0)}</b>`;
      }).join("<br>") },
      radar: {
        center: ["50%", "47%"], radius: "60%", splitNumber: 5,
        indicator: radarGroups.map((g) => ({ name: wrap(`${g} · ${groupName(g)}`), max: cap, min: 0 })),
        axisName: { color: T.text2, fontSize: 11, lineHeight: 13 },
        splitLine: { lineStyle: { color: T.grid } }, splitArea: { show: false }, axisLine: { lineStyle: { color: T.grid } },
      },
      series: [{
        type: "radar", symbolSize: 5,
        data: [
          { name: t("avg.age", { age: ageLabel(age) }), value: radarGroups.map(() => 100), symbol: "none", lineStyle: { color: T.ref, type: [6, 4], width: 2 }, itemStyle: { color: T.ref } },
          ...models.filter((m) => m.ages[age]).map((m) => {
            const i = models.indexOf(m);
            return { name: m.name, value: radarGroups.map((g) => { const v = idx(m, g); return v == null ? null : +Math.min(v, cap).toFixed(0); }),
              lineStyle: { color: color(i), width: 2 }, itemStyle: { color: color(i) }, areaStyle: { color: color(i), opacity: models.length <= 2 ? 0.12 : 0.04 } };
          }),
        ],
      }],
    });
  }

  // Line charts across age classes.
  const x = db.ages.map((a) => ageLabel(a));
  const lineSeries = (get) => models.map((m, i) => ({
    name: m.name, type: "line", connectNulls: false, symbolSize: 8, lineStyle: { width: 2 },
    itemStyle: { color: color(i), borderColor: T.surface, borderWidth: 2 },
    data: db.ages.map((a) => (m.ages[a] ? +get(m.ages[a], a).toFixed(2) : null)),
    endLabel: models.length <= 4 ? { show: true, formatter: () => m.model, color: T.text2, fontSize: 11 } : undefined,
  }));
  const refLine = (name, data) => ({ name, type: "line", symbol: "none", lineStyle: { width: 2, color: T.ref, type: [6, 4] }, itemStyle: { color: T.ref }, data, z: 1 });
  const fmtTip = (unit) => (ps) => `<b>${ps[0].axisValue}</b><br>` + ps.filter((p) => p.value != null).map((p) =>
    `${p.marker} ${esc(p.seriesName)}: <b>${unit(p.value)}</b>`).join("<br>");

  if (yMode === "idx") {
    chart(root.querySelector("#c-rate"), {
      grid: { left: 8, right: models.length <= 4 ? 90 : 16, top: 36, bottom: 8, containLabel: true },
      legend: {}, tooltip: { trigger: "axis", formatter: fmtTip((v) => fmt(v, 0)) },
      xAxis: { type: "category", data: x, boundaryGap: true },
      yAxis: { type: "value", scale: true },
      series: [...lineSeries((d) => d.idx), refLine(t("avg.sameAge"), db.ages.map(() => 100))],
    });
  } else {
    chart(root.querySelector("#c-rate"), {
      grid: { left: 8, right: models.length <= 4 ? 90 : 16, top: 36, bottom: 8, containLabel: true },
      legend: {}, tooltip: { trigger: "axis", formatter: fmtTip((v) => pct(v)) },
      xAxis: { type: "category", data: x, boundaryGap: true },
      yAxis: { type: "value", min: 0, axisLabel: { formatter: (v) => `${v}%` } },
      series: [...lineSeries((d) => d.rate), refLine(t("avg.sameAge"), db.ages.map((a) => db.classAvg[a].rate))],
    });
  }
  chart(root.querySelector("#c-km"), {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: {}, tooltip: { trigger: "axis", formatter: fmtTip(km) },
    xAxis: { type: "category", data: x, boundaryGap: true },
    yAxis: { type: "value", min: 0, axisLabel: { formatter: (v) => `${fmt(v / 1000, 0)}k` } },
    series: [...lineSeries((d) => d.km || 0).map((s) => ({ ...s, endLabel: undefined })), refLine(t("avg.sameAge"), db.ages.map((a) => db.classAvg[a].km))],
  });

  function wire() {
    modelCombo(root.querySelector("#combo"), db.models.filter((m) => !picks.includes(m.slug)), (s) => {
      if (picks.length < MAX_COMPARE) update({ m: [...picks, s] });
    }, t("cmp.addPh"));
    root.querySelectorAll("[data-unpick]").forEach((b) => b.addEventListener("click", () => update({ m: picks.filter((x) => x !== b.dataset.unpick) })));
    root.querySelector("#clear")?.addEventListener("click", () => update({ m: [], age: "" }));
  }
}

export { go };
