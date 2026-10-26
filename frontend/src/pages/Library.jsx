import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Check, Loader2, MailPlus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { FlipBook } from "../components/viewer/FlipBook";
import { ViewerToolbar } from "../components/viewer/ViewerToolbar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { copyText, errMsg, fileUrl, publicApi, track } from "../lib/api";
import { playFlip } from "../lib/flipSound";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const monthOf = (it) => (it?.label || "").split(" ")[0];
const yearOf = (it) => (it?.date || "").slice(0, 4) || (it?.label || "").split(" ").slice(-1)[0];
const issueName = (it) => (it?.special ? `${it.kind}, ${it.label}` : it?.label || "");
const shortLabel = (it) => (it?.special ? (it.kind || "Special").replace(/\s*edition$/i, "") : `${monthOf(it).slice(0, 3)} ${yearOf(it).slice(2)}`);
const WIDE = 1280;
const isWide = () => window.innerWidth >= WIDE;

/* Issues are fetched once and reused, and fetched early when a cover is hovered,
   so the opening animation never waits on the network. */
const bookCache = new Map();
function loadBook(id) {
  if (!bookCache.has(id)) {
    const p = publicApi.get(`/flipbooks/${id}`).then((r) => {
      r.data.pages.slice(0, 3).forEach((src) => { const im = new Image(); im.src = fileUrl(src); });
      return r.data;
    });
    p.catch(() => bookCache.delete(id));
    bookCache.set(id, p);
  }
  return bookCache.get(id);
}
const prefetch = (it) => { if (it?.flipbook_id) loadBook(it.flipbook_id).catch(() => {}); };

/* Topics come from each issue's contents page; the same subject is often written
   several ways ("FTP", "Foreign Trade Policy"), so known ones are folded together. */
const TOPIC_RULES = [
  ["Income Tax", /income.?tax|direct tax|\btds\b/i],
  ["GST", /goods and services|\bgst/i],
  ["Customs", /customs/i],
  ["Foreign Trade", /foreign trade|\bftp\b/i],
  ["FEMA", /\bfema\b/i],
  ["Companies Act", /compan(y|ies)/i],
  ["SEBI", /\bsebi\b/i],
];
function topicsOf(it) {
  const out = new Set();
  (it.toc || []).forEach((s) => {
    const rule = TOPIC_RULES.find(([, re]) => re.test(s.section));
    if (rule) out.add(rule[0]);
    else if (/^[A-Za-z]/.test(s.section) && s.section.length < 28) out.add(s.section.replace(/\b\w/g, (c) => c.toUpperCase()));
  });
  if (it.special) out.add("Special editions");
  return [...out];
}

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

function ShelfCard({ item, onFocus, onOpen, focused, stacked = false }) {
  const { target, bind } = useTilt(12);
  const special = item.special;
  return (
    <button
      type="button"
      className="lib-card lib-tilt group shrink-0 text-left w-[132px] sm:w-[150px] focus:outline-none"
      data-focus={focused ? "1" : "0"}
      onMouseEnter={() => { onFocus(item); prefetch(item); }}
      onFocus={() => { onFocus(item); prefetch(item); }}
      onClick={(e) => onOpen(item, e.currentTarget.querySelector(".lib-cover"))}
      {...bind}
      aria-label={`Open ${issueName(item)}`}
      data-testid={`shelf-${item.flipbook_id}`}
    >
      <Cover src={item.thumb || item.cover} aspect={item.aspect} width="100%" coverRef={target} />
      <div className={`pt-3 pr-2 transition-opacity duration-300 ${stacked ? "opacity-0" : "opacity-100"}`}>
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

// "Singhvi Dev & Unni LLP" -> "SDU"; used to name the assistant ("Ask SDU").
function shortName(name = "") {
  const skip = /^(llp|ltd|limited|pvt|private|inc|co|company|and|&|the|of)$/i;
  const words = name.replace(/[.,]/g, " ").split(/\s+/).filter((w) => w && !skip.test(w) && /^[A-Z]/.test(w));
  if (!words.length) return "";
  return words.length === 1 ? words[0] : words.map((w) => w[0]).join("").toUpperCase();
}

// The contents-page headline that sits on (or just before) a page.
function headlineAt(item, page) {
  const all = (item?.toc || []).flatMap((s) => s.items.map((h) => ({ ...h, section: s.section }))).filter((h) => h.page != null);
  if (!all.length) return null;
  const exact = all.find((h) => h.page === page);
  if (exact) return exact;
  const before = all.filter((h) => h.page < page).sort((a, b) => b.page - a.page)[0];
  return before && page - before.page <= 2 ? before : null;
}

function useSearch(slug, q) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      publicApi.get(`/public/libraries/${slug}/search`, { params: { q: term } })
        .then((r) => setRes(r.data)).catch(() => setRes({ results: [], terms: [], query: term })).finally(() => setBusy(false));
    }, 240);
    return () => clearTimeout(t);
  }, [q, slug]);
  return { res, busy };
}

