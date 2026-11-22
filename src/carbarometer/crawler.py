"""Crawl the GOCA Barometer (https://gocabarometer.gocavlaanderen.be/) and harvest all model data.

The site is fully static: the start page lists every model (grouped by brand) and each model
has one page with an SVG bar chart (model vs. class average per age class) and, per age class
with enough inspections, a KPI block and the top-10 defect rubrics.

Raw HTML is cached in data/raw/ so parsing can be re-run without hitting the site again.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx2 as httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser, LexborNode as Node

from carbarometer.build_site import build as build_site
from carbarometer.segments import SEGMENTS

BASE = "https://gocabarometer.gocavlaanderen.be"
USER_AGENT = "carbarometer-research-crawler/0.1 (+personal, non-commercial; polite rate)"
CONCURRENCY = 4
RETRIES = 4

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
OUT_JSON = ROOT / "data" / "barometer.json"
SITE_DATA = ROOT / "site" / "data" / "barometer.json"


# ---------------------------------------------------------------- fetching


async def fetch(client: httpx.AsyncClient, sem: asyncio.Semaphore, path: str) -> str:
    async with sem:
        for attempt in range(RETRIES):
            try:
                r = await client.get(BASE + path)
                if r.status_code == 200:
                    return r.text
                if r.status_code in (403, 429) or r.status_code >= 500:
                    await asyncio.sleep(2**attempt)
                    continue
                r.raise_for_status()
            except httpx.TransportError:
                await asyncio.sleep(2**attempt)
        raise RuntimeError(f"failed to fetch {path} after {RETRIES} attempts")


def cache_path(path: str) -> Path:
    name = path.strip("/").replace("/", "__") or "index"
    return RAW_DIR / (name if name.endswith(".html") else name + ".html")


async def crawl(refresh: bool = False) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "nl"}
    async with httpx.AsyncClient(headers=headers, timeout=30, follow_redirects=True) as client:

        async def get(path: str) -> str:
            p = cache_path(path)
            if p.exists() and not refresh:
                return p.read_text("utf-8")
            html = await fetch(client, sem, path)
            p.write_text(html, "utf-8")
            await asyncio.sleep(0.2)  # be gentle
            return html

        home = await get("/")
        paths = sorted({a.attributes["href"] for a in HTMLParser(home).css(".merken a")})
        print(f"{len(paths)} model pages", file=sys.stderr)
        done = 0

        async def one(path: str) -> None:
            nonlocal done
            await get(path)
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(paths)}", file=sys.stderr)

        await asyncio.gather(*(one(p) for p in paths))


# ---------------------------------------------------------------- parsing

PCT = re.compile(r"(-?\d+(?:,\d+)?)\s*%")
AGE = re.compile(r"(\d+)\s*-\s*(\d+)")


def num(s: str) -> float | None:
    """Parse a Dutch formatted number: '73.100' -> 73100, '4,6%' -> 4.6."""
    s = s.strip().replace("%", "").replace(" ", "").strip()
    if not s or s.lower() in {"n.v.t.", "-"}:
        return None
    if s.startswith("<"):  # e.g. '< 0.01' (note: dot decimal) -> store half the bound
        return float(s[1:].strip().replace(",", ".")) / 2
    return float(s.replace(".", "").replace(",", "."))


def age_key(label: str) -> str:
    m = AGE.search(label)
    if not m:
        raise ValueError(f"unexpected age class label {label!r}")
    return f"{m.group(1)}-{m.group(2)}"


def parse_chart(svg: Node) -> dict[str, dict]:
    """Walk the bar chart: per group [model value | n.v.t.], class value, class label."""
    classes: dict[str, dict] = {}
    pending: dict = {}
    for el in svg.iter():
        if el.tag != "text":
            continue
        a = el.attributes
        t = el.text(strip=True)
        if a.get("text-anchor") == "end":  # y-axis ticks
            continue
        if a.get("font-size") == "13":  # x-axis label closes the group
            classes[age_key(t)] = {"model": pending.get("model"), "class": pending.get("class")}
            pending = {}
        elif t == "n.v.t.":
            pending["model"] = None
        elif a.get("font-weight") == "700":
            pending["model"] = num(t)
        elif PCT.search(t):
            pending["class"] = num(t)
    return classes


def parse_class_section(sec: Node) -> tuple[str, dict]:
    key = age_key(sec.css_first("h3").text())
    kpis = sec.css(".kpi > div")
    out: dict = {}
    if kpis:
        b = kpis[0].css_first("b").text()
        span = kpis[0].css_first("span").text()
        out["defectRate"] = num(b)
        m = PCT.search(span)
        out["classDefectRate"] = num(m.group(0)) if m else None
    if len(kpis) > 1:
        out["km"] = num(kpis[1].css_first("b").text())
        m = re.search(r"\(.*?([\d.]+)\)", kpis[1].css_first("span").text())
        out["classKm"] = num(m.group(1)) if m else None
    rubrics = []
    for tr in sec.css("tbody tr"):
        tds = tr.css("td")
        label = tds[0].text(strip=True)
        code, _, name = label.partition(" ")
        rubrics.append({"code": code, "name": name, "model": num(tds[1].text()), "class": num(tds[2].text())})
    out["rubrics"] = rubrics
    return key, out


def parse_model(html: str, path: str, brand: str) -> dict:
    tree = HTMLParser(html)
    name = tree.css_first("main h2").text(strip=True)
    chart = parse_chart(tree.css_first("main section.sectie svg"))
    details = dict(parse_class_section(s) for s in tree.css("main section.sectie")[1:])
    ages = {}
    for key, v in chart.items():
        d = details.get(key, {})
        ages[key] = {
            "defectRate": d.get("defectRate", v["model"]),
            "classDefectRate": d.get("classDefectRate", v["class"]),
            "km": d.get("km"),
            "classKm": d.get("classKm"),
            "rubrics": d.get("rubrics", []),
        }
    slug = path.rsplit("/", 1)[-1].removesuffix(".html")
    model = name[len(brand) :].strip() if name.startswith(brand) else name
    return {"slug": slug, "brand": brand, "model": model, "name": name, "ages": ages}


def rubric_sort(code: str) -> list:
    return [(0, int(x)) if x.isdigit() else (1, x) for x in code.split(".")]


def parse_all() -> dict:
    home = HTMLParser(cache_path("/").read_text("utf-8"))
    hints = [p.text(strip=True) for p in home.css("main p.hint")]
    m = re.search(r"([\d.]+) periodieke keuringen", hints[0]) if hints else None
    total = int(num(m.group(1))) if m else None
    title = home.css_first("header .label").text(deep=False, strip=True)
    version = home.css_first("header .versie")

    models = []
    for sec in home.css(".merken section.merk"):
        brand = sec.css_first("h3").text(strip=True)
        for a in sec.css("a"):
            path = a.attributes["href"]
            models.append(parse_model(cache_path(path).read_text("utf-8"), path, brand))

    age_classes = sorted({k for mdl in models for k in mdl["ages"]}, key=lambda k: int(k.split("-")[0]))
    # Class-level reference values (identical on every page) and the rubric catalogue.
    class_avg: dict[str, dict] = {k: {} for k in age_classes}
    rubrics: dict[str, str] = {}
    for mdl in models:
        for k, a in mdl["ages"].items():
            ca = class_avg[k]
            if a["classDefectRate"] is not None:
                ca.setdefault("defectRate", a["classDefectRate"])
            if a["classKm"] is not None:
                ca.setdefault("km", a["classKm"])
            for r in a["rubrics"]:
                rubrics.setdefault(r["code"], r["name"])
                ca.setdefault("rubrics", {}).setdefault(r["code"], r["class"])

    return {
        "source": BASE + "/",
        "title": title,
        "version": version.text(strip=True) if version else None,
        "crawledAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "totalInspections": total,
        "minInspections": 500,
        "ageClasses": age_classes,
        "classAverages": class_avg,
        "rubrics": dict(sorted(rubrics.items(), key=lambda kv: rubric_sort(kv[0]))),
        "models": models,
    }


def site_data(data: dict) -> dict:
    """Compact form for the static site: ages without data are dropped, rubric names live in i18n."""
    models = []
    for m in data["models"]:
        seg, body, *pt = SEGMENTS.get(m["slug"], "? ?").split()
        ages = {
            k: [a["defectRate"], a["km"], {r["code"]: r["model"] for r in a["rubrics"]}]
            for k, a in m["ages"].items()
            if a["defectRate"] is not None
        }
        models.append({"s": m["slug"], "b": m["brand"], "m": m["model"], "seg": seg, "body": body,
                       "pt": pt[0] if pt else "", "a": ages})
    return {
        "meta": {k: data[k] for k in ("source", "title", "version", "crawledAt", "totalInspections", "minInspections")},
        "ages": data["ageClasses"],
        "classAvg": {k: [v.get("defectRate"), v.get("km"), v.get("rubrics", {})] for k, v in data["classAverages"].items()},
        "rubricsNl": data["rubrics"],
        "models": models,
    }


def main() -> None:
    refresh = "--refresh" in sys.argv
    if "--parse-only" not in sys.argv:
        asyncio.run(crawl(refresh))
    data = parse_all()
    # Keep the previous timestamp when nothing else changed, so a scheduled re-crawl doesn't commit noise.
    if OUT_JSON.exists():
        old = json.loads(OUT_JSON.read_text("utf-8"))
        if {**old, "crawledAt": None} == {**data, "crawledAt": None}:
            data["crawledAt"] = old["crawledAt"]
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    SITE_DATA.parent.mkdir(parents=True, exist_ok=True)
    SITE_DATA.write_text(json.dumps(site_data(data), ensure_ascii=False, separators=(",", ":")), "utf-8")
    missing = [m["slug"] for m in data["models"] if m["slug"] not in SEGMENTS]
    if missing:
        print(f"warning: no segment classification for {missing}", file=sys.stderr)
    n_ages = sum(len([a for a in m["ages"].values() if a["defectRate"] is not None]) for m in data["models"])
    print(f"{len(data['models'])} models, {n_ages} model×age datapoints, {len(data['rubrics'])} rubrics", file=sys.stderr)
    print(f"wrote {OUT_JSON.relative_to(ROOT)} and {SITE_DATA.relative_to(ROOT)}", file=sys.stderr)
    build_site()


if __name__ == "__main__":
    main()
