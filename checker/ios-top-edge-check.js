// Reproduces WebKit's top-edge decision (LocalFrameView::fixedContainerEdges at WebKit de94a1bcf328)
// in any browser, so you can see why an installed iOS web app keeps its status-bar blur.
// No dependencies. Usage: checkTopEdge() → result; printTopEdgeCheck(result) logs it.

const MARGIN = 4; // PageColorSampler::fixedContainerSampleRectMargin
const THIN = 10; // thinBorderWidth: at or below this, the colour comes from a pixel sample
const MIN_RATIO = 0.9; // compareWithViewportSize: below this → too small
const MAX_RATIO = 1.05; // at or above this → larger than the viewport
const NEARLY_TRANSPARENT = 0.1; // nearlyTransparentAlphaThreshold
const SOLID_ALPHA = 0.75; // minimumOpacityThresholdToClampToSolidColor
const SAMPLES = 29; // predominantColor sampleCount
const REPLACED = new Set(["IMG", "VIDEO", "CANVAS", "IFRAME", "EMBED", "OBJECT", "svg", "INPUT", "SELECT", "TEXTAREA"]);

let canvas = null;

function parseColor(win, value) {
  if (!value || value === "transparent") return null;
  const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  // Other syntaxes (oklch(), color(), …): let a canvas resolve them to sRGB.
  canvas ??= win.document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = "rgba(0, 0, 0, 0)";
  canvas.fillStyle = value;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
  return a ? { r, g, b, a: a / 255 } : null;
}

const visible = (c) => Boolean(c && c.a > 0);
const same = (a, b) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
const similar = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2 <= 36;
const hex = (c) => (c ? `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` : "none");
const show = (c) => (c ? (c.a < 1 ? `${hex(c)} at ${Math.round(c.a * 100)}% alpha` : hex(c)) : "none");

function describe(el) {
  if (!el || !el.tagName) return String(el);
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  if (typeof el.className === "string" && el.className.trim()) s += `.${el.className.trim().split(/\s+/).join(".")}`;
  return s;
}

function parent(el) {
  if (el.assignedSlot) return el.assignedSlot;
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode?.();
  return root && root.host ? root.host : null;
}

function hasRenderedChild(win, el) {
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent.trim()) return true;
    if (node.nodeType === 1 && win.getComputedStyle(node).display !== "none") return true;
  }
  return false;
}

