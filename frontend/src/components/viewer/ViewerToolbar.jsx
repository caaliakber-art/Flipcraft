import { ChevronLeft, ChevronRight, Maximize, Minimize, Share2, Volume2, VolumeX, ZoomIn, ZoomOut, LayoutGrid, ExternalLink } from "lucide-react";

const Btn = ({ onClick, disabled, children, testid, title }) => (
  <button onClick={onClick} disabled={disabled} title={title} data-testid={testid}
    className="w-9 h-9 grid place-items-center rounded-full text-slate-200 hover:bg-white/10 active:scale-95 disabled:opacity-30 transition-[background-color,transform] duration-150">
    {children}
  </button>
);

export const ViewerToolbar = ({ label, canPrev, canNext, onPrev, onNext, zoom, onZoom, sound, onSound, fs, onFs, onShare, onThumbs, embed, openUrl, accent }) => (
  <div className="fc-glass rounded-full px-2 py-1.5 flex items-center gap-0.5 shadow-2xl" data-testid="viewer-toolbar">
    <Btn onClick={onPrev} disabled={!canPrev} testid="viewer-prev-page-btn" title="Previous"><ChevronLeft className="w-5 h-5" /></Btn>
    <span className="font-mono text-xs px-2 min-w-[72px] text-center text-slate-300" data-testid="viewer-page-counter">{label}</span>
    <Btn onClick={onNext} disabled={!canNext} testid="viewer-next-page-btn" title="Next"><ChevronRight className="w-5 h-5" /></Btn>
    <span className="w-px h-5 bg-white/10 mx-1" />
    <span className="hidden sm:flex items-center gap-0.5">
      <Btn onClick={() => onZoom(-0.5)} disabled={zoom <= 1} testid="viewer-zoom-out-btn" title="Zoom out"><ZoomOut className="w-4 h-4" /></Btn>
      <span className="font-mono text-[10px] text-slate-400 w-8 text-center" data-testid="viewer-zoom-level">{Math.round(zoom * 100)}%</span>
      <Btn onClick={() => onZoom(0.5)} disabled={zoom >= 3} testid="viewer-zoom-in-btn" title="Zoom in"><ZoomIn className="w-4 h-4" /></Btn>
    </span>
    <Btn onClick={onThumbs} testid="viewer-thumbs-btn" title="All pages"><LayoutGrid className="w-4 h-4" /></Btn>
    <Btn onClick={onSound} testid="viewer-sound-toggle-btn" title="Flip sound">{sound ? <Volume2 className="w-4 h-4" style={{ color: accent }} /> : <VolumeX className="w-4 h-4" />}</Btn>
    <Btn onClick={onFs} testid="viewer-fullscreen-btn" title="Fullscreen">{fs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</Btn>
    {embed ? (
      <a href={openUrl} target="_blank" rel="noreferrer" title="Open in new tab" data-testid="viewer-open-new-tab-btn" className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10"><ExternalLink className="w-4 h-4" /></a>
    ) : (
      <button onClick={onShare} data-testid="viewer-share-btn" className="ml-1 h-9 px-4 rounded-full text-sm font-semibold text-white flex items-center gap-2 hover:brightness-110 active:scale-95 transition-[filter,transform]" style={{ background: accent }}>
        <Share2 className="w-4 h-4" /><span className="hidden sm:inline">Share</span>
      </button>
    )}
  </div>
);
