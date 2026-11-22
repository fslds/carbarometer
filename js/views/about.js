// About: data source and methodology.
import { t, fmt, ageLabel } from "../ui.js";

export function render(root, route, db) {
  const m = db.meta;
  root.innerHTML = `<article class="card prose" style="margin-top:20px">
    <h1>${t("about.title")}</h1>
    <p>${t("about.intro", { n: db.models.length, total: fmt(m.totalInspections, 0), min: m.minInspections })}</p>
    <h2>${t("about.metricsTitle")}</h2>
    <ul>
      <li>${t("about.rate")}</li>
      <li>${t("about.index")}</li>
      <li>${t("about.score")}</li>
      <li>${t("about.rubrics")}</li>
      <li>${t("about.groups")}</li>
    </ul>
    <h2>${t("about.classesTitle")}</h2>
    <p>${t("about.classes", { list: db.ages.map((a) => ageLabel(a)).join(", ") })}</p>
    <h2>${t("about.segTitle")}</h2>
    <p>${t("about.seg")}</p>
    <h2>${t("about.caveatsTitle")}</h2>
    <ul><li>${t("about.caveat1")}</li><li>${t("about.caveat2")}</li><li>${t("about.caveat3")}</li></ul>
    <h2>${t("about.urlTitle")}</h2>
    <p>${t("about.url")}</p>
    <p class="muted">${t("about.crawled", { date: new Date(m.crawledAt).toLocaleDateString() })} · <a href="${m.source}" target="_blank" rel="noopener">${m.source}</a></p>
  </article>`;
}
