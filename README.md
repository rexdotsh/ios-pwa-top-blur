# iOS web app top blur

Since iOS 26, web apps added to the Home Screen can show a frosted blur over the status bar when content scrolls under it, and `theme-color` doesn't change it. This repo collects what is known about why: what was checked on a device, what other developers report, and what WebKit's source says. It also gives a fix that worked on an iPhone with iOS 27, a checker that estimates WebKit's decision from the DOM, and a demo.

**Live demo:** https://ios-pwa-top-blur-demo.rexdotsh.workers.dev

## TL;DR

In `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- No apple-mobile-web-app-status-bar-style (or content="default"). Not "black-translucent". -->
```

At the start of `<body>`:

```html
<header class="top-bar">…</header>
```

```css
.top-bar {
  box-sizing: border-box;
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  min-height: calc(44px + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  background-color: #fff;                 /* opaque; no backdrop-filter */
}
main { padding-top: calc(44px + env(safe-area-inset-top)); }  /* content starts below the bar */
```

On an iPhone with iOS 27, this pattern turned the status bar into a solid band in the bar's colour, with no blur ([evidence](#evidence)).

If you **changed the status-bar meta tag** (for example, removed `black-translucent`), test with a fresh install: delete the Home Screen icon and add it again. Reports say the tag is captured when the icon is added. CSS-only changes don't need this. Removing the icon may also remove the app's storage, sign-ins and notification permission; that wasn't checked here.

## Contents

