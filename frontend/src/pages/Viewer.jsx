import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { FlipBook } from "../components/viewer/FlipBook";
import { ViewerToolbar } from "../components/viewer/ViewerToolbar";
import { ShareDialog } from "../components/ShareDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { fileUrl, publicApi, track } from "../lib/api";
import { playFlip } from "../lib/flipSound";

export default function Viewer({ embed = false }) {
  const { id } = useParams();
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sound, setSound] = useState(true);
  const [fs, setFs] = useState(false);
  const [share, setShare] = useState(false);
  const [thumbs, setThumbs] = useState(false);
  const rootRef = useRef(null);
  const flipRef = useRef(null);
  const soundRef = useRef(true);
  soundRef.current = sound;

  const tracked = useRef(false);

  useEffect(() => {
    publicApi.get(`/flipbooks/${id}`).then((r) => {
      if (r.data.status !== "ready") return setError("This flipbook is still being prepared. Try again in a minute.");
      setBook(r.data);
      setSound(r.data.sound);
      document.title = r.data.title;
      if (!tracked.current) {
        tracked.current = true;
        track(id, { open: true, pages: [0], source: embed ? "embed" : "link" });
      }
    }).catch(() => setError("This flipbook doesn't exist or was removed."));
  }, [id, embed]);

  useEffect(() => {
    const k = (e) => {
      if (e.key === "ArrowRight") flipRef.current?.next();
      if (e.key === "ArrowLeft") flipRef.current?.prev();
    };
    const f = () => setFs(!!document.fullscreenElement);
    window.addEventListener("keydown", k);
    document.addEventListener("fullscreenchange", f);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("fullscreenchange", f); };
  }, []);

  useEffect(() => { const t = setTimeout(() => flipRef.current?.update(), 30); return () => clearTimeout(t); }, [zoom, fs]);

  const onFlip = useCallback((p, visible) => { setPage(p); track(id, { pages: visible }); }, [id]);
  const onTurnStart = useCallback(() => soundRef.current && playFlip(), []);
  const onReady = useCallback((o) => setPortrait(o === "portrait"), []);

  if (error) return <div className="min-h-screen grid place-items-center bg-[#0B0F17] text-slate-400 px-6 text-center" data-testid="viewer-error">{error}</div>;
  if (!book) return <div className="min-h-screen grid place-items-center bg-[#0B0F17]"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>;

  const n = book.pages.length;
  const accent = book.brand.color;
  const shown = portrait || page === 0 || page === n - 1 ? `${page + 1}` : `${page + 1}–${Math.min(page + 2, n)}`;
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current.requestFullscreen?.());
  const exitFs = () => document.fullscreenElement && document.exitFullscreen();
  const { brand } = book;
  const logo = brand.logo && <img src={fileUrl(brand.logo)} alt={brand.name} className="h-7 max-w-[120px] object-contain" data-testid="viewer-brand-logo" />;

  return (
    <div ref={rootRef} className="h-screen w-screen overflow-hidden bg-[#0B0F17] fc-stage-grid flex flex-col text-slate-100" data-testid="viewer-root">
      {!embed && (
        <header className="h-14 shrink-0 px-5 flex items-center gap-3 border-b border-white/5">
          {brand.website ? <a href={brand.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3" data-testid="viewer-brand-link">{logo}{brand.name && <span className="font-display font-semibold">{brand.name}</span>}</a> : <div className="flex items-center gap-3">{logo}{brand.name && <span className="font-display font-semibold">{brand.name}</span>}</div>}
          <span className="text-slate-500 text-sm truncate ml-auto" data-testid="viewer-title">{book.title}</span>
        </header>
      )}
      <div className={`flex-1 min-h-0 fc-scroll ${zoom > 1 ? "overflow-auto" : "overflow-hidden"} flex`}>
        <div className="m-auto shrink-0 p-4 sm:p-8" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          <FlipBook ref={flipRef} book={book} accent={accent} onFlip={onFlip} onReady={onReady} onTurnStart={onTurnStart} />
        </div>
      </div>
      <div className="shrink-0 flex justify-center pb-4 pt-2 relative">
        {embed && logo && <div className="absolute left-4 bottom-5">{brand.website ? <a href={brand.website} target="_blank" rel="noopener noreferrer">{logo}</a> : logo}</div>}
        <ViewerToolbar label={`${shown} / ${n}`} canPrev={page > 0} canNext={page < n - (portrait ? 1 : 2) || (page === 0 && n > 1)} onPrev={() => flipRef.current.prev()} onNext={() => flipRef.current.next()}
          zoom={zoom} onZoom={(d) => setZoom((z) => Math.min(3, Math.max(1, z + d)))} sound={sound} onSound={() => setSound((s) => !s)}
          fs={fs} onFs={toggleFs} onShare={() => { exitFs(); setShare(true); }} onThumbs={() => { exitFs(); setThumbs(true); }} embed={embed} openUrl={`${window.location.origin}/view/${book.id}`} accent={accent} />
      </div>
      <ShareDialog book={book} open={share} onOpenChange={setShare} />
      <Sheet open={thumbs} onOpenChange={setThumbs}>
        <SheetContent side="bottom" className="bg-[#131B2E] border-white/10 max-h-[60vh]">
          <SheetHeader><SheetTitle className="font-display">All pages</SheetTitle></SheetHeader>
          <div className="flex gap-3 overflow-x-auto fc-scroll py-4" data-testid="viewer-thumbs-strip">
            {book.thumbs.map((t, i) => (
              <button key={t} onClick={() => { setPage(flipRef.current.go(i)); setThumbs(false); }} className={`shrink-0 w-24 rounded overflow-hidden ring-2 transition-[box-shadow] ${i === page ? "" : "ring-transparent hover:ring-white/30"}`} style={i === page ? { "--tw-ring-color": accent } : undefined} data-testid={`viewer-thumb-${i}`}>
                <img src={fileUrl(t)} alt="" className="w-full" />
                <span className="block text-[10px] font-mono py-1 text-slate-400">{i + 1}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
