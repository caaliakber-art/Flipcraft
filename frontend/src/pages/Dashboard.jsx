import { useCallback, useEffect, useState } from "react";
import { BookOpen, Palette } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { UploadZone } from "../components/UploadZone";
import { FlipbookCard } from "../components/FlipbookCard";
import { ShareDialog } from "../components/ShareDialog";
import { BrandDialog } from "../components/BrandDialog";
import { StatsDialog } from "../components/StatsDialog";
import { api, errMsg, fileUrl } from "../lib/api";

const EMPTY_BRAND = { name: "", logo: "", color: "#3B82F6", website: "" };

export default function Dashboard() {
  const [books, setBooks] = useState(null);
  const [brand, setBrand] = useState(EMPTY_BRAND);
  const [share, setShare] = useState(null);
  const [stats, setStats] = useState(null);
  const [brandOpen, setBrandOpen] = useState(false);

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
          <Button variant="secondary" onClick={() => setBrandOpen(true)} data-testid="open-brand-settings-btn">
            {brand.logo ? <img src={fileUrl(brand.logo)} alt="" className="w-5 h-5 object-contain mr-2 rounded-sm" /> : <Palette className="w-4 h-4 mr-2" />}
            {brand.name || "Branding"}
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 sm:py-16 space-y-14">
        <section className="grid lg:grid-cols-[1fr_1.3fr] gap-10 items-center">
          <div className="fc-rise">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-blue-400 mb-4">Your flipbook studio</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">PDFs that turn<br />like real pages.</h1>
            <p className="text-slate-400 mt-5 max-w-md">Upload a PDF, drop videos, pictures and links right onto any page, then share a link or embed it on your site. No sign-up for you or your readers.</p>
          </div>
          <div className="fc-rise" style={{ animationDelay: "120ms" }}>
            <UploadZone onCreated={(b) => setBooks((l) => [b, ...(l || [])])} />
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-base md:text-lg font-semibold">My flipbooks <span className="text-slate-500 font-mono text-sm ml-2" data-testid="flipbook-count">{books?.length ?? 0}</span></h2>
          </div>
          {books === null ? (
            <div className="text-slate-500 text-sm">Loading…</div>
          ) : books.length === 0 ? (
            <div className="rounded-xl border border-white/10 p-10 text-center text-slate-400" data-testid="empty-state">Nothing here yet — your first flipbook is one PDF away.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="flipbook-grid">
              {books.map((b, i) => <FlipbookCard key={b.id} book={b} index={i} onShare={setShare} onDelete={onDelete} onStats={setStats} />)}
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