export function checkTopEdge(options = {}) {
  const win = options.window ?? globalThis.window;
  const doc = win.document;
  const html = doc.documentElement;
  const cs = (el) => win.getComputedStyle(el);

  const vw = Math.min(html.clientWidth || win.innerWidth, win.innerWidth);
  const vh = Math.min(html.clientHeight || win.innerHeight, win.innerHeight);
  const lengthTop = vw - 2 * MARGIN;
  const lengthSide = vh - 2 * MARGIN;
  const point = { x: vw / 2, y: MARGIN };

  const pageBg = (() => {
    const h = parseColor(win, cs(html).backgroundColor);
    if (visible(h)) return h;
    const b = doc.body ? parseColor(win, cs(doc.body).backgroundColor) : null;
    return visible(b) ? b : { r: 255, g: 255, b: 255, a: 1 };
  })();

  const backdrop = (s) => {
    const v = s.backdropFilter || s.webkitBackdropFilter;
    return Boolean(v && v !== "none");
  };

  const compare = (len, viewport) => (len < viewport * MIN_RATIO ? "smaller" : len < viewport * MAX_RATIO ? "similar" : "larger");

  const hidden = (el, s) => {
    if (s.visibility === "hidden" || s.visibility === "collapse") return "visibility: hidden";
    if (parseFloat(s.opacity) === 0) return "opacity: 0";
    if (parseFloat(s.opacity) < NEARLY_TRANSPARENT) return `opacity ${s.opacity} < 0.1`;
    const hasBg = visible(parseColor(win, s.backgroundColor)) || (s.backgroundImage && s.backgroundImage !== "none");
    if (!hasBg && !backdrop(s) && !hasRenderedChild(win, el) && !REPLACED.has(el.tagName)) return "no background, no backdrop-filter and no content";
    return null;
  };

  const backgroundOf = (el, s, rect) => {
    if (rect.width <= THIN || rect.height <= THIN) return { color: null, why: `${Math.round(rect.width)}×${Math.round(rect.height)}px is ≤ 10px on one side` };
    if (hidden(el, s)) return { color: null, why: "hidden" };
    if (compare(rect.width, lengthTop) === "smaller") return { color: null, why: "narrower than 90%" };
    return { color: parseColor(win, s.backgroundColor), why: "" };
  };

  // Mirrors containerEdgeCandidateResult().
  const classify = (el) => {
    const s = cs(el);
    const rect = el.getBoundingClientRect();
    const info = { el, s, rect, position: s.position };
    if (s.position !== "fixed" && s.position !== "sticky") return { ...info, type: "not-fixed", why: `position: ${s.position}` };
    const w = compare(rect.width, lengthTop);
    const h = compare(rect.height, lengthSide);
    const hid = hidden(el, s);
    if (hid) return { ...info, type: "hidden", why: hid };
    const bg = parseColor(win, s.backgroundColor);
    const dimming =
      w !== "smaller" && h !== "smaller" && visible(bg) && !hasRenderedChild(win, el) && (parseFloat(s.opacity) < 1 || bg.a < 1);
    const pct = Math.round((rect.width / vw) * 100);
    if (w === "smaller")
      return h !== "smaller"
        ? { ...info, type: "sidebar", why: `narrow (${pct}%) but full height: counted as a sidebar` }
        : { ...info, type: "too-small", why: `${Math.round(rect.width)}px wide (${pct}%) < 90% of ${lengthTop}px` };
    if (!dimming && h === "larger") return { ...info, type: "too-large", why: `${Math.round(rect.height)}px tall ≥ 105% of the viewport` };
    if (dimming) return { ...info, type: "dimming", why: "full-viewport translucent overlay (dimming layer)" };
    if (w === "similar" && h === "similar") {
      const z = parseInt(s.zIndex, 10);
      if (z < 0) return { ...info, type: "negative-z", why: `viewport-sized with z-index ${z}` };
      return { ...info, type: "viewport-sized", why: "about the size of the viewport" };
    }
    return { ...info, type: "candidate", why: `${s.position}, ${pct}% wide, ${Math.round(rect.height)}px tall` };
  };

  const hitTest = (ignorePointerEvents) => {
    let style = null;
    if (ignorePointerEvents) {
      style = doc.createElement("style");
      style.textContent = "*, *::before, *::after { pointer-events: auto !important; }";
      (doc.head || html).appendChild(style);
    }
    const stack = doc.elementsFromPoint(point.x, point.y).filter((e) => !(options.ignore && e.closest?.(options.ignore)));
    style?.remove();
    return stack[0] ?? null;
  };

  const walk = (ignorePointerEvents) => {
    const hit = hitTest(ignorePointerEvents);
    const steps = [];
    let color = null;
    let multiple = false;
    let foundBackdrop = false;
    let retry = false;
    for (let el = hit; el; el = parent(el)) {
      const c = classify(el);
      if (c.type !== "hidden") {
        if (backdrop(c.s)) foundBackdrop = true;
        else {
          const bg = backgroundOf(el, c.s, c.rect).color;
          if (visible(bg)) {
            if (!color) color = bg;
            else if (!same(color, bg)) multiple = true;
          }
        }
      }
      steps.push(c);
      if (["negative-z", "too-large", "hidden"].includes(c.type)) retry = c.s.pointerEvents === "none";
      if (["viewport-sized", "dimming", "sidebar", "candidate"].includes(c.type))
        return { hit, steps, container: c, foundBackdrop, color: multiple ? null : color, multiple };
    }
    return { hit, steps, container: null, foundBackdrop, color: null, multiple, retry };
  };

  let walked = walk(true);
  if (!walked.container && walked.retry) walked = walk(false);

  const rules = [];
  const add = (id, ok, text, el = null) => rules.push({ id, ok, text, element: el });

  const sbs = doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content ?? null;
  add(
    "status-bar-style",
    sbs !== "black-translucent",
    sbs === "black-translucent"
      ? 'apple-mobile-web-app-status-bar-style is "black-translucent": iOS reserves no strip under the status bar, so nothing can replace the blur. Remove it and re-add the icon.'
      : `apple-mobile-web-app-status-bar-style is ${sbs ? `"${sbs}"` : "not set"} (fine). It is read when the icon is added.`,
  );

  const c = walked.container;
  add(
    "fixed-container",
    Boolean(c),
    c
      ? `${describe(c.el)} is a ${c.position} element covering the top-centre point (${Math.round(point.x)}, ${point.y}).`
      : `No fixed or sticky element at the top-centre point (${Math.round(point.x)}, ${point.y}). Hit ${describe(walked.hit)}; walked up: ${walked.steps
          .map((st) => `${describe(st.el)} (${st.why})`)
          .join(" → ")}.`,
    c?.el ?? walked.hit,
  );

  let verdict = "fail";
  let color = null;
  let colorSource = null;

  if (c) {
    if (c.type === "sidebar" || c.type === "viewport-sized" || c.type === "dimming")
      add("size", true, `${describe(c.el)}: ${c.why}. It works, but it never replaces an edge colour already chosen (preferExistingColor).`, c.el);
    else add("size", true, `${describe(c.el)}: ${c.why} (needs ≥ 90% of ${lengthTop}px, < 105% of the viewport height).`, c.el);

    add(
      "backdrop-filter",
      !walked.foundBackdrop,
      walked.foundBackdrop
        ? "A backdrop-filter between the hit element and the container makes the edge \"multiple colours\": the strip is filled with the page background instead of the bar's colour."
        : "No backdrop-filter on the way up.",
      c.el,
    );

    if (walked.foundBackdrop) {
      verdict = "warn";
      color = pageBg;
      colorSource = "page background (backdrop-filter)";
    } else if (visible(walked.color)) {
      const solid = walked.color.a >= SOLID_ALPHA && c.type !== "dimming";
      color = solid ? { ...walked.color, a: 1 } : blend(pageBg, walked.color);
      colorSource = "background-color";
      add(
        "colour",
        true,
        solid
          ? `background-color ${show(walked.color)} → status bar ${hex(color)}.`
          : `background-color ${show(walked.color)} is below 75% alpha, so it is blended over the page background → ${hex(color)}.`,
        c.el,
      );
      verdict = c.type === "candidate" ? "pass" : "warn";
    } else {
      const reason = walked.multiple
        ? "elements between the hit point and the container have different background colours"
        : backgroundOf(c.el, c.s, c.rect).why || "the container has no background-color";
      const sampled = sampleRow();
      add(
        "colour",
        Boolean(sampled.color || sampled.unknown),
        `No colour from CSS (${reason}), so WebKit snapshots rows 4–6 of fixed/sticky layers. Approximation here: ${sampled.text}`,
        c.el,
      );
      if (sampled.color) {
        verdict = "warn";
        color = sampled.color.a >= SOLID_ALPHA ? { ...sampled.color, a: 1 } : blend(pageBg, sampled.color);
        colorSource = "pixel sample (approximate)";
      } else if (sampled.multiple) {
        verdict = "warn";
        color = pageBg;
        colorSource = "page background (mixed colours in the sample)";
      } else if (sampled.unknown) {
        verdict = "warn";
        colorSource = "pixel sample of an image (unknown here)";
      }
    }
  }

  if (!rules[0].ok) verdict = "fail";
  if (verdict === "fail") color = null;

  function sampleRow() {
    const counts = [];
    let total = 0;
    let image = false;
    for (let i = 0; i < SAMPLES; i++) {
      const x = MARGIN + ((vw - 2 * MARGIN) * i) / (SAMPLES - 1);
      const stack = doc.elementsFromPoint(Math.min(x, vw - 1), MARGIN + 1);
      let found = null;
      for (const e of stack) {
        if (options.ignore && e.closest?.(options.ignore)) continue;
        let fixed = false;
        for (let p = e; p; p = parent(p)) {
          const ps = cs(p).position;
          if (ps === "fixed" || ps === "sticky") {
            fixed = true;
            break;
          }
        }
        if (!fixed) continue;
        const es = cs(e);
        const bg = parseColor(win, es.backgroundColor);
        if (visible(bg)) {
          found = bg;
          break;
        }
        if (es.backgroundImage && es.backgroundImage !== "none") {
          image = true;
          break;
        }
      }
      if (image) return { color: null, multiple: false, unknown: true, text: "a background image or gradient is painted there; JavaScript can't read its pixels. Check on a device." };
      if (!found) continue;
      total++;
      const bucket = counts.find((b) => similar(b.color, found));
      if (bucket) bucket.n++;
      else counts.push({ color: found, n: 1 });
    }
    counts.sort((a, b) => b.n - a.n);
    if (!total) return { color: null, multiple: false, text: "nothing fixed/sticky with a background at y = 5px → no edge, blur stays." };
    if (counts[0].n > 0.67 * SAMPLES)
      return { color: counts[0].color, multiple: false, text: `${show(counts[0].color)} covers ${counts[0].n}/${SAMPLES} samples (> 67%).` };
    return { color: null, multiple: true, text: `no colour covers > 67% of ${SAMPLES} samples (top: ${show(counts[0].color)} ${counts[0].n}/${SAMPLES}) → filled with the page background.` };
  }

  const standalone = win.navigator.standalone === true || win.matchMedia("(display-mode: standalone)").matches;
  return {
    verdict,
    blurHidden: verdict !== "fail",
    statusBarColor: color ? hex(color) : null,
    colorSource,
    container: c?.el ?? null,
    hit: walked.hit,
    point,
    viewport: { width: vw, height: vh },
    walk: walked.steps.map((st) => ({ element: st.el, label: describe(st.el), type: st.type, why: st.why })),
    rules,
    standalone,
  };
}

function blend(bg, fg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

export function formatTopEdgeCheck(result) {
  const head = {
    pass: "PASS: the status bar should be solid, no blur",
    warn: "PASS WITH CAVEATS: the blur should hide, but read the notes",
    fail: "FAIL: the status bar will keep its blur",
  }[result.verdict];
  const lines = [head];
  if (result.statusBarColor) lines.push(`status bar colour: ${result.statusBarColor} (from ${result.colorSource})`);
  for (const r of result.rules) lines.push(`${r.ok ? "✓" : "✗"} ${r.text}`);
  if (!result.standalone) lines.push("note: not running as an installed web app; the result describes what the installed app would do.");
  return lines.join("\n");
}

export function printTopEdgeCheck(result = checkTopEdge()) {
  const style = { pass: "color:#16a34a", warn: "color:#b45309", fail: "color:#dc2626" }[result.verdict];
  console.log(`%c${formatTopEdgeCheck(result)}`, `${style};font-weight:600`);
  console.log("walk from the hit element up:", result.walk);
  if (result.container || result.hit) console.log("element:", result.container ?? result.hit);
  return result;
}
