// Entry point: load data, route hash changes to views, wire the header controls.
import { loadData } from "./data.js";
import { parseHash, setReplaceHandler } from "./state.js";
import { disposeAll } from "./charts.js";
import { initLang, setLang, lang, t, applyStatic } from "./i18n.js";
import { toast, fmt } from "./ui.js";
import * as ranking from "./views/ranking.js";
import * as compare from "./views/compare.js";
import * as model from "./views/model.js";
import * as brands from "./views/brands.js";
import * as defects from "./views/defects.js";
import * as explore from "./views/explore.js";
import * as about from "./views/about.js";

const VIEWS = { ranking, compare, model, brands, defects, explore, about };
const app = document.getElementById("app");
let db;

function render({ keepScroll = true } = {}) {
  const route = parseHash();
  const view = VIEWS[route.view] || ranking;
  const y = window.scrollY;
  // Keep focus in a text filter across re-renders.
  const active = document.activeElement;
  const focusId = active && app.contains(active) && active.id ? active.id : null;
  const caret = focusId && "selectionStart" in active ? active.selectionStart : null;

  disposeAll();
  document.querySelectorAll("#tabs a").forEach((a) =>
    a.classList.toggle("active", a.dataset.view === (route.view === "model" ? "ranking" : route.view)));
  view.render(app, route, db);
  document.title = `${t("nav." + (VIEWS[route.view] ? route.view : "ranking"))} · ${t("app.title")}`;
  if (route.view === "model" && db.bySlug[route.arg]) document.title = `${db.bySlug[route.arg].name} · ${t("app.title")}`;

  if (keepScroll) window.scrollTo(0, y);
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch {} }
  }
}

async function main() {
  initLang();
  applyStatic();
  try {
    await new Promise((res) => (window.echarts ? res() : window.addEventListener("load", res, { once: true })));
    db = await loadData();
  } catch (e) {
    app.innerHTML = `<div class="empty">${t("ui.loadError")}<br><small>${String(e)}</small></div>`;
    return;
  }
  document.getElementById("foot-meta").textContent =
    `${db.meta.title} · ${fmt(db.meta.totalInspections, 0)} ${t("foot.inspections")}`;

  let lastView = parseHash().view + parseHash().arg;
  window.addEventListener("hashchange", () => {
    const r = parseHash();
    const changedPage = r.view + r.arg !== lastView;
    lastView = r.view + r.arg;
    render({ keepScroll: !changedPage });
    if (changedPage) window.scrollTo(0, 0);
  });
  setReplaceHandler(() => render());

  const sel = document.getElementById("lang");
  sel.value = lang();
  sel.addEventListener("change", () => { setLang(sel.value); applyStatic(); render(); });

  document.getElementById("theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("cb-theme", root.dataset.theme); } catch {}
  });
  // Charts are drawn on canvas with resolved colours, so redraw whenever the theme changes,
  // whether from the OS, our toggle, or a host page (e.g. an artifact viewer) setting data-theme.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Inside a frame (e.g. an embedded viewer) our own URL isn't one others can open, so don't offer to copy it.
  if (window.self !== window.top) document.getElementById("share").hidden = true;

  document.getElementById("share").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); toast(t("ui.copied")); }
    catch { prompt(t("ui.copyLink"), location.href); }
  });

  render({ keepScroll: false });
}

main();
