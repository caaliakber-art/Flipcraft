import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Code2, ExternalLink, FileUp, Link2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { api, copyText, errMsg, fileUrl } from "../lib/api";
import { LibraryStats, Subscribers } from "../components/LibraryInsights";

const Field = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium text-slate-400">{label}</span>
    {children}
  </label>
);

export default function LibraryEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [lib, setLib] = useState(null);
  const [form, setForm] = useState({ title: "", subtitle: "" });
  const [items, setItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [queue, setQueue] = useState([]);
  const fileRef = useRef(null);

  const apply = (data, keepEdits = false) => {
    setLib(data);
    if (!keepEdits) { setForm({ title: data.title, subtitle: data.subtitle }); setItems(data.items); setDirty(false); }
    else setItems((cur) => data.items.map((i) => cur.find((c) => c.flipbook_id === i.flipbook_id) ? { ...i, ...pick(cur.find((c) => c.flipbook_id === i.flipbook_id)) } : i));
  };
  const pick = (i) => ({ label: i.label, date: i.date, special: i.special, kind: i.kind });
  const load = useCallback((keep = false) => api.get(`/libraries/${id}`).then((r) => apply(r.data, keep)).catch((e) => { toast.error(errMsg(e)); nav("/"); }), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const processing = items.some((i) => i.status === "processing") || queue.some((q) => q.state === "uploading");
  useEffect(() => { if (!processing) return; const t = setInterval(() => load(true), 2500); return () => clearInterval(t); }, [processing, load]);

  const addFiles = async (files) => {
    const pdfs = [...files].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return toast.error("Choose PDF files");
    setQueue((q) => [...q, ...pdfs.map((f) => ({ name: f.name, state: "waiting" }))]);
    for (const f of pdfs) {
      setQueue((q) => q.map((x) => (x.name === f.name ? { ...x, state: "uploading" } : x)));
      try {
        const fd = new FormData();
        fd.append("file", f);
        const { data: book } = await api.post("/flipbooks", fd);
        const { data } = await api.post(`/libraries/${id}/items`, { flipbook_id: book.id, filename: f.name });
        apply(data, true);
        setQueue((q) => q.map((x) => (x.name === f.name ? { ...x, state: "done" } : x)));
      } catch (e) {
        setQueue((q) => q.map((x) => (x.name === f.name ? { ...x, state: "failed", error: errMsg(e) } : x)));
      }
    }
  };

  const setItem = (fid, patch) => { setItems((l) => l.map((i) => (i.flipbook_id === fid ? { ...i, ...patch } : i))); setDirty(true); };
  const remove = (fid) => { setItems((l) => l.filter((i) => i.flipbook_id !== fid)); setDirty(true); };
  const save = async () => {
    try {
      const { data } = await api.put(`/libraries/${id}`, { ...form, items: items.map((i) => ({ flipbook_id: i.flipbook_id, ...pick(i) })) });
      apply(data);
      toast.success("Library saved");
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!lib) return <div className="min-h-screen bg-[#0B0F17] grid place-items-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>;
  const url = `${window.location.origin}/library/${lib.slug}`;
  const embed = `<iframe src="${window.location.origin}/embed/library/${lib.slug}" title="${lib.title}" style="width:100%;height:90vh;min-height:640px;border:0;border-radius:12px" allow="fullscreen" loading="lazy"></iframe>`;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-50">
      <header className="border-b border-white/10 sticky top-0 bg-[#0B0F17]/90 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/" aria-label="Back to dashboard"><ArrowLeft className="w-4 h-4" /></Link></Button>
          <span className="font-display font-semibold truncate">{lib.title}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 mr-2" />Open library</a></Button>
            <Button onClick={save} disabled={!dirty} data-testid="library-save">Save changes</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[1fr_340px] gap-10">
        <div className="space-y-8">
          <section className="grid sm:grid-cols-2 gap-4">
            <Field label="Library name"><Input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setDirty(true); }} data-testid="library-title-input" /></Field>
            <Field label="Short description (optional)"><Input value={form.subtitle} onChange={(e) => { setForm({ ...form, subtitle: e.target.value }); setDirty(true); }} placeholder="e.g. Monthly Communique" /></Field>
          </section>

          <section
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="rounded-xl border border-dashed border-white/20 p-8 text-center hover:border-blue-400/60 transition-colors"
          >
            <FileUp className="w-6 h-6 mx-auto text-slate-400" />
            <p className="mt-3 font-medium">Drop issues here, or choose several PDFs at once</p>
            <p className="text-sm text-slate-400 mt-1">Month and year are read from the file name, e.g. “Monthly Communique_October 2026.pdf”.</p>
            <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="library-file-input" />
            <Button variant="secondary" className="mt-4" onClick={() => fileRef.current.click()}>Choose PDFs</Button>
            {queue.length > 0 && (
              <ul className="mt-5 text-left text-sm space-y-1 max-h-40 overflow-y-auto">
                {queue.map((q) => (
                  <li key={q.name} className="flex justify-between gap-3">
                    <span className="truncate text-slate-300">{q.name}</span>
                    <span className={q.state === "failed" ? "text-red-400" : q.state === "done" ? "text-emerald-400" : "text-slate-400"}>{q.state === "failed" ? q.error : q.state === "done" ? "Added" : q.state === "uploading" ? "Uploading" : "Waiting"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-semibold">Issues <span className="text-slate-500 text-sm ml-1">{items.length}</span></h2>
            {items.length === 0 && <p className="text-sm text-slate-400">No issues yet. Add PDFs above.</p>}
            <div className="divide-y divide-white/5 rounded-xl border border-white/10">
              {items.map((it) => (
                <div key={it.flipbook_id} className="flex items-center gap-4 p-3" data-testid={`library-item-${it.flipbook_id}`}>
                  <div className="w-12 shrink-0">{it.thumb ? <img src={fileUrl(it.thumb)} alt="" className="w-12 rounded-sm" /> : <div className="w-12 aspect-[3/4] rounded-sm bg-white/5 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>}</div>
                  <div className="flex-1 grid sm:grid-cols-[1fr_140px] gap-2 min-w-0">
                    <Input value={it.label} onChange={(e) => setItem(it.flipbook_id, { label: e.target.value })} aria-label="Label" />
                    <Input type="month" value={it.date} onChange={(e) => setItem(it.flipbook_id, { date: e.target.value })} aria-label="Issue month" />
                    {it.special && <Input value={it.kind} onChange={(e) => setItem(it.flipbook_id, { kind: e.target.value })} placeholder="Edition name, e.g. AIF edition" className="sm:col-span-2" />}
                    {it.status === "processing" && <p className="text-xs text-slate-400 sm:col-span-2">Preparing pages {it.pages_done}/{it.page_count || "…"}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-400 shrink-0"><Switch checked={!!it.special} onCheckedChange={(v) => setItem(it.flipbook_id, { special: v, kind: v ? it.kind || "Special edition" : "" })} />Special</label>
                  <Button variant="ghost" size="icon" onClick={() => remove(it.flipbook_id)} aria-label="Remove from library"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-semibold">Readers</h2>
            <LibraryStats id={id} />
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-semibold">Subscribers</h2>
            <Subscribers id={id} title={lib.title} />
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-white/10 p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Link2 className="w-4 h-4" />Public link</h2>
            <p className="text-sm text-slate-400">Anyone with this link can browse and search the library.</p>
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" className="w-full" onClick={async () => { await copyText(url); toast.success("Link copied"); }}>Copy link</Button>
          </div>
          <div className="rounded-xl border border-white/10 p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Code2 className="w-4 h-4" />Embed on your website</h2>
            <p className="text-sm text-slate-400">Give this code to your web team. Pasted into any page, it shows the full library with search.</p>
            <textarea readOnly value={embed} rows={5} className="w-full rounded-md bg-black/30 border border-white/10 p-2 font-mono text-[11px] text-slate-300" onFocus={(e) => e.target.select()} data-testid="library-embed-code" />
            <Button variant="secondary" className="w-full" onClick={async () => { await copyText(embed); toast.success("Embed code copied"); }}>Copy embed code</Button>
          </div>
        </aside>
      </main>
    </div>
  );
}
