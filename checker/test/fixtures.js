// Each fixture is a page. `expect` is the checker verdict that WebKit's rules (de94a1bcf328) call for;
// `color` is the expected estimate (null = no estimate). These test the checker, not iOS.
const G = "#0e7a4f";
const bar = (extra = "") => `.bar { position: fixed; top: 0; left: 0; right: 0; height: 52px; background: ${G}; ${extra} }`;
const BAR = `<header class="bar"></header>`;

export const FIXTURES = [
  { name: "full-width opaque fixed header", expect: "candidate", color: G, css: bar(), html: BAR },
  {
    name: "sticky header",
    expect: "candidate",
    color: G,
    css: `.bar { position: sticky; top: 0; height: 52px; background: ${G}; } .content { padding-top: 8px; }`,
    html: BAR,
  },
  {
    name: "safe-area padded bar",
    expect: "candidate",
    color: "#f6f3ec",
    css: `.bar { position: fixed; inset: 0 0 auto; box-sizing: border-box; min-height: calc(52px + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); background: #f6f3ec; }`,
    html: BAR,
  },
  { name: "header 80% wide", expect: "none", css: bar("left: 10%; right: 10%;"), html: BAR },
  { name: "header 85% wide", expect: "none", css: bar("left: 7.5%; right: 7.5%;"), html: BAR },
  { name: "header 90% wide", expect: "candidate", color: G, css: bar("left: 5%; right: 5%;"), html: BAR },
  { name: "4px strip (misses the point 4px down)", expect: "none", css: bar("height: 4px;"), html: BAR },
  { name: "6px strip (pixel-sample path)", expect: "inconclusive", color: null, css: bar("height: 6px;"), html: BAR },
  { name: "11px strip", expect: "candidate", color: G, css: bar("height: 11px;"), html: BAR },
  {
    name: "invisible 11px strip (background-clip: text)",
    expect: "candidate",
    color: G,
    css: bar("height: 11px; background-clip: text; -webkit-background-clip: text; pointer-events: none;"),
    html: BAR,
  },
  { name: "strip sized to env(safe-area-inset-top) = 0px", expect: "none", css: bar("height: env(safe-area-inset-top);"), html: BAR },
  {
    name: "glass header (backdrop-filter): edge found, no colour estimate",
    expect: "candidate",
    color: null,
    css: bar("background: rgb(14 122 79 / 50%); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);"),
    html: BAR,
  },
  { name: "80% alpha header (clamped to solid)", expect: "candidate", color: G, css: bar("background: rgb(14 122 79 / 80%);"), html: BAR },
  { name: "50% alpha header (blended over page)", expect: "candidate", color: "#87bda7", css: bar("background: rgb(14 122 79 / 50%);"), html: BAR },
  {
    name: "narrow fixed pill above the header (sibling)",
    expect: "none",
    css: bar() + `.pill { position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 30px; background: #fde047; z-index: 2; }`,
    html: BAR + `<div class="pill"></div>`,
  },
  {
    name: "narrow pill inside the header (child)",
    expect: "candidate",
    color: G,
    css: bar("display: flex; justify-content: center;") + `.pill { width: 120px; height: 30px; background: #fde047; }`,
    html: `<header class="bar"><div class="pill"></div></header>`,
  },
  { name: "header at opacity 0.05", expect: "none", css: bar("opacity: 0.05;"), html: BAR },
  { name: "header visibility: hidden", expect: "none", css: bar("visibility: hidden;"), html: BAR },
  { name: "header 8px below the top", expect: "none", css: bar("top: 8px;"), html: BAR },
  {
    name: "good header, black-translucent meta (reported separately)",
    expect: "candidate",
    color: G,
    meta: "black-translucent",
    head: `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
    css: bar(),
    html: BAR,
  },
  {
    name: "good header, \"black\" meta is not called fine",
    expect: "candidate",
    color: G,
    meta: "black",
    head: `<meta name="apple-mobile-web-app-status-bar-style" content="black">`,
    css: bar(),
    html: BAR,
  },
  { name: "header with pointer-events: none", expect: "candidate", color: G, css: bar("pointer-events: none;"), html: BAR },
  {
    name: "whole app in a fixed inset:0 frame",
    expect: "candidate",
    color: "#f6f3ec",
    css: `.frame { position: fixed; inset: 0; overflow: auto; background: #f6f3ec; }`,
    html: `<div class="frame"><div style="height:2000px"></div></div>`,
  },
  { name: "no fixed element, html background only", expect: "none", css: `html { background: ${G}; }`, html: "" },
  {
    name: "header whose full-width child has another colour",
    expect: "inconclusive",
    color: null,
    css: bar() + `.inner { height: 40px; background: #1d4ed8; }`,
    html: `<header class="bar"><div class="inner"></div></header>`,
  },
  { name: "header painted only by a gradient", expect: "inconclusive", color: null, css: bar(`background: linear-gradient(${G}, #000);`), html: BAR },

  // Regressions from review.
  {
    name: "absolute high-z badge over the bar (unrelated layer, skipped)",
    expect: "candidate",
    color: G,
    css: bar() + `.badge { position: absolute; top: 0; left: 50%; width: 80px; height: 30px; z-index: 99; background: #e11d48; }`,
    html: BAR + `<div class="badge"></div>`,
  },
  { name: "6px bar at 5% alpha (pixel path)", expect: "inconclusive", color: null, css: bar("height: 6px; background: rgb(14 122 79 / 5%);"), html: BAR },
  { name: "6px opaque bar with pointer-events: none", expect: "inconclusive", color: null, css: bar("height: 6px; pointer-events: none;"), html: BAR },
  {
    name: "6px gradient over a solid colour (pixel path)",
    expect: "inconclusive",
    color: null,
    css: bar(`height: 6px; background: linear-gradient(90deg, #e11d48, #1d4ed8) ${G};`),
    html: BAR,
  },
  {
    name: "52px gradient over a solid colour (fast path reads background-color)",
    expect: "candidate",
    color: G,
    css: bar(`background: linear-gradient(90deg, #e11d48, #1d4ed8) ${G};`),
    html: BAR,
  },
  {
    name: "open modal <dialog> (::backdrop branch)",
    expect: "candidate",
    css: `dialog { width: 200px; }`,
    html: `<dialog><p>hello</p></dialog>`,
    script: `document.querySelector("dialog").showModal();`,
  },
  {
    name: "iframe painting the colour inside a transparent fixed header",
    expect: "inconclusive",
    color: null,
    css: `.bar { position: fixed; top: 0; left: 0; right: 0; height: 52px; } .bar iframe { display: block; width: 100%; height: 52px; border: 0; }`,
    html: `<header class="bar"><iframe srcdoc="<body style='margin:0;background:${G}'></body>"></iframe></header>`,
  },
  {
    name: "fixed header inside an open shadow root",
    expect: "candidate",
    color: G,
    css: "",
    html: `<div id="host"></div>`,
    script: `document.getElementById("host").attachShadow({ mode: "open" }).innerHTML = '<style>${bar()}</style>${BAR}';`,
  },
  {
    name: "author pointer-events: none !important beats the override",
    expect: "inconclusive",
    css: bar() + `html body header.bar { pointer-events: none !important; }`,
    html: BAR,
  },
  {
    name: "CSP style-src 'none' blocks the override",
    expect: "inconclusive",
    head: `<meta http-equiv="Content-Security-Policy" content="style-src 'none'">`,
    css: "",
    html: BAR,
    script: `Object.assign(document.querySelector(".bar").style, { position: "fixed", top: "0", left: "0", right: "0", height: "52px", background: "${G}", pointerEvents: "none" }); document.body.style.margin = "0";`,
  },
  {
    name: "6px bar scaled to 12px (border box decides the path)",
    expect: "inconclusive",
    color: null,
    css: bar("height: 6px; transform: scaleY(2); transform-origin: top;"),
    html: BAR,
  },
  {
    name: "good header while pulled down past the top (simulated visual viewport offset)",
    expect: "inconclusive",
    css: bar(),
    html: BAR,
    script: `window.visualViewport = { scale: 1, width: innerWidth, height: innerHeight, offsetTop: -139, offsetLeft: 0, pageTop: -139, pageLeft: 0, addEventListener() {} };`,
  },
  {
    name: "dimming overlay: 80% black is blended, not clamped",
    expect: "candidate",
    color: "#333333",
    css: `.dim { position: fixed; inset: 0; background: rgb(0 0 0 / 80%); }`,
    html: `<div class="dim"></div>`,
  },
];

export function fixtureDoc(f) {
  let stripes = "";
  for (let i = 0; i < 30; i++) stripes += `<div style="height:70px;background:${["#e11d48", "#fde047", "#1d4ed8", "#000"][i % 4]}"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${f.head ?? ""}
<style>html, body { margin: 0; background: #fff; } .content { padding-top: 60px; } ${f.css}</style>
</head><body>${f.html}<div class="content">${stripes}</div>${f.script ? `<script>${f.script}</script>` : ""}</body></html>`;
}
