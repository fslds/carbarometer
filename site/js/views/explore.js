// Explore: mileage vs defect rate within one age class — are cars failing because they are driven more?
import { reader, update } from "../state.js";
import { filterModels } from "../data.js";
import { chart, tokens } from "../charts.js";
import { commonFilters, filterBar, wireFilterBar } from "./ranking.js";
import { esc, t, fmt, pct, km, segButtons, wireToggles, ageLabel, ptName, segName, bodyName } from "../ui.js";

export function render(root, route, db) {
  const r = reader(route.params);
  const f = commonFilters(r);
  const age = db.ages.includes(r.str("age")) ? r.str("age") : db.ages[0];
  const T = tokens();
  const ca = db.classAvg[age];

  const pts = filterModels(db.models, f).filter((m) => m.ages[age]?.km).map((m) => ({ m, x: m.ages[age].km, y: m.ages[age].rate }));
  const n = pts.length;
  let corr = null;
  if (n > 2) {
    const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
    corr = sxy / Math.sqrt(sxx * syy);
  }
  // Low mileage *and* low defects is unremarkable; the interesting corner is high mileage with low defects.
  const sturdy = pts.filter((p) => p.x > ca.km && p.y < ca.rate).sort((a, b) => a.y / a.x - b.y / b.x).slice(0, 8);

  root.innerHTML = `
    <div class="page-head"><div><h1>${t("exp.title")}</h1><p class="sub">${t("exp.sub")}</p></div></div>
    ${filterBar(db, f)}
    <div class="grid">
      <section class="card span-8">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <h2 style="margin:0">${t("exp.chart")}</h2>
          ${segButtons("age", db.ages, age, (a) => ageLabel(a))}
        </div>
        <p class="card-sub">${t("exp.chartHelp")}</p>
        <div class="chart tall" id="c-scatter"></div>
      </section>
      <section class="card span-4">
        <h2>${t("exp.sturdy")}</h2>
        <p class="card-sub">${t("exp.sturdyHelp")}</p>
        <table><tbody>${sturdy.map((p) => `<tr><td><a href="#/model/${p.m.slug}">${esc(p.m.name)}</a></td><td class="num">${pct(p.y)}</td><td class="num muted">${km(p.x)}</td></tr>`).join("") || `<tr><td class="empty">${t("ui.noResults")}</td></tr>`}</tbody></table>
        <h2 style="margin-top:16px">${t("exp.corr")}</h2>
        <p><span style="font-size:1.6rem;font-weight:700">${corr == null ? "–" : fmt(corr, 2)}</span> <span class="muted">(n = ${n})</span></p>
        <p class="card-sub">${t("exp.corrHelp")}</p>
      </section>
    </div>`;

  wireFilterBar(root);
  wireToggles(root.querySelector(".grid"), (name, v) => update({ [name]: v }));

  const groups = db.powertrains.map((pt, i) => ({
    name: ptName(pt), type: "scatter", symbolSize: 10,
    itemStyle: { color: T.series[i], borderColor: T.surface, borderWidth: 2, opacity: 0.9 },
    emphasis: { focus: "series", scale: 1.6 },
    data: pts.filter((p) => p.m.pt === pt).map((p) => ({ value: [p.x, p.y], m: p.m })),
  })).filter((s) => s.data.length);
  if (groups[0]) {
    groups[0].markLine = {
      silent: true, symbol: "none", lineStyle: { color: T.ref, type: "solid", width: 1 },
      label: { color: T.muted, fontSize: 10 },
      data: [{ xAxis: ca.km, label: { formatter: km(ca.km) } }, { yAxis: ca.rate, label: { formatter: pct(ca.rate) } }],
    };
  }
  const c = chart(root.querySelector("#c-scatter"), {
    grid: { left: 8, right: 24, top: 36, bottom: 28, containLabel: true },
    legend: {},
    tooltip: { trigger: "item", formatter: (p) => `<b>${esc(p.data.m.name)}</b><br>${t("metric.rate")}: ${pct(p.value[1])}<br>${t("col.km")}: ${km(p.value[0])}<br><span style="color:${T.muted}">${esc(segName(p.data.m.seg))} · ${esc(bodyName(p.data.m.body))}</span>` },
    xAxis: { type: "value", scale: true, name: t("col.km"), nameLocation: "middle", nameGap: 28, axisLabel: { formatter: (v) => `${fmt(v / 1000, 0)}k` } },
    yAxis: { type: "value", min: 0, name: t("metric.rate"), axisLabel: { formatter: (v) => `${v}%` } },
    series: groups,
  });
  c.on("click", (p) => { if (p.data?.m) location.hash = `#/model/${p.data.m.slug}`; });
}
