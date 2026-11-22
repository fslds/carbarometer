// Brands: aggregate model scores per brand (unweighted mean of the models' indices).
import { reader, update } from "../state.js";
import { filterModels, score } from "../data.js";
import { chart, tokens } from "../charts.js";
import { commonFilters, filterBar, wireFilterBar } from "./ranking.js";
import { esc, t, fmt, idxPill, ageOptions, ageLabel } from "../ui.js";

export function render(root, route, db) {
  const r = reader(route.params);
  const f = { ...commonFilters(r), brand: [] };
  const age = db.ages.includes(r.str("age")) ? r.str("age") : "";
  const minModels = r.num("minm", 2);
  const T = tokens();

  const scored = filterModels(db.models, f)
    .map((m) => ({ m, s: score(m, age ? [age] : []).score }))
    .filter((x) => x.s != null);
  const byBrand = new Map();
  for (const x of scored) {
    if (!byBrand.has(x.m.brand)) byBrand.set(x.m.brand, []);
    byBrand.get(x.m.brand).push(x);
  }
  const rows = [...byBrand.entries()].map(([brand, xs]) => {
    xs.sort((a, b) => a.s - b.s);
    const vals = xs.map((x) => x.s);
    const mid = Math.floor(vals.length / 2);
    return {
      brand, xs, n: xs.length,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      median: vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2,
      best: xs[0], worst: xs[xs.length - 1],
    };
  }).filter((b) => b.n >= minModels).sort((a, b) => a.mean - b.mean);

  const extra = `
    <label class="field"><span>${t("filter.age")}</span><select id="f-age">${ageOptions(db.ages, age)}</select></label>
    <label class="field"><span>${t("brands.minModels")}</span><select id="f-minm">${[1, 2, 3, 5, 10].map((n) => `<option ${n === minModels ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>${t("brands.title")}</h1><p class="sub">${t("brands.sub")}</p></div></div>
    ${filterBar(db, f, extra, { brand: false })}
    <div class="grid">
      <section class="card span-7">
        <h2>${t("brands.chart")}</h2>
        <p class="card-sub">${t("brands.chartHelp")} · ${age ? esc(ageLabel(age)) : t("filter.allAges")}</p>
        <div class="chart" id="c-brands" style="height:${Math.max(320, rows.length * 22 + 60)}px"></div>
      </section>
      <section class="card span-5">
        <h2>${t("brands.table", { n: rows.length })}</h2>
        ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>${t("filter.brand")}</th><th class="num">${t("brands.mean")}</th><th class="num">${t("brands.median")}</th><th class="num">${t("brands.models")}</th><th>${t("brands.best")}</th></tr></thead>
        <tbody>${rows.map((b, i) => `<tr><td class="rank">${i + 1}</td><td><a href="#/ranking?brand=${encodeURIComponent(b.brand)}${age ? "&age=" + age : ""}">${esc(b.brand)}</a></td><td class="num">${idxPill(b.mean)}</td><td class="num">${fmt(b.median, 0)}</td><td class="num">${b.n}</td><td><a href="#/model/${b.best.m.slug}">${esc(b.best.m.model)}</a> <span class="muted">${fmt(b.best.s, 0)}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">${t("ui.noResults")}</div>`}
      </section>
    </div>`;

  wireFilterBar(root, ["age", "minm"]);
  root.querySelector("#f-age").addEventListener("change", (e) => update({ age: e.target.value }));
  root.querySelector("#f-minm").addEventListener("change", (e) => update({ minm: e.target.value === "2" ? "" : e.target.value }));

  if (!rows.length) return;
  const brands = rows.map((b) => b.brand).reverse();
  const pts = rows.flatMap((b) => b.xs.map((x) => ({ value: [+x.s.toFixed(1), b.brand], m: x.m })));
  const c = chart(root.querySelector("#c-brands"), {
    grid: { left: 8, right: 24, top: 44, bottom: 8, containLabel: true },
    legend: { data: [t("brands.mean"), t("brands.modelDots")] },
    tooltip: { trigger: "item", formatter: (p) => p.seriesIndex === 1
      ? `<b>${esc(p.data.m.name)}</b><br>${t("rank.score")}: ${fmt(p.value[0], 0)}`
      : `<b>${esc(p.name)}</b><br>${t("brands.mean")}: ${fmt(p.value, 0)}` },
    xAxis: { type: "value", min: 0 },
    yAxis: { type: "category", data: brands, axisLabel: { color: T.text2 } },
    series: [
      { name: t("brands.mean"), type: "bar", barMaxWidth: 10, data: brands.map((b) => { const row = rows.find((x) => x.brand === b); return { value: +row.mean.toFixed(1), itemStyle: { color: row.mean <= 100 ? T.divNeg : T.divPos, borderRadius: 4 } }; }),
        markLine: { silent: true, symbol: "none", lineStyle: { color: T.ref, type: "solid" }, label: { show: false }, data: [{ xAxis: 100 }] } },
      { name: t("brands.modelDots"), type: "scatter", symbolSize: 8, itemStyle: { color: T.muted, opacity: 0.7, borderColor: T.surface, borderWidth: 1 }, data: pts },
    ],
  });
  c.on("click", (p) => { if (p.seriesIndex === 1) location.hash = `#/model/${p.data.m.slug}`; });
}
