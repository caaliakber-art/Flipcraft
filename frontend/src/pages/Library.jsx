import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ChevronRight, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { FlipBook } from "../components/viewer/FlipBook";
import { ViewerToolbar } from "../components/viewer/ViewerToolbar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { copyText, fileUrl, publicApi, track } from "../lib/api";
import { playFlip } from "../lib/flipSound";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const monthOf = (it) => (it?.label || "").split(" ")[0];
const yearOf = (it) => (it?.date || "").slice(0, 4) || (it?.label || "").split(" ").slice(-1)[0];

/* ------------------------------------------------------------------ tilt */
function useTilt(max = 9) {
  const target = useRef(null);
  const frame = useRef(0);
  const set = (x, y, on) => {
    const el = target.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = on ? `rotateY(${(x - 0.5) * max * 2}deg) rotateX(${(0.5 - y) * max * 1.4}deg) translateZ(18px)` : "";
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
      el.style.setProperty("--go", on ? "1" : "0");
    });
  };
  const bind = {
    onPointerMove: (e) => {
      if (reduceMotion() || e.pointerType === "touch") return;
      const r = e.currentTarget.getBoundingClientRect();
      set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, true);
    },
    onPointerLeave: () => set(0.5, 0.5, false),
  };
  return { target, bind };
}

function Cover({ src, aspect = 0.707, width, reflect = false, coverRef, className = "", eager = false }) {
  return (
    <div className={`relative ${className}`} style={{ width, aspectRatio: `${aspect}` }}>
      <div ref={coverRef} className="lib-cover w-full h-full">
        <img src={fileUrl(src)} alt="" draggable={false} loading={eager ? "eager" : "lazy"} />
        <span className="lib-glare" />
      </div>
      {reflect && <div className="lib-reflect" style={{ backgroundImage: `url(${fileUrl(src)})` }} aria-hidden="true" />}
    </div>
  );
}

