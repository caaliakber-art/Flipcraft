import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PageFlip } from "page-flip";
import { OverlayContent } from "../OverlayContent";
import { fileUrl } from "../../lib/api";
import { blankEdges, enlargeCornerCurl, syncMedia, visiblePages } from "../../lib/flipExtras";

// Mounted once per book; page-flip moves the page nodes so this must not re-render its children list.
export const FlipBook = forwardRef(({ book, accent, onFlip, onReady, onTurnStart }, ref) => {
  const elRef = useRef(null);
  const pfRef = useRef(null);
  const cb = useRef({ onFlip, onReady, onTurnStart });
  cb.current = { onFlip, onReady, onTurnStart };

  useImperativeHandle(ref, () => {
    const turn = (dir) => {
      const pf = pfRef.current;
      if (!pf) return;
      const r = pf.getRender().getRect();
      const portrait = pf.getOrientation() === "portrait";
      const x = dir > 0 ? r.left + r.pageWidth * 2 - 10 : r.left + (portrait ? r.pageWidth : 0) + 10;
      pf.getFlipController().flip({ x, y: r.top + 1 });
    };
    return {
      next: () => turn(1),
      prev: () => turn(-1),
      go: (i) => { pfRef.current?.turnToPage(i); return pfRef.current?.getCurrentPageIndex() ?? i; },
      update: () => pfRef.current?.update(),
      // book geometry inside the stage, used to fill the empty half next to a closed cover
      rect: () => { try { return pfRef.current?.getRender().getRect(); } catch { return null; } },
      orientation: () => pfRef.current?.getOrientation(),
      // the sheet shown while uncovering an inside cover (see blankEdges)
      blank: () => { try { return pfRef.current?.getPageCollection()?.__blankEl || null; } catch { return null; } },
    };
  });

  useEffect(() => {
    const el = elRef.current;
    const pf = new PageFlip(el, {
      width: book.page_width,
      height: book.page_height,
      size: "stretch",
      minWidth: 300,
      maxWidth: 3000,
      minHeight: 200,
      maxHeight: 4000,
      showCover: true,
      usePortrait: true,
      disableFlipByClick: false,
      mobileScrollSupport: true,
      maxShadowOpacity: 0.7,
      flippingTime: 900,
      swipeDistance: 20,
      autoSize: true,
    });
    pf.loadFromHTML(el.querySelectorAll(".fc-page"));
    const fc = pf.getFlipController();
    enlargeCornerCurl(fc);
    blankEdges(pf);
    const total = book.pages.length;
    const media = () => syncMedia(el, visiblePages(pf, total));
    const soften = () => {
      // Covers keep the hardcover look but bend like flexible board.
      try { pf.getPageCollection().getPages().forEach((p) => { p.setDensity("soft"); p.setDrawingDensity("soft"); }); } catch { /* noop */ }
    };
    soften();
    pf.on("flip", (e) => {
      media();
      cb.current.onFlip?.(e.data, visiblePages(pf, total));
    });
    pf.on("changeState", (e) => e.data === "flipping" && cb.current.onTurnStart?.());
    pf.on("changeOrientation", () => { blankEdges(pf); soften(); media(); cb.current.onReady?.(pf.getOrientation()); });
    pfRef.current = pf;
    cb.current.onReady?.(pf.getOrientation());
    media();
    // Brief corner peel on load hints that pages can be grabbed.
    const peel = setTimeout(() => {
      const r = pf.getRender().getRect();
      fc.showCorner({ x: r.left + r.pageWidth * 2 - 4, y: r.top + r.height - 4 });
    }, 1200);
    const release = setTimeout(() => fc.showCorner({ x: -9999, y: -9999 }), 2300);
    return () => {
      clearTimeout(peel);
      clearTimeout(release);
      try { pf.getUI().removeHandlers(); } catch { /* noop */ }
    };
  }, [book]);

  return (
    <div ref={elRef} className={`w-full h-full ${book.hard_cover ? "fc-hardcover" : ""}`} data-testid="flipbook-stage">
      {book.pages.map((p, i) => (
        <div key={p} className="fc-page" data-cover={book.hard_cover && (i === 0 || i === book.pages.length - 1) ? "1" : undefined} data-density={book.hard_cover && (i === 0 || i === book.pages.length - 1) ? "hard" : "soft"} data-testid={`flipbook-page-${i}`}>
          <img src={fileUrl(p)} alt={`Page ${i + 1}`} className="absolute inset-0 w-full h-full object-fill select-none" draggable={false} loading={i < 4 ? "eager" : "lazy"} />
          <span className="fc-paper" aria-hidden="true" />
          {book.overlays.filter((o) => o.page === i).map((o) => <OverlayContent key={o.id} o={o} live accent={accent} />)}
        </div>
      ))}
    </div>
  );
});
