import { checkTopEdge, formatTopEdgeCheck } from "/checker/ios-top-edge-check.js";

const $ = (s) => document.querySelector(s);
const mq = (q) => matchMedia(q).matches;

function insets() {
  const p = document.createElement("div");
  p.style.cssText =
    "position:absolute;top:0;left:0;width:0;height:0;visibility:hidden;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(p);
  const s = getComputedStyle(p);
  const v = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((x) => Math.round(parseFloat(x)));
  p.remove();
  return v.join(" ");
}

function rows() {
  const modes = ["standalone", "fullscreen", "minimal-ui", "browser"].filter((m) => mq(`(display-mode: ${m})`));
  const sbs = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content ?? "not set";
  const vv = visualViewport;
  return [
    ["navigator.standalone", String(navigator.standalone)],
    ["display-mode", modes.join(", ") || "none"],
    ["safe-area t r b l", insets()],
    ["layout viewport", `${innerWidth}×${innerHeight}`],
    ["visual viewport", vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}, scale ${vv.scale.toFixed(2)}, offset ${Math.round(vv.offsetTop)}` : "n/a"],
    ["screen", `${screen.width}×${screen.height} @${devicePixelRatio}x`],
    ["colour scheme", mq("(prefers-color-scheme: dark)") ? "dark" : "light"],
    ["status-bar meta (current HTML)", `${sbs}; the installed value can't be read`],
    ["user agent", navigator.userAgent],
  ];
}

function render() {
  $("#diag").innerHTML = rows()
    .map(([k, v]) => `<tr><th>${k}</th><td>${v.replace(/</g, "&lt;")}</td></tr>`)
    .join("");
  const r = checkTopEdge();
  const out = $("#check");
  out.textContent = formatTopEdgeCheck(r);
  out.dataset.verdict = r.verdict;
}

render();
addEventListener("resize", render);
visualViewport?.addEventListener("resize", render);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
let t = 0;
addEventListener(
  "scroll",
  () => {
    clearTimeout(t);
    t = setTimeout(render, 150);
  },
  { passive: true },
);
