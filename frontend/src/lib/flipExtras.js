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
