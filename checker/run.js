// Entry for the console snippet and the bookmarklet: run the check, log it, show it on the page.
import { checkTopEdge, formatTopEdgeCheck, printTopEdgeCheck } from "./ios-top-edge-check.js";

const ATTR = "data-top-edge-check";
const OUTLINE = "data-top-edge-outline";
const cleanUp = () => {
  document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove());
  document.querySelectorAll(`[${OUTLINE}]`).forEach((el) => {
    el.style.outline = el.getAttribute(OUTLINE);
    el.removeAttribute(OUTLINE);
  });
};
cleanUp();

const result = printTopEdgeCheck(checkTopEdge({ ignore: `[${ATTR}]` }));
const target = result.container ?? result.hit;
const colour = { pass: "#16a34a", warn: "#b45309", fail: "#dc2626" }[result.verdict];

const box = document.createElement("div");
box.setAttribute(ATTR, "");
box.style.cssText = `position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:45vh;overflow:auto;
  padding:12px 14px;border-radius:12px;border:3px solid ${colour};background:#fff;color:#111;
  font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;box-shadow:0 8px 30px rgba(0,0,0,.35)`;
box.textContent = formatTopEdgeCheck(result);

const close = document.createElement("button");
close.textContent = "close";
close.style.cssText = "float:right;margin:0 0 6px 8px;font:600 13px system-ui;padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#f4f4f4;color:#111";
box.prepend(close);

if (target && target !== document.documentElement && target !== document.body) {
  target.setAttribute(OUTLINE, target.style.outline);
  target.style.outline = `3px dashed ${colour}`;
}
close.onclick = cleanUp;
document.body.appendChild(box);
