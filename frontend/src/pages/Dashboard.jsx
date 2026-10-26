import { useCallback, useEffect, useState } from "react";
import { BookOpen, Library as LibraryIcon, LogOut, Palette, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { UploadZone } from "../components/UploadZone";
import { FlipbookCard } from "../components/FlipbookCard";
import { ShareDialog } from "../components/ShareDialog";
import { BrandDialog } from "../components/BrandDialog";
import { StatsDialog } from "../components/StatsDialog";
import { api, errMsg, fileUrl } from "../lib/api";
import { useAuth } from "../lib/auth";

const EMPTY_BRAND = { name: "", logo: "", color: "#3B82F6", color2: "#44546A", website: "", font: "Inter", theme: "dark", stripe: "", footer: "" };

export default function Dashboard() {
  const { account, logout } = useAuth();
  const [books, setBooks] = useState(null);
  const [brand, setBrand] = useState(EMPTY_BRAND);
  const [share, setShare] = useState(null);
  const [stats, setStats] = useState(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [libs, setLibs] = useState(null);
  const [newLib, setNewLib] = useState("");
  const nav = useNavigate();
  const canLibrary = account?.workspace.limits.libraries !== 0;
  useEffect(() => { api.get("/libraries").then((r) => setLibs(r.data)).catch(() => setLibs([])); }, []);
  const inLibrary = new Set((libs || []).flatMap((l) => l.items.map((i) => i.flipbook_id)));
  const createLib = async (e) => {
    e.preventDefault();
    if (!newLib.trim()) return;
    try { const { data } = await api.post("/libraries", { title: newLib.trim(), subtitle: "" }); nav(`/libraries/${data.id}`); }
    catch (err) { toast.error(errMsg(err)); }
  };

  const load = useCallback(() => api.get("/flipbooks").then((r) => setBooks(r.data)).catch((e) => toast.error(errMsg(e))), []);

  useEffect(() => {
    load();
    api.get("/brand").then((r) => setBrand(r.data)).catch(() => {});
  }, [load]);

  const processing = books?.some((b) => b.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [processing, load]);

  const onDelete = async (b) => {
    try {
      await api.delete(`/flipbooks/${b.id}`);
      setBooks((l) => l.filter((x) => x.id !== b.id));
      toast.success("Flipbook deleted");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-50">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3" data-testid="app-logo">
            <div className="w-8 h-8 rounded-md bg-blue-500 grid place-items-center"><BookOpen className="w-4 h-4 text-white" /></div>
            <span className="font-display font-bold text-lg tracking-tight">FlipCraft</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block text-right leading-tight" data-testid="workspace-info">
              <div className="text-sm font-medium">{account?.workspace.name}</div>
              <div className="text-xs text-slate-500">{account?.user.email}{account?.workspace.plan !== "demo" && <> · <span className="text-blue-400">{account?.workspace.plan_label}</span></>}</div>
            </div>
            <Button variant="secondary" onClick={() => setBrandOpen(true)} data-testid="open-brand-settings-btn">
              {brand.logo ? <img src={fileUrl(brand.logo)} alt="" className="w-5 h-5 object-contain mr-2 rounded-sm" /> : <Palette className="w-4 h-4 mr-2" />}
              {brand.name || "Branding"}
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out" data-testid="logout-btn"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 sm:py-16 space-y-14">
        <section className="grid lg:grid-cols-[1fr_1.3fr] gap-10 items-center">
          <div className="fc-rise">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-blue-400 mb-4">Your flipbook studio</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">PDFs that turn<br />like real pages.</h1>
            <p className="text-slate-400 mt-5 max-w-md">Upload a PDF, drop videos, pictures and links right onto any page, then share a link or embed it on your site. Readers never need to sign up.</p>
          </div>
          <div className="fc-rise" style={{ animationDelay: "120ms" }}>
            <UploadZone onCreated={(b) => setBooks((l) => [b, ...(l || [])])} />
          </div>
        </section>

        <section className="space-y-5" data-testid="libraries-section">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h2 className="font-display text-base md:text-lg font-semibold">Libraries <span className="text-slate-500 font-mono text-sm ml-2">{libs?.length ?? 0}</span></h2>
            {canLibrary && (
              <form onSubmit={createLib} className="flex gap-2">
                <Input value={newLib} onChange={(e) => setNewLib(e.target.value)} placeholder="New library name, e.g. Monthly Communique" className="w-72" data-testid="new-library-input" />
                <Button type="submit" data-testid="new-library-btn"><Plus className="w-4 h-4 mr-1" />Create</Button>
              </form>
            )}
          </div>
          {!canLibrary ? (
            <p className="text-sm text-slate-400">Libraries turn a set of issues into a branded, searchable archive for your website. They're available on Premium and Pro Plus.</p>
          ) : libs?.length === 0 ? (
            <p className="text-sm text-slate-400">Group issues of a newsletter into one searchable archive you can embed on your website.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(libs || []).map((l) => (
                <Link key={l.id} to={`/libraries/${l.id}`} className="rounded-xl border border-white/10 p-4 flex gap-4 hover:border-white/25 transition-colors" data-testid={`library-card-${l.id}`}>
                  <div className="flex -space-x-6 shrink-0">
                    {l.items.slice(0, 3).map((i) => i.thumb && <img key={i.flipbook_id} src={fileUrl(i.thumb)} alt="" className="w-12 rounded-sm shadow-lg ring-1 ring-black/40" />)}
                    {l.items.length === 0 && <div className="w-12 aspect-[3/4] rounded-sm bg-white/5 grid place-items-center"><LibraryIcon className="w-4 h-4 text-slate-500" /></div>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{l.title}</div>
                    <div className="text-sm text-slate-400">{l.items.length} {l.items.length === 1 ? "issue" : "issues"}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-base md:text-lg font-semibold">My flipbooks <span className="text-slate-500 font-mono text-sm ml-2" data-testid="flipbook-count">{books ? books.filter((b) => !inLibrary.has(b.id)).length : 0}</span></h2>
          </div>
          {books === null ? (
            <div className="text-slate-500 text-sm">Loading…</div>
          ) : books.length === 0 ? (
            <div className="rounded-xl border border-white/10 p-10 text-center text-slate-400" data-testid="empty-state">Nothing here yet — your first flipbook is one PDF away.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="flipbook-grid">
              {books.filter((b) => !inLibrary.has(b.id)).map((b, i) => <FlipbookCard key={b.id} book={b} index={i} onShare={setShare} onDelete={onDelete} onStats={setStats} />)}
            </div>
          )}
        </section>
      </main>

      <ShareDialog book={share} open={!!share} onOpenChange={(o) => !o && setShare(null)} />
      <StatsDialog book={stats} onOpenChange={(o) => !o && setStats(null)} />
      <BrandDialog open={brandOpen} onOpenChange={setBrandOpen} brand={brand} onSaved={setBrand} />
    </div>
  );
}
