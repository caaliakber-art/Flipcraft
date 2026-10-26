import { useEffect, useRef } from "react";
import { ExternalLink, Link2, PlayCircle } from "lucide-react";
import { fileUrl, toEmbed } from "../lib/api";

const stop = (e) => e.stopPropagation();

// Viewer mode isolates pointer events so the page-flip engine doesn't grab them.
export const OverlayContent = ({ o, live, accent = "#3B82F6" }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!live || !el) return;
    ["mousedown", "touchstart", "pointerdown"].forEach((ev) => el.addEventListener(ev, stop));
    return () => ["mousedown", "touchstart", "pointerdown"].forEach((ev) => el.removeEventListener(ev, stop));
  }, [live]);

  const style = { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%` };
  const base = live ? "absolute z-10" : "absolute inset-0";
  const pos = live ? style : undefined;

  if (o.type === "image") {
    const img = <img src={fileUrl(o.src)} alt={o.label || ""} className="w-full h-full object-cover" draggable={false} />;
    return (
      <div ref={ref} className={base} style={pos} data-testid={`overlay-image-${o.id}`}>
        {live && o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer">{img}</a> : img}
      </div>
    );
  }
  if (o.type === "video") {
    return (
      <div ref={ref} className={`${base} bg-black ${live ? "fc-media-hover" : ""}`} style={pos} data-testid={`overlay-video-${o.id}`}>
        <video src={fileUrl(o.src)} controls={live} playsInline loop={live && o.autoplay} preload="metadata" className="w-full h-full object-contain" data-page={live ? o.page : undefined} data-autoplay={o.autoplay ? "1" : "0"} />
        {!live && <PlayCircle className="absolute inset-0 m-auto w-10 h-10 text-white/80 pointer-events-none" />}
      </div>
    );
  }
  if (o.type === "youtube") {
    const src = toEmbed(o.src);
    return (
      <div ref={ref} className={`${base} bg-black ${live ? "fc-media-hover" : ""}`} style={pos} data-testid={`overlay-embed-${o.id}`}>
        {src ? (
          <iframe src={src} data-src={src} data-page={live ? o.page : undefined} data-autoplay={o.autoplay ? "1" : "0"} title={o.label || "Video"} className={`w-full h-full ${live ? "" : "pointer-events-none"}`} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen frameBorder="0" />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-white/60">Add a YouTube or Vimeo link</div>
        )}
      </div>
    );
  }
  if (!live) {
    return (
      <div className="absolute inset-0 grid place-items-center" style={{ background: `${accent}33`, border: `2px dashed ${accent}` }}>
        <Link2 className="w-5 h-5" style={{ color: accent }} />
      </div>
    );
  }
  return (
    <a
      ref={ref}
      href={o.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      title={o.label || o.url}
      className="fc-hotspot absolute z-10 group"
      style={{ ...style, "--accent": accent }}
      data-testid={`overlay-link-${o.id}`}
    >
      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full grid place-items-center opacity-80 group-hover:opacity-100" style={{ background: accent }}>
        <ExternalLink className="w-3 h-3 text-white" />
      </span>
    </a>
  );
};
