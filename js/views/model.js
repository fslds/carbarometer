// Model detail: one model across all age classes, its rubrics, and its peers.
import { go } from "../state.js";
import { score, rankAmong, rubricValue, groupValue, classGroup, groupOf } from "../data.js";
import { chart, tokens } from "../charts.js";
import { esc, t, fmt, pct, km, idxPill, heatCell, nameCell, tags, ageLabel, segName, bodyName, rubricName, groupName, rubricCell, rangeTitle } from "../ui.js";

export function render(root, route, db) {
  const m = db.bySlug[route.arg];
  if (!m) {
    root.innerHTML = `<div class="empty">${t("model.notFound")} <a href="#/ranking">${t("nav.ranking")}</a></div>`;
    return;
  }
  const T = tokens();
  const s = score(m);
  const all = rankAmong(m, db.models);
  const peers = db.models.filter((x) => x.seg === m.seg && x.body === m.body);
  const inSeg = rankAmong(m, peers);
  const brandPeers = db.models.filter((x) => x.brand === m.brand);
  const inBrand = rankAmong(m, brandPeers);
  const ages = db.ages.filter((a) => m.ages[a]);

  const codes = db.rubricCodes.filter((c) => ages.some((a) => c in m.ages[a].rub));
  const firstAge = ages[0];
  codes.sort((a, b) => (m.ages[firstAge].rub[b] ?? -1) - (m.ages[firstAge].rub[a] ?? -1));
  const groups = db.rubricGroups.filter((g) => codes.some((c) => groupOf(c) === g));

  const peerRows = peers.map((x) => ({ x, s: score(x).score })).sort((a, b) => a.s - b.s);
  const tile = (label, value, hint) => `<section class="card tile span-3"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></section>`;
  const verdict = s.score < 100 ? `<span class="delta-good">▼ ${fmt(100 - s.score, 0)}% ${t("model.betterThanAvg")}</span>` : `<span class="delta-bad">▲ ${fmt(s.score - 100, 0)}% ${t("model.worseThanAvg")}</span>`;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="muted" style="margin:0"><a href="#/ranking?brand=${encodeURIComponent(m.brand)}">${esc(m.brand)}</a></p>
        <h1>${esc(m.name)}</h1>
        <p>${tags(m)} <span class="muted">· ${esc(segName(m.seg))} · ${esc(bodyName(m.body))}</span></p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="cmp-peers">${t("model.comparePeers")}</button>
        <a class="btn" href="${esc(db.meta.source)}m/${m.slug}.html" target="_blank" rel="noopener">${t("model.original")} ↗</a>
      </div>
    </div>
    <div class="grid">
      ${tile(t("rank.score"), fmt(s.score, 0), verdict)}
      ${tile(t("model.rankAll"), all ? `${all.rank}<span class="muted" style="font-size:1rem"> / ${all.of}</span>` : "–", t("model.rankAllHint"))}
      ${tile(t("model.rankSeg"), inSeg ? `${inSeg.rank}<span class="muted" style="font-size:1rem"> / ${inSeg.of}</span>` : "–", `${esc(m.seg)} · ${esc(bodyName(m.body))}`)}
      ${tile(t("model.rankBrand"), inBrand ? `${inBrand.rank}<span class="muted" style="font-size:1rem"> / ${inBrand.of}</span>` : "–", esc(m.brand))}
      <section class="card span-7">
        <h2>${t("model.chart")}</h2>
        <p class="card-sub">${t("model.chartHelp")}</p>
        <div class="chart" id="c-ages"></div>
        <details class="table-view"><summary>${t("ui.tableView")}</summary><div class="table-wrap"><table>
          <thead><tr><th>${t("col.age")}</th><th class="num">${t("metric.rate")}</th><th class="num">${t("avg.sameAge")}</th><th class="num">${t("metric.index")}</th><th class="num">${t("col.km")}</th><th class="num">${t("avg.sameAgeKm")}</th></tr></thead>
          <tbody>${db.ages.map((a) => { const d = m.ages[a], c = db.classAvg[a]; return `<tr><td>${esc(ageLabel(a))}</td><td class="num">${d ? pct(d.rate) : "–"}</td><td class="num">${pct(c.rate)}</td><td class="num">${d ? idxPill(d.idx) : "–"}</td><td class="num">${d ? km(d.km) : "–"}</td><td class="num">${km(c.km)}</td></tr>`; }).join("")}</tbody></table></div></details>
      </section>
      <section class="card span-5">
        <h2>${t("model.peers")}</h2>
        <p class="card-sub">${t("model.peersHelp", { seg: m.seg, body: bodyName(m.body) })}</p>
        <div class="table-wrap" style="max-height:380px"><table><thead><tr><th>#</th><th>${t("col.model")}</th><th class="num">${t("rank.score")}</th><th class="num">${t("col.n")}</th></tr></thead>
        <tbody>${peerRows.map(({ x, s: sc }, i) => `<tr ${x.slug === m.slug ? 'style="background:var(--surface-2);font-weight:600"' : ""}><td class="rank">${i + 1}</td><td><a href="#/model/${x.slug}">${esc(x.name)}</a></td><td class="num">${idxPill(sc)}</td><td class="num">${Object.keys(x.ages).length}</td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="card span-12">
        <h2>${t("model.rubrics")}</h2>
        <p class="card-sub">${t("model.rubricsHelp")}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>${t("col.categoryRubric")}</th>${ages.map((a) => `<th class="num">${esc(ageLabel(a))}</th>`).join("")}</tr></thead>
          <tbody>${groups.map((g) => `<tr class="group-row"><td><b>${esc(g)} · ${esc(groupName(g))}</b></td>${ages.map((a) => {
            const gv = groupValue(m, a, g), cg = classGroup(a, g);
            return rubricCell(gv, cg, `title="${esc(t("avg.age", { age: ageLabel(a) }))}: ${cg != null ? pct(cg, 2) : "–"}${gv?.approx ? " · " + esc(rangeTitle(gv)) : ""}"`);
          }).join("")}</tr>` + codes.filter((c) => groupOf(c) === g).map((c) => `<tr class="sub-row"><td>${esc(c)} ${esc(rubricName(c))}</td>${ages.map((a) => {
            const rv = rubricValue(m, a, c), ca = db.classAvg[a].rub[c];
            return rubricCell(rv, ca, `title="${esc(t("avg.age", { age: ageLabel(a) }))}: ${ca != null ? pct(ca, 2) : "–"}"`);
          }).join("")}</tr>`).join("")).join("")}</tbody></table></div>
        <div class="legend-inline"><span>${t("legend.better")}<span class="scale"></span>${t("legend.worse")}</span><span>≈ = ${t("legend.approx")}</span><span>≤ = ${t("legend.bound")}</span></div>
      </section>
    </div>`;

  root.querySelector("#cmp-peers").addEventListener("click", () => {
    const others = peerRows.map((p) => p.x.slug).filter((x) => x !== m.slug).slice(0, 4);
    go("compare", "", { m: [m.slug, ...others] });
  });

  chart(root.querySelector("#c-ages"), {
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    legend: {},
    tooltip: { trigger: "axis", formatter: (ps) => `<b>${ps[0].axisValue}</b><br>` + ps.map((p) => `${p.marker} ${esc(p.seriesName)}: <b>${p.value == null ? t("legend.na") : pct(p.value)}</b>`).join("<br>") },
    xAxis: { type: "category", data: db.ages.map((a) => ageLabel(a)) },
    yAxis: { type: "value", min: 0, axisLabel: { formatter: (v) => `${v}%` } },
    series: [
      { name: m.name, type: "bar", barMaxWidth: 28, barGap: "8%", itemStyle: { color: T.series[0], borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", color: T.text, fontSize: 11, fontWeight: 600, formatter: (p) => pct(p.value) },
        data: db.ages.map((a) => m.ages[a]?.rate ?? null) },
      { name: t("avg.sameAge"), type: "bar", barMaxWidth: 28, itemStyle: { color: T.axis, borderRadius: [4, 4, 0, 0] },
        data: db.ages.map((a) => db.classAvg[a].rate) },
    ],
  });
}