function useSuggestions(lib) {
  return useMemo(() => {
    const counts = {};
    lib.items.forEach((it) => it.toc?.forEach((s) => { counts[s.section] = (counts[s.section] || 0) + s.items.length; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => k.length < 24).slice(0, 5);
    return [...new Set(["GSTAT", "TDS", ...top])].slice(0, 7);
  }, [lib]);
}

function groupHits(res, onlyIssue) {
  if (!res) return [];
  const list = onlyIssue ? res.results.filter((r) => r.flipbook_id === onlyIssue) : res.results;
  const by = new Map();
  list.forEach((r) => { if (!by.has(r.flipbook_id)) by.set(r.flipbook_id, []); by.get(r.flipbook_id).push(r); });
  return [...by.values()];
}

function HitGroup({ group, lib, terms, onOpen }) {
  const meta = lib.items.find((i) => i.flipbook_id === group[0].flipbook_id) || {};
  return (
    <section className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden lib-swap">
      <header className="flex items-center gap-3 px-3 pt-3 pb-2">
        <img src={fileUrl(meta.thumb)} alt="" className="w-8 rounded-[2px] shadow-md" />
        <div className="min-w-0">
          <div className="text-[14px] font-medium truncate">{issueName(meta)}</div>
          <div className="lib-cond text-[12px] text-white/45">{group.length} {group.length === 1 ? "match" : "matches"}</div>
        </div>
      </header>
      {group.slice(0, 4).map((r) => (
        <button key={r.page} onClick={() => onOpen(meta, r.page)} className="w-full text-left px-3 py-2.5 hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus:outline-none transition-colors flex gap-3" data-testid={`search-hit-${r.flipbook_id}-${r.page}`}>
          <span className="lib-cond shrink-0 w-11 text-[12px] text-[color:var(--mist)] pt-0.5">Page {r.page + 1}</span>
          <span className="text-[13.5px] leading-relaxed text-white/80 line-clamp-3">{highlight(r.snippet, terms)}</span>
        </button>
      ))}
    </section>
  );
}

/* Side panel while reading: what this page links to elsewhere, plus search. */
function SearchPanel({ slug, lib, current, readPage, onOpen, onClose, autoFocus }) {
  const [q, setQ] = useState("");
  const [related, setRelated] = useState(null);
  const [scope, setScope] = useState("all");
  const { res, busy } = useSearch(slug, q);
  const inputRef = useRef(null);
  const suggestions = useSuggestions(lib);
  useEffect(() => { if (autoFocus) setTimeout(() => inputRef.current?.focus(), 50); }, [autoFocus]);

  useEffect(() => {
    if (!current || readPage == null) { setRelated(null); return; }
    const t = setTimeout(() => {
      publicApi.get(`/public/libraries/${slug}/related`, { params: { flipbook_id: current.flipbook_id, page: readPage } })
        .then((r) => setRelated(r.data.results)).catch(() => setRelated([]));
    }, 350);
    return () => clearTimeout(t);
  }, [slug, current, readPage]);

  const groups = useMemo(() => groupHits(res, scope === "issue" && current ? current.flipbook_id : null), [res, scope, current]);
  const total = groups.reduce((a, g) => a + g.length, 0);
  const assistant = `Ask ${shortName(lib.brand?.name) || "the archive"}`;
  const here = current && readPage != null ? headlineAt(current, readPage) || headlineAt(current, readPage + 1) : null;

  return (
    <aside className="lib-glass h-full rounded-2xl flex flex-col min-h-0 overflow-hidden" aria-label={assistant} data-testid="library-search">
      <div className="p-5 pb-4 space-y-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Barcode count={7} active={3} height={18} />
          <div className="min-w-0">
            <h2 className="text-[17px] font-medium leading-tight">{assistant}</h2>
            <p className="text-[12.5px] text-white/50 leading-tight mt-0.5 truncate">Searches all {lib.items.length} issues</p>
          </div>
          {onClose && <button onClick={onClose} className="ml-auto w-8 h-8 grid place-items-center rounded-full hover:bg-white/10" aria-label={`Close ${assistant}`} data-testid="ask-close"><X className="w-4 h-4" /></button>}
        </div>
        <label className="relative block">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about GSTAT, TDS, FEMA..."
            onKeyDown={(e) => e.key === "Escape" && (q ? setQ("") : onClose?.())}
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
        {!res && current && related?.length > 0 && (
          <div className="pb-3" data-testid="related-pages">
            <div className="px-2 pt-1 pb-3">
              <p className="lib-cond text-[12px] text-white/45">You're reading page {readPage + 1}</p>
              {here && <p className="text-[13.5px] text-white/85 leading-snug mt-1 line-clamp-2" data-testid="related-context"><span className="text-[color:var(--mist)]">{here.section}:</span> {here.title}</p>}
            </div>
            <h3 className="px-2 pb-2 text-[13px] text-white/55">The same subject in other issues</h3>
            <div className="space-y-1">
              {related.map((r) => {
                const meta = lib.items.find((i) => i.flipbook_id === r.flipbook_id) || {};
                const there = headlineAt(meta, r.page);
                return (
                  <button key={r.flipbook_id + r.page} onClick={() => onOpen(meta, r.page)} className="w-full text-left rounded-xl px-2.5 py-2.5 hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus:outline-none transition-colors flex gap-3 lib-swap" data-testid={`related-${r.flipbook_id}-${r.page}`}>
                    <img src={fileUrl(r.thumb)} alt="" className="w-9 shrink-0 self-start rounded-[2px] shadow-md bg-white" />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{issueName(meta)}<span className="lib-cond font-normal text-[12px] text-[color:var(--mist)] ml-2">Page {r.page + 1}</span></span>
                      <span className="block text-[13px] leading-snug text-white/70 line-clamp-2 mt-0.5">{there ? there.title : highlight(r.snippet, r.terms)}</span>
                      {r.terms?.length > 0 && <span className="lib-cond block text-[11.5px] text-white/40 mt-1 truncate">Shared terms: {r.terms.slice(0, 3).join(", ")}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!res && (
          <div className="p-2 space-y-4">
            <p className="text-[14px] text-white/60 leading-relaxed">{current ? "Or search every issue. Results open at the right page." : "Search every issue. Results open the issue at the right page."}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setQ(s)} className="h-8 px-3 rounded-full border border-white/15 text-[13px] text-white/80 hover:bg-white/10 hover:border-white/30 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {res && total === 0 && !busy && <p className="p-3 text-[14px] text-white/60">No pages mention “{res.query}”. Try a shorter phrase or a form or section number.</p>}
        {res && total > 0 && <p className="lib-cond px-2 pb-2 text-[12px] text-white/45">{total} {total === 1 ? "page" : "pages"} in {groups.length} {groups.length === 1 ? "issue" : "issues"}</p>}
        <div className="space-y-2">
          {groups.map((g) => <HitGroup key={g[0].flipbook_id} group={g} lib={lib} terms={res.terms} onOpen={onOpen} />)}
        </div>
      </div>
    </aside>
  );
}

/* Home screen search: one large bar, Google style. It drops in on click or "/",
   and folds away when the pointer leaves it with nothing typed. */
function Spotlight({ slug, lib, topics, closing, onOpen, onTopic, onClose }) {
  const [q, setQ] = useState("");
  const { res, busy } = useSearch(slug, q);
  const suggestions = useSuggestions(lib);
  const inputRef = useRef(null);
  const leave = useRef(0);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(t); }, []);
  useEffect(() => () => clearTimeout(leave.current), []);
  const groups = useMemo(() => groupHits(res), [res]);
  const total = groups.reduce((a, g) => a + g.length, 0);
  const assistant = `Ask ${shortName(lib.brand?.name) || "the archive"}`;
  return (
    <div className={`absolute inset-0 top-16 z-40 ${closing ? "lib-spot-out" : "lib-spot-in"}`} role="dialog" aria-label={assistant} data-testid="spotlight">
      <button className="absolute inset-0 w-full h-full bg-[#0a1626]/60 backdrop-blur-[6px] cursor-default lib-fade" onClick={onClose} aria-label="Close search" tabIndex={-1} />
      <div className="lib-spot relative mx-auto mt-5 w-[min(880px,calc(100vw-24px))]"
        onMouseLeave={() => { if (!q.trim()) leave.current = setTimeout(onClose, 650); }} onMouseEnter={() => clearTimeout(leave.current)}>
        <label className="lib-glass bg-[#10233a]/85 lib-spot-bar flex items-center gap-3 h-16 rounded-full pl-5 pr-3 shadow-2xl">
          <Barcode count={5} active={2} height={18} />
          <span className="hidden sm:inline text-[15px] text-[color:var(--mist)] shrink-0">{assistant}</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every issue: GSTAT, TDS on rent, FEMA reporting..."
            onKeyDown={(e) => e.key === "Escape" && (q ? setQ("") : onClose())}
            className="flex-1 min-w-0 bg-transparent text-[18px] sm:text-[19px] placeholder:text-white/40 focus:outline-none" data-testid="spotlight-input" />
          {busy && <Loader2 className="w-5 h-5 animate-spin text-white/50 shrink-0" />}
          {q && !busy && <button onClick={() => { setQ(""); inputRef.current?.focus(); }} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 shrink-0" aria-label="Clear"><X className="w-4 h-4" /></button>}
          <kbd className="hidden sm:inline lib-cond text-[11px] text-white/45 border border-white/15 rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </label>

        <div className="lib-glass bg-[#0f1f33]/85 mt-3 rounded-3xl overflow-hidden lib-spot-panel">
          <div className="max-h-[min(62vh,620px)] overflow-y-auto lib-scroll p-4 sm:p-5">
            {!res && (
              <div className="space-y-5">
                <div>
                  <p className="lib-cond text-[12.5px] text-white/50 mb-2">Try</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => <button key={s} onClick={() => setQ(s)} className="h-9 px-3.5 rounded-full border border-white/15 text-[14px] text-white/85 hover:bg-white/10 hover:border-white/30 transition-colors">{s}</button>)}
                  </div>
                </div>
                {topics.length > 0 && (
                  <div>
                    <p className="lib-cond text-[12.5px] text-white/50 mb-2">Or browse issues by topic</p>
                    <div className="flex flex-wrap gap-2">
                      {topics.map(([t, n]) => <button key={t} onClick={() => onTopic(t)} className="h-9 px-3.5 rounded-full bg-white/[0.08] text-[14px] text-white/85 hover:bg-white/15 transition-colors">{t}<span className="lib-cond ml-2 text-[12px] text-white/45">{n}</span></button>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            {res && total === 0 && !busy && <p className="text-[15px] text-white/65">No pages mention “{res.query}”. Try a shorter phrase, or a form or section number.</p>}
            {res && total > 0 && <p className="lib-cond pb-3 text-[12.5px] text-white/50">{total} {total === 1 ? "page" : "pages"} in {groups.length} {groups.length === 1 ? "issue" : "issues"}</p>}
            <div className="grid md:grid-cols-2 gap-2.5 items-start">
              {groups.map((g) => <HitGroup key={g[0].flipbook_id} group={g} lib={lib} terms={res.terms} onOpen={onOpen} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ subscribe */
const SUB_KEY = (slug) => `flipcraft_sub_${slug}`;
function readSubscribed(slug) { try { return localStorage.getItem(SUB_KEY(slug)) === "1"; } catch { return false; } }

function SubscribeDialog({ slug, lib, topics, issue, onClose, onDone }) {
  const brand = shortName(lib.brand?.name) || lib.brand?.name || "us";
  const [f, setF] = useState({ name: "", email: "", organisation: "", phone: "", message: "", website: "" });
  const [interests, setInterests] = useState([]);
  const [state, setState] = useState("form");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState("sending");
    try {
      await publicApi.post(`/public/libraries/${slug}/subscribe`, { ...f, interests, issue: issue?.flipbook_id || "" });
      try { localStorage.setItem(SUB_KEY(slug), "1"); } catch { /* private mode */ }
      setState("done");
      onDone();
    } catch (err) { toast.error(errMsg(err)); setState("form"); }
  };
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const field = "w-full h-11 rounded-xl bg-black/25 border border-white/12 px-3.5 text-[15px] placeholder:text-white/35 focus:outline-none focus:border-[color:var(--mist)] transition-colors";
  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-3 sm:p-6 lib-spot-in" role="dialog" aria-modal="true" aria-label={`Subscribe to ${lib.title}`} data-testid="subscribe-dialog">
      <button className="absolute inset-0 w-full h-full bg-[#0a1626]/70 backdrop-blur-sm cursor-default" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="lib-glass lib-spot relative w-[min(560px,100%)] max-h-full overflow-y-auto lib-scroll rounded-3xl p-6 sm:p-8 bg-[#0f1f33]/80">
        <button onClick={onClose} className="absolute right-4 top-4 w-9 h-9 grid place-items-center rounded-full hover:bg-white/10" aria-label="Close"><X className="w-4 h-4" /></button>
        {state === "done" ? (
          <div className="py-6 text-center lib-swap">
            <div className="mx-auto w-12 h-12 rounded-full bg-white text-[color:var(--ink)] grid place-items-center"><Check className="w-6 h-6" /></div>
            <h2 className="mt-5 text-[26px] font-light">Thank you{f.name ? `, ${f.name.split(" ")[0]}` : ""}.</h2>
            <p className="mt-2 text-[15px] text-white/65 leading-relaxed">You're on the list for the {lib.title}. Someone from {brand} will be in touch.</p>
            <button onClick={onClose} className="mt-7 h-11 px-6 rounded-full bg-white text-[color:var(--ink)] text-[15px] font-medium">Back to the library</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-3"><Barcode count={7} active={3} height={18} /><span className="lib-cond text-[13px] text-[color:var(--mist)]">{lib.title}</span></div>
            <div>
              <h2 className="text-[28px] font-light leading-tight tracking-[-0.01em]">Join {brand}'s network</h2>
              <p className="mt-2 text-[14.5px] text-white/65 leading-relaxed">Receive each issue when it's published, along with {brand}'s updates and invitations. Tell us what matters to you and we'll follow up.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input required value={f.name} onChange={set("name")} placeholder="Your name" autoComplete="name" className={field} data-testid="sub-name" />
              <input required type="email" value={f.email} onChange={set("email")} placeholder="Work email" autoComplete="email" className={field} data-testid="sub-email" />
              <input value={f.organisation} onChange={set("organisation")} placeholder="Organisation" autoComplete="organization" className={field} />
              <input value={f.phone} onChange={set("phone")} placeholder="Phone (optional)" autoComplete="tel" className={field} />
            </div>
            <input value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            {topics.length > 0 && (
              <div>
                <p className="text-[13px] text-white/55 mb-2">Areas of interest</p>
                <div className="flex flex-wrap gap-2">
                  {topics.map(([t]) => {
                    const on = interests.includes(t);
                    return <button type="button" key={t} onClick={() => setInterests(on ? interests.filter((x) => x !== t) : [...interests, t])} aria-pressed={on}
                      className={`h-8 px-3 rounded-full text-[13px] transition-colors ${on ? "bg-white text-[color:var(--ink)]" : "border border-white/15 text-white/80 hover:bg-white/10"}`}>{t}</button>;
                  })}
                </div>
              </div>
            )}
            <textarea value={f.message} onChange={set("message")} rows={2} placeholder="Anything you'd like to discuss? (optional)" className={`${field} h-auto py-2.5 resize-none`} />
            <button disabled={state === "sending"} className="w-full h-12 rounded-full bg-white text-[color:var(--ink)] text-[15px] font-medium hover:bg-[color:var(--paper)] disabled:opacity-60 flex items-center justify-center gap-2" data-testid="sub-submit">
              {state === "sending" && <Loader2 className="w-4 h-4 animate-spin" />}Subscribe
            </button>
            <p className="text-[12px] text-white/45 leading-relaxed">By subscribing you agree that {brand} may contact you about this publication and related services. You can ask to be removed at any time.</p>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ barcode
   The SDU barcode motif, made meaningful: one bar per issue (or per page in the
   reader). The current bar rises and brightens; its neighbours lift a little,
   so the code ripples as you move through the archive. */
function Barcode({ count, active = -1, done, onPick, labels = [], height = 22, className = "" }) {
  return (
    <div className={`flex items-end gap-[3px] ${className}`} style={{ height }} role={onPick ? "tablist" : undefined} aria-label={onPick ? "Issues" : undefined}>
      {Array.from({ length: count }, (_, i) => {
        const d = Math.abs(i - active);
        const on = d === 0;
        const h = on ? 100 : d === 1 ? 72 : d === 2 ? 58 : 46;
        const tone = on ? "bg-white" : done?.has(i) ? "bg-[color:var(--mist)]" : d <= 2 ? "bg-white/55" : "bg-white/30";
        const bar = <span className={`lib-bar block w-[2px] rounded-[1px] ${tone}`} style={{ height: `${h}%`, animationDelay: `${Math.min(i, 40) * 18}ms` }} />;
        return onPick ? (
          <button key={i} type="button" onClick={() => onPick(i)} aria-label={labels[i] || `Item ${i + 1}`} aria-selected={on} role="tab"
            className="h-full px-[1.5px] -mx-[1.5px] flex items-end focus:outline-none focus-visible:ring-1 focus-visible:ring-white/70 rounded-sm">{bar}</button>
        ) : <span key={i} className="h-full flex items-end">{bar}</span>;
      })}
    </div>
  );
}

// The brand stripe as it sits in the corner of SDU's slides: even, quiet bars.
function BrandBars({ className = "" }) {
  return <div className={`lib-brandbars pointer-events-none ${className}`} aria-hidden="true" />;
}

function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, []);
  return m;
}

function TopicBar({ topics, topic, onTopic, total, className = "" }) {
  if (topics.length < 2) return null;
  const chip = (key, label, n) => {
    const on = topic === key;
    return (
      <button key={key} onClick={() => onTopic(key)} aria-pressed={on} data-testid={`topic-${key}`}
        className={`shrink-0 h-9 px-4 rounded-full text-[14px] transition-all duration-300 ${on ? "bg-white text-[color:var(--ink)] shadow-lg" : "bg-white/[0.07] text-white/80 hover:bg-white/[0.14] hover:text-white"}`}>
        {label}<span className={`lib-cond ml-2 text-[12px] ${on ? "text-[color:var(--steel)]" : "text-white/40"}`}>{n}</span>
      </button>
    );
  };
  return (
    <div className={`flex gap-2 overflow-x-auto lib-noscroll ${className}`} role="toolbar" aria-label="Filter by topic">
      {chip("all", "All", total)}
      {topics.map(([t, n]) => chip(t, t, n))}
    </div>
  );
}

/* Phone browsing: swipe through covers, Cover Flow style. */
function MobileBrowse({ items, latest, onOpen, onActive }) {
  const ref = useRef(null);
  const raf = useRef(0);
  const cur = useRef(0);
  const [idx, setIdx] = useState(0);
  const layout = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, bd = Infinity;
    [...el.children].forEach((ch, i) => {
      const d = (ch.offsetLeft + ch.offsetWidth / 2 - mid) / ch.offsetWidth;
      const a = Math.max(-1.4, Math.min(1.4, d));
      const card = ch.firstChild;
      if (!reduceMotion()) card.style.transform = `perspective(1100px) translateX(${-a * 14}%) rotateY(${-a * 40}deg) scale(${1 - Math.min(Math.abs(a), 1) * 0.18})`;
      card.style.opacity = String(1 - Math.min(Math.abs(a), 1) * 0.45);
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = i; }
    });
    if (best !== cur.current || !items[best]) { cur.current = best; setIdx(best); }
    if (items[best]) { onActive(items[best]); prefetch(items[best]); }
  }, [items, onActive]);
  useEffect(() => { cur.current = -1; layout(); }, [layout]);
  const go = (i) => {
    const el = ref.current, ch = el?.children[i];
    if (ch) el.scrollTo({ left: ch.offsetLeft - (el.clientWidth - ch.offsetWidth) / 2, behavior: reduceMotion() ? "auto" : "smooth" });
  };
  const it = items[idx];
  return (
    <div className="flex flex-col pb-6" data-testid="library-mobile">
      <div ref={ref} onScroll={() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(layout); }}
        className="lib-noscroll flex overflow-x-auto pt-4 pb-2" style={{ scrollSnapType: "x mandatory", paddingInline: "calc(50vw - min(26vw, 125px))" }}>
        {items.map((x, i) => (
          <div key={x.flipbook_id} className="shrink-0 w-[52vw] max-w-[250px] px-1.5" style={{ scrollSnapAlign: "center" }}>
            <button type="button" onClick={(e) => (i === idx ? onOpen(x, e.currentTarget.querySelector(".lib-cover")) : go(i))} className="block w-full will-change-transform" aria-label={`${i === idx ? "Open" : "Show"} ${x.label}`} data-testid={`carousel-${x.flipbook_id}`}>
              <Cover src={x.cover || x.thumb} aspect={x.aspect} width="100%" eager={i < 3} />
            </button>
          </div>
        ))}
      </div>
      <div className="px-6 flex justify-center pt-2"><Barcode count={items.length} active={idx} onPick={go} labels={items.map((x) => x.label)} height={24} /></div>
      {it && (
        <div key={it.flipbook_id} className="lib-swap px-6 pt-4 text-center">
          <p className="text-[14px] text-white/55">{it.special ? it.kind : it.flipbook_id === latest?.flipbook_id ? "Latest issue" : "From the archive"}</p>
          <h1 className="mt-1 leading-none tracking-[-0.03em]">
            <span className="text-[clamp(36px,11vw,48px)] font-light">{monthOf(it)}</span>
            <span className="ml-2.5 text-[clamp(20px,6vw,26px)] font-light text-[color:var(--mist)]">{yearOf(it)}</span>
          </h1>
          <button onClick={() => onOpen(it, ref.current?.children[idx]?.querySelector(".lib-cover"))} className="mt-5 h-12 px-8 rounded-full bg-white text-[color:var(--ink)] text-[15px] font-medium active:scale-[0.98] transition" data-testid="mobile-read">Read {it.special ? "edition" : monthOf(it)}</button>
          <p className="lib-cond mt-3 text-[12.5px] text-white/45">{it.page_count} pages. Swipe for other issues.</p>
        </div>
      )}
    </div>
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

function NextPanel({ next, onOpen, onBack, onSubscribe, subscribed }) {
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
      {!subscribed && (
        <button onClick={onSubscribe} className="mt-8 self-start max-w-xs text-left rounded-2xl lib-glass px-4 py-3.5 hover:bg-white/10 transition-colors" data-testid="next-subscribe">
          <span className="flex items-center gap-2 text-[15px]"><MailPlus className="w-4 h-4" />Get the next issue first</span>
          <span className="block text-[13px] text-white/55 mt-1">Subscribe and we'll send it when it's published.</span>
        </button>
      )}
      <button onClick={onBack} className="mt-6 self-start text-[14px] text-white/70 hover:text-white underline-offset-4 hover:underline">Back to all issues</button>
    </div>
  );
}

function Reader({ slug, item, items, startPage, embed, onOpen, onBack, onPage, onShown, onSubscribe, subscribed }) {
  const [book, setBook] = useState(null);
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sound, setSound] = useState(true);
  const [fs, setFs] = useState(false);
  const [thumbs, setThumbs] = useState(false);
  const [rect, setRect] = useState(null);
  const [seen, setSeen] = useState(() => new Set([0]));
  const [contents, setContents] = useState(false);
  const flipRef = useRef(null);
  const rootRef = useRef(null);
  const soundRef = useRef(true);
  soundRef.current = sound;
  const pending = useRef(startPage);
  const shown = useRef(false);

  useEffect(() => {
    let live = true;
    setBook(null); setPage(0); setSeen(new Set([startPage || 0])); pending.current = startPage; shown.current = false;
    loadBook(item.flipbook_id).then((data) => {
      if (!live) return;
      setBook(data); setSound(data.sound);
      let tz = "";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browsers */ }
      track(item.flipbook_id, { open: true, pages: [startPage || 0], source: embed ? "embed" : "link", tz });
    }).catch(() => { toast.error("This issue couldn't be opened"); onShown?.(null); });
    // reading time, counted only while the page is actually visible
    const beat = setInterval(() => { if (document.visibilityState === "visible") track(item.flipbook_id, { seconds: 15 }); }, 15000);
    return () => { live = false; clearInterval(beat); };
  }, [item.flipbook_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (startPage && book) { flipRef.current?.go(startPage); } }, [startPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = useCallback(() => { const r = flipRef.current?.rect(); setRect(r ? { ...r } : null); setPortrait(flipRef.current?.orientation() === "portrait"); }, []);
  useEffect(() => {
    const k = (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === "ArrowRight") flipRef.current?.next(); if (e.key === "ArrowLeft") flipRef.current?.prev(); };
    const f = () => setFs(!!document.fullscreenElement);
    const r = () => setTimeout(() => { flipRef.current?.update(); measure(); }, 80);
    const live = () => { flipRef.current?.update(); measure(); };
    window.addEventListener("keydown", k); window.addEventListener("resize", r); window.addEventListener("lib-relayout", live); document.addEventListener("fullscreenchange", f);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("resize", r); window.removeEventListener("lib-relayout", live); document.removeEventListener("fullscreenchange", f); };
  }, [measure]);
  useEffect(() => { const t = setTimeout(() => { flipRef.current?.update(); measure(); }, 40); return () => clearTimeout(t); }, [zoom, fs, measure]);

  // Tell the page where the cover landed, once its image has painted, so the flying cover can hand over.
  const announce = useCallback(() => {
    if (shown.current || !onShown) return;
    const stage = rootRef.current?.querySelector("[data-testid=flipbook-stage]");
    const r = flipRef.current?.rect();
    if (!stage || !r) return;
    shown.current = true;
    const img = stage.querySelector("img");
    const done = () => {
      const s = stage.getBoundingClientRect();
      const x = flipRef.current?.orientation() === "portrait" || page !== 0 ? r.left : r.left + r.pageWidth;
      onShown({ left: s.left + x, top: s.top + r.top, width: r.pageWidth, height: r.height });
    };
    if (!img || img.complete) requestAnimationFrame(done);
    else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
  }, [onShown, page]);

  const onFlip = useCallback((p, visible) => { setPage(p); setSeen((s0) => new Set([...s0, ...visible])); track(item.flipbook_id, { pages: visible }); setTimeout(measure, 30); }, [item.flipbook_id, measure]);
  const onTurnStart = useCallback(() => soundRef.current && playFlip(), []);
  const onReady = useCallback((o) => {
    setPortrait(o === "portrait");
    setTimeout(() => {
      if (pending.current) { const p = flipRef.current?.go(pending.current); if (p != null) setPage(p); pending.current = 0; }
      measure();
      announce();
    }, 60);
  }, [measure, announce]);

  useEffect(() => { onPage?.(page); }, [page, onPage]);
  const idx = items.findIndex((i) => i.flipbook_id === item.flipbook_id);
  const next = items[idx + 1];
  if (!book) return <div className="h-full grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-white/40" /></div>;
  const n = book.pages.length;
  const label = portrait || page === 0 || page === n - 1 ? `${page + 1}` : `${page + 1}–${Math.min(page + 2, n)}`;
  const blankLeft = !portrait && rect && page === 0 && zoom === 1;
  const blankRight = !portrait && rect && page === n - 1 && n % 2 === 0 && zoom === 1;
  const share = async () => { await copyText(`${window.location.origin}/library/${slug}?issue=${item.flipbook_id}&page=${page + 1}`); toast.success("Link to this page copied"); };
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current.requestFullscreen?.());

  return (
    <div ref={rootRef} className="h-full flex flex-col min-h-0" data-testid="library-reader">
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
                <NextPanel next={next} onOpen={(it) => onOpen(it, 0)} onBack={onBack} onSubscribe={onSubscribe} subscribed={subscribed} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex items-center justify-center gap-4 pt-1 pb-2 px-3">
        {portrait && item.toc?.length > 0 && (
          <button onClick={() => setContents(true)} className="h-8 px-3.5 rounded-full lib-glass text-[13px] shrink-0" data-testid="reader-contents">Contents</button>
        )}
        <Barcode count={n} active={page} done={seen} onPick={(i) => { const r = flipRef.current?.go(i); if (r != null) setPage(r); setTimeout(measure, 60); }} labels={book.pages.map((_, i) => `Page ${i + 1}`)} height={16} />
      </div>
      <div className="shrink-0 flex justify-center pb-4 pt-1">
        <ViewerToolbar label={`${label} / ${n}`} canPrev={page > 0} canNext={page < n - (portrait ? 1 : 2) || (page === 0 && n > 1)} onPrev={() => flipRef.current.prev()} onNext={() => flipRef.current.next()}
          zoom={zoom} onZoom={(d) => setZoom((z) => Math.min(3, Math.max(1, z + d)))} sound={sound} onSound={() => setSound((s) => !s)}
          fs={fs} onFs={toggleFs} onShare={share} onThumbs={() => setThumbs(true)} embed={false} accent="#204262" />
      </div>
      <Sheet open={contents} onOpenChange={setContents}>
        <SheetContent side="bottom" className="lib bg-[#0f1f33] border-white/10 h-[75vh] text-white p-0">
          <div className="h-full overflow-y-auto lib-scroll px-6 pt-8 pb-6">
            <IssuePanel item={item} onGo={(p) => { const r = flipRef.current?.go(p); if (r != null) setPage(r); setContents(false); }} onStart={() => { flipRef.current?.next(); setContents(false); }} />
          </div>
        </SheetContent>
      </Sheet>
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

/* Left rail while reading: every issue, labelled, magnifying under the pointer
   like the Mac dock, with the full name shown beside the one you're on. */
function DockRail({ items, current, onOpen }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const move = (e) => {
    if (reduceMotion()) return;
    ref.current?.querySelectorAll("[data-dock]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientY - (r.top + r.height / 2));
      const s = 1 + Math.max(0, 1 - d / 140) * 0.45;
      el.style.transform = `scale(${s})`;
      el.style.marginBlock = `${(s - 1) * 30}px`;
    });
  };
  const leave = () => { setTip(null); ref.current?.querySelectorAll("[data-dock]").forEach((el) => { el.style.transform = ""; el.style.marginBlock = ""; }); };
  const show = (it, el) => { const r = el.getBoundingClientRect(); setTip({ it, top: r.top + r.height / 2 }); };
  useEffect(() => {
    const el = ref.current?.querySelector('[aria-current="true"]');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);
  return (
    <>
      <nav ref={ref} onMouseMove={move} onMouseLeave={leave} onScroll={() => setTip(null)} className="h-full overflow-y-auto overflow-x-hidden lib-noscroll py-5 pl-4 pr-2 flex flex-col gap-3 items-start" aria-label="All issues">
        {items.map((it) => {
          const on = it.flipbook_id === current;
          return (
            <button key={it.flipbook_id} data-dock onClick={() => onOpen(it, 0)} onMouseEnter={(e) => { show(it, e.currentTarget); prefetch(it); }} onFocus={(e) => show(it, e.currentTarget)} onBlur={() => setTip(null)}
              className={`lib-dock-item shrink-0 w-12 text-center group ${on ? "" : "opacity-75 hover:opacity-100"}`} aria-current={on ? "true" : undefined} aria-label={issueName(it)}>
              <img src={fileUrl(it.thumb)} alt="" className={`w-full block rounded-[2px] shadow-lg ring-2 ${on ? "ring-white" : "ring-transparent"}`} />
              <span className={`lib-cond block mt-1 text-[10.5px] leading-none whitespace-nowrap ${on ? "text-white" : "text-white/60"}`}>{shortLabel(it)}</span>
            </button>
          );
        })}
      </nav>
      {tip && createPortal(
        <div className="lib-tipwrap" style={{ left: 104, top: tip.top }} role="tooltip">
         <div className="lib lib-tip" style={{ background: "transparent" }}>
          <div className="lib-glass rounded-xl px-3.5 py-2 bg-[#0f1f33]/85 shadow-2xl">
            <div className="text-[15px] font-medium whitespace-nowrap">{tip.it.special ? tip.it.kind : tip.it.label}</div>
            <div className="lib-cond text-[12px] text-white/55 whitespace-nowrap">{tip.it.special ? tip.it.label : `${tip.it.page_count} pages`}{tip.it.toc?.length ? `, ${topicsOf(tip.it).slice(0, 3).join(", ")}` : ""}</div>
          </div>
         </div>
        </div>, document.body
      )}
    </>
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
  const [askOpen, setAskOpen] = useState(false);
  const [askMounted, setAskMounted] = useState(false);
  const [spot, setSpot] = useState(null); // null | "open" | "closing"
  const [readPage, setReadPage] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [topic, setTopic] = useState("all");
  const [leaving, setLeaving] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(() => readSubscribed(slug));
  const hero = useTilt(7);
  const mobile = useIsMobile();
  const focusTimer = useRef(0);
  const ghost = useRef(null);
  const shelvesRef = useRef(null);

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
  const topics = useMemo(() => {
    const c = {};
    items.forEach((it) => topicsOf(it).forEach((t) => { c[t] = (c[t] || 0) + 1; }));
    const order = TOPIC_RULES.map(([t]) => t);
    return Object.entries(c).filter(([t, n]) => n >= 2 || order.includes(t) || t === "Special editions")
      .sort((a, b) => {
        const ia = a[0] === "Special editions" ? 99 : order.indexOf(a[0]), ib = b[0] === "Special editions" ? 99 : order.indexOf(b[0]);
        return (ia < 0 ? 50 : ia) - (ib < 0 ? 50 : ib) || b[1] - a[1];
      });
  }, [items]);
  const shown = useMemo(() => (topic === "all" ? items : items.filter((it) => topicsOf(it).includes(topic))), [items, topic]);

  const openSpot = useCallback(() => setSpot("open"), []);
  const closeSpot = useCallback(() => { setSpot((s) => (s ? "closing" : s)); setTimeout(() => setSpot((s) => (s === "closing" ? null : s)), 260); }, []);
  const toggleAsk = useCallback(() => {
    if (!open) return spot === "open" ? closeSpot() : openSpot();
    return isWide() ? setAskOpen((v) => !v) : setSearchSheet(true);
  }, [open, spot, openSpot, closeSpot]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) { e.preventDefault(); toggleAsk(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [toggleAsk]);

  // The side panel slides; the book re-fits on every frame of the slide instead of jumping at the end.
  useEffect(() => {
    if (askOpen) setAskMounted(true);
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => { window.dispatchEvent(new Event("lib-relayout")); if (t - t0 < 560) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const unmount = !askOpen ? setTimeout(() => setAskMounted(false), 520) : 0;
    return () => { cancelAnimationFrame(raf); clearTimeout(unmount); };
  }, [askOpen]);

  const latest = useMemo(() => items.find((i) => !i.special) || items[0], [items]);
  const featured = focus || latest;
  useEffect(() => { prefetch(featured); }, [featured]);
  const shelves = useMemo(() => {
    const years = {};
    shown.filter((i) => !i.special).forEach((i) => { const y = yearOf(i) || "Other"; (years[y] = years[y] || []).push(i); });
    const rows = Object.entries(years).sort((a, b) => b[0].localeCompare(a[0])).map(([y, list]) => ({ key: y, title: y, list }));
    const sp = shown.filter((i) => i.special);
    if (sp.length) rows.push({ key: "special", title: "Special editions", list: sp });
    return rows;
  }, [shown]);

  const pickTopic = (t) => {
    setTopic(t);
    const first = t === "all" ? null : items.find((it) => topicsOf(it).includes(t));
    if (first) setFocus(first);
    if (spot) closeSpot();
    setTimeout(() => shelvesRef.current?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }), 60);
  };

  const onFocus = (it) => { clearTimeout(focusTimer.current); focusTimer.current = setTimeout(() => setFocus(it), 90); };
  const openIssue = (it, page = 0) => {
    setOpen(it); setStartPage(page); setSearchSheet(false); setReadPage(page); setLeaving(false);
    if (spot) { setSpot(null); }
    if (isWide()) setAskOpen(true);
    setParams((p) => { p.set("issue", it.flipbook_id); if (page) p.set("page", String(page + 1)); else p.delete("page"); return p; }, { replace: true });
  };

  /* Opening an issue: the page behind dims, the side panel (if any) slides in, and the
     cover lifts out and grows to where the open book will sit. The reader mounts under
     it, and the cover only fades once the real page has painted in the same spot. */
  const fly = (it, el, page = 0) => {
    if (!el || reduceMotion()) return openIssue(it, page);
    prefetch(it);
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const phone = vw < 768;
    const aspect = it.aspect || 0.707;
    const panel = vw >= WIDE ? 384 : 0;
    let H = vh - 64 - 150, W = H * aspect;
    if (phone && W > vw - 32) { W = vw - 32; H = W / aspect; }
    const railL = phone ? 0 : 84;
    const mid = railL + (vw - railL - panel) / 2;
    const left = phone ? (vw - W) / 2 : mid;
    const top = 64 + (vh - 64 - 110 - H) / 2;
    const g = document.createElement("div");
    g.className = "lib-ghost";
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, backgroundImage: `url(${fileUrl(it.cover || it.thumb)})` });
    document.body.appendChild(g);
    const s = H / r.height;
    setLeaving(true);
    if (panel) setAskOpen(true);
    const anim = g.animate([
      { transform: "translate(0px, 0px) scale(1)", offset: 0 },
      { transform: `translate(${(left - r.left) * 0.5}px, ${(top - r.top) * 0.5 - 24}px) scale(${1 + (s - 1) * 0.55})`, offset: 0.5 },
      { transform: `translate(${left - r.left}px, ${top - r.top}px) scale(${s})`, offset: 1 },
    ], { duration: 680, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" });
    const cleanup = () => { if (ghost.current?.el === g) ghost.current = null; g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "ease-out", fill: "forwards" }).onfinish = () => g.remove(); };
    ghost.current = { el: g, from: r, ready: false, target: null, cleanup };
    anim.onfinish = () => {
      openIssue(it, page);
      const cur = ghost.current;
      if (cur?.el === g) { cur.ready = true; if (cur.target) land(cur.target); }
    };
    setTimeout(() => { if (ghost.current?.el === g) cleanup(); }, 3200);
  };
  // Settle the flown cover exactly onto the rendered cover page, then dissolve it.
  const land = (to) => {
    const cur = ghost.current;
    if (!cur) return;
    if (!to) return cur.cleanup();
    if (!cur.ready) { cur.target = to; return; }
    const { el, from } = cur;
    const end = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.height / from.height})`;
    const a = el.animate([{ transform: getComputedStyle(el).transform }, { transform: end }], { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" });
    a.onfinish = cur.cleanup;
  };
  const back = () => { setOpen(null); setReadPage(null); setAskOpen(false); setLeaving(false); setParams((p) => { p.delete("issue"); p.delete("page"); return p; }, { replace: true }); };

  if (error) return <div className="lib min-h-screen grid place-items-center px-6 text-center text-white/70">{error}</div>;
  if (!lib) return <div className="lib min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-white/40" /></div>;

  const { brand } = lib;
  const ask = `Ask ${shortName(brand.name) || "the archive"}`;
  const logo = brand.logo ? <img src={fileUrl(brand.logo)} alt={brand.name || "Home"} className="h-6 sm:h-7 w-auto max-w-[140px] object-contain brightness-0 invert" /> : <BookOpen className="w-5 h-5" />;
  const backdrop = (open || featured)?.cover;
  const browsing = !open && items.length > 0;

  return (
    <div className="lib relative h-screen w-full overflow-hidden flex flex-col" data-testid="library-root">
      {backdrop && <div key={backdrop} className="lib-backdrop lib-swap" style={{ backgroundImage: `url(${fileUrl(backdrop)})` }} aria-hidden="true" />}
      <div className="lib-veil" aria-hidden="true" />
      <div className={`lib-floor-wrap ${browsing && !leaving ? "opacity-100" : "opacity-0"}`} aria-hidden="true"><div className="lib-floor" /><div className="lib-horizon" /></div>

      {/* header */}
      <header className="relative z-30 shrink-0">
        <div className="h-16 px-4 sm:px-8 flex items-center gap-3 sm:gap-4">
          {brand.website ? <a href={brand.website} target="_blank" rel="noopener noreferrer" className="shrink-0">{logo}</a> : <span className="shrink-0">{logo}</span>}
          <span className="w-px h-6 bg-white/20 shrink-0" aria-hidden="true" />
          <button onClick={back} className="text-[16px] sm:text-[17px] font-normal tracking-[-0.01em] truncate hover:text-white text-white/90 min-w-0" data-testid="library-title">{lib.title}</button>

          {!open && items.length > 0 && !mobile && (
            <button onClick={toggleAsk} aria-expanded={!!spot} className={`lib-askpill mx-auto h-10 w-[min(440px,34vw)] rounded-full flex items-center gap-3 pl-4 pr-2 text-left transition-all duration-300 ${spot ? "opacity-0 scale-95 pointer-events-none" : "lib-glass hover:bg-white/[0.14]"}`} data-testid="ask-pill">
              <Search className="w-4 h-4 text-white/70 shrink-0" />
              <span className="text-[14.5px] text-white/60 truncate flex-1">{ask}: search every issue</span>
              <kbd className="lib-cond text-[11px] text-white/45 border border-white/15 rounded px-1.5 py-0.5">/</kbd>
            </button>
          )}

          <div className={`${!open && items.length > 0 && !mobile ? "" : "ml-auto"} flex items-center gap-2 shrink-0`}>
            {items.length > 1 && open && (
              <Barcode className="hidden lg:flex mr-2" count={items.length} height={20}
                active={items.findIndex((x) => x.flipbook_id === open.flipbook_id)}
                onPick={(i) => openIssue(items[i], 0)} labels={items.map(issueName)} />
            )}
            {open && <button onClick={back} className="h-9 px-3 sm:px-4 rounded-full text-[14px] text-white/80 hover:bg-white/10 flex items-center gap-2" data-testid="library-back"><ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">All issues</span></button>}
            {items.length > 0 && (open || mobile) && (
              <button onClick={toggleAsk} aria-expanded={askOpen || !!spot} className={`h-9 rounded-full flex items-center gap-2 transition-colors duration-300 ${askOpen ? "bg-white text-[color:var(--ink)] px-4" : "hover:bg-white/10 px-2.5 sm:px-4"}`} data-testid="ask-toggle">
                <Search className="w-4 h-4" /><span className="hidden sm:inline text-[14px]">{ask}</span>
              </button>
            )}
            {items.length > 0 && (
              <button onClick={() => setSubOpen(true)} className={`h-9 rounded-full flex items-center gap-2 text-[14px] transition-colors ${subscribed ? "px-3 text-white/70 hover:bg-white/10" : "px-3 sm:px-4 bg-white/[0.12] hover:bg-white/20 border border-white/15"}`} data-testid="subscribe-open">
                {subscribed ? <Check className="w-4 h-4" /> : <MailPlus className="w-4 h-4" />}<span className="hidden sm:inline">{subscribed ? "Subscribed" : "Subscribe"}</span>
              </button>
            )}
          </div>
        </div>
        {brand.stripe ? <div className="h-[8px] w-full opacity-40 brightness-0 invert" style={{ backgroundImage: `url(${fileUrl(brand.stripe)})`, backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" }} aria-hidden="true" /> : <div className="h-px bg-white/10" />}
      </header>

      {/* body */}
      <div className={`relative z-10 flex-1 min-h-0 flex ${askOpen ? "xl:pr-6" : ""} transition-[padding] duration-500`}>
        <div className="flex-1 min-w-0 min-h-0 grid">
          {items.length === 0 ? (
            <main className="min-h-0 grid place-items-center px-6 text-center" data-testid="library-empty">
              <div className="max-w-md lib-swap">
                <p className="text-[15px] text-white/55">{lib.title}</p>
                <h1 className="mt-2 text-[clamp(32px,4vw,48px)] font-light leading-tight tracking-[-0.02em]">No issues published yet</h1>
                <p className="mt-4 text-[15px] text-white/60 leading-relaxed">Issues appear here as soon as they're added to this library.</p>
              </div>
            </main>
          ) : !open && mobile ? (
            <main className={`min-h-0 overflow-y-auto lib-noscroll transition-opacity duration-300 ${leaving ? "opacity-0" : ""}`}>
              <TopicBar topics={topics} topic={topic} onTopic={pickTopic} total={items.length} className="px-4 pt-4" />
              <MobileBrowse items={shown} latest={latest} onOpen={(x, el) => fly(x, el)} onActive={setFocus} />
            </main>
          ) : !open ? (
            <main className={`min-h-0 overflow-y-auto lib-scroll transition-[opacity,filter] duration-300 ${leaving ? "opacity-0 blur-[2px]" : ""}`} data-testid="library-browse">
              {/* hero: the one bold moment */}
              <section className="px-4 sm:px-8 lg:px-12 pt-10 sm:pt-12 pb-6 grid md:grid-cols-[minmax(0,1fr)_auto] gap-8 md:gap-14 items-center min-h-[54vh]" {...hero.bind}>
                <div key={featured?.flipbook_id} className="lib-swap max-w-xl order-2 md:order-1">
                  <p className="text-[15px] text-white/60">{featured?.special ? featured.kind : featured?.flipbook_id === latest?.flipbook_id ? "Latest issue" : "From the archive"}</p>
                  <h1 className="mt-2 leading-[0.92] tracking-[-0.035em]">
                    <span className="block text-[clamp(56px,8.5vw,120px)] font-light">{monthOf(featured)}</span>
                    <span className="block text-[clamp(30px,4vw,56px)] font-light text-[color:var(--mist)]">{yearOf(featured)}</span>
                  </h1>
                  {featured?.toc?.length > 0 && (
                    <div className="mt-7 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {topicsOf(featured).map((t) => (
                          <button key={t} onClick={() => pickTopic(t)} title={`Show every issue covering ${t}`} className={`lib-cond h-7 px-3 rounded-full border text-[13px] inline-flex items-center transition-colors ${topic === t ? "bg-white text-[color:var(--ink)] border-white" : "bg-white/[0.08] border-white/10 text-white/80 hover:bg-white/[0.18] hover:text-white"}`}>{t}</button>
                        ))}
                      </div>
                      <ul className="space-y-1.5 text-[15px] text-white/75 leading-snug max-w-lg">
                        {featured.toc.flatMap((s) => s.items.slice(0, 1)).slice(0, 3).map((h, i) => <li key={i} className="line-clamp-1">{h.title}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="mt-8 flex items-center gap-4">
                    <button onClick={() => fly(featured, hero.target.current)} className="h-12 px-7 rounded-full bg-white text-[color:var(--ink)] text-[15px] font-medium hover:bg-[color:var(--paper)] active:scale-[0.98] transition" data-testid="library-read">Read {featured?.special ? "edition" : monthOf(featured)}</button>
                    <span className="lib-cond text-[13px] text-white/50">{featured?.page_count} pages</span>
                  </div>
                </div>
                <div className="lib-tilt order-1 md:order-2 justify-self-center md:justify-self-end lib-enter">
                  <button onClick={(e) => fly(featured, e.currentTarget.querySelector(".lib-cover"))} aria-label={`Open ${featured?.label}`} className="block focus:outline-none">
                    <Cover key={featured?.flipbook_id} src={featured?.cover} aspect={featured?.aspect} width="clamp(200px, 23vw, 340px)" reflect coverRef={hero.target} eager />
                  </button>
                </div>
              </section>

              {/* topics + shelves */}
              <div ref={shelvesRef} className="scroll-mt-4">
                <TopicBar topics={topics} topic={topic} onTopic={pickTopic} total={items.length} className="px-4 sm:px-8 lg:px-12 pb-6" />
                <div className="pb-10 space-y-7">
                  {shelves.length === 0 && <p className="px-4 sm:px-8 lg:px-12 text-white/60">No issues under this topic yet.</p>}
                  {shelves.map((row) => {
                    const expanded = activeRow === row.key || (row.list.length <= 2);
                    return (
                      <section key={`${topic}-${row.key}`} aria-label={row.title} onMouseEnter={() => setActiveRow(row.key)} onMouseLeave={() => setActiveRow((k) => (k === row.key ? null : k))}
                        onFocus={() => setActiveRow(row.key)} data-testid={`row-${row.key}`} data-expanded={expanded ? "1" : "0"} className="lib-swap">
                        <button type="button" onClick={() => setActiveRow(activeRow === row.key ? null : row.key)} className="px-4 sm:px-8 lg:px-12 flex items-baseline gap-3 mb-2 text-left">
                          <h2 className={`${row.key === "special" ? "text-[22px] font-light" : "text-[34px] font-thin tracking-[-0.03em] leading-none"} transition-colors duration-300 ${expanded ? "text-white" : "text-white/60"}`}>{row.title}</h2>
                          <span className="lib-cond text-[13px] text-white/45">{row.list.length} {row.list.length === 1 ? "issue" : "issues"}{expanded ? "" : ", hover to spread"}</span>
                        </button>
                        <div className="lib-shelf flex overflow-x-auto px-4 sm:px-8 lg:px-12 scroll-px-4 sm:scroll-px-8 lg:scroll-px-12 pb-4 pt-3">
                          {row.list.map((it, i) => (
                            <div key={it.flipbook_id} className="lib-stack-item shrink-0"
                              style={{ marginLeft: i === 0 ? 0 : expanded ? 26 : -126, zIndex: expanded ? 1 : row.list.length - i,
                                transform: expanded ? "none" : `translateY(${Math.min(i, 6) * 2.5}px) rotate(${Math.min(i, 6) * 1.4}deg) scale(${1 - Math.min(i, 6) * 0.012})`,
                                opacity: expanded || i < 7 ? 1 : 0, transitionDelay: expanded ? `${Math.min(i, 12) * 24}ms` : `${Math.max(0, 6 - i) * 12}ms` }}>
                              <ShelfCard item={it} stacked={!expanded} focused={featured?.flipbook_id === it.flipbook_id} onFocus={onFocus} onOpen={(x, el) => fly(x, el)} />
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>

              <footer className="px-4 sm:px-8 lg:px-12 pb-10 pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/45">
                {brand.footer && <span>{brand.footer}</span>}
                {brand.website && <a href={brand.website} target="_blank" rel="noopener noreferrer" className="hover:text-white">{brand.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
                {!subscribed && <button onClick={() => setSubOpen(true)} className="hover:text-white underline-offset-4 hover:underline">Subscribe to updates</button>}
                {lib.show_badge && <a href="/" target="_blank" rel="noopener noreferrer" className="ml-auto hover:text-white">Made with FlipCraft</a>}
              </footer>
            </main>
          ) : (
            <main className="min-h-0 grid grid-cols-1 md:grid-cols-[84px_minmax(0,1fr)]" data-testid="library-reading">
              <div className="hidden md:block min-h-0 border-r border-white/[0.06]"><DockRail items={items} current={open.flipbook_id} onOpen={openIssue} /></div>
              <Reader slug={slug} item={open} items={items} startPage={startPage} embed={embed} onOpen={openIssue} onBack={back} onPage={setReadPage}
                onShown={land} onSubscribe={() => setSubOpen(true)} subscribed={subscribed} />
            </main>
          )}
        </div>
        {items.length > 0 && (
          <div className="hidden xl:block min-h-0 py-6 overflow-hidden lib-ask shrink-0" style={{ width: askOpen ? 384 : 0 }} aria-hidden={!askOpen}>
            <div className="w-[360px] ml-6 h-full lib-ask-inner" data-open={askOpen ? "1" : "0"}>
              {askMounted && <SearchPanel slug={slug} lib={lib} current={open} readPage={readPage} onOpen={openIssue} onClose={() => setAskOpen(false)} autoFocus={false} />}
            </div>
          </div>
        )}
      </div>

      <BrandBars className="hidden md:block absolute right-6 bottom-3 z-20" />

      {spot && !open && <Spotlight slug={slug} lib={lib} topics={topics} closing={spot === "closing"} onOpen={(it, p) => openIssue(it, p)} onTopic={pickTopic} onClose={closeSpot} />}

      {searchSheet && (
        <div className="xl:hidden fixed inset-0 z-50 bg-[#0a1626]/80 backdrop-blur-sm p-3 sm:p-6 lib-spot-in" role="dialog" aria-modal="true">
          <div className="h-full max-w-lg ml-auto"><SearchPanel slug={slug} lib={lib} current={open} readPage={readPage} onOpen={openIssue} onClose={() => setSearchSheet(false)} autoFocus /></div>
        </div>
      )}

      {subOpen && <SubscribeDialog slug={slug} lib={lib} topics={topics} issue={open} onClose={() => setSubOpen(false)} onDone={() => setSubscribed(true)} />}
    </div>
  );
}
