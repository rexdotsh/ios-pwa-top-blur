// Demo pages. Each is its own installable web app under /<id>/.
const GREEN = "#0e7a4f";

const bar = (extra = "") => `
.top-bar {
  box-sizing: border-box;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  min-height: calc(44px + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  background-color: ${GREEN};
  color: #fff;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font: 600 17px/44px system-ui, -apple-system, sans-serif;
  ${extra}
}`;

// basis: "device" = the same setup was checked on an iPhone (iOS 27); "reports" = other developers' device reports;
// "source" = predicted from WebKit's source only.
export const PAGES = [
  {
    n: 1,
    id: "fixed",
    title: "fixed",
    ok: true,
    basis: "device",
    summary: "Full-width, opaque, fixed bar at top: 0. No status-bar tag.",
    expect: "No blur; the status bar is solid green. The same pattern was checked on an iPhone with iOS 27.",
    css: bar(),
    html: `<header class="top-bar">fixed</header>`,
  },
  {
    n: 2,
    id: "narrow",
    title: "narrow bar",
    basis: "source",
    summary: "The same bar, 80% wide. WebKit wants at least 0.9 × (viewport width − 8px).",
    expect: "Predicted from WebKit's source: the bar is too narrow to count, so the blur stays.",
    css: bar("left: 10%; right: 10%;"),
    html: `<header class="top-bar">80% wide</header>`,
  },
  {
    n: 3,
    id: "thin",
    title: "thin strip",
    basis: "source",
    summary: "A 4px accent line at the top. WebKit tests the point 4px down, which a 4px strip doesn't reach.",
    expect: "Predicted from WebKit's source: the blur stays.",
    css: bar("min-height: 0; height: 4px; padding: 0;"),
    html: `<div class="top-bar"></div>`,
  },
  {
    n: 4,
    id: "glass",
    title: "glass bar (tint fallback experiment)",
    basis: "source",
    summary: "Translucent bar with backdrop-filter. WebKit still counts it as the edge, but marks its colour as \"multiple\".",
    expect: "Predicted from WebKit's source: no blur, but the status bar takes the page background (white or near-black), not the bar's green.",
    css: bar("background-color: rgb(14 122 79 / 50%); -webkit-backdrop-filter: blur(20px) saturate(1.8); backdrop-filter: blur(20px) saturate(1.8);"),
    html: `<header class="top-bar">glass</header>`,
  },
  {
    n: 5,
    id: "black-translucent",
    title: "black-translucent",
    basis: "reports",
    summary: "Exactly page 1, except for apple-mobile-web-app-status-bar-style: black-translucent.",
    expect: "Based on developer reports, not checked here: the blur stays over the bar, because the app reserves no strip under the status bar for WebKit to fill.",
    statusBarStyle: "black-translucent",
    css: bar(),
    html: `<header class="top-bar">black-translucent</header>`,
  },
];
