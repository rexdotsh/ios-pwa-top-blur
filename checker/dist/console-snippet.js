// Paste into the browser console. Built from checker/run.js.
(() => {
  // checker/ios-top-edge-check.js
  var MARGIN = 4;
  var THIN = 10;
  var MIN_RATIO = 0.9;
  var MAX_RATIO = 1.05;
  var NEARLY_TRANSPARENT = 0.1;
  var SOLID_ALPHA = 0.75;
  var REPLACED = new Set(["IMG", "VIDEO", "CANVAS", "IFRAME", "EMBED", "OBJECT", "svg", "INPUT", "SELECT", "TEXTAREA"]);
  var FRAMES = new Set(["IFRAME", "FRAME", "OBJECT", "EMBED"]);
  var canvas = null;
  function parseColor(win, value) {
    if (!value || value === "transparent")
      return null;
    const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) {
      const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    canvas ??= win.document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = "rgba(0, 0, 0, 0)";
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
    return a ? { r, g, b, a: a / 255 } : null;
  }
  var visible = (c) => Boolean(c && c.a > 0);
  var same = (a, b) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  var hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  var show = (c) => c ? c.a < 1 ? `${hex(c)} at ${Math.round(c.a * 100)}% alpha` : hex(c) : "none";
  var blend = (bg, fg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  function describe(el) {
    if (!el || !el.tagName)
      return String(el);
    let s = el.tagName.toLowerCase();
    if (el.id)
      s += `#${el.id}`;
    if (typeof el.className === "string" && el.className.trim())
      s += `.${el.className.trim().split(/\s+/).join(".")}`;
    return s;
  }
  function parent(el) {
    if (el.assignedSlot)
      return el.assignedSlot;
    if (el.parentElement)
      return el.parentElement;
    const root = el.getRootNode?.();
    return root && root.host ? root.host : null;
  }
  function hasRenderedChild(win, el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim())
        return true;
      if (node.nodeType === 1 && win.getComputedStyle(node).display !== "none")
        return true;
    }
    return false;
  }
  function checkTopEdge(options = {}) {
    const win = options.window ?? globalThis.window;
    const doc = win.document;
    const html = doc.documentElement;
    const cs = (el) => win.getComputedStyle(el);
    const ignored = (el) => Boolean(options.ignore && el.closest?.(options.ignore));
    const viewportConstrained = (s) => s.position === "fixed" || s.position === "sticky";
    const probe = doc.createElement("div");
    probe.style.cssText = "position:absolute;top:0;left:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none";
    let units;
    try {
      html.appendChild(probe);
      units = probe.getBoundingClientRect();
    } finally {
      probe.remove();
    }
    const fixedW = html.clientWidth || win.innerWidth;
    const fixedH = html.clientHeight || win.innerHeight;
    const lengthTop = Math.min(fixedW - 2 * MARGIN, units.width);
    const lengthSide = Math.min(fixedH - 2 * MARGIN, units.height);
    const point = { x: fixedW / 2, y: MARGIN };
    const approximate = [];
    const vv = win.visualViewport;
    if (vv && (Math.abs(vv.scale - 1) > 0.01 || vv.offsetTop || vv.offsetLeft))
      approximate.push("the page is zoomed or the visual viewport is offset");
    if (html.scrollWidth > html.clientWidth + 1)
      approximate.push("the page overflows horizontally");
    const pageBg = (() => {
      const h = parseColor(win, cs(html).backgroundColor);
      if (visible(h))
        return h;
      const b = doc.body ? parseColor(win, cs(doc.body).backgroundColor) : null;
      return visible(b) ? b : { r: 255, g: 255, b: 255, a: 1 };
    })();
    const backdrop = (s) => {
      const v = s.backdropFilter || s.webkitBackdropFilter;
      return Boolean(v && v !== "none");
    };
    const compare = (len, viewport) => len < viewport * MIN_RATIO ? "smaller" : len < viewport * MAX_RATIO ? "similar" : "larger";
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { width: Math.ceil(r.right) - Math.floor(r.left), height: Math.ceil(r.bottom) - Math.floor(r.top) };
    };
    const borderBox = (el) => typeof el.offsetWidth === "number" ? { width: el.offsetWidth, height: el.offsetHeight } : box(el);
    const hidden = (el, s) => {
      if (s.visibility === "hidden" || s.visibility === "collapse")
        return "visibility: hidden";
      if (parseFloat(s.opacity) === 0)
        return "opacity: 0";
      if (parseFloat(s.opacity) < NEARLY_TRANSPARENT)
        return `opacity ${s.opacity} < 0.1`;
      const hasBg = visible(parseColor(win, s.backgroundColor)) || s.backgroundImage && s.backgroundImage !== "none";
      if (!hasBg && !backdrop(s) && !hasRenderedChild(win, el) && !REPLACED.has(el.tagName))
        return "no background, no backdrop-filter and no content";
      return null;
    };
    const backgroundOf = (el, s) => {
      const b = borderBox(el);
      if (b.width <= THIN || b.height <= THIN)
        return { color: null, why: `its border box is ${b.width}×${b.height}px (≤ 10px on one side)` };
      if (hidden(el, s))
        return { color: null, why: "it is hidden" };
      if (compare(box(el).width, lengthTop) === "smaller")
        return { color: null, why: "it is narrower than 90%" };
      return { color: parseColor(win, s.backgroundColor), why: "it has no background-color" };
    };
    const classify = (el) => {
      const s = cs(el);
      const rect = box(el);
      const info = { el, s, position: s.position };
      if (!viewportConstrained(s))
        return { ...info, type: "not-fixed", why: `position: ${s.position}` };
      const w = compare(rect.width, lengthTop);
      const h = compare(rect.height, lengthSide);
      const hid = hidden(el, s);
      if (hid)
        return { ...info, type: "hidden", why: hid };
      const bg = parseColor(win, s.backgroundColor);
      const dimming = w !== "smaller" && h !== "smaller" && visible(bg) && !hasRenderedChild(win, el) && (parseFloat(s.opacity) < 1 || bg.a < 1);
      const pct = Math.round(rect.width / fixedW * 100);
      if (w === "smaller")
        return h !== "smaller" ? { ...info, type: "sidebar", why: `narrow (${pct}%) but full height: counted as a sidebar` } : { ...info, type: "too-small", why: `${rect.width}px wide (${pct}%) < 90% of ${lengthTop}px` };
      if (!dimming && h === "larger")
        return { ...info, type: "too-large", why: `${rect.height}px tall ≥ 105% of the viewport` };
      if (dimming)
        return { ...info, type: "dimming", why: "full-viewport translucent overlay (dimming layer)" };
      if (w === "similar" && h === "similar") {
        const z = parseInt(s.zIndex, 10);
        if (z < 0)
          return { ...info, type: "negative-z", why: `viewport-sized with z-index ${z}` };
        return { ...info, type: "viewport-sized", why: "about the size of the viewport" };
      }
      return { ...info, type: "candidate", why: `${s.position}, ${pct}% wide, ${rect.height}px tall` };
    };
    const createsLayer = (el, s) => el === html || s.position !== "static" || s.transform !== "none" || parseFloat(s.opacity) < 1 || s.filter !== "none" || backdrop(s) || s.overflowX !== "visible" || s.overflowY !== "visible" || s.clipPath && s.clipPath !== "none" || /transform|opacity/.test(s.willChange);
    const hasViewportConstrainedDescendant = (el) => {
      const walker = doc.createTreeWalker(el, 1);
      for (let n = walker.nextNode();n; n = walker.nextNode())
        if (viewportConstrained(cs(n)))
          return true;
      return false;
    };
    const skippedLayer = (el) => {
      let layer = el;
      while (layer && !createsLayer(layer, cs(layer)))
        layer = parent(layer);
      if (!layer || layer === html)
        return false;
      for (let p = layer;p; p = parent(p))
        if (viewportConstrained(cs(p)))
          return false;
      return !hasViewportConstrainedDescendant(layer);
    };
    const inconclusive = [];
    const topAt = (root, owner) => {
      for (const e of root.elementsFromPoint(point.x, point.y)) {
        if (ignored(e) || owner && e.getRootNode() !== root || skippedLayer(e))
          continue;
        if (e.shadowRoot)
          return topAt(e.shadowRoot, e) ?? e;
        return e;
      }
      return null;
    };
    const hitTest = (ignorePointerEvents) => {
      if (!ignorePointerEvents)
        return topAt(doc, null);
      const style = doc.createElement("style");
      style.textContent = "*, *::before, *::after { pointer-events: auto !important; }";
      try {
        (doc.head || html).appendChild(style);
        const stuck = [...doc.querySelectorAll("*")].filter((e) => {
          if (ignored(e) || cs(e).pointerEvents !== "none")
            return false;
          const r = e.getBoundingClientRect();
          return r.left <= point.x && point.x < r.right && r.top <= point.y && point.y < r.bottom;
        });
        if (stuck.length)
          inconclusive.push(`WebKit ignores pointer-events here, but this check couldn't override it on ${stuck.slice(0, 3).map(describe).join(", ")} (a stricter author rule or a Content-Security-Policy)`);
        return topAt(doc, null);
      } finally {
        style.remove();
      }
    };
    const walk = (ignorePointerEvents) => {
      const hit = hitTest(ignorePointerEvents);
      const steps = [];
      let color = null;
      let multiple = false;
      let foundBackdrop = false;
      let retry = false;
      const topLayer = (el) => [":modal", ":popover-open", ":fullscreen"].some((sel) => {
        try {
          return el.matches(sel);
        } catch {
          return false;
        }
      });
      if (hit && topLayer(hit)) {
        const b = parseColor(win, win.getComputedStyle(hit, "::backdrop").backgroundColor);
        return { hit, steps, container: { el: hit, position: "top layer", type: "dimming", why: "::backdrop of a top-layer element" }, color: visible(b) ? b : pageBg, foundBackdrop };
      }
      for (let el = hit;el; el = parent(el)) {
        const c = classify(el);
        if (c.type !== "hidden") {
          if (backdrop(c.s))
            foundBackdrop = true;
          else {
            const bg = backgroundOf(el, c.s).color;
            if (visible(bg)) {
              if (!color)
                color = bg;
              else if (!same(color, bg))
                multiple = true;
            }
          }
        }
        steps.push(c);
        if (["negative-z", "too-large", "hidden"].includes(c.type))
          retry = c.s.pointerEvents === "none";
        if (["viewport-sized", "dimming", "sidebar", "candidate"].includes(c.type))
          return { hit, steps, container: c, foundBackdrop, color: multiple ? null : color, multiple };
      }
      return { hit, steps, container: null, foundBackdrop, color: null, multiple, retry };
    };
    let walked = walk(true);
    if (!walked.container && walked.retry)
      walked = walk(false);
    const c = walked.container;
    if (walked.hit && FRAMES.has(walked.hit.tagName))
      inconclusive.push(`the top-centre point is over ${describe(walked.hit)}; WebKit samples subframes, this check can't`);
    for (const st of walked.steps)
      if (st.s && st.s.transform !== "none")
        approximate.push(`${describe(st.el)} is transformed`);
    const notes = [];
    let color = null;
    let colorSource = null;
    if (c) {
      notes.push(`${describe(c.el)} is the candidate: ${c.why}.`);
      if (["sidebar", "viewport-sized", "dimming"].includes(c.type))
        notes.push("Boxes like this never replace an edge colour WebKit already chose (preferExistingColor).");
      if (walked.foundBackdrop) {
        notes.push('A backdrop-filter between the hit element and the candidate marks the edge "multiple colours": WebKit fills the strip with the page background, unless it keeps an earlier solid colour (Page::updateFixedContainerEdges).');
        colorSource = "page background (multiple colours)";
      } else if (visible(walked.color)) {
        const solid = walked.color.a >= SOLID_ALPHA && c.type !== "dimming";
        color = solid ? { ...walked.color, a: 1 } : blend(pageBg, walked.color);
        colorSource = "computed background-color (estimate)";
        notes.push(solid ? `background-color ${show(walked.color)} → estimated status-bar colour ${hex(color)}.` : `background-color ${show(walked.color)} is blended over the page background${c.type === "dimming" ? " (dimming layers always are)" : ""} → estimated ${hex(color)}.`);
      } else {
        const reason = walked.multiple ? "elements between the hit point and the candidate have different background colours" : `the candidate's colour can't come from CSS: ${backgroundOf(c.el, c.s ?? cs(c.el)).why}`;
        inconclusive.push(`${reason}, so WebKit samples painted pixels 4–6px below the top, which this check can't`);
      }
    }
    const verdict = inconclusive.length ? "inconclusive" : c ? "candidate" : "none";
    const meta = doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content?.trim() ?? null;
    const statusBarStyle = {
      value: meta,
      note: meta === null || meta === "default" ? `${meta === null ? "not set" : '"default"'}, as in the setups verified on an iPhone.` : meta === "black-translucent" ? '"black-translucent": installs with it reportedly reserve no strip under the status bar, so no element can remove the blur.' : meta === "black" ? '"black": not studied here.' : `"${meta}" is not a recognised value.`
    };
    return {
      verdict,
      container: c?.el ?? null,
      hit: walked.hit,
      estimatedColor: color ? hex(color) : null,
      colorSource,
      notes,
      inconclusive,
      approximate: [...new Set(approximate)],
      statusBarStyle,
      point,
      walk: walked.steps.map((st) => ({ element: st.el, label: describe(st.el), type: st.type, why: st.why })),
      standalone: win.navigator.standalone === true || win.matchMedia("(display-mode: standalone)").matches
    };
  }
  function formatTopEdgeCheck(result) {
    const lines = [];
    if (result.verdict === "candidate")
      lines.push("CANDIDATE FOUND: WebKit's rules would pick an element for the top edge (the path that hides the blur).");
    if (result.verdict === "none")
      lines.push("NO CANDIDATE FOUND by this check: WebKit's rules would find nothing for the top edge, so the blur stays.");
    if (result.verdict === "inconclusive")
      lines.push("INCONCLUSIVE: part of WebKit's decision can't be reproduced from the DOM.");
    const meta = result.statusBarStyle;
    const metaLine = `Current apple-mobile-web-app-status-bar-style meta: ${meta.note} The value an icon was installed with can't be read from the page.`;
    if (meta.value !== null && meta.value !== "default")
      lines.push(`! ${metaLine}`);
    for (const r of result.inconclusive)
      lines.push(`? ${r}.`);
    for (const n of result.notes)
      lines.push(`· ${n}`);
    if (result.verdict === "none")
      lines.push(`· Nothing qualified at the top-centre point (${Math.round(result.point.x)}, ${result.point.y}). Walked up: ${result.walk.map((w) => `${w.label} (${w.why})`).join(" → ") || "nothing hit"}.`);
    for (const a of result.approximate)
      lines.push(`~ approximate: ${a}.`);
    if (meta.value === null || meta.value === "default")
      lines.push(`· ${metaLine}`);
    lines.push("· This is an estimate from the DOM at WebKit de94a1bcf328, not a result from iOS.");
    return lines.join(`
`);
  }
  function printTopEdgeCheck(result = checkTopEdge()) {
    const style = { candidate: "color:#16a34a", inconclusive: "color:#b45309", none: "color:#dc2626" }[result.verdict];
    console.log(`%c${formatTopEdgeCheck(result)}`, `${style};font-weight:600`);
    console.log("walk from the hit element up:", result.walk);
    if (result.container || result.hit)
      console.log("element:", result.container ?? result.hit);
    return result;
  }

  // checker/run.js
  var ATTR = "data-top-edge-check";
  var OUTLINE = "data-top-edge-outline";
  var cleanUp = () => {
    document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove());
    document.querySelectorAll(`[${OUTLINE}]`).forEach((el) => {
      const [value, priority] = JSON.parse(el.getAttribute(OUTLINE));
      el.style.setProperty("outline", value, priority);
      el.removeAttribute(OUTLINE);
    });
  };
  cleanUp();
  var result = printTopEdgeCheck(checkTopEdge({ ignore: `[${ATTR}]` }));
  var target = result.container ?? result.hit;
  var colour = { candidate: "#16a34a", inconclusive: "#b45309", none: "#dc2626" }[result.verdict];
  var box = document.createElement("div");
  box.setAttribute(ATTR, "");
  box.style.cssText = `position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:45vh;overflow:auto;
  padding:12px 14px;border-radius:12px;border:3px solid ${colour};background:#fff;color:#111;
  font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;box-shadow:0 8px 30px rgba(0,0,0,.35)`;
  box.textContent = formatTopEdgeCheck(result);
  var close = document.createElement("button");
  close.textContent = "close";
  close.style.cssText = "float:right;margin:0 0 6px 8px;font:600 13px system-ui;padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#f4f4f4;color:#111";
  box.prepend(close);
  if (target && target !== document.documentElement && target !== document.body) {
    target.setAttribute(OUTLINE, JSON.stringify([target.style.getPropertyValue("outline"), target.style.getPropertyPriority("outline")]));
    target.style.setProperty("outline", `3px dashed ${colour}`, "important");
  }
  close.onclick = cleanUp;
  document.body.appendChild(box);
})();