function ShelfCard({ item, onFocus, onOpen, focused }) {
  const { target, bind } = useTilt(12);
  const special = item.special;
  return (
    <button
      type="button"
      className="lib-card lib-tilt group shrink-0 text-left w-[132px] sm:w-[150px] focus:outline-none"
      data-focus={focused ? "1" : "0"}
      onMouseEnter={() => onFocus(item)}
      onFocus={() => onFocus(item)}
      onClick={() => onOpen(item)}
      {...bind}
      aria-label={`Open ${item.kind ? item.kind + ", " : ""}${item.label}`}
      data-testid={`shelf-${item.flipbook_id}`}
    >
      <Cover src={item.thumb || item.cover} aspect={item.aspect} width="100%" coverRef={target} />
      <div className="pt-3 pr-2">
        <div className={`text-[15px] leading-tight ${focused ? "text-white" : "text-white/75"} transition-colors`}>{special ? item.kind : monthOf(item)}</div>
        <div className="lib-cond text-[12px] text-white/45 mt-0.5">{special ? item.label : `${item.page_count} pages`}</div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ search */
function highlight(text, terms) {
  if (!terms?.length) return text;
  const esc = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!esc.length) return text;
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

function SearchPanel({ slug, lib, current, onOpen, onClose, autoFocus }) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => inputRef.current?.focus(), 50); }, [autoFocus]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return; }
    setBusy(true);
    const t = setTimeout(() => {
      publicApi.get(`/public/libraries/${slug}/search`, { params: { q: term } })
        .then((r) => setRes(r.data)).catch(() => setRes({ results: [], terms: [] })).finally(() => setBusy(false));
    }, 260);
    return () => clearTimeout(t);
  }, [q, slug]);

  const suggestions = useMemo(() => {
    const counts = {};
    lib.items.forEach((it) => it.toc?.forEach((s) => { counts[s.section] = (counts[s.section] || 0) + s.items.length; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => k.length < 24).slice(0, 5);
    return [...new Set(["GSTAT", "TDS", ...top])].slice(0, 7);
  }, [lib]);

  const groups = useMemo(() => {
    if (!res) return [];
    const list = scope === "issue" && current ? res.results.filter((r) => r.flipbook_id === current.flipbook_id) : res.results;
    const by = new Map();
    list.forEach((r) => { if (!by.has(r.flipbook_id)) by.set(r.flipbook_id, []); by.get(r.flipbook_id).push(r); });
    return [...by.values()];
  }, [res, scope, current]);
  const total = groups.reduce((a, g) => a + g.length, 0);

  return (
    <aside className="lib-glass h-full rounded-2xl flex flex-col min-h-0 overflow-hidden" aria-label="Search the archive" data-testid="library-search">
      <div className="p-5 pb-4 space-y-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-medium">Search the archive</h2>
          {onClose && <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10" aria-label="Close search"><X className="w-4 h-4" /></button>}
        </div>
        <label className="relative block">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${lib.items.length} issues`}
            className="w-full h-11 rounded-xl bg-black/25 border border-white/10 pl-10 pr-9 text-[15px] placeholder:text-white/40 focus:outline-none focus:border-[color:var(--mist)] focus:bg-black/35 transition-colors"
            data-testid="library-search-input" />
          {busy && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50" />}
        </label>
        {current && res && (
          <div className="flex gap-1 text-[13px]" role="tablist">
            {[["all", "All issues"], ["issue", current.special ? current.kind : current.label]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
                className={`px-3 h-7 rounded-full transition-colors ${scope === k ? "bg-white text-[color:var(--ink)]" : "text-white/70 hover:bg-white/10"}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lib-scroll p-3">
        {!res && (
          <div className="p-2 space-y-4">
            <p className="text-[14px] text-white/60 leading-relaxed">Find any update across every issue. Results open the issue at the right page.</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setQ(s)} className="h-8 px-3 rounded-full border border-white/15 text-[13px] text-white/80 hover:bg-white/10 hover:border-white/30 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {res && total === 0 && !busy && (
          <p className="p-3 text-[14px] text-white/60">No pages mention “{res.query}”. Try a shorter phrase or a form or section number.</p>
        )}
        {res && total > 0 && <p className="lib-cond px-2 pb-2 text-[12px] text-white/45">{total} {total === 1 ? "page" : "pages"} in {groups.length} {groups.length === 1 ? "issue" : "issues"}</p>}
        <div className="space-y-2">
          {groups.map((g) => {
            const meta = lib.items.find((i) => i.flipbook_id === g[0].flipbook_id) || {};
            return (
              <section key={g[0].flipbook_id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <header className="flex items-center gap-3 px-3 pt-3 pb-2">
                  <img src={fileUrl(meta.thumb)} alt="" className="w-8 rounded-[2px] shadow-md" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium truncate">{meta.special ? `${meta.kind}, ${meta.label}` : meta.label}</div>
                    <div className="lib-cond text-[12px] text-white/45">{g.length} {g.length === 1 ? "match" : "matches"}</div>
                  </div>
                </header>
                {g.slice(0, 4).map((r) => (
                  <button key={r.page} onClick={() => onOpen(meta, r.page)} className="w-full text-left px-3 py-2.5 hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus:outline-none transition-colors flex gap-3 group" data-testid={`search-hit-${r.flipbook_id}-${r.page}`}>
                    <span className="lib-cond shrink-0 w-11 text-[12px] text-[color:var(--mist)] pt-0.5">Page {r.page + 1}</span>
                    <span className="text-[13.5px] leading-relaxed text-white/80 line-clamp-3">{highlight(r.snippet, res.terms)}</span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ reader */
function IssuePanel({ item, onGo, onStart }) {
  return (
    <div className="h-full flex flex-col justify-center pr-6 sm:pr-10 pl-2 lib-swap">
      <p className="text-[14px] text-white/55">{item.special ? item.kind : "In this issue"}</p>
      <h2 className="text-[clamp(28px,3.2vw,44px)] font-light leading-[1.05] mt-1">{item.label}</h2>
      {item.toc?.length > 0 ? (
        <div className="mt-6 space-y-5 overflow-y-auto lib-scroll min-h-0 pr-2" style={{ maxHeight: "62%" }}>
          {item.toc.map((s) => (
            <div key={s.section}>
              <h3 className="lib-cond text-[13px] text-[color:var(--mist)] mb-1.5">{s.section}</h3>
              <ul className="space-y-1">
                {s.items.map((h, i) => (
                  <li key={i}>
                    <button disabled={h.page == null} onClick={() => onGo(h.page)} className="text-left text-[14px] leading-snug text-white/80 hover:text-white disabled:hover:text-white/80 flex gap-2 group">
                      <span className="flex-1">{h.title}</span>
                      {h.page != null && <span className="lib-cond text-[12px] text-white/40 group-hover:text-white/80 pt-0.5">p{h.page + 1}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[15px] text-white/65 max-w-sm">{item.page_count} pages. Turn the cover or use the arrows to start reading.</p>
      )}
      <button onClick={onStart} className="mt-7 self-start h-10 px-5 rounded-full bg-white text-[color:var(--ink)] text-[14px] font-medium hover:bg-[color:var(--paper)] transition-colors">Start reading</button>
    </div>
  );
}

function NextPanel({ next, onOpen, onBack }) {
  return (
    <div className="h-full flex flex-col justify-center pl-8 sm:pl-12 lib-swap">
      {next ? (
        <>
          <p className="text-[14px] text-white/55">Next issue</p>
          <button onClick={() => onOpen(next)} className="mt-4 flex items-end gap-5 text-left group">
            <img src={fileUrl(next.thumb)} alt="" className="w-24 rounded-[3px] shadow-2xl group-hover:-translate-y-1 transition-transform" />
            <span>
              <span className="block text-[26px] font-light leading-tight">{next.special ? next.kind : monthOf(next)}</span>
              <span className="block lib-cond text-[13px] text-white/50">{next.label}</span>
            </span>
          </button>
        </>
      ) : <p className="text-[18px] font-light text-white/70">You've reached the earliest issue.</p>}
      <button onClick={onBack} className="mt-8 self-start text-[14px] text-white/70 hover:text-white underline-offset-4 hover:underline">Back to all issues</button>
    </div>
  );
}

function Reader({ slug, item, items, startPage, embed, onOpen, onBack }) {
  const [book, setBook] = useState(null);
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sound, setSound] = useState(true);
  const [fs, setFs] = useState(false);
  const [thumbs, setThumbs] = useState(false);
  const [rect, setRect] = useState(null);
  const flipRef = useRef(null);
  const rootRef = useRef(null);
  const soundRef = useRef(true);
  soundRef.current = sound;
  const pending = useRef(startPage);

  useEffect(() => {
    setBook(null); setPage(0); pending.current = startPage;
    publicApi.get(`/flipbooks/${item.flipbook_id}`).then((r) => {
      setBook(r.data); setSound(r.data.sound);
      track(item.flipbook_id, { open: true, pages: [startPage || 0], source: embed ? "embed" : "link" });
    }).catch(() => toast.error("This issue couldn't be opened"));
  }, [item.flipbook_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (startPage && book) { flipRef.current?.go(startPage); } }, [startPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = useCallback(() => { const r = flipRef.current?.rect(); setRect(r ? { ...r } : null); setPortrait(flipRef.current?.orientation() === "portrait"); }, []);
  useEffect(() => {
    const k = (e) => { if (e.target.tagName === "INPUT") return; if (e.key === "ArrowRight") flipRef.current?.next(); if (e.key === "ArrowLeft") flipRef.current?.prev(); };
    const f = () => setFs(!!document.fullscreenElement);
    const r = () => setTimeout(measure, 80);
    window.addEventListener("keydown", k); window.addEventListener("resize", r); document.addEventListener("fullscreenchange", f);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("resize", r); document.removeEventListener("fullscreenchange", f); };
  }, [measure]);
  useEffect(() => { const t = setTimeout(() => { flipRef.current?.update(); measure(); }, 40); return () => clearTimeout(t); }, [zoom, fs, measure]);

  const onFlip = useCallback((p, visible) => { setPage(p); track(item.flipbook_id, { pages: visible }); setTimeout(measure, 30); }, [item.flipbook_id, measure]);
  const onTurnStart = useCallback(() => soundRef.current && playFlip(), []);
  const onReady = useCallback((o) => {
    setPortrait(o === "portrait");
    setTimeout(() => {
      if (pending.current) { const p = flipRef.current?.go(pending.current); if (p != null) setPage(p); pending.current = 0; }
      measure();
    }, 60);
  }, [measure]);

  const idx = items.findIndex((i) => i.flipbook_id === item.flipbook_id);
  const next = items[idx + 1];
  if (!book) return <div className="h-full grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-white/40" /></div>;
  const n = book.pages.length;
  const shown = portrait || page === 0 || page === n - 1 ? `${page + 1}` : `${page + 1}–${Math.min(page + 2, n)}`;
  const blankLeft = !portrait && rect && page === 0 && zoom === 1;
  const blankRight = !portrait && rect && page === n - 1 && n % 2 === 0 && zoom === 1;
  const share = async () => { await copyText(`${window.location.origin}/library/${slug}?issue=${item.flipbook_id}&page=${page + 1}`); toast.success("Link to this page copied"); };
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current.requestFullscreen?.());

  return (
    <div ref={rootRef} className="h-full flex flex-col min-h-0 bg-[color:var(--ink)]/0" data-testid="library-reader">
      <div className={`flex-1 min-h-0 ${zoom > 1 ? "overflow-auto lib-scroll" : "overflow-hidden"} flex`}>
        <div className="m-auto shrink-0 p-3 sm:p-6 relative" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          <div className="relative w-full h-full">
            <FlipBook key={book.id} ref={flipRef} book={book} accent="#9db8d4" onFlip={onFlip} onReady={onReady} onTurnStart={onTurnStart} />
            {blankLeft && (
              <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.pageWidth, height: rect.height }}>
                <IssuePanel item={item} onGo={(p) => { const r = flipRef.current?.go(p); if (r != null) setPage(r); setTimeout(measure, 60); }} onStart={() => flipRef.current?.next()} />
              </div>
            )}
            {blankRight && (
              <div className="absolute" style={{ left: rect.left + rect.pageWidth, top: rect.top, width: rect.pageWidth, height: rect.height }}>
                <NextPanel next={next} onOpen={(it) => onOpen(it, 0)} onBack={onBack} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex justify-center pb-4 pt-1">
        <ViewerToolbar label={`${shown} / ${n}`} canPrev={page > 0} canNext={page < n - (portrait ? 1 : 2) || (page === 0 && n > 1)} onPrev={() => flipRef.current.prev()} onNext={() => flipRef.current.next()}
          zoom={zoom} onZoom={(d) => setZoom((z) => Math.min(3, Math.max(1, z + d)))} sound={sound} onSound={() => setSound((s) => !s)}
          fs={fs} onFs={toggleFs} onShare={share} onThumbs={() => setThumbs(true)} embed={false} accent="#204262" />
      </div>
      <Sheet open={thumbs} onOpenChange={setThumbs}>
        <SheetContent side="bottom" className="bg-[#0f1f33] border-white/10 max-h-[60vh] text-white">
          <SheetHeader><SheetTitle className="text-white font-normal">{item.label}, all pages</SheetTitle></SheetHeader>
          <div className="flex gap-3 overflow-x-auto lib-scroll py-4">
            {book.thumbs.map((t, i) => (
              <button key={t} onClick={() => { setPage(flipRef.current.go(i)); setThumbs(false); setTimeout(measure, 60); }} className={`shrink-0 w-24 rounded overflow-hidden ring-2 ${i === page ? "ring-[color:var(--mist)]" : "ring-transparent hover:ring-white/30"}`}>
                <img src={fileUrl(t)} alt="" className="w-full" /><span className="block lib-cond text-[11px] py-1 text-white/60">{i + 1}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DockRail({ items, current, onOpen }) {
  const ref = useRef(null);
  const move = (e) => {
    if (reduceMotion()) return;
    ref.current?.querySelectorAll("[data-dock]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientY - (r.top + r.height / 2));
      const s = 1 + Math.max(0, 1 - d / 140) * 0.55;
      el.style.transform = `scale(${s})`;
      el.style.marginBlock = `${(s - 1) * 22}px`;
    });
  };
  const leave = () => ref.current?.querySelectorAll("[data-dock]").forEach((el) => { el.style.transform = ""; el.style.marginBlock = ""; });
  return (
    <nav ref={ref} onMouseMove={move} onMouseLeave={leave} className="h-full overflow-y-auto lib-scroll py-4 px-3 flex flex-col gap-2.5 items-start" aria-label="All issues">
      {items.map((it) => {
        const on = it.flipbook_id === current;
        return (
          <button key={it.flipbook_id} data-dock onClick={() => onOpen(it, 0)} title={it.special ? `${it.kind}, ${it.label}` : it.label}
            className={`lib-dock-item shrink-0 w-12 rounded-[2px] overflow-hidden shadow-lg ring-2 ${on ? "ring-white" : "ring-transparent opacity-70 hover:opacity-100"}`} aria-current={on ? "true" : undefined}>
            <img src={fileUrl(it.thumb)} alt={it.label} className="w-full block" />
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ page */
export default function Library({ embed = false }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [lib, setLib] = useState(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState(null);
  const [open, setOpen] = useState(null);
  const [startPage, setStartPage] = useState(0);
  const [searchSheet, setSearchSheet] = useState(false);
  const hero = useTilt(7);
  const focusTimer = useRef(0);

  useEffect(() => {
    publicApi.get(`/public/libraries/${slug}`).then((r) => {
      setLib(r.data);
      document.title = r.data.title + (r.data.brand.name ? ` | ${r.data.brand.name}` : "");
      const want = params.get("issue");
      const it = r.data.items.find((i) => i.flipbook_id === want);
      if (it) { setOpen(it); setStartPage(Math.max(0, (parseInt(params.get("page"), 10) || 1) - 1)); }
    }).catch(() => setError("This library isn't available. Check the link, or ask the publisher for a new one."));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => lib?.items || [], [lib]);
  const latest = useMemo(() => items.find((i) => !i.special) || items[0], [items]);
  const featured = focus || latest;
  const shelves = useMemo(() => {
    const years = {};
    items.filter((i) => !i.special).forEach((i) => { const y = yearOf(i) || "Other"; (years[y] = years[y] || []).push(i); });
    const rows = Object.entries(years).sort((a, b) => b[0].localeCompare(a[0])).map(([y, list]) => ({ key: y, title: y, list }));
    const sp = items.filter((i) => i.special);
    if (sp.length) rows.push({ key: "special", title: "Special editions", list: sp });
    return rows;
  }, [items]);

  const onFocus = (it) => { clearTimeout(focusTimer.current); focusTimer.current = setTimeout(() => setFocus(it), 90); };
  const openIssue = (it, page = 0) => {
    setOpen(it); setStartPage(page); setSearchSheet(false);
    setParams((p) => { p.set("issue", it.flipbook_id); if (page) p.set("page", String(page + 1)); else p.delete("page"); return p; }, { replace: true });
  };
  const back = () => { setOpen(null); setParams((p) => { p.delete("issue"); p.delete("page"); return p; }, { replace: true }); };

  if (error) return <div className="lib min-h-screen grid place-items-center px-6 text-center text-white/70">{error}</div>;
  if (!lib) return <div className="lib min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-white/40" /></div>;

  const { brand } = lib;
  const logo = brand.logo ? <img src={fileUrl(brand.logo)} alt={brand.name || "Home"} className="h-6 sm:h-7 w-auto max-w-[140px] object-contain brightness-0 invert" /> : <BookOpen className="w-5 h-5" />;
  const backdrop = (open || featured)?.cover;

  return (
    <div className="lib relative h-screen w-full overflow-hidden flex flex-col" data-testid="library-root">
      {backdrop && <div key={backdrop} className="lib-backdrop lib-swap" style={{ backgroundImage: `url(${fileUrl(backdrop)})` }} aria-hidden="true" />}
      <div className="lib-veil" aria-hidden="true" />

      {/* header */}
      <header className="relative z-10 shrink-0">
        <div className="h-16 px-4 sm:px-8 flex items-center gap-4">
          {brand.website ? <a href={brand.website} target="_blank" rel="noopener noreferrer" className="shrink-0">{logo}</a> : <span className="shrink-0">{logo}</span>}
          <span className="w-px h-6 bg-white/20" aria-hidden="true" />
          <button onClick={back} className="text-[16px] sm:text-[17px] font-normal tracking-[-0.01em] truncate hover:text-white text-white/90" data-testid="library-title">{lib.title}</button>
          <div className="ml-auto flex items-center gap-2">
            {open && <button onClick={back} className="h-9 px-4 rounded-full text-[14px] text-white/80 hover:bg-white/10 flex items-center gap-2" data-testid="library-back"><ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">All issues</span></button>}
            {items.length > 0 && <button onClick={() => setSearchSheet(true)} className="xl:hidden h-9 w-9 grid place-items-center rounded-full hover:bg-white/10" aria-label="Search"><Search className="w-4 h-4" /></button>}
          </div>
        </div>
        {brand.stripe ? <img src={fileUrl(brand.stripe)} alt="" className="h-[5px] w-full object-cover object-left opacity-30 brightness-0 invert" aria-hidden="true" /> : <div className="h-px bg-white/10" />}
      </header>

      {/* body */}
      <div className="relative z-10 flex-1 min-h-0 grid xl:grid-cols-[minmax(0,1fr)_360px] gap-0 xl:gap-6 xl:pr-6">
        {items.length === 0 ? (
          <main className="min-h-0 grid place-items-center px-6 text-center" data-testid="library-empty">
            <div className="max-w-md lib-swap">
              <p className="text-[15px] text-white/55">{lib.title}</p>
              <h1 className="mt-2 text-[clamp(32px,4vw,48px)] font-light leading-tight tracking-[-0.02em]">No issues published yet</h1>
              <p className="mt-4 text-[15px] text-white/60 leading-relaxed">Issues appear here as soon as they're added to this library.</p>
            </div>
          </main>
        ) : !open ? (
          <main className="min-h-0 overflow-y-auto lib-scroll" data-testid="library-browse">
            {/* hero: the one bold moment */}
            <section className="px-4 sm:px-8 lg:px-12 pt-10 sm:pt-12 pb-6 grid md:grid-cols-[minmax(0,1fr)_auto] gap-8 md:gap-14 items-center min-h-[54vh]" {...hero.bind}>
              <div key={featured?.flipbook_id} className="lib-swap max-w-xl order-2 md:order-1">
                <p className="text-[15px] text-white/60">{featured?.special ? featured.kind : featured?.flipbook_id === latest?.flipbook_id ? "Latest issue" : "From the archive"}</p>
                <h1 className="mt-2 leading-[0.92] tracking-[-0.035em]">
                  <span className="block text-[clamp(56px,8.5vw,120px)] font-light">{featured?.special ? monthOf(featured) : monthOf(featured)}</span>
                  <span className="block text-[clamp(30px,4vw,56px)] font-light text-[color:var(--mist)]">{yearOf(featured)}</span>
                </h1>
                {featured?.toc?.length > 0 && (
                  <div className="mt-7 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {featured.toc.map((s) => <span key={s.section} className="lib-cond h-7 px-3 rounded-full bg-white/[0.08] border border-white/10 text-[13px] text-white/80 inline-flex items-center">{s.section}</span>)}
                    </div>
                    <ul className="space-y-1.5 text-[15px] text-white/75 leading-snug max-w-lg">
                      {featured.toc.flatMap((s) => s.items.slice(0, 1)).slice(0, 3).map((h, i) => <li key={i} className="line-clamp-1">{h.title}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-8 flex items-center gap-4">
                  <button onClick={() => openIssue(featured, 0)} className="h-12 px-7 rounded-full bg-white text-[color:var(--ink)] text-[15px] font-medium hover:bg-[color:var(--paper)] active:scale-[0.98] transition" data-testid="library-read">Read {featured?.special ? "edition" : monthOf(featured)}</button>
                  <span className="lib-cond text-[13px] text-white/50">{featured?.page_count} pages</span>
                </div>
              </div>
              <div className="lib-tilt order-1 md:order-2 justify-self-center md:justify-self-end lib-enter">
                <button onClick={() => openIssue(featured, 0)} aria-label={`Open ${featured?.label}`} className="block focus:outline-none">
                  <Cover key={featured?.flipbook_id} src={featured?.cover} aspect={featured?.aspect} width="clamp(200px, 23vw, 340px)" reflect coverRef={hero.target} eager />
                </button>
              </div>
            </section>

            {/* shelves */}
            <div className="pb-10 space-y-9">
              {shelves.map((row) => (
                <section key={row.key} aria-label={row.title}>
                  <div className="px-4 sm:px-8 lg:px-12 flex items-baseline gap-3 mb-4">
                    <h2 className={row.key === "special" ? "text-[22px] font-light" : "text-[34px] font-thin tracking-[-0.03em] leading-none"}>{row.title}</h2>
                    <span className="lib-cond text-[13px] text-white/45">{row.list.length} {row.list.length === 1 ? "issue" : "issues"}</span>
                  </div>
                  <div className="lib-shelf flex gap-5 sm:gap-7 overflow-x-auto px-4 sm:px-8 lg:px-12 scroll-px-4 sm:scroll-px-8 lg:scroll-px-12 pb-4 pt-3">
                    {row.list.map((it) => <ShelfCard key={it.flipbook_id} item={it} focused={featured?.flipbook_id === it.flipbook_id} onFocus={onFocus} onOpen={(x) => openIssue(x, 0)} />)}
                  </div>
                </section>
              ))}
            </div>

            <footer className="px-4 sm:px-8 lg:px-12 pb-8 pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/45">
              {brand.footer && <span>{brand.footer}</span>}
              {brand.website && <a href={brand.website} target="_blank" rel="noopener noreferrer" className="hover:text-white">{brand.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
              {lib.show_badge && <a href="/" target="_blank" rel="noopener noreferrer" className="ml-auto hover:text-white">Made with FlipCraft</a>}
            </footer>
          </main>
        ) : (
          <main className="min-h-0 grid grid-cols-1 md:grid-cols-[84px_minmax(0,1fr)]" data-testid="library-reading">
            <div className="hidden md:block min-h-0 border-r border-white/[0.06]"><DockRail items={items} current={open.flipbook_id} onOpen={openIssue} /></div>
            <Reader slug={slug} item={open} items={items} startPage={startPage} embed={embed} onOpen={openIssue} onBack={back} />
          </main>
        )}
        <div className={`${items.length ? "hidden xl:block" : "hidden"} min-h-0 py-6`}><SearchPanel slug={slug} lib={lib} current={open} onOpen={openIssue} /></div>
      </div>

      {searchSheet && (
        <div className="xl:hidden fixed inset-0 z-50 bg-[color:var(--ink)]/80 backdrop-blur-sm p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="h-full max-w-lg ml-auto"><SearchPanel slug={slug} lib={lib} current={open} onOpen={openIssue} onClose={() => setSearchSheet(false)} autoFocus /></div>
        </div>
      )}
    </div>
  );
}
