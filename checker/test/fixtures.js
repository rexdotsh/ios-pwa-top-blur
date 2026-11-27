// Each fixture is a page; `expect` is what WebKit's rules (de94a1bcf328) predict for it.
const G = "#0e7a4f";
const bar = (extra = "") => `.bar { position: fixed; top: 0; left: 0; right: 0; height: 52px; background: ${G}; ${extra} }`;
const BAR = `<header class="bar"></header>`;

export const FIXTURES = [
  { name: "full-width opaque fixed header", expect: "pass", color: G, css: bar(), html: BAR },
  {
    name: "sticky header",
    expect: "pass",
    color: G,
    css: `.bar { position: sticky; top: 0; height: 52px; background: ${G}; } .content { padding-top: 8px; }`,
    html: BAR,
  },
  {
    name: "safe-area padded bar",
    expect: "pass",
    color: "#f6f3ec",
    css: `.bar { position: fixed; inset: 0 0 auto; min-height: calc(52px + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); background: #f6f3ec; }`,
    html: BAR,
  },
  { name: "header 80% wide", expect: "fail", css: bar("left: 10%; right: 10%;"), html: BAR },
  { name: "header 85% wide", expect: "fail", css: bar("left: 7.5%; right: 7.5%;"), html: BAR },
  { name: "header 90% wide", expect: "pass", color: G, css: bar("left: 5%; right: 5%;"), html: BAR },
  { name: "4px strip (misses the point 4px down)", expect: "fail", css: bar("height: 4px;"), html: BAR },
  { name: "6px strip (pixel-sample path)", expect: "warn", color: G, css: bar("height: 6px;"), html: BAR },
  { name: "11px strip", expect: "pass", color: G, css: bar("height: 11px;"), html: BAR },
  {
    name: "invisible 11px strip (background-clip: text)",
    expect: "pass",
    color: G,
    css: bar("height: 11px; background-clip: text; -webkit-background-clip: text; pointer-events: none;"),
    html: BAR,
  },
  { name: "strip sized to env(safe-area-inset-top) = 0px", expect: "fail", css: bar("height: env(safe-area-inset-top);"), html: BAR },
  {
    name: "glass header (backdrop-filter)",
    expect: "warn",
    color: "#ffffff",
    css: bar("background: rgb(14 122 79 / 50%); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);"),
    html: BAR,
  },
  { name: "80% alpha header (clamped to solid)", expect: "pass", color: G, css: bar("background: rgb(14 122 79 / 80%);"), html: BAR },
  { name: "50% alpha header (blended over page)", expect: "pass", color: "#87bda7", css: bar("background: rgb(14 122 79 / 50%);"), html: BAR },
  {
    name: "narrow pill above the header (sibling)",
    expect: "fail",
    css: bar() + `.pill { position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 30px; background: #fde047; z-index: 2; }`,
    html: BAR + `<div class="pill"></div>`,
  },
  {
    name: "narrow pill inside the header (child)",
    expect: "pass",
    color: G,
    css: bar("display: flex; justify-content: center;") + `.pill { width: 120px; height: 30px; background: #fde047; }`,
    html: `<header class="bar"><div class="pill"></div></header>`,
  },
  { name: "header at opacity 0.05", expect: "fail", css: bar("opacity: 0.05;"), html: BAR },
  { name: "header visibility: hidden", expect: "fail", css: bar("visibility: hidden;"), html: BAR },
  { name: "header 8px below the top", expect: "fail", css: bar("top: 8px;"), html: BAR },
  {
    name: "good header but black-translucent",
    expect: "fail",
    head: `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
    css: bar(),
    html: BAR,
  },
  { name: "header with pointer-events: none", expect: "pass", color: G, css: bar("pointer-events: none;"), html: BAR },
  {
    name: "whole app in a fixed inset:0 frame",
    expect: "warn",
    color: "#f6f3ec",
    css: `.frame { position: fixed; inset: 0; overflow: auto; background: #f6f3ec; }`,
    html: `<div class="frame"><div style="height:2000px"></div></div>`,
  },
  { name: "no fixed element, html background only", expect: "fail", css: `html { background: ${G}; }`, html: "" },
  {
    name: "header whose full-width child has another colour",
    expect: "warn",
    color: "#1d4ed8",
    css: bar() + `.inner { height: 40px; background: #1d4ed8; }`,
    html: `<header class="bar"><div class="inner"></div></header>`,
  },
  {
    name: "header painted only by a gradient",
    expect: "warn",
    css: bar(`background: linear-gradient(${G}, #000);`),
    html: BAR,
  },
];

export function fixtureDoc(f) {
  let stripes = "";
  for (let i = 0; i < 30; i++) stripes += `<div style="height:70px;background:${["#e11d48", "#fde047", "#1d4ed8", "#000"][i % 4]}"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${f.head ?? ""}
<style>html, body { margin: 0; background: #fff; } .content { padding-top: 60px; } ${f.css}</style>
</head><body>${f.html}<div class="content">${stripes}</div></body></html>`;
}
