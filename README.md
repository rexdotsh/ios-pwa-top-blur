# iOS web app top blur

Since iOS 26, web apps added to the Home Screen draw a frosted blur over the status bar when content scrolls under it, and `theme-color` no longer changes it. This repo explains why, lists the exact rules WebKit uses (with links into WebKit's source), and gives the fix, a checker and a demo.

**Live demo:** https://ios-pwa-top-blur-demo.rexdotsh.workers.dev

## TL;DR

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- No apple-mobile-web-app-status-bar-style, or content="default". Never "black-translucent". -->
<header class="top-bar">…</header>
```

```css
.top-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  min-height: calc(44px + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  background-color: #fff; /* opaque, and no backdrop-filter */
}
```

Then **delete the Home Screen icon and add it again.** iOS reads the status-bar style when the icon is added, so an app installed while it used `black-translucent` keeps the blur whatever the page does now.

With this, the status bar becomes a solid band in the bar's colour and the blur is gone (checked on an iPhone running iOS 27).

## Contents

- [What the blur is](#what-the-blur-is)
- [The rules WebKit applies](#the-rules-webkit-applies)
- [What doesn't work, and why](#what-doesnt-work-and-why)
- [Undo the "move content down" workaround](#undo-the-move-content-down-workaround)
- [Recipes](#recipes)
- [Debugging and the checker](#debugging-and-the-checker)
- [What has been verified on a device](#what-has-been-verified-on-a-device)
- [Sources](#sources)

## What the blur is

iOS 26 brought Liquid Glass, and with it the *scroll edge effect*: a soft, progressive blur where scrolling content meets system UI. WebKit calls it the *scroll pocket*. Native apps control it with `UIScrollEdgeEffect`. Web pages get no API for it: no meta tag, no manifest key, no CSS property.

In an installed web app, the system UI at the top is the status bar. When the page scrolls under it, the status bar sits on a frosted, fading band instead of a solid colour. On iOS 27 the band reaches well below the status bar and can blur the app's own header.

WebKit hides that blur in one situation only: when it paints a solid **colour extension** over the strip behind the status bar. The colour comes from a fixed or sticky element at the top of the page. So the fix is to give WebKit an element it accepts.

| Before (no qualifying element) | After (fixed opaque bar) |
| --- | --- |
| _screenshot pending: demo page 2 installed, scrolled_ | _screenshot pending: demo page 1 installed, scrolled_ |

<!-- Screenshots: install /narrow/ and /fixed/ from the demo, scroll the stripes under the status bar, take a screenshot of each, crop to the top ~300px and save as docs/before.png and docs/after.png. -->

## The rules WebKit applies

All links point at WebKit `main` at [`de94a1bcf328`][head] (27 Nov 2026).

**When it runs at all**

1. **The app must reserve a strip at the top.** WebKit only samples the top edge when the hosting app reports a covered ("obscured") inset there ([`WebPage::sidesRequiringFixedContainerEdges`][sides]), and it only draws the fill when that inset is above 0 ([`_updateFixedColorExtensionViews`][update-views]). The feature is on wherever Liquid Glass is on ([`defaultContentInsetBackgroundFillEnabled`][pref]).
   - With no status-bar tag (or `default`), the status bar is a covered strip and this works.
   - With `black-translucent`, the page draws under the status bar, so nothing is covered, no fill is ever drawn and **the blur can't be removed**. The Home Screen app shell that sets this up is closed source; this behaviour comes from developer measurements ([zenn][zenn]) and from Apple's comment on [bug 317153][bug-317153]:
     > The black-translucent status bar mode has been deprecated for multiple releases because it semantically can't work with dark mode and across different webpage styles. Please remove this key, and the status bar should automatically appear in the same color as the webpage. Home Screen web apps does not support drawing arbitrary content below the status bar.
2. **The fill hides the blur.** On iPhone, [`_shouldHideTopScrollPocket`][hide-pocket] returns true when the top colour extension is visible, and [`_updateHiddenScrollPocketEdges`][hidden-edges] hides the top edge effect accordingly. The colour and the blur are one switch.

**Which element counts** ([`LocalFrameView::fixedContainerEdges`][fce])

3. **One hit test, at the top centre, 4px down.** The area where fixed elements are laid out is shrunk by 4px on each side ([`fixedContainerSampleRectMargin`][margin], [contract][contract]), and WebKit hit-tests the midpoint of its top edge ([`midpointOnSide`][midpoint], [hit test][hittest]). The first pass ignores CSS `pointer-events` ([retry][retry]).
4. **It walks up from the hit element to the first fixed or sticky box that qualifies** ([walk][walk], [`containerEdgeCandidateResult`][candidate]). A narrow element *inside* your bar is fine, because the walk reaches the bar. A narrow fixed element *beside* it (a sibling such as a pill, toast or badge sitting over the top centre) ends the walk at `<body>`, and nothing qualifies.
5. **Width: at least 0.9 × (viewport width − 8px)** ([`compareWithViewportSize`][compare]), about 88% on an iPhone. It was 0.8 until [`8b209a7da992`][c-90] (11 Aug 2025).
6. **Height: under 105% of the viewport.** A box about the size of the viewport in both directions (an app frame, a modal overlay) still counts, but it never *replaces* an edge colour already chosen ([`preferExistingColor`][prefer]).
7. **Visible.** Boxes with `visibility: hidden`, `opacity` below 0.1, or no background, no `backdrop-filter` and no content are skipped ([`isHiddenOrNearlyTransparent`][hidden]).
8. **Colour, fast path: more than 10px in both directions → `background-color` from the computed style** ([`primaryBackgroundColorForRenderer`][primary], [`thinBorderWidth`][thin]). Pixels aren't read, so an element that declares a colour but paints nothing (`background-clip: text` on an empty box) still counts. This fast path arrived in [`92b9c7857ee5`][c-fast] (Apr 2025).
9. **Colour, slow path: 10px or less, or mixed background colours on the way up → pixel sample.** WebKit snapshots a 2px row ([`fixedContainerSampleRect`][sample-rect]) 4–6px below the top, painting only fixed and sticky layers without text or images. It takes 29 samples and needs one colour (or near-identical ones) on more than 67% of them ([`predominantColor`][predominant]). A 6px strip can pass this way; a 4px strip misses the hit point entirely.
10. **Alpha ≥ 0.75 is treated as solid; below that the colour is blended over the page background** ([`finishedFixedContainerColor`][finished]).
11. **Any `backdrop-filter` between the hit element and the container makes the edge "multiple colours"** ([backdrop][backdrop]). It still counts as an edge, so the blur hides, but the strip is filled with the page's background colour instead of the bar's ([fallback][fallback], [`hasFixedEdge`][has-edge]).

**Over time**

12. **Edges stick.** When a frame finds no element, the previous edge is kept as long as the previous element still renders and is visible ([`Page::updateFixedContainerEdges`][page-update]). A top `<header>` keeps it even while `visibility: hidden`. An element that slides away with `transform` keeps its edge; it is released by `display: none` or removal. ([zenn][zenn] hit this on a device.)
13. **No re-sampling while pulled down.** The top edge isn't sampled while the page is rubber-banding past the top ([sides to sample][overscroll]), so a fixed bar keeps its colour when you pull down. In web apps without a refresh control the fill doesn't grow during the stretch ([`7aa2c5c21594`][c-stretch], "Fixed headers in web apps may be obscured during top scroll stretch", which also shows Home Screen web apps use this code).

WebKit's edge code never reads `theme-color`, and `apple-mobile-web-app-status-bar-style` doesn't appear in WebKit at all: it is handled by the closed-source app shell.

## What doesn't work, and why

| Attempt | Why it fails |
| --- | --- |
| `theme-color` (with or without `media`), manifest `theme_color` | The edge code never reads it ([rule list](#the-rules-webkit-applies)). |
| Only changing `apple-mobile-web-app-status-bar-style` | It decides whether a strip is reserved (rule 1), but WebKit still needs a qualifying element (rules 3–11). Reported failing alone: [planestro#574][planestro]. |
| A strip with `height: env(safe-area-inset-top)` | Without `black-translucent`, the status bar isn't part of the page, so the inset is **0** and the strip is 0px tall. Measured on iOS 27 by [zenn][zenn]: the layout viewport shrank by exactly the status bar's 59px and `env(safe-area-inset-top)` read 0. |
| `html`/`body` background colour | Only used as the fallback colour when an edge exists but its colour is mixed (rule 11). With no fixed element there is no edge, so the blur stays. |
| Manifest `display: fullscreen` or `minimal-ui` | This code never looks at the display mode. Reported not to help: [bug 325807][bug-325807]. |
| Removing or adding `viewport-fit=cover` | Not read by the edge code. One unconfirmed report says removing it hides the blur ([bug 325807][bug-325807]); you also lose edge-to-edge layout in landscape. |
| Moving content down by the band's height | The blur is still there; content just starts below it at rest and still scrolls under it. |
| A translucent glass bar (`backdrop-filter`) | Counts as an edge, but the status bar takes the page background, not the bar's colour (rule 11). From source, not checked on a device. |
| A thin accent line (1–4px) at the top | Doesn't reach the hit point 4px down (rule 3). |

## Undo the "move content down" workaround

If your app keeps `black-translucent` and pushes content below the blurred band, switch to the fix:

1. **Remove `black-translucent`.** Delete the `apple-mobile-web-app-status-bar-style` tag, or set it to `default`. Keep `viewport-fit=cover`.
2. **Remove the extra top offset** (`padding-top: calc(env(safe-area-inset-top) + 40px)` and similar) from the page and the header.
3. **Make the header fixed (or sticky), full width, opaque, at `top: 0`**, with no `backdrop-filter`. Keep `padding-top: env(safe-area-inset-top)` on the bar itself: it is 0 in the installed app now, but still correct in a Safari tab, in landscape and for anyone still on an old install.
4. **Offset the content by the bar's height**, e.g. `padding-top: calc(44px + env(safe-area-inset-top))` on the main column.
5. **Check nothing narrow is fixed over the top centre**: pills, toasts, "new posts" buttons. Move them below the bar or inside it (rule 4).
6. **Ship the bar in the HTML**, not only from JavaScript, so it is there on the first paint.
7. **Watch out for `100vh`.** Without `black-translucent`, `100vh` and `100lvh` include the status bar's height ([bug 316008][bug-316008]), so a "full height" shell becomes scrollable. Use `100dvh` or `height: 100%`.
8. **Run the [checker](#debugging-and-the-checker)** on the page.
9. **Delete the Home Screen icon and add it again**, and tell your users to do the same. Nothing changes for an existing install until then.
10. **Optional: `html { overscroll-behavior-y: none; }`** if you don't want the rubber-band stretch at the top. From source, the edge survives pulling down anyway (rule 13). Not checked on a device.

## Recipes

### Plain fixed bar (verified on a device)

The TL;DR above. Any solid `background-color` works; the status bar takes that exact colour.

### Light and dark

```css
:root { --bar: #f6f3ec; }
@media (prefers-color-scheme: dark) { :root { --bar: #151411; } }

html, body { background-color: var(--bar); } /* fallback colour (rule 11) and the pull-down area */
.top-bar { /* as in the TL;DR */ background-color: var(--bar); }
```

On iPhone the top colour may change after scrolling ([`defaultTopContentInsetBackgroundCanChangeAfterScrolling`][can-change]; on iPad it locks after the first interaction), so the status bar should follow the bar's colour when the scheme changes. A bar like this has been confirmed blur-free on a device. That the colour switches live between schemes is from source, not separately checked.

### Sticky header

```css
.top-bar { position: sticky; top: 0; z-index: 10; background-color: #fff; min-height: 44px; }
```

Sticky boxes count like fixed ones (rule 4) once they are stuck at the top. A header that only becomes sticky further down the page doesn't count until it reaches the top. [magpie#3515][magpie] reports an opaque sticky header removing the blur on an iPhone with iOS 27; [ovis#199][ovis-199] reports the same on a device and in the Simulator.

### Glass header that still gets a solid status bar (unverified on a device)

Keep the glass look below the status bar, and give WebKit an invisible strip above it that declares the colour:

```html
<div class="status-strip" aria-hidden="true"></div>
<header class="top-bar glass">…</header>
```

```css
.status-strip {
  position: fixed; top: 0; left: 0; right: 0; height: 11px;  /* > 10px: colour read from CSS */
  z-index: 2147483647; pointer-events: none;                  /* always the element at the hit point */
  background-color: #f6f3ec;                                  /* the status bar's colour */
  -webkit-background-clip: text; background-clip: text;       /* declares the colour, paints nothing */
}
.top-bar.glass { background: rgb(246 243 236 / 60%); backdrop-filter: blur(20px); }
```

The strip is what the hit test finds. It isn't an ancestor of the glass header, so the `backdrop-filter` isn't on the walk (rule 11). The invisible-strip technique is from [zenn][zenn] (iOS 27 device), [planestro#574][planestro] and [exsesx.dev][exsesx]. Combining it with a glass header has not been checked on a device.

### App shells where the document doesn't scroll

If `html`/`body` don't scroll and an inner element does, add the fixed bar anyway; the rules don't care which element scrolls. A full-viewport fixed frame with a background (`position: fixed; inset: 0`) also counts, as a viewport-sized box (rule 6), but it won't replace a colour already chosen, so a real bar is more predictable.

## Debugging and the checker

[`checker/ios-top-edge-check.js`](checker/ios-top-edge-check.js) reproduces rules 1 and 3–11 in any browser. It hit-tests the top-centre point, walks up to the fixed or sticky container, applies the size, visibility, `backdrop-filter`, alpha and colour rules, and reports pass, warn or fail, with each rule and the element at fault.

```text
FAIL: the status bar will keep its blur
✓ apple-mobile-web-app-status-bar-style is not set (fine). It is read when the icon is added.
✗ No fixed or sticky element at the top-centre point (195, 4). Hit header.top-bar; walked up:
  header.top-bar (312px wide (80%) < 90% of 382px) → body (position: static) → html (position: static).
```

**Ways to run it**

- **Console:** paste [`checker/dist/console-snippet.js`](checker/dist/console-snippet.js) into the console. It logs the result, outlines the element and shows a panel on the page.
- **Bookmarklet:** use [`checker/dist/bookmarklet.txt`](checker/dist/bookmarklet.txt), or drag the link from the [demo index](https://ios-pwa-top-blur-demo.rexdotsh.workers.dev).
- **Module:**
  ```js
  import { checkTopEdge, formatTopEdgeCheck } from "./ios-top-edge-check.js";
  const result = checkTopEdge();          // { verdict, statusBarColor, container, rules, walk, … }
  console.log(formatTopEdgeCheck(result));
  ```
- **On the iPhone itself:** turn on Settings → Apps → Safari → Advanced → Web Inspector. Connect the phone to a Mac, open the installed app, then pick it under Safari's Develop menu on the Mac and paste the snippet.

Run it at phone width (responsive design mode is fine) with the page scrolled the way you see the problem.

**Limits**

- It sees a single moment. It can't know about edges kept from earlier frames (rule 12), or what the app shell reserved (rule 1, beyond reading the meta tag).
- The pixel-sample path (rule 9) is approximated from computed background colours. Images and gradients get "check on a device".
- WebKit walks the render tree; the checker walks the DOM (including slots and shadow roots). They differ for `display: contents` and some generated content.

**Reading symptoms**

| You see | Likely cause |
| --- | --- |
| Blur, and the bar under it is your header's colour | Installed with `black-translucent` (rule 1): remove it and re-add the icon. |
| Blur, status bar plain white or black | No qualifying element: run the checker. |
| No blur, but the status bar is the page background, not the bar | `backdrop-filter` or mixed colours on the way up (rules 9, 11). |
| Colour stays after the header slides away | The edge is kept while the old element still renders (rule 12). Use `display: none`, or `opacity` below 0.1 while it moves ([zenn][zenn]). |

**Tests.** [`checker/test/`](checker/test/index.html) runs 25 fixture pages through the checker (good, broken and edge cases, with expected results taken from the source). Open it in a browser at `/checker/test/` with `bun run serve`, or on the [demo](https://ios-pwa-top-blur-demo.rexdotsh.workers.dev/checker/test/). All 25 pass in headless Chromium.

## What has been verified on a device

| Setup | Result | Where it comes from |
| --- | --- | --- |
| Fixed, full width, 52px, opaque bar, `default` status-bar style, icon re-added (a production app) | No blur | iPhone, iOS 27 (this repo) |
| Fixed, full width, safe area + 44px, opaque header, no status-bar tag (test page) | No blur | iPhone, iOS 27 (this repo) |
| Invisible 11px strip; `opacity: 0.05`, `display: none` and 50% wide candidates rejected; `black-translucent` blocks everything | As in the rules | iPhone 15 Pro, iOS 27 ([zenn][zenn]) |
| Without a status-bar tag, `env(safe-area-inset-top)` is 0 | 0px | iPhone 15 Pro, iOS 27 ([zenn][zenn]) |
| Opaque sticky header, no `black-translucent` | No blur | iPhone, iOS 27 ([magpie#3515][magpie]); device report and Simulator ([ovis#199][ovis-199]) |
| Everything else in this README (width and height thresholds, alpha, glass, pull-down, viewport-sized frames, dark-mode switching) | — | From WebKit source; not checked on a device |

The demo pages are installable, so you can check the rest yourself. Results are welcome as issues.

## Demo

https://ios-pwa-top-blur-demo.rexdotsh.workers.dev: one fixed page and four broken ones (narrow bar, thin strip, glass bar, translucent bar with `black-translucent`). Each is its own installable app with its own manifest, and shows its install state, safe-area insets, user agent and the checker's verdict.

```sh
bun run serve    # build and serve on http://localhost:4173
bun run deploy   # build and deploy demo/ as a Cloudflare Worker (static assets)
```

No dependencies: `scripts/build.js` bundles the checker with Bun and writes `demo/public/`.

## Sources

**WebKit source** (at [`de94a1bcf328`][head])

- [`LocalFrameView::fixedContainerEdges`][fce]: the hit test, walk, size, visibility and colour rules
- [`PageColorSampler`][pcs-h]: margin and transparency thresholds; [`predominantColor`][predominant], [`finishedFixedContainerColor`][finished]
- [`Page::updateFixedContainerEdges`][page-update]: edge retention, no sampling while overscrolled
- [`WKWebView _updateFixedColorExtensionViews`][update-views], [`_shouldHideTopScrollPocket`][hide-pocket]: the fill and the blur
- [`WebPage::sidesRequiringFixedContainerEdges`][sides]: only sides with a covered inset are sampled

**WebKit commits**

- [`92b9c7857ee5`][c-fast] (293340@main, Apr 2025): reads `background-color` instead of snapshotting; thin threshold 5 → 10px
- [`383ba72d1640`][c-suppress] (296293@main, Jun 2025): SPI to hide the top colour extension
- [`8b209a7da992`][c-90] (298506@main, Aug 2025): width threshold 80% → 90%, viewport-sized boxes never replace a colour
- [`7aa2c5c21594`][c-stretch] (313186@main, May 2026): fixed headers in web apps during top scroll stretch

**WebKit bugs**

- [317153][bug-317153]: Apple: `black-translucent` is deprecated; web apps don't draw under the status bar
- [301756][bug-301756]: Apple: the colour extension exists only for fixed/sticky elements next to a covered inset
- [325807][bug-325807]: iOS 27 web apps can't draw under the status bar or set its colour at runtime
- [329103][bug-329103]: iOS 27 top-edge blur in web apps covers app content
- [319479][bug-319479]: `backdrop-filter` on a top bar disables tint sampling
- [316008][bug-316008]: wrong `100vh` in web apps without a status-bar style

**Developer reports**

- [zenn: iOS 27 PWA top-edge blur, toggled from the page][zenn] (Japanese; device-tested, source-read)
- [Modern Web Weekly #80: So what's up with the iOS 27 blur?][mww]
- [planestro#574][planestro], [ovis#164][ovis-164], [ovis#199][ovis-199], [magpie#3515][magpie], [meshmonitor#5309][meshmonitor]
- [Ben Frain: Safari 26 tab tinting with fixed elements][frain], [andesco/safari-color-tinting][andesco], [exsesx.dev: invisible tint sampler][exsesx]
- [WebKit Features in Safari 26.0][safari-26] (every Home Screen site opens as a web app)

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
[retry]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2715-L2718
[backdrop]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2725-L2728
[prefer]: https://github.com/WebKit/WebKit/blob/de94a1bcf328766c89d837665a03d0f87c470208/Source/WebCore/page/LocalFrameView.cpp#L2730-L2734
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
