// Demo pages. Each is its own installable web app under /<id>/.
const GREEN = "#0e7a4f";

const bar = (extra = "") => `
.top-bar {
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

export const PAGES = [
  {
    n: 1,
    id: "fixed",
    title: "fixed",
    ok: true,
    summary: "Full-width, opaque, fixed bar at top: 0. No status-bar tag.",
    expect: "No blur. The status bar is solid green and stays green while you scroll.",
    css: bar(),
    html: `<header class="top-bar">fixed</header>`,
  },
  {
    n: 2,
    id: "narrow",
    title: "narrow bar",
    summary: "Same bar, but 80% wide. WebKit wants at least 90% of the viewport width.",
    expect: "Blur stays: the bar is too narrow to count.",
    css: bar("left: 10%; right: 10%;"),
    html: `<header class="top-bar">80% wide</header>`,
  },
  {
    n: 3,
    id: "thin",
    title: "thin strip",
    summary: "A 4px accent line at the top. WebKit tests the point 4px down, which a 4px strip doesn't reach.",
    expect: "Blur stays.",
    css: bar("min-height: 0; height: 4px; padding: 0;"),
    html: `<div class="top-bar"></div>`,
  },
  {
    n: 4,
    id: "glass",
    title: "glass bar",
    summary: "Translucent bar with backdrop-filter. WebKit treats it as \"multiple colours\".",
    expect: "From source (not checked on a device): no blur, but the status bar takes the page background, not the bar's green.",
    css: bar("background-color: rgb(14 122 79 / 50%); -webkit-backdrop-filter: blur(20px) saturate(1.8); backdrop-filter: blur(20px) saturate(1.8);"),
    html: `<header class="top-bar">glass</header>`,
  },
  {
    n: 5,
    id: "translucent",
    title: "translucent + black-translucent",
    summary: "The old recipe: apple-mobile-web-app-status-bar-style black-translucent and a 60% alpha bar drawn under the status bar.",
    expect: "Blur stays over the bar: with black-translucent, iOS reserves no strip for WebKit to fill.",
    statusBarStyle: "black-translucent",
    css: bar("background-color: rgb(14 122 79 / 60%);"),
    html: `<header class="top-bar">black-translucent</header>`,
  },
];