- [Evidence](#evidence)
- [What the blur is](#what-the-blur-is)
- [WebKit's rules](#webkits-rules)
- [What doesn't work](#what-doesnt-work)
- [Undo the "move content down" workaround](#undo-the-move-content-down-workaround)
- [Recipes](#recipes)
- [The checker](#the-checker)
- [Demo](#demo)
- [Sources](#sources)

## Evidence

Three kinds, kept apart throughout:

**Checked on a device for this repo** (iPhone, iOS 27, fresh installs; which colour scheme was on wasn't recorded):

| Setup | Result |
| --- | --- |
| Fixed, full width, 52px, opaque bar; `apple-mobile-web-app-status-bar-style` `default` (a production app) | No blur |
| Fixed, full width, safe area + 44px, opaque header; no status-bar tag (a test page; the same pattern as demo page 1) | No blur |

**Other developers' device reports:**

| Setup | Reported result | Source |
| --- | --- | --- |
| Opaque sticky header, no `black-translucent` | No blur | iPhone, iOS 27: [magpie#3515][magpie]; device report and Simulator: [ovis#199][ovis-199] |
| Invisible 11px strip (`background-clip: text`) | Status bar takes its colour, no blur | iPhone 15 Pro, iOS 27: [zenn][zenn]; iPhone, iOS 26: [planestro#574][planestro] |
| `opacity: 0.05`, `display: none`, 50% wide candidates | Rejected, blur stays | [zenn][zenn] |
| Installed with `black-translucent` | Blur stays whatever the page does; with a sticky header the bar takes its colour but the header's content is blurred | [zenn][zenn]; [ovis#164][ovis-164] and [ovis#199][ovis-199] |
| `default` status-bar style alone, no qualifying element | Blur stays | iPhone: [planestro#574][planestro] |
| No status-bar tag | Layout viewport shrinks by the status bar's height; `env(safe-area-inset-top)` is 0 | [zenn][zenn] |

**WebKit source**, `main` at [`de94a1bcf328`][head] (27 Nov 2026): the [rules below](#webkits-rules). Shipping iOS builds may differ from `main`. The Home Screen app shell that hosts the page is closed source, so what it reserves at the top for each install isn't visible in the source either.

## What the blur is

iOS 26 brought Liquid Glass, and with it the *scroll edge effect*: a soft, progressive blur where scrolling content meets system UI. WebKit calls it the *scroll pocket*. Native apps control it with `UIScrollEdgeEffect`. Pages get no API: no meta tag, no manifest key, no CSS property.

In an installed web app, the system UI at the top is the status bar. When the page scrolls under it, the status bar sits on a frosted, fading band. Reports from iOS 27 describe the band reaching well below the status bar ([bug 329103][bug-329103]).

On iPhone, WebKit hides that blur when it paints a solid **colour extension** over the strip behind the status bar. The colour comes from a fixed or sticky element at the top of the page, so the fix is to give WebKit an element it accepts.

<!-- Screenshot slot: docs/before.png (demo page 2, installed, scrolled) and docs/after.png (demo page 1),
     with notes in docs/simulator-results.md. Add an image table here once those files exist. -->

## WebKit's rules

These describe the soft iPhone scroll pocket in WebKit [`de94a1bcf328`][head]. Each rule links to the code.

**When the fill can exist**

1. **The fill needs a covered strip at the top.** WebKit draws the top fill only when the hosting app reports a covered ("obscured") top inset above 0 ([`_updateFixedColorExtensionViews`][update-views]). Sampling the top edge starts when that inset is above 0, or continues if an edge already exists ([`sidesRequiringFixedContainerEdges`][sides]). The feature is on wherever Liquid Glass is on ([`defaultContentInsetBackgroundFillEnabled`][pref]).
   - What the Home Screen shell reports isn't in the public source. Developer measurements match this reading: with no status-bar tag the status bar is a covered strip ([zenn][zenn]), and with `black-translucent` nothing is covered, so no fill can appear (see [Evidence](#evidence)).
   - Apple's comment on [bug 317153][bug-317153] deprecates `black-translucent` ("Please remove this key, and the status bar should automatically appear in the same color as the webpage. Home Screen web apps does not support drawing arbitrary content below the status bar"). It doesn't describe the mechanism.
2. **On iPhone, a visible fill hides the blur, with exceptions.** [`_shouldHideTopScrollPocket`][hide-pocket] returns yes for explicit hide reasons, and no when the pocket is needed for a visible content inset or the scroll view uses the hard edge style (iPad). Otherwise it follows the top colour extension ([`_updateHiddenScrollPocketEdges`][hidden-edges]).

**Which element counts** ([`LocalFrameView::fixedContainerEdges`][fce])

3. **One hit test, at the top centre, 4px down.** WebKit takes the rect fixed elements are laid out in (the layout viewport, in the ordinary unzoomed case), clamps it to the document and shrinks it by 4px on each side ([margin][margin], [contract][contract]). It then hit-tests the midpoint of its top edge ([`midpointOnSide`][midpoint], [hit test][hittest]). The first pass ignores CSS `pointer-events`. A second pass honours them only if the first pass hit a hidden, oversized or negative-z box with `pointer-events: none` ([retry][retry]).
4. **That hit test skips unrelated layers.** A layer that isn't fixed or sticky and has no fixed or sticky ancestor or descendant is skipped ([`RenderLayer::hitTestLayer`][renderlayer]). An absolutely positioned badge over your bar doesn't block it; normal-flow content and other fixed elements do.
5. **It walks up from the hit element to the first fixed or sticky box that qualifies** ([walk][walk], [`containerEdgeCandidateResult`][candidate]). A narrow element *inside* the bar is fine, because the walk reaches the bar. A narrow *fixed* element beside it, such as a pill over the top centre, ends the walk without a candidate.
6. **Size.** Lengths are compared with the smaller of the shrunken rect and the CSS viewport-unit size, using the element's transformed bounding box rounded outwards ([`compareWithViewportSize`][compare]):
   - **Width:** at least 0.9 × that, which is 0.9 × (viewport width − 8px) in the ordinary case. It was 0.8 until [`8b209a7da992`][c-90] (Aug 2025).
   - **Narrow but full height:** counted as a sidebar.
   - **Height ≥ 105%:** rejected, unless it's a dimming layer (an empty, translucent, full-viewport box).
   - **Viewport-sized:** rejected with a negative `z-index`.
   - **Sidebars, dimming layers and viewport-sized boxes** never replace an edge colour already chosen ([`preferExistingColor`][prefer]).
7. **Visible.** `visibility: hidden`, `opacity` below 0.1, or no background, no `backdrop-filter` and no content: skipped ([`isHiddenOrNearlyTransparent`][hidden]).
8. **Colour, fast path.** If the untransformed border box is more than 10px in both directions, WebKit uses the computed `background-color` ([`primaryBackgroundColorForRenderer`][primary], [`thinBorderWidth`][thin]). Pixels aren't read, so:
   - a gradient over a solid colour gives the solid colour;
   - an empty box that declares a colour but paints nothing (`background-clip: text`) still counts.

   Elements between the hit point and the candidate that have different background colours send it to the slow path. The fast path arrived in [`92b9c7857ee5`][c-fast] (Apr 2025).
9. **Colour, slow path.** WebKit snapshots a 2px row 4–6px below the top ([`fixedContainerSampleRect`][sample-rect]), moved down past a visible top border of up to 10px ([sampling rect][sampling-rect]):
   - **What's painted:** only fixed and sticky layers, including background images and subframes, without text.
   - **Samples:** about 29 at an integer stride. One colour (or near-identical ones) on more than 67% of them wins; otherwise the edge is "multiple colours" ([`predominantColor`][predominant]).
   - **Mostly transparent winner:** no edge at all.
10. **Alpha.** At 0.75 or more the colour is treated as solid; below that it is blended over the page background. Dimming layers are always blended ([`finishedFixedContainerColor`][finished]).
11. **`backdrop-filter` anywhere between the hit element and the candidate** marks the edge "multiple colours" ([backdrop][backdrop]). It still counts as an edge, so the fill exists, but it uses the page's background colour ([fallback][fallback], [`hasFixedEdge`][has-edge]). Rule 12 can keep an earlier solid colour instead.

**Over time**

12. **Edges are retained** ([`Page::updateFixedContainerEdges`][page-update]). WebKit keeps the previous element and colour when a sample finds no edge, or finds one with no usable colour while the previous one had a colour. That lasts as long as the previous element still renders and is `visibility: visible`; a top `<header>` is kept even when hidden.
    - Opacity isn't checked here, so fading an element out doesn't release its edge. `display: none` or removing it does.
    - [zenn][zenn] hands the edge over instead: the departing header drops below `opacity: 0.1`, so it stops qualifying as a candidate (rule 7), and a replacement strip wins the next sample.
13. **No top sampling while the page is pulled down past the top** ([sides to sample][overscroll]), so the previous edge is kept during the stretch. Separately, WKWebView stopped growing the fill during the stretch when there's no refresh control ([`7aa2c5c21594`][c-stretch]). That commit is titled after web apps, but it changes WKWebView; it doesn't show how the Home Screen shell is configured.

WebKit's edge code never reads `theme-color`. `apple-mobile-web-app-status-bar-style` doesn't appear in WebKit at all; the closed-source shell handles it.

## What doesn't work

| Attempt | Why |
| --- | --- |
| `theme-color` (with or without `media`), manifest `theme_color` | The edge code never reads it. |
| Only changing `apple-mobile-web-app-status-bar-style` | At most it affects whether a strip is reserved (rule 1); WebKit still needs a qualifying element. Reported failing on its own: [planestro#574][planestro]. |
| A strip with `height: env(safe-area-inset-top)` | With no status-bar tag the inset is reported as 0 ([zenn][zenn]), so the strip is 0px tall. |
| `html`/`body` background colour | Used as the fill colour only when an edge exists but its colour is "multiple" (rule 11). With no fixed element there's no edge. |
| Manifest `display: fullscreen` | This code never looks at the display mode; [bug 325807][bug-325807] reports the blur stays. `minimal-ui` wasn't tested there. |
| Moving content down by the band's height | The blur stays; content just starts below it and still scrolls under it. |
| A thin accent line (1–4px) at the top | Doesn't reach the hit point 4px down (rule 3). |

**Mixed reports:** `viewport-fit=cover` isn't read by the edge code, yet one comment on [bug 325807][bug-325807] says removing it made the scrim disappear, while other reports keep it. Untested here. Removing it also loses edge-to-edge layout in landscape.

**Tint fallback, not a failure:** a translucent glass bar with `backdrop-filter` should still remove the blur, but the status bar takes the page background (or a retained earlier colour) instead of the bar's colour (rules 11–12). This comes from source only; it wasn't checked on a device.

## Undo the "move content down" workaround

If your app keeps `black-translucent` and pushes content below the blurred band:

1. **Remove `black-translucent`.** Delete the `apple-mobile-web-app-status-bar-style` tag, or set it to `default`. Keep `viewport-fit=cover`.
2. **Remove the extra top offset**, e.g. `padding-top: calc(env(safe-area-inset-top) + 40px)`, from the page and the header.
3. **Make the header fixed (or sticky), full width, opaque, at `top: 0`**, with no `backdrop-filter`. Use `box-sizing: border-box` and keep `padding-top: env(safe-area-inset-top)` on the bar itself. It is reported as 0 in a fresh install without the tag, but it's still correct in a Safari tab and in older installs.
4. **Offset the content by the bar's height**, as in the TL;DR.
5. **Move narrow fixed elements away from the top centre**: pills, toasts, "new posts" buttons. Put them below the bar or inside it (rule 5).
6. **Ship the bar in the HTML**, not only from JavaScript, so it's there on the first paint.
7. **Check full-height layouts.** Without `black-translucent`, `100vh` and `100lvh` were reported to include the status bar's height in installed apps ([bug 316008][bug-316008]), making a "full-height" shell scroll. `100dvh` or `height: 100%` are alternatives; check on your devices.
8. **Run [the checker](#the-checker).**
9. **Test with a fresh install** (delete the icon, add it again). Existing installs may keep the old status-bar style. Removing an icon may also remove that app's storage, sign-ins and notification permission (not checked here), so plan how you tell users.
10. **Optional:** `html { overscroll-behavior-y: none; }` stops the stretch at the top. It isn't needed for the edge (rule 13). Not checked on a device.

## Recipes

### Plain fixed bar (checked on a device)

The TL;DR. Any opaque `background-color` works; the status bar should take that colour.

### Light and dark

```css
:root { --bar: #f6f3ec; }
@media (prefers-color-scheme: dark) { :root { --bar: #151411; } }

html, body { background-color: var(--bar); } /* fill colour for "multiple" (rule 11) and the area shown when pulled down */
.top-bar { background-color: var(--bar); }   /* plus the TL;DR rules */
```

On iPhone the top colour may change after scrolling ([`defaultTopContentInsetBackgroundCanChangeAfterScrolling`][can-change]; on iPad it locks after the first interaction), so the status bar should follow a scheme change. Blur removal with a bar like this was checked on a device; that the colour switches live was not.

### Sticky header (other developers' reports)

```css
.top-bar { position: sticky; top: 0; z-index: 10; min-height: 44px; background-color: #fff; }
```

A sticky box counts like a fixed one whenever it covers the hit point (rules 3–5). [magpie#3515][magpie] reports this on an iPhone with iOS 27.

### Glass header with a solid status bar (not checked on a device)

```html
<div class="status-strip" aria-hidden="true"></div>
<header class="top-bar glass">…</header>
```

```css
.status-strip {
  position: fixed; top: 0; left: 0; right: 0; height: 11px; /* > 10px: colour read from CSS */
  z-index: 2147483647; pointer-events: none;                 /* the element at the hit point */
  background-color: #f6f3ec;                                 /* the status bar's colour */
  -webkit-background-clip: text; background-clip: text;      /* declares the colour, paints nothing */
}
.top-bar.glass { background: rgb(246 243 236 / 60%); backdrop-filter: blur(20px); }
```

The strip is what the hit test finds. It isn't an ancestor of the glass header, so the `backdrop-filter` isn't on the walk (rule 11). The invisible strip on its own is reported working on iOS 27 ([zenn][zenn]); the combination with a glass header is untested.

### App shells where the document doesn't scroll

Add the fixed bar anyway; the rules don't care which element scrolls. A full-viewport fixed frame with a background also counts, as a viewport-sized box (rule 6). It never replaces a colour already chosen, so a real bar is more predictable.

## The checker

[`checker/ios-top-edge-check.js`](checker/ios-top-edge-check.js) estimates rules 3–11 from the DOM in any browser. It finds the element WebKit would hit-test, walks up to the candidate and explains each step. It is not iOS, and it says so.

| Verdict | Meaning |
| --- | --- |
| `candidate` | WebKit's rules would pick this element for the top edge. Includes an estimated colour when it can come from CSS. |
| `none` | No candidate found by this check: by WebKit's rules the blur would stay. |
| `inconclusive` | Part of the decision can't be reproduced from the DOM: the pixel-sample path, subframes, or a `pointer-events` override that didn't apply. |

```text
NO CANDIDATE FOUND by this check: WebKit's rules would find nothing for the top edge, so the blur stays.
· Nothing qualified at the top-centre point (195, 4). Walked up: header.top-bar (312px wide (80%) < 90% of 382px)
  → body (position: static) → html (position: static).
· Current apple-mobile-web-app-status-bar-style meta: not set, as in the setups verified on an iPhone.
  The value an icon was installed with can't be read from the page.
```

**Running it**

- **Console:** paste [`checker/dist/console-snippet.js`](checker/dist/console-snippet.js). It logs the result, outlines the element and shows a panel. This is the most reliable way.
- **Bookmarklet:** [`checker/dist/bookmarklet.txt`](checker/dist/bookmarklet.txt), or the link on the [demo index](https://ios-pwa-top-blur-demo.rexdotsh.workers.dev). It ran from the live link in Chromium. Saving or syncing it as a Safari bookmark, and pages with a strict Content-Security-Policy, weren't checked.
- **Module:**
  ```js
  import { checkTopEdge, formatTopEdgeCheck } from "./ios-top-edge-check.js";
  const result = checkTopEdge(); // { verdict, container, estimatedColor, notes, inconclusive, approximate, statusBarStyle, walk, … }
  console.log(formatTopEdgeCheck(result));
  ```
- **On the iPhone:** turn on Settings → Apps → Safari → Advanced → Web Inspector. Connect the phone to a Mac, open the installed app, pick it under Safari's Develop menu and paste the snippet.

**Limits**

- **One moment only.** It can't see retained edges (rule 12), what the shell reserved (rule 1) or the status-bar style an icon was installed with. It reports the current meta tag separately.
- **Approximate geometry:**
  - transforms, pinch zoom, horizontal overflow and a visual viewport offset from the layout viewport are flagged as approximate;
  - which boxes form a layer (rule 4) is estimated from CSS;
  - WebKit walks the render tree while the checker walks the DOM, including open shadow roots, which can differ for `display: contents`.
- **Pointer events.** WebKit ignores `pointer-events` in its first pass. The checker emulates that with a temporary stylesheet. When a stricter author rule or a CSP keeps an element at the point at `pointer-events: none`, the result is `inconclusive`.

**Reading symptoms**

| You see | Likely cause |
| --- | --- |
| Blur, and your header's colour under it | Installed with `black-translucent` (rule 1, reports): remove it and test a fresh install. |
| Blur, status bar plain white or black | No qualifying element: run the checker. |
| No blur, but the status bar is the page background | `backdrop-filter` or mixed colours on the way up (rules 9, 11). |
| A colour stays after the header slides away | The old element still renders and is visible, so its edge is retained (rule 12). Remove it with `display: none`, or hand over to another element as [zenn][zenn] does. |

**Tests.** [`checker/test/`](checker/test/index.html) runs 38 fixture pages through the checker, with expected verdicts taken from the source. They test the checker's reading of WebKit's rules, not iOS. All 38 pass in headless Chromium. Run them with `bun run serve` and open `/checker/test/`, or use the [live copy](https://ios-pwa-top-blur-demo.rexdotsh.workers.dev/checker/test/).

## Demo

https://ios-pwa-top-blur-demo.rexdotsh.workers.dev has five pages, each its own installable app with its own manifest:

1. **fixed:** the TL;DR. The same pattern as the test page checked on an iPhone.
2. **narrow bar:** 80% wide. Prediction from source.
3. **thin strip:** 4px. Prediction from source.
4. **glass bar:** the tint fallback experiment. Prediction from source.
5. **black-translucent:** page 1 plus that tag only. Based on other developers' reports.

Each page shows its install state, safe-area insets, layout and visual viewport, the current status-bar meta tag and the checker's estimate.

```sh
bun run serve    # build and serve on http://localhost:4173
bun run deploy   # build, then deploy demo/ with Wrangler 4.149.0 (needs Cloudflare credentials)
```

No dependencies besides Bun; `scripts/build.js` bundles the checker and writes `demo/public/`.

## Sources

**WebKit source** (at [`de94a1bcf328`][head])

- [`LocalFrameView::fixedContainerEdges`][fce]: the hit test, walk, size, visibility and colour rules
- [`RenderLayer::hitTestLayer`][renderlayer]: unrelated layers skipped while sampling
- [`PageColorSampler`][pcs-h]: thresholds; [`predominantColor`][predominant], [`finishedFixedContainerColor`][finished]
- [`Page::updateFixedContainerEdges`][page-update]: retention, no top sampling while overscrolled
- [`WKWebView _updateFixedColorExtensionViews`][update-views], [`_shouldHideTopScrollPocket`][hide-pocket]: the fill and the blur
- [`WebPage::sidesRequiringFixedContainerEdges`][sides]: which sides are sampled
- Upstream tests: [modal dialog][test-dialog], [subframes][test-subframes]

**WebKit commits**

- [`92b9c7857ee5`][c-fast] (293340@main, Apr 2025): colour from `background-color` before snapshotting
- [`383ba72d1640`][c-suppress] (296293@main, Jun 2025): SPI to hide the top colour extension
- [`8b209a7da992`][c-90] (298506@main, Aug 2025): width threshold 80% → 90%; viewport-sized boxes never replace a colour
- [`7aa2c5c21594`][c-stretch] (313186@main, May 2026): WKWebView fill height during the top stretch

**WebKit bugs**

- [317153][bug-317153]: Apple deprecates `black-translucent`
- [301756][bug-301756]: Apple: the colour extension exists for fixed/sticky elements next to a covered inset
- [325807][bug-325807]: iOS 27 web apps can't draw under the status bar or set its colour at runtime (several differing reports)
- [329103][bug-329103]: iOS 27 top-edge blur in web apps covers app content
- [319479][bug-319479]: `backdrop-filter` on a top bar disables tint sampling
- [316008][bug-316008]: `100vh` in web apps without a status-bar style

**Developer reports**

- [zenn: iOS 27 PWA top-edge blur, toggled from the page][zenn] (Japanese; device-tested, source-read)
- [Modern Web Weekly #80: So what's up with the iOS 27 blur?][mww]
- [planestro#574][planestro], [ovis#164][ovis-164], [ovis#199][ovis-199], [magpie#3515][magpie], [meshmonitor#5309][meshmonitor]
- [Ben Frain: Safari 26 tab tinting with fixed elements][frain], [andesco/safari-color-tinting][andesco], [exsesx.dev: invisible tint sampler][exsesx]
- [WebKit Features in Safari 26.0][safari-26]: every Home Screen site opens as a web app

## License

[MIT](LICENSE) © rexdotsh

[head]: https://github.com/WebKit/WebKit/tree/de94a1bcf328766c89d837665a03d0f87c470208
[fce]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2351-L2761
[hidden]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2337-L2349
[thin]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2372
[contract]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2385-L2391
[compare]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2426-L2440
[midpoint]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2442-L2456
[primary]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2458-L2473
[candidate]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2489-L2541
[hittest]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2544-L2558
[walk]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2605-L2649
[sampling-rect]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2662-L2711
[retry]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2715-L2718
[backdrop]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2725-L2728
[prefer]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2730-L2734
[renderlayer]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/rendering/RenderLayer.cpp#L4985-L4998
[pcs-h]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/PageColorSampler.h#L45-L46
[margin]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/PageColorSampler.h#L46
[sample-rect]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/PageColorSampler.cpp#L302-L319
[finished]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/PageColorSampler.cpp#L321-L329
[predominant]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/PageColorSampler.cpp#L331-L426
[page-update]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/Page.cpp#L5876-L5894
[overscroll]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/Page.cpp#L5853-L5874
[has-edge]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/platform/FixedContainerEdges.cpp#L35-L44
[update-views]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/UIProcess/API/Cocoa/WKWebView.mm#L3619-L3702
[fallback]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/UIProcess/API/Cocoa/WKWebView.mm#L3636-L3646
[hidden-edges]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/UIProcess/API/Cocoa/WKWebView.mm#L3807-L3818
[hide-pocket]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm#L2528-L2540
[sides]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/WebProcess/WebPage/Cocoa/WebPageCocoa.mm#L1783-L1820
[pref]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/Shared/Cocoa/WebPreferencesDefaultValuesCocoa.mm#L193-L199
[can-change]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebKit/Shared/Cocoa/WebPreferencesDefaultValuesCocoa.mm#L160-L167
[test-dialog]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/LayoutTests/fast/page-color-sampling/color-sampling-modal-dialog.html
[test-subframes]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/LayoutTests/fast/page-color-sampling/color-sampling-includes-subframes.html
[c-fast]: https://github.com/WebKit/WebKit/commit/92b9c7857ee51709dd45301037020c3b86c24be8
[c-suppress]: https://github.com/WebKit/WebKit/commit/383ba72d164097ef9f267981d102d19a5bb0b577
[c-90]: https://github.com/WebKit/WebKit/commit/8b209a7da992cc5728c936b41afc2ae5dbafd2e5
[c-stretch]: https://github.com/WebKit/WebKit/commit/7aa2c5c2159457a055b3de29283644fff1b7cb35
[bug-317153]: https://bugs.webkit.org/show_bug.cgi?id=317153#c2
[bug-301756]: https://bugs.webkit.org/show_bug.cgi?id=301756#c2
[bug-325807]: https://bugs.webkit.org/show_bug.cgi?id=325807
[bug-329103]: https://bugs.webkit.org/show_bug.cgi?id=329103
[bug-319479]: https://bugs.webkit.org/show_bug.cgi?id=319479
[bug-316008]: https://bugs.webkit.org/show_bug.cgi?id=316008
[zenn]: https://zenn.dev/uakihir0/articles/260920-ios27-pwa-blur
[mww]: https://modernwebweekly.substack.com/p/so-whats-up-with-the-ios27-blur
[planestro]: https://github.com/gravesisme/planestro/pull/574
[ovis-164]: https://github.com/devswha/ovis/issues/164
[ovis-199]: https://github.com/devswha/ovis/pull/199
[magpie]: https://github.com/yetone/magpie/issues/3515
[meshmonitor]: https://github.com/Yeraze/meshmonitor/pull/5309
[frain]: https://benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements
[andesco]: https://github.com/andesco/safari-color-tinting
[exsesx]: https://exsesx.dev/blog/en/safari-26-invisible-tint-sampler
[safari-26]: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
