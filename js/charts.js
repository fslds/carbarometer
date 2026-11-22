// ECharts helpers: colors come from the CSS tokens so light/dark switch in one place.

const live = new Set();
const ro = new ResizeObserver((entries) => {
  for (const e of entries) window.echarts.getInstanceByDom(e.target)?.resize();
});

export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--surface"), text: v("--text"), text2: v("--text-2"), muted: v("--muted"),
    grid: v("--grid"), axis: v("--axis"), ref: v("--ref"), accent: v("--accent"),
    good: v("--good"), bad: v("--bad"),
    divNeg: v("--div-neg"), divMid: v("--div-mid"), divPos: v("--div-pos"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
  };
}

export function disposeAll() {
  for (const c of live) { ro.unobserve(c.getDom()); c.dispose(); }
  live.clear();
}

/** Create (or reuse) a chart on el and apply a base theme merged with the option. */
export function chart(el, option) {
  const T = tokens();
  let c = window.echarts.getInstanceByDom(el);
  if (!c) {
    c = window.echarts.init(el, null, { renderer: "canvas" });
    live.add(c);
    ro.observe(el);
  }
  const axisBase = {
    axisLine: { lineStyle: { color: T.axis } },
    axisTick: { show: false },
    axisLabel: { color: T.muted, fontFamily: "inherit" },
    splitLine: { lineStyle: { color: T.grid, type: "solid" } },
    nameTextStyle: { color: T.muted },
  };
  const base = {
    backgroundColor: "transparent",
    color: T.series,
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: T.text2 },
    animationDuration: 300,
    tooltip: {
      backgroundColor: T.surface, borderColor: T.grid, borderWidth: 1,
      textStyle: { color: T.text, fontSize: 12 }, extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:8px;",
    },
    legend: { textStyle: { color: T.text2 }, icon: "roundRect", itemWidth: 14, itemHeight: 8, top: 0, type: "scroll" },
  };
  const merged = { ...base, ...option };
  merged.tooltip = option.tooltip === false ? { show: false } : { ...base.tooltip, ...(option.tooltip || {}) };
  if (option.legend !== undefined) merged.legend = option.legend === false ? { show: false } : { ...base.legend, ...option.legend };
  for (const ax of ["xAxis", "yAxis"]) {
    if (!option[ax]) continue;
    const apply = (a) => deepMerge(structuredClone(axisBase), a);
    merged[ax] = Array.isArray(option[ax]) ? option[ax].map(apply) : apply(option[ax]);
  }
  c.setOption(merged, true);
  return c;
}

function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof a[k] === "object") a[k] = deepMerge(a[k], v);
    else a[k] = v;
  }
  return a;
}

/** Diverging color for an index (100 = class average): blue below, red above, gray at 100. */
export function divColor(idx, T = tokens(), span = 60) {
  if (idx == null) return "transparent";
  const t = Math.max(-1, Math.min(1, (idx - 100) / span));
  return mix(T.divMid, t < 0 ? T.divNeg : T.divPos, Math.abs(t) * 0.85);
}

export function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return `rgb(${c.join(",")})`;
}

function hex(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Readable ink on top of a background color. */
export function inkOn(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return "inherit";
  const [r, g, b] = m.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#0b0b0b" : "#ffffff";
}
