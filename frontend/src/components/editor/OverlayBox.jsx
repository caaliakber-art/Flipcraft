import { OverlayContent } from "../OverlayContent";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

export const OverlayBox = ({ o, selected, onSelect, onChange, canvasRef, accent }) => {
  const start = (e, mode) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, orig = { ...o };
    const move = (ev) => {
      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;
      const n = { ...orig };
      if (mode === "move") {
        n.x = clamp(orig.x + dx, 0, 100 - orig.w);
        n.y = clamp(orig.y + dy, 0, 100 - orig.h);
      } else {
        const [hx, hy] = mode;
        if (hx > 0) n.w = clamp(orig.w + dx, 3, 100 - orig.x);
        else { n.x = clamp(orig.x + dx, 0, orig.x + orig.w - 3); n.w = orig.w + orig.x - n.x; }
        if (hy > 0) n.h = clamp(orig.h + dy, 3, 100 - orig.y);
        else { n.y = clamp(orig.y + dy, 0, orig.y + orig.h - 3); n.h = orig.h + orig.y - n.y; }
      }
      onChange({ ...n, x: r2(n.x), y: r2(n.y), w: r2(n.w), h: r2(n.h) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      onPointerDown={(e) => start(e, "move")}
      className={`absolute cursor-move touch-none ${selected ? "z-20" : "z-10"}`}
      style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%`, outline: selected ? `2px solid ${accent}` : "1px solid rgba(59,130,246,0.5)" }}
      data-testid={`editor-overlay-${o.id}`}
    >
      <OverlayContent o={o} accent={accent} />
      {selected && CORNERS.map(([hx, hy]) => (
        <span key={`${hx}${hy}`} onPointerDown={(e) => start(e, [hx, hy])}
          className="absolute w-3 h-3 bg-white rounded-sm shadow"
          style={{ left: hx < 0 ? -6 : undefined, right: hx > 0 ? -6 : undefined, top: hy < 0 ? -6 : undefined, bottom: hy > 0 ? -6 : undefined, border: `2px solid ${accent}`, cursor: hx === hy ? "nwse-resize" : "nesw-resize" }}
          data-testid={`editor-overlay-handle-${hx}${hy}`} />
      ))}
    </div>
  );
};
