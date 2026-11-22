// URL state. Everything except the language lives in the hash so links are shareable:
//   #/<view>[/<arg>]?key=value&list=a,b,c
// Hash routing keeps the site working on any static host without rewrite rules.

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = h.split("?");
  const [view = "", ...rest] = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs);
  return { view: view || "ranking", arg: rest.map(decodeURIComponent).join("/"), params };
}

/** Read helpers with defaults. */
export function reader(params) {
  return {
    str: (k, d = "") => params.get(k) ?? d,
    list: (k) => (params.get(k) || "").split(",").map((s) => s.trim()).filter(Boolean),
    num: (k, d) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : d; },
    bool: (k, d = false) => (params.has(k) ? params.get(k) === "1" : d),
  };
}

export function buildHash(view, arg, obj) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length) || v === false) continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v));
  }
  const qs = sp.toString().replace(/%2C/g, ",");
  return `#/${view}${arg ? "/" + encodeURIComponent(arg) : ""}${qs ? "?" + qs : ""}`;
}

let onReplace = () => {};
export function setReplaceHandler(fn) { onReplace = fn; }

/** Merge params into the current URL. Filter tweaks replace history; navigation pushes. */
export function update(patch, { push = false, view, arg } = {}) {
  const cur = parseHash();
  const obj = Object.fromEntries(cur.params.entries());
  for (const [k, v] of Object.entries(patch)) obj[k] = v;
  const hash = buildHash(view ?? cur.view, arg ?? cur.arg, obj);
  if (hash === location.hash) return;
  if (push) location.hash = hash;
  else { history.replaceState(null, "", hash); onReplace(); }
}

export function go(view, arg = "", params = {}) {
  location.hash = buildHash(view, arg, params);
}
