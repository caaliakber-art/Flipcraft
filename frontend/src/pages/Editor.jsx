import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Loader2, Save, Share2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ShareDialog } from "../components/ShareDialog";
import { OverlayBox } from "../components/editor/OverlayBox";
import { PropertiesPanel } from "../components/editor/PropertiesPanel";
import { ToolRail } from "../components/editor/ToolRail";
import { api, errMsg, fileUrl, toEmbed, uploadMedia } from "../lib/api";

const uid = () => Math.random().toString(36).slice(2, 10);
const fit = ({ w, h }, r) => (!h ? { width: 0, height: 0 } : w / h > r ? { height: h, width: h * r } : { width: w, height: w / r });
const imgRatio = (file) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalHeight / i.naturalWidth || 0.75); i.onerror = () => res(0.75); i.src = URL.createObjectURL(file); });

export default function Editor() {
  const { id } = useParams();
  const [book, setBook] = useState(null);
  const [overlays, setOverlays] = useState([]);
  const [title, setTitle] = useState("");
  const [sound, setSound] = useState(true);
  const [hardCover, setHardCover] = useState(true);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [share, setShare] = useState(false);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [book]);

  useEffect(() => {
    api.get(`/flipbooks/${id}`).then((r) => {
      setBook(r.data); setOverlays(r.data.overlays); setTitle(r.data.title); setSound(r.data.sound); setHardCover(r.data.hard_cover);
    }).catch(() => setBook(false));
  }, [id]);

  const change = useCallback((fn) => { setOverlays(fn); setDirty(true); }, []);
  const add = (o) => { const n = { id: uid(), page, label: "", src: "", url: "", ...o }; change((l) => [...l, n]); setSel(n.id); };
  const ratio = book ? book.page_width / book.page_height : 0.75;

  const onFile = async (file, kind) => {
    try {
      setUpload(0);
      const h = kind === "image" ? await imgRatio(file) : 9 / 16;
      const r = await uploadMedia(file, setUpload);
      const w = kind === "image" ? 40 : 70;
      add({ type: kind, src: r.path, x: (100 - w) / 2, y: 25, w, h: Math.round(Math.min(90, w * h * ratio) * 100) / 100, autoplay: kind === "video" });
      toast.success(kind === "image" ? "Picture added" : "Video added");
    } catch (e) {
      toast.error(errMsg(e, "Upload failed"));
    } finally {
      setUpload(null);
    }
  };

  const addEmbed = () => {
    if (!toEmbed(embedUrl)) return toast.error("Paste a YouTube or Vimeo link");
    add({ type: "youtube", src: embedUrl.trim(), x: 15, y: 25, w: 70, h: Math.min(90, 70 * (9 / 16) * ratio), autoplay: true });
    setEmbedOpen(false); setEmbedUrl("");
  };

  const save = async () => {
    const bad = overlays.find((o) => (o.type === "link" && !/^(https?:\/\/|mailto:|tel:)/.test(o.url)) || (o.type === "youtube" && !toEmbed(o.src)) || (o.url && !/^(https?:\/\/|mailto:|tel:)/.test(o.url)));
    if (bad) { setPage(bad.page); setSel(bad.id); return toast.error("One item needs a valid link before saving"); }
    try {
      setSaving(true);
      const { data } = await api.put(`/flipbooks/${id}`, { title: title.trim() || "Untitled", overlays, sound, hard_cover: hardCover });
      setBook(data); setDirty(false);
      toast.success("Saved — your share link is up to date");
    } catch (e) {
      toast.error(errMsg(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const k = (e) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { change((l) => l.filter((o) => o.id !== sel)); setSel(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel, change]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (book === null) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>;
  if (book === false || !book.is_owner) return (
    <div className="min-h-screen grid place-items-center text-center px-6" data-testid="editor-no-access">
      <div className="space-y-4"><p className="text-slate-300">This flipbook belongs to another workspace.</p><p className="text-sm text-slate-500">Sign in with an account in that workspace to edit it.</p><Button asChild><Link to="/">Go home</Link></Button></div>
    </div>
  );

  const selected = overlays.find((o) => o.id === sel);
  const pageItems = overlays.filter((o) => o.page === page);
  const accent = book.brand.color;
  const n = book.pages.length;
  const update = (o) => change((l) => l.map((x) => (x.id === o.id ? o : x)));

  return (
    <div className="h-screen flex flex-col bg-[#0B0F17] text-slate-50" data-testid="editor-root">
      <header className="h-14 shrink-0 border-b border-white/10 px-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link to="/" data-testid="editor-back-btn"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="max-w-sm h-9 bg-transparent border-transparent hover:border-white/10 focus:border-white/20 font-display font-semibold" data-testid="editor-title-input" />
        {dirty && <span className="text-[11px] text-amber-400 font-mono" data-testid="editor-unsaved-indicator">unsaved</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" asChild><a href={`/view/${id}`} target="_blank" rel="noreferrer" data-testid="editor-preview-btn"><Eye className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Preview</span></a></Button>
          <Button variant="secondary" size="sm" onClick={() => setShare(true)} data-testid="editor-share-btn"><Share2 className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Share</span></Button>
          <Button size="sm" onClick={save} disabled={saving} data-testid="editor-save-btn">{saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}Save</Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 shrink-0 border-r border-white/10 p-4 overflow-y-auto hidden md:block">
          <ToolRail onFile={onFile} onEmbed={() => setEmbedOpen(true)} onLink={() => add({ type: "link", x: 35, y: 40, w: 30, h: 8 })} busy={upload !== null} />
          {upload !== null && <div className="mt-4 text-xs text-slate-400" data-testid="editor-upload-progress">Uploading… {upload}%<div className="h-1 mt-1 bg-white/10 rounded"><div className="h-1 bg-blue-500 rounded" style={{ width: `${upload}%` }} /></div></div>}
        </aside>

        <main className="flex-1 min-w-0 flex flex-col fc-stage-grid">
          <div className="md:hidden border-b border-white/10 px-3 py-2 bg-[#0B0F17]" data-testid="editor-mobile-tools">
            <ToolRail row onFile={onFile} onEmbed={() => setEmbedOpen(true)} onLink={() => add({ type: "link", x: 35, y: 40, w: 30, h: 8 })} busy={upload !== null} />
            {upload !== null && <p className="text-xs text-slate-400 mt-1">Uploading… {upload}%</p>}
          </div>
          {pageItems.length === 0 && (
            <p className="text-center text-xs text-slate-400 pt-3 px-4" data-testid="editor-hint">
              <span className="hidden md:inline">Use the “Add to this page” panel on the left</span><span className="md:hidden">Tap a button above</span> to place a video, YouTube/Vimeo clip, picture or link on page {page + 1}.
            </p>
          )}
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 gap-4" onPointerDown={() => setSel(null)}>
            <Button variant="ghost" size="icon" disabled={page === 0} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setPage(page - 1); setSel(null); }} data-testid="editor-prev-page-btn"><ChevronLeft /></Button>
            <div ref={stageRef} className="flex-1 h-full min-w-0 flex items-center justify-center">
            <div ref={canvasRef} className="relative bg-white shadow-[0_20px_60px_rgba(0,0,0,0.6)] select-none" style={fit(stage, ratio)} data-testid="editor-canvas">
              <img src={fileUrl(book.pages[page])} alt="" className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} />
              {pageItems.map((o) => <OverlayBox key={o.id} o={o} selected={o.id === sel} onSelect={setSel} onChange={update} canvasRef={canvasRef} accent={accent} />)}
            </div>
            </div>
            <Button variant="ghost" size="icon" disabled={page >= n - 1} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setPage(page + 1); setSel(null); }} data-testid="editor-next-page-btn"><ChevronRight /></Button>
          </div>
          <div className="h-28 shrink-0 border-t border-white/10 bg-[#0B0F17]/90 flex gap-2 overflow-x-auto fc-scroll px-4 py-3" data-testid="editor-filmstrip">
            {book.thumbs.map((t, i) => {
              const c = overlays.filter((o) => o.page === i).length;
              return (
                <button key={t} onClick={() => { setPage(i); setSel(null); }} className={`relative shrink-0 h-full rounded overflow-hidden ring-2 transition-[box-shadow,opacity] ${i === page ? "ring-blue-500" : "ring-transparent opacity-60 hover:opacity-100"}`} data-testid={`editor-thumb-${i}`}>
                  <img src={fileUrl(t)} alt="" className="h-full w-auto" />
                  <span className="absolute bottom-0 left-0 text-[10px] font-mono bg-black/70 px-1">{i + 1}</span>
                  {c > 0 && <span className="absolute top-1 right-1 text-[10px] bg-blue-500 rounded-full w-4 h-4 grid place-items-center">{c}</span>}
                </button>
              );
            })}
          </div>
        </main>

        <aside className="w-72 shrink-0 border-l border-white/10 p-5 overflow-y-auto hidden lg:block">
          <PropertiesPanel o={selected} onChange={update} page={page} total={n} sound={sound} onSound={(v) => { setSound(v); setDirty(true); }}
            hardCover={hardCover} onHardCover={(v) => { setHardCover(v); setDirty(true); }}
            onDelete={() => { change((l) => l.filter((o) => o.id !== sel)); setSel(null); }}
            onDuplicate={() => add({ ...selected, id: uid(), x: Math.min(selected.x + 3, 100 - selected.w), y: Math.min(selected.y + 3, 100 - selected.h) })} />
        </aside>
      </div>

      {selected && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 max-h-[38vh] overflow-y-auto bg-[#131B2E] border-t border-white/10 p-4 pt-2 shadow-2xl" data-testid="editor-mobile-properties">
          <div className="flex justify-end mb-1"><button onClick={() => setSel(null)} className="text-xs font-semibold text-blue-400 px-2 py-1" data-testid="editor-mobile-properties-close">Done</button></div>
          <PropertiesPanel o={selected} onChange={update} page={page} total={n} sound={sound} onSound={() => {}}
            onDelete={() => { change((l) => l.filter((o) => o.id !== sel)); setSel(null); }}
            onDuplicate={() => add({ ...selected, id: uid(), x: Math.min(selected.x + 3, 100 - selected.w), y: Math.min(selected.y + 3, 100 - selected.h) })} />
        </div>
      )}

      <Dialog open={embedOpen} onOpenChange={setEmbedOpen}>
        <DialogContent className="bg-[#131B2E] border-white/10" data-testid="embed-url-dialog">
          <DialogHeader><DialogTitle className="font-display">Add a YouTube or Vimeo video</DialogTitle></DialogHeader>
          <Input autoFocus value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEmbed()} placeholder="https://www.youtube.com/watch?v=…" data-testid="embed-url-input" />
          <Button onClick={addEmbed} data-testid="embed-url-add-btn">Add to page {page + 1}</Button>
        </DialogContent>
      </Dialog>
      <ShareDialog book={book} open={share} onOpenChange={setShare} />
    </div>
  );
}
