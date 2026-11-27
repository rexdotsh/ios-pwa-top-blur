# Simulator results

**Device:** iPhone 18 Pro simulator (`com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro`), runtime iOS 27.2 (24B8117), Xcode 27.2 (27B52). Safari reports `Version/27.2`. Screen 402×874 pt @3x.

**Method:** each page was opened in Safari, added with Share → View More → Add to Home Screen ("Open as Web App" on, default title), and launched from the Home Screen. Each page's diagnostics showed `navigator.standalone` true and `display-mode` standalone. Every shot was taken after a cold launch of the web app in that appearance (`simctl ui appearance light|dark`). "Scrolled" means scrolled to the end of the page, so every page shows stripes 26–36 at the same position. "Pull-down" is a held drag about 350 pt down from the top, with the finger still down when the screenshot is taken. Taken on 28 Nov 2026 against the deployed demo, whose pages match `demo/` at `5b43e60`.

## Results

- 1 · fixed: blur no, bar #0e7a4f (green), light + dark, pull-down ok
- 2 · narrow bar: blur yes, bar blurred content (#dfeee7 at top; picks up the stripes when scrolled), light + dark (dark: #111c17 at top), pull-down blurred
- 3 · thin strip: blur yes, bar blurred content (#fbfefc at top), light + dark (dark: #111311 at top), pull-down blurred
- 4 · glass bar: blur no, bar #ffffff (page background, not the bar's green), light; #111111 in dark, pull-down ok
- 5 · black-translucent: blur yes, bar green behind glass (#82bba4 light, #104731 dark), light + dark, pull-down blurred

The colours are pixels sampled in the status-bar strip, away from the clock and icons.

## Screenshots

- `before.png`: page 2, scrolled, light. `after.png`: page 1 at the same scroll position, light. Both are full 1206×2622 screenshots.
- `sim/<page>-<light|dark>-<top|scroll|pull>.png`: the top 45% of each shot, at half size. The top shots include the diagnostics' `navigator.standalone` row.
- `sim/4-glass-dark-scroll-live-switch.png`: page 4 switched to dark while it was running (see below).

## Surprises

- **Page 4 doesn't follow a live switch to dark.** When the system switched to dark while page 4 was open, the page went dark but the status bar stayed #ffffff, even after scrolling to the bottom. A cold relaunch in dark gave #111111. The README says the status bar "should follow a scheme change"; this page doesn't, at least for the page-background fallback. Page 1's bar is green in both schemes, so it doesn't test this.
- **The blur band reaches below the status bar.** On pages 2, 3 and 5 the blur extends about 105 pt down, past the 62 pt status bar, and blurs the top of the bar: the "80% wide" and "black-translucent" labels are soft.
- **The blur on pages 2 and 3 is there before any scrolling.** At scroll position 0, page 2's bar and page 3's accent line are already soft under a frosted band.
- **Page 5 has a dark clock in light mode.** With `black-translucent` the clock and icons are dark, not white. The strip is the green bar seen through light glass, and the header's label is blurred, as the README's evidence table reports.
- **The in-page checker is wrong during a pull-down.** On page 1, while the page is held past the top (visual viewport offset −139), the checker re-runs and reports "NO CANDIDATE FOUND", while the status bar stays solid green. It reports a candidate again once the page settles.
- **Insets match the README.** Pages without the tag report a layout viewport of 402×812 and `safe-area-inset-top` 0. Page 5 reports 402×874 and an inset of 62.
- **The status-bar text follows the strip.** The clock is white over page 1's green and dark over the light blur on pages 2 and 3.

All five observed results match the demo's expected results, including page 4's tint fallback (no blur, page background) and page 5 (blur stays).

The demo was redeployed during the run: page 5 moved from `/translucent/` (a 60% alpha bar) to `/black-translucent/` (page 1's opaque bar plus the tag). Every result and screenshot above comes from the redeployed site, after a cold relaunch. The icons for pages 1–4 were added before the redeploy. Their head tags didn't change, and their bar CSS only gained `box-sizing: border-box`, which has no effect with a top inset of 0. The live-switch shot of page 4 is from before the redeploy, so its heading text is the old one.
