// Page-flip helpers: larger hover curl and page-aware media playback.

export function enlargeCornerCurl(fc) {
  const orig = fc.showCorner.bind(fc);
  fc.showCorner = function (pos) {
    if (!this.checkState("read", "fold_corner")) return;
    const rect = this.getBoundsRect();
    const pw = rect.pageWidth;
    const s = Math.max(80, Math.min(pw, rect.height) * 0.32);
    if (this.calc === null && this.isPointOnCorners(pos)) {
      if (!this.start(pos)) return;
      this.setState("fold_corner");
      this.calc.calc({ x: pw - 1, y: 1 });
      const bottom = this.calc.getCorner() === "bottom";
      this.animateFlippingTo({ x: pw - 1, y: bottom ? rect.height - 1 : 1 }, { x: pw - s, y: bottom ? rect.height - s : s }, false, false);
      return;
    }
    if (this.calc !== null && this.isPointOnCorners(pos)) {
      // Keep the curl at least `s` deep while it follows the mouse.
      const p = this.render.convertToPage(pos);
      const bottom = this.calc.getCorner() === "bottom";
      const cy = bottom ? rect.height : 0;
      const dx = pw - p.x, dy = Math.abs(cy - p.y);
      const depth = Math.max(s, Math.hypot(dx, dy));
      const ang = Math.atan2(Math.max(dy, 1), Math.max(dx, 1));
      const q = { x: pw - depth * Math.cos(ang), y: bottom ? rect.height - depth * Math.sin(ang) : depth * Math.sin(ang) };
      this.do(q);
      return;
    }
    orig(pos);
  };
}

export function visiblePages(pf, total) {
  const p = pf.getCurrentPageIndex();
  if (pf.getOrientation() === "portrait" || p === 0) return [p];
  return [p, p + 1].filter((x) => x < total);
}

const autoSrc = (base) => `${base}${base.includes("?") ? "&" : "?"}${base.includes("vimeo") ? "autoplay=1&muted=1" : "autoplay=1&mute=1"}`;

export function syncMedia(root, visible) {
  root.querySelectorAll("video[data-page], iframe[data-page]").forEach((node) => {
    const on = visible.includes(Number(node.dataset.page));
    const auto = node.dataset.autoplay === "1";
    if (node.tagName === "VIDEO") {
      if (!on) node.pause();
      else if (auto && node.dataset.live !== "1") {
        node.muted = true;
        node.play().catch(() => {});
      }
    } else if (on && auto && node.dataset.live !== "1") {
      node.src = autoSrc(node.dataset.src);
    } else if (!on && node.dataset.live === "1") {
      node.src = node.dataset.src;
    }
    node.dataset.live = on ? "1" : "0";
  });
}

// With a cover shown on its own, page-flip reuses the cover as the "page underneath"
// when you peel back to it (or forward to a lone back cover), so the page you're on
// shows through the uncovered corner. Hand it an empty sheet instead, painted the
// colour of the stage, so the uncovered part reads as nothing there.
export function blankEdges(pf) {
  const pc = pf.getPageCollection();
  if (!pc || pc.__blankEdges) return;
  pc.__blankEdges = true;
  const orig = pc.getBottomPage.bind(pc);
  let blank = null;
  const sheet = () => {
    if (blank) return blank;
    const first = pc.getPages()[0];
    const host = first?.getElement?.().parentElement;
    if (!host) return null;
    const el = document.createElement("div");
    el.className = "fc-page fc-blank";
    el.style.display = "none";
    host.appendChild(el);
    blank = new first.constructor(pf.getRender(), el, "soft");
    blank.load();
    return blank;
  };
  pc.getBottomPage = (direction) => {
    try {
      if (pf.getOrientation() === "landscape") {
        const spreads = pc.getSpread();
        const cur = pc.currentSpreadIndex;
        const target = direction === 0 ? spreads[cur + 1] : spreads[cur - 1]; // 0 = FORWARD
        if (target && target.length === 1) return sheet() || orig(direction);
      }
    } catch { /* fall back to the library's choice */ }
    return orig(direction);
  };
  const hide = () => { if (blank) blank.getElement().style.cssText = "display: none"; };
  pf.on("changeState", (e) => e.data === "read" && hide());
  pf.on("flip", hide);
}
