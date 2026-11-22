// Defects: how each rubric evolves with age, and which models score worst/best on it.
import { reader, update } from "../state.js";
import { filterModels, groupOf, measure, isMeasure, classGroup } from "../data.js";
import { chart, tokens } from "../charts.js";
import { commonFilters, filterBar, wireFilterBar } from "./ranking.js";
import { esc, t, fmt, pct, heatCell, nameCell, rubricOptions, segButtons, wireToggles, ageLabel, rubricName, rubricCell, measureName } from "../ui.js";
import { groupName } from "../i18n.js";

export function render(root, route, db) {
  const r = reader(route.params);
  const f = commonFilters(r);
  const rub = isMeasure(r.str("r")) ? r.str("r") : "4.1";
  const ms = measure(rub);
  const isGroup = ms.kind === "group";
  const age = db.ages.includes(r.str("age")) ? r.str("age") : db.ages[0];
  const T = tokens();

  // Overview: class averages per rubric × age (only rubrics that appear in some class top list).
  const codes = db.rubricCodes.filter((c) => db.ages.some((a) => db.classAvg[a].rub[c] != null));
  const maxAvg = Math.max(...codes.flatMap((c) => db.ages.map((a) => db.classAvg[a].rub[c] || 0)));
  const maxGroup = Math.max(...db.rubricGroups.flatMap((g) => db.ages.map((a) => classGroup(a, g) || 0)));
  const selected = 'style="outline:2px solid var(--accent);outline-offset:-2px"';
  const barCell = (v, max, strong) => {
    const w = v == null ? 0 : Math.max(2, (v / max) * 100);
    return `<td class="num" style="min-width:90px"><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">${v == null ? "–" : strong ? `<b>${pct(v, 2)}</b>` : pct(v, 2)}<span style="display:inline-block;width:40px;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:${w}%;background:${T.series[0]}"></i></span></div></td>`;
  };
  let lastGroup = null;
  const overview = codes.map((c) => {
    const g = groupOf(c);
    const head = g !== lastGroup
      ? `<tr class="group-row" ${rub === "g:" + g ? selected : ""}><td><a href="#" data-r="g:${g}"><b>${esc(g)} · ${esc(groupName(g))}</b></a></td>${db.ages.map((a) => barCell(classGroup(a, g), maxGroup, true)).join("")}</tr>`
      : "";
    lastGroup = g;
    return head + `<tr class="sub-row" ${c === rub ? selected : ""}><td><a href="#" data-r="${c}">${esc(c)} ${esc(rubricName(c))}</a></td>${db.ages.map((a) => barCell(db.classAvg[a].rub[c], maxAvg, false)).join("")}</tr>`;
  }).join("");

  // Models for this rubric and age.
  const ca = ms.cls(age);
  const rows = filterModels(db.models, f).map((m) => ({ m, rv: ms.value(m, age) })).filter((x) => x.rv);
  const exact = rows.filter((x) => !x.rv.bound).sort((a, b) => b.rv.v - a.rv.v);
  const bounded = rows.filter((x) => x.rv.bound).sort((a, b) => a.rv.v - b.rv.v);
  const worst = exact.slice(0, 20).reverse();

  root.innerHTML = `
    <div class="page-head"><div><h1>${t("def.title")}</h1><p class="sub">${t("def.sub")}</p></div></div>
    ${filterBar(db, f, `<label class="field grow"><span>${t("col.categoryRubric")}</span><select id="f-r">${rubricOptions(db.rubricCodes, rub, "", db.rubricGroups)}</select></label>`)}
    <div class="grid">
      <section class="card span-12">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <h2 style="margin:0">${esc(measureName(rub))}</h2>
          ${segButtons("age", db.ages, age, (a) => ageLabel(a))}
        </div>
        <p class="card-sub">${t("avg.age", { age: ageLabel(age) })}: <b>${ca != null ? pct(ca, 2) : "–"}</b> · ${isGroup ? t("def.groupCount", { n: exact.length }) : t("def.counts", { exact: exact.length, bound: bounded.length })}</p>
      </section>
      <section class="card span-6">
        <h2>${t("def.worst")}</h2>
        <p class="card-sub">${isGroup ? t("def.worstHelpGroup") : t("def.worstHelp")}</p>
        ${worst.length ? `<div class="chart" id="c-worst" style="height:${Math.max(240, worst.length * 22 + 40)}px"></div>` : `<div class="empty">${t("ui.noResults")}</div>`}
      </section>
      <section class="card span-6">
        <h2>${t("def.all")}</h2>
        <p class="card-sub">${isGroup ? t("legend.approx") : t("def.allHelp")}</p>
        <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>${t("col.model")}</th><th class="num">${t("def.value")}</th><th class="num">${t("metric.index")}</th></tr></thead>
        <tbody>${[...exact, ...bounded.slice().reverse()].map((x) => {
          const idx = ca ? (100 * x.rv.v) / ca : null;
          return `<tr><td>${nameCell(x.m)}</td>${rubricCell(x.rv, ca)}<td class="num">${idx == null ? "–" : (x.rv.bound ? "≤ " : x.rv.approx ? "≈ " : "") + fmt(idx, 0)}</td></tr>`;
        }).join("")}</tbody></table></div>
      </section>
      <section class="card span-12">
        <h2>${t("def.overview")}</h2>
        <p class="card-sub">${t("def.overviewHelp")}</p>
        <div class="table-wrap"><table><thead><tr><th>${t("col.rubric")}</th>${db.ages.map((a) => `<th class="num">${esc(ageLabel(a))}</th>`).join("")}</tr></thead><tbody>${overview}</tbody></table></div>
      </section>
    </div>`;

  wireFilterBar(root, ["r"]);
  root.querySelector("#f-r").addEventListener("change", (e) => update({ r: e.target.value }));
  wireToggles(root.querySelector(".grid"), (name, v) => update({ [name]: v }));
  root.querySelectorAll("[data-r]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); update({ r: a.dataset.r }); window.scrollTo({ top: 0, behavior: "smooth" }); }));

  if (worst.length) {
    const c = chart(root.querySelector("#c-worst"), {
      grid: { left: 8, right: 48, top: 24, bottom: 24, containLabel: true },
      tooltip: { trigger: "item", formatter: (p) => `<b>${esc(worst[p.dataIndex].m.name)}</b><br>${pct(p.value, 2)} (${t("avg.age", { age: ageLabel(age) })}: ${pct(ca, 2)})` },
      xAxis: { type: "value", min: 0, axisLabel: { formatter: (v) => `${v}%` } },
      yAxis: { type: "category", data: worst.map((x) => x.m.name), axisLabel: { color: T.text2, width: 150, overflow: "truncate" } },
      series: [{
        type: "bar", barMaxWidth: 14,
        data: worst.map((x) => ({ value: x.rv.v, itemStyle: { color: ca && x.rv.v <= ca ? T.divNeg : T.divPos, borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", color: T.text2, fontSize: 11, formatter: (p) => pct(p.value, 2) },
        markLine: ca != null ? { silent: true, symbol: "none", lineStyle: { color: T.ref, type: "solid" }, label: { formatter: t("avg.age", { age: ageLabel(age) }), color: T.muted, fontSize: 10, position: "end" }, data: [{ xAxis: ca }] } : undefined,
      }],
    });
    c.on("click", (p) => { location.hash = `#/model/${worst[p.dataIndex].m.slug}`; });
  }
}
