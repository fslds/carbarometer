// Small DOM/format helpers shared by the views.
import { t, lang, rubricName, groupName, ageLabel, segName, bodyName, ptName } from "./i18n.js";
import { divColor, tokens } from "./charts.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function fmt(n, d = 1) {
  if (n == null || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat(lang(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
export const pct = (n, d = 1) => (n == null ? "–" : `${fmt(n, d)}%`);
export const km = (n) => (n == null ? "–" : `${fmt(n, 0)} km`);

/** Rubric value cell text: "≤ 0,12%" when outside the published top 10. */
export function rubricText(rv) {
  if (!rv) return "–";
  if (rv.approx) return `≈ ${pct(rv.v, 2)}`;
  return rv.bound ? `≤ ${pct(rv.v, 2)}` : pct(rv.v, 2);
}

/** Tooltip for an estimated category value: the possible range. */
export const rangeTitle = (rv) => (rv?.approx ? `${t("legend.range")}: ${pct(rv.lo, 2)} – ${pct(rv.hi, 2)}` : "");

/** Index pill: number plus a tiny diverging bar around the 100 line. */
export function idxPill(idx) {
  if (idx == null) return `<span class="muted">–</span>`;
  const T = tokens();
  const d = Math.max(-100, Math.min(100, idx - 100)); // ±100 index points = full half-bar
  const w = Math.abs(d) / 2;
  const left = d < 0 ? 50 - w : 50;
  return `<span class="idx" title="${esc(t("metric.indexHelp"))}"><span class="bar"><i style="left:${left}%;width:${w}%;background:${d < 0 ? T.divNeg : T.divPos}"></i></span>${fmt(idx, 0)}</span>`;
}

export function heatCell(text, idx, extra = "") {
  const bg = divColor(idx);
  const T = tokens();
  return `<td class="cell-heat" style="background:${bg};color:${idx == null ? T.muted : "inherit"}" ${extra}>${text}</td>`;
}

/** Rubric cell: exact values are coloured against the class average; upper bounds ("≤") stay neutral. */
export function rubricCell(rv, classVal, extra = "") {
  if (!rv) return `<td class="na">·</td>`;
  const idx = !rv.bound && classVal ? (100 * rv.v) / classVal : null;
  if (rv.approx && !/title=/.test(extra)) extra += ` title="${esc(rangeTitle(rv))}"`;
  return heatCell(rubricText(rv), idx, extra);
}

export function tags(m) {
  return `<span class="tag" title="${esc(segName(m.seg))}">${esc(m.seg)}</span><span class="tag">${esc(bodyName(m.body))}</span>${m.pt !== "ice" ? `<span class="tag ${m.pt}">${esc(ptName(m.pt))}</span>` : ""}`;
}

export function nameCell(m) {
  return `<div class="name-cell"><a href="#/model/${m.slug}">${esc(m.name)}</a><small>${tags(m)}</small></div>`;
}

export function chips(name, values, selected, label = (v) => v) {
  return `<div class="chips" data-chips="${name}">${values.map((v) =>
    `<button type="button" class="chip" data-v="${esc(v)}" aria-pressed="${selected.includes(v)}">${esc(label(v))}</button>`).join("")}</div>`;
}

export function segButtons(name, values, selected, label = (v) => v) {
  return `<div class="seg" role="group" data-seg="${name}">${values.map((v) =>
    `<button type="button" data-v="${esc(v)}" aria-pressed="${v === selected}">${esc(label(v))}</button>`).join("")}</div>`;
}

/** Wire chips/seg groups under root: onChange(name, value[s]). */
export function wireToggles(root, onChange) {
  root.querySelectorAll("[data-chips]").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
    onChange(g.dataset.chips, [...g.querySelectorAll('.chip[aria-pressed="true"]')].map((x) => x.dataset.v));
  }));
  root.querySelectorAll("[data-seg]").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    onChange(g.dataset.seg, b.dataset.v);
  }));
}

export function ageOptions(ages, selected, withAll = true) {
  return (withAll ? `<option value="">${esc(t("filter.allAges"))}</option>` : "") +
    ages.map((a) => `<option value="${a}" ${a === selected ? "selected" : ""}>${esc(ageLabel(a))}</option>`).join("");
}

/** Select options: optional "none", then categories ("g:4"), then individual rubrics. */
export function rubricOptions(codes, selected, withNone = "", groups = []) {
  const opt = (v, label) => `<option value="${v}" ${v === selected ? "selected" : ""}>${esc(label)}</option>`;
  return (withNone ? opt("", withNone) : "") +
    (groups.length ? `<optgroup label="${esc(t("metric.categories"))}">${groups.map((g) => opt("g:" + g, measureName("g:" + g))).join("")}</optgroup>` : "") +
    `<optgroup label="${esc(t("metric.rubrics"))}">${codes.map((c) => opt(c, measureName(c))).join("")}</optgroup>`;
}

export function measureName(code) {
  if (code.startsWith("g:")) return `${code.slice(2)} · ${groupName(code.slice(2))}`;
  return `${code} ${rubricName(code)}`;
}

/** Searchable model picker. onPick(slug). */
export function modelCombo(container, models, onPick, placeholder) {
  container.classList.add("combo");
  container.innerHTML = `<input type="search" placeholder="${esc(placeholder)}" autocomplete="off" role="combobox" aria-expanded="false" aria-label="${esc(placeholder)}"><ul role="listbox" hidden></ul>`;
  const input = container.querySelector("input");
  const ul = container.querySelector("ul");
  let hits = [], sel = 0;
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const draw = () => {
    const q = norm(input.value.trim());
    hits = q ? models.filter((m) => q.split(/\s+/).every((w) => norm(m.name).includes(w))).slice(0, 40) : [];
    sel = 0;
    ul.hidden = !hits.length;
    input.setAttribute("aria-expanded", String(!!hits.length));
    ul.innerHTML = hits.map((m, i) => `<li role="option" data-s="${m.slug}" aria-selected="${i === sel}">${esc(m.name)} <small>${esc(m.seg)} · ${esc(bodyName(m.body))}</small></li>`).join("");
  };
  const pick = (slug) => { input.value = ""; draw(); onPick(slug); };
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % Math.max(hits.length, 1);
      ul.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === sel)));
      ul.children[sel]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); pick(hits[sel].slug); }
    else if (e.key === "Escape") { input.value = ""; draw(); }
  });
  ul.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(li.dataset.s); } });
  input.addEventListener("blur", () => setTimeout(() => { ul.hidden = true; }, 100));
  return input;
}

export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 1800);
}

export { t, ageLabel, rubricName, groupName, segName, bodyName, ptName };
