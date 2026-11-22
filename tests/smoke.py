"""Smoke test: serve site/ (and open it via file://), load every view, fail on console/page errors, save screenshots."""
import asyncio, functools, http.server, sys, threading
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tests" / "shots"
ROUTES = {
    "ranking": "#/ranking",
    "ranking-filtered": "#/ranking?age=4-5&seg=C&body=suv&m=volvo-xc40,toyota-c-hr,kia-sportage",
    "ranking-rubric": "#/ranking?r=4.1&min=3",
    "compare-empty": "#/compare",
    "compare": "#/compare?m=volkswagen-golf,ford-focus,toyota-auris,peugeot-308,opel-astra",
    "compare-idx": "#/compare?m=tesla-model-3,volkswagen-id-3,polestar-2&y=idx&age=4-5",
    "model": "#/model/volvo-xc40",
    "model-old": "#/model/toyota-yaris",
    "brands": "#/brands",
    "defects": "#/defects?r=5.3&age=10-11",
    "explore": "#/explore?age=8-9",
    "about": "#/about",
    "ranking-group": "#/ranking?r=g:5&age=10-11",
    "compare-cats": "#/compare?m=volkswagen-golf,ford-focus,toyota-auris&age=8-9&dv=all",
    "defects-group": "#/defects?r=g:4&age=12-13",
}

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=str(ROOT / "site"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = serve()
    base = f"http://127.0.0.1:{srv.server_port}/"
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for scheme, lang, vp in [("light", "en", (1366, 900)), ("dark", "fr", (1366, 900)), ("light", "pl", (390, 844))]:
            ctx = await b.new_context(viewport={"width": vp[0], "height": vp[1]}, color_scheme=scheme, locale=lang)
            page = await ctx.new_page()
            page.on("console", lambda m: m.type == "error" and errors.append(f"[{lang}] console: {m.text}"))
            page.on("pageerror", lambda e: errors.append(f"[{lang}] pageerror: {e}"))
            for name, route in ROUTES.items():
                if vp[0] < 500 and name not in ("ranking", "compare", "model"):
                    continue
                await page.goto(base + "?lang=" + lang + route)
                await page.wait_for_selector("#app > :not(.loading)", timeout=10000)
                await page.wait_for_timeout(500)
                overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
                if overflow:
                    errors.append(f"[{lang}] {name}: horizontal page overflow")
                await page.screenshot(path=str(OUT / f"{name}-{scheme}-{lang}-{vp[0]}.png"), full_page=True)
            await ctx.close()
        # The bundled page must also work when opened straight from disk.
        ctx = await b.new_context(viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()
        page.on("console", lambda m: m.type == "error" and errors.append(f"[file] console: {m.text}"))
        page.on("pageerror", lambda e: errors.append(f"[file] pageerror: {e}"))
        file_url = (ROOT / "site" / "index.html").as_uri()
        for name, route in ROUTES.items():
            await page.goto(file_url + route)
            try:
                await page.wait_for_selector("#app > :not(.loading)", timeout=10000)
            except Exception:
                errors.append(f"[file] {name}: did not render")
        await ctx.close()
        await b.close()
    srv.shutdown()
    print("\n".join(errors) or "no errors")
    sys.exit(1 if errors else 0)

asyncio.run(main())
