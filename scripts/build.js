// bun scripts/build.js → checker/dist/ (console snippet, bookmarklet) and demo/public/ (the deployed demo).
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES } from "../checker/test/fixtures.js";
import { PAGES } from "../demo/pages.js";
import { iconPng } from "./png.js";

const root = join(import.meta.dir, "..");
const REPO = "https://github.com/rexdotsh/ios-pwa-top-blur";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

async function bundle(minify) {
  const out = await Bun.build({ entrypoints: [join(root, "checker/run.js")], format: "iife", minify, target: "browser" });
  if (!out.success) throw new AggregateError(out.logs, "checker build failed");
  return (await out.outputs[0].text()).trim();
}

const snippet = await bundle(false);
const bookmarklet = `javascript:${encodeURIComponent(await bundle(true))}`;
mkdirSync(join(root, "checker/dist"), { recursive: true });
writeFileSync(join(root, "checker/dist/console-snippet.js"), `// Paste into the browser console. Built from checker/run.js.\n${snippet}\n`);
writeFileSync(join(root, "checker/dist/bookmarklet.txt"), `${bookmarklet}\n`);

const pub = join(root, "demo/public");
rmSync(pub, { recursive: true, force: true });
mkdirSync(join(pub, "checker/test"), { recursive: true });
cpSync(join(root, "checker/ios-top-edge-check.js"), join(pub, "checker/ios-top-edge-check.js"));
cpSync(join(root, "checker/test"), join(pub, "checker/test"), { recursive: true });
cpSync(join(root, "checker/dist"), join(pub, "checker/dist"), { recursive: true });
cpSync(join(root, "demo/static"), join(pub, "static"), { recursive: true });

const BASIS = { device: "verified", reports: "reported", source: "prediction" };
const STRIPES = ["THE QUICK BROWN FOX", "JUMPS OVER", "THE LAZY DOG", "SCROLL ME UP", "IS IT BLURRY?"];
const stripes = Array.from({ length: 36 }, (_, i) => `<div class="stripe s${i % 6}">${String(i + 1).padStart(2, "0")} ▸ ${STRIPES[i % STRIPES.length]}</div>`).join("\n");

function page(p) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
${p.statusBarStyle ? `<meta name="apple-mobile-web-app-status-bar-style" content="${p.statusBarStyle}">\n` : ""}<meta name="apple-mobile-web-app-title" content="${p.n} ${esc(p.id)}">
<link rel="manifest" href="/${p.id}/manifest.webmanifest">
<link rel="apple-touch-icon" href="/${p.id}/icon-180.png">
<title>${p.n} · ${esc(p.title)}</title>
<link rel="stylesheet" href="/static/demo.css">
<style>${p.css}</style>
</head>
<body>
${p.html}
<main>
<section class="card">
<h1>${p.n} · ${esc(p.title)}</h1>
<p>${esc(p.summary)}</p>
<p><b>Expected when installed:</b> ${esc(p.expect)}</p>
<p class="mute">Scroll the stripes up under the status bar. <a href="/">All demo pages</a></p>
<table id="diag"></table>
<pre id="check">checking…</pre>
</section>
${stripes}
</main>
<script type="module" src="/static/diag.js"></script>
</body>
</html>
`;
}

function manifest(p) {
  const base = `/${p.id}/`;
  return JSON.stringify(
    {
      id: base,
      name: `${p.n} ${p.title}`,
      short_name: `${p.n} ${p.id}`,
      start_url: base,
      scope: base,
      display: "standalone",
      icons: [
        { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
        { src: `${base}icon-512.png`, sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  );
}

for (const p of PAGES) {
  const dir = join(pub, p.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page(p));
  writeFileSync(join(dir, "manifest.webmanifest"), manifest(p));
  const colour = p.ok ? [14, 122, 79] : [168, 52, 42];
  for (const size of [180, 192, 512]) writeFileSync(join(dir, `icon-${size}.png`), iconPng(p.n, size, colour));
}

const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>iOS web app top blur: demo</title>
<style>
  body { margin: 0 auto; max-width: 800px; padding: 20px 16px 60px; font: 15px/1.5 system-ui, -apple-system, sans-serif; color: #111; background: #fff; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 24px 0 8px; }
  a { color: #1d4ed8; } code { font: 13px ui-monospace, Menlo, monospace; background: #f3f3f3; padding: 1px 4px; border-radius: 4px; }
  ul.pages { list-style: none; padding: 0; margin: 0; border: 1px solid #e5e5e5; border-radius: 12px; }
  ul.pages li { padding: 10px 14px; border-top: 1px solid #eee; } ul.pages li:first-child { border-top: 0; }
  .tag { display: inline-block; min-width: 70px; font: 700 12px system-ui; color: #fff; border-radius: 6px; padding: 1px 6px; margin-right: 6px; text-align: center; }
  .ok { background: #16a34a; } .bad { background: #dc2626; }
  .mute { color: #555; font-size: 14px; }
</style>
</head>
<body>
<h1>iOS web app top blur: demo</h1>
<p class="mute">Installed web apps on iOS 26/27 blur the status bar when content scrolls under it. Page 1 is a setup checked on an iPhone with iOS 27; the others are common mistakes, with predictions from WebKit's source or other developers' reports. Write-up: <a href="${REPO}">${REPO.replace("https://", "")}</a></p>

<h2>Try it</h2>
<ol>
<li>Open a page below in Safari on an iPhone.</li>
<li>Share → <b>Add to Home Screen</b>, with <b>Open as Web App</b> on. Every page is its own app.</li>
<li>Open it from the Home Screen and scroll the stripes up under the clock.</li>
</ol>
<p class="mute">Each page shows its install state, safe-area insets and the checker's estimate (from the DOM, not from iOS). The status-bar meta tag is read when the icon is added; the pages here never change it, so a fresh install of each is the comparison to make.</p>

<h2>Pages</h2>
<ul class="pages">
${PAGES.map((p) => `<li><span class="tag ${p.ok ? "ok" : "bad"}">${BASIS[p.basis]}</span><a href="/${p.id}/"><b>${p.n} · ${esc(p.title)}</b></a><br><span class="mute">${esc(p.summary)}</span></li>`).join("\n")}
</ul>

<h2>Checker</h2>
<ul>
<li><a href="/checker/ios-top-edge-check.js">ios-top-edge-check.js</a> (ES module) and the <a href="/checker/dist/console-snippet.js">console snippet</a>.</li>
<li>Bookmarklet: drag <a href="${esc(bookmarklet)}">top-edge check</a> to your bookmarks bar.</li>
<li><a href="/checker/test/">Fixture tests</a>: ${FIXTURES.length} pages run through the checker in your browser. They test the checker's reading of WebKit's rules, not iOS.</li>
</ul>
</body>
</html>
`;
writeFileSync(join(pub, "index.html"), index);
writeFileSync(
  join(pub, "_headers"),
  `/*\n  Cache-Control: no-cache\n/*.webmanifest\n  Content-Type: application/manifest+json\n`,
);

console.log(`built checker/dist (${snippet.length} B snippet, ${bookmarklet.length} B bookmarklet) and demo/public (${PAGES.length} pages)`);
