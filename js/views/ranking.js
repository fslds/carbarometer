// Ranking: every model, filterable, sortable, with picks that flow into the comparison.
import { reader, update, go } from "../state.js";
import { filterModels, score, measure, isMeasure } from "../data.js";
import { chart, tokens } from "../charts.js";
import { esc, t, fmt, pct, km, idxPill, heatCell, nameCell, chips, segButtons, wireToggles, ageOptions, rubricOptions, ageLabel, segName, bodyName, ptName, measureName, rubricCell, rangeTitle } from "../ui.js";

export const MAX_COMPARE = 8;

export function commonFilters(r) {
  return { brand: r.list("brand"), seg: r.list("seg"), body: r.list("body"), pt: r.list("pt"), q: r.str("q") };
}

export function filterBar(db, f, extra = "", { brand = true } = {}) {
  return `<div class="filters" id="filters">
    <label class="field grow"><span>${t("filter.search")}</span><input type="search" id="f-q" value="${esc(f.q)}" placeholder="${esc(t("filter.searchPh"))}"></label>
    ${brand ? `<label class="field"><span>${t("filter.brand")}</span><select id="f-brand"><option value="">${t("filter.allBrands")}</option>${db.brands.map((b) => `<option ${f.brand.length === 1 && f.brand[0] === b ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></label>` : ""}
    <div class="field"><span>${t("filter.segment")}</span>${chips("seg", db.segments, f.seg, (s) => s)}</div>
    <div class="field"><span>${t("filter.body")}</span>${chips("body", db.bodies, f.body, bodyName)}</div>
    <div class="field"><span>${t("filter.powertrain")}</span>${chips("pt", db.powertrains, f.pt, ptName)}</div>
    ${extra}
    <div class="field"><span>&nbsp;</span><button type="button" class="btn small" id="f-reset">${t("filter.reset")}</button></div>
  </div>`;
}

export function wireFilterBar(root, resetKeys = []) {
  let timer;
  root.querySelector("#f-q")?.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => update({ q: e.target.value }), 200);
  });
  root.querySelector("#f-brand")?.addEventListener("change", (e) => update({ brand: e.target.value }));
  root.querySelector("#f-reset")?.addEventListener("click", () =>
    update(Object.fromEntries(["q", "brand", "seg", "body", "pt", ...resetKeys].map((k) => [k, ""]))));
  wireToggles(root.querySelector("#filters"), (name, v) => update({ [name]: Array.isArray(v) ? v : v }));
}

export function render(root, route, db) {
  const r = reader(route.params);
  const f = commonFilters(r);
  const age = db.ages.includes(r.str("age")) ? r.str("age") : "";
  const rub = isMeasure(r.str("r")) ? r.str("r") : "";
  const ms = rub ? measure(rub) : null;
  const minAges = r.num("min", 1);
  const sort = r.str("sort", "score");
  const dir = r.str("dir", sort === "name" ? "asc" : "asc");
  const picks = r.list("m").filter((s) => db.bySlug[s]);
  const T = tokens();

  const ages = age ? [age] : [];
  // Rows with the value we sort and chart on.
  let rows = filterModels(db.models, f).map((m) => {
    let val, n, bound = false;
    if (rub) {
      const keys = (age ? [age] : Object.keys(m.ages)).filter((a) => m.ages[a]);
      const idxs = keys.map((a) => {
        const rv = ms.value(m, a);
        const c = ms.cls(a);
        if (!rv) return null;
        if (rv.bound || rv.approx) bound = true;
        return c ? (100 * rv.v) / c : null;
      }).filter((x) => x != null);
      val = idxs.length ? idxs.reduce((s, x) => s + x, 0) / idxs.length : null;
      n = keys.length;
    } else {
      ({ score: val, n } = score(m, ages));
    }
    return { m, val, n, bound };
  }).filter((x) => x.val != null && x.n >= (age ? 1 : minAges));

  const sorters = {
    score: (x) => x.val, name: (x) => x.m.name, n: (x) => x.n,
    km: (x) => (age ? x.m.ages[age]?.km : null),
  };
  const key = sort.startsWith("a:") ? (x) => x.m.ages[sort.slice(2)]?.rate : sorters[sort] || sorters.score;
  rows.sort((a, b) => {
    const va = key(a), vb = key(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "desc" ? -c : c;
  });
  // Rank always by score (best first), independent of the display sort.
  const rankOf = new Map([...rows].sort((a, b) => a.val - b.val).map((x, i) => [x.m.slug, i + 1]));

  const metricLabel = rub ? t(ms.kind === "group" ? "rank.groupIndex" : "rank.rubricIndex") : t("rank.score");
  const extra = `
    <label class="field"><span>${t("filter.age")}</span><select id="f-age">${ageOptions(db.ages, age)}</select></label>
    <label class="field"><span>${t("filter.metric")}</span><select id="f-r">${rubricOptions(db.rubricCodes, rub, t("metric.overall"), db.rubricGroups)}</select></label>
    ${age ? "" : `<label class="field"><span title="${esc(t("filter.minAgesHelp"))}">${t("filter.minAges")}</span><select id="f-min">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === minAges ? "selected" : ""}>${n}</option>`).join("")}</select></label>`}`;

  const arrow = (k) => (sort === k ? `<span class="arrow">${dir === "desc" ? "▼" : "▲"}</span>` : "");
  const th = (k, label, cls = "") => `<th class="sortable ${cls}" data-sort="${k}" aria-sort="${sort === k ? (dir === "desc" ? "descending" : "ascending") : "none"}">${label} ${arrow(k)}</th>`;
  const ageCols = rub ? (age ? [age] : db.ages) : db.ages;

  const tableRows = rows.map((x) => {
    const m = x.m;
    const cells = ageCols.map((a) => {
      const d = m.ages[a];
      if (!d) return `<td class="na">·</td>`;
      if (rub) {
        const rv = ms.value(m, a);
        const c = ms.cls(a);
        return rubricCell(rv, c, `title="${esc(t("avg.age", { age: ageLabel(a) }))}: ${pct(c, 2)}${rv?.approx ? " · " + esc(rangeTitle(rv)) : ""}"`);
      }
      return heatCell(pct(d.rate), d.idx, `title="${esc(t("avg.age", { age: ageLabel(a) }))}: ${pct(db.classAvg[a].rate)} · ${esc(t("metric.index"))} ${fmt(d.idx, 0)}"`);
    }).join("");
    return `<tr>
      <td class="rank">${rankOf.get(m.slug)}</td>
      <td><input type="checkbox" class="pick" data-s="${m.slug}" ${picks.includes(m.slug) ? "checked" : ""} aria-label="${esc(t("rank.pick"))} ${esc(m.name)}"></td>
      <td>${nameCell(m)}</td>
      <td class="num">${x.bound ? (ms?.kind === "group" ? "≈ " : "≤ ") : ""}${idxPill(x.val)}</td>
      ${cells}
      ${age && !rub ? `<td class="num">${km(m.ages[age].km)}</td>` : ""}
      ${!age ? `<td class="num">${x.n}</td>` : ""}
    </tr>`;
  }).join("");

  const topN = Math.min(20, rows.length);
  const best = [...rows].sort((a, b) => a.val - b.val);
  const worst = [...best].reverse();
  const showWorst = r.str("show") === "worst";
  const chartRows = (showWorst ? worst : best).slice(0, topN).reverse();

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${t("rank.title")}</h1>
        <p class="sub">${t("rank.sub")}</p>
      </div>
    </div>
    ${filterBar(db, f, extra)}
    <div class="grid">
      <section class="card span-4">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <h2 style="margin:0">${showWorst ? t("rank.worstN", { n: topN }) : t("rank.bestN", { n: topN })}</h2>
          ${segButtons("show", ["best", "worst"], showWorst ? "worst" : "best", (v) => t(`rank.${v}`))}
        </div>
        <p class="card-sub">${esc(metricLabel)}${rub ? ` · ${esc(measureName(rub))}` : ""} · ${age ? esc(ageLabel(age)) : t("filter.allAges")} · ${t("rank.lowerBetter")}</p>
        <div class="chart tall" id="c-top"></div>
      </section>
      <section class="card span-8">
        <h2>${t("rank.table", { n: rows.length })}</h2>
        <p class="card-sub">${t("rank.tableHelp")}</p>
        ${rows.length ? `<div class="table-wrap" style="max-height:620px"><table>
          <thead><tr><th>#</th><th></th>${th("name", t("col.model"))}${th("score", esc(metricLabel), "num")}
          ${ageCols.map((a) => th("a:" + a, esc(ageLabel(a, true)), "num")).join("")}
          ${age && !rub ? th("km", t("col.km"), "num") : ""}${!age ? th("n", t("col.n"), "num") : ""}</tr></thead>
          <tbody>${tableRows}</tbody></table></div>` : `<div class="empty">${t("ui.noResults")}</div>`}
      </section>
    </div>
    <div class="comparebar" id="cbar" ${picks.length ? "" : "hidden"}>
      <strong>${t("rank.selected")}</strong>
      ${picks.map((s, i) => `<span class="pill"><span class="dot" style="background:${T.series[i % 8]}"></span>${esc(db.bySlug[s].name)}<button type="button" data-unpick="${s}" aria-label="${esc(t("ui.remove"))}">×</button></span>`).join("")}
      <span style="flex:1"></span>
      <button class="btn small" type="button" id="clear-picks">${t("ui.clear")}</button>
      <button class="btn primary" type="button" id="go-compare" ${picks.length < 1 ? "disabled" : ""}>${t("rank.compareN", { n: picks.length })}</button>
    </div>`;

  wireFilterBar(root, ["age", "r", "min", "sort", "dir"]);
  root.querySelector("#f-age").addEventListener("change", (e) => update({ age: e.target.value, sort: sort.startsWith("a:") || sort === "km" ? "" : sort }));
  root.querySelector("#f-r").addEventListener("change", (e) => update({ r: e.target.value }));
  root.querySelector("#f-min")?.addEventListener("change", (e) => update({ min: e.target.value === "1" ? "" : e.target.value }));
  wireToggles(root.querySelector(".card"), (name, v) => update({ show: v === "best" ? "" : v }));
  root.querySelectorAll("th.sortable").forEach((h) => h.addEventListener("click", () => {
    const k = h.dataset.sort;
    update({ sort: k === "score" ? "" : k, dir: sort === k && dir === "asc" ? "desc" : "" });
  }));
  root.querySelectorAll(".pick").forEach((cb) => cb.addEventListener("change", () => {
    const s = cb.dataset.s;
    let next = picks.filter((x) => x !== s);
    if (cb.checked) {
      if (picks.length >= MAX_COMPARE) { cb.checked = false; return; }
      next.push(s);
    }
    update({ m: next });
  }));
  root.querySelectorAll("[data-unpick]").forEach((b) => b.addEventListener("click", () => update({ m: picks.filter((x) => x !== b.dataset.unpick) })));
  root.querySelector("#clear-picks")?.addEventListener("click", () => update({ m: [] }));
  root.querySelector("#go-compare")?.addEventListener("click", () => go("compare", "", { m: picks, age }));

  if (chartRows.length) {
    const c = chart(root.querySelector("#c-top"), {
      grid: { left: 8, right: 40, top: 24, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const x = chartRows[p.dataIndex];
          return `<b>${esc(x.m.name)}</b><br>${esc(metricLabel)}: ${x.bound ? (ms?.kind === "group" ? "≈ " : "≤ ") : ""}${fmt(x.val, 0)}<br><span style="color:${T.muted}">${esc(segName(x.m.seg))} · ${esc(bodyName(x.m.body))} · ${t("col.n")}: ${x.n}</span>`;
        },
      },
      xAxis: { type: "value", min: 0, splitLine: { show: true } },
      yAxis: { type: "category", data: chartRows.map((x) => x.m.name), axisLabel: { color: T.text2, width: 150, overflow: "truncate" } },
      series: [{
        type: "bar", barMaxWidth: 14,
        data: chartRows.map((x) => ({ value: +x.val.toFixed(1), itemStyle: { color: x.val <= 100 ? T.divNeg : T.divPos, borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", color: T.text2, fontSize: 11, formatter: (p) => fmt(p.value, 0) },
        markLine: { silent: true, symbol: "none", lineStyle: { color: T.ref, type: "solid", width: 1 }, label: { formatter: t("rank.avg100"), color: T.muted, fontSize: 10, position: "end" }, data: [{ xAxis: 100 }] },
      }],
    });
    c.off("click");
    c.on("click", (p) => go("model", chartRows[p.dataIndex].m.slug));
  }
}
