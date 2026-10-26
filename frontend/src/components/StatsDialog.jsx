import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { api } from "../lib/api";

const Stat = ({ label, value, testid }) => (
  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
    <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400">{label}</p>
    <p className="font-display text-2xl font-bold mt-1" data-testid={testid}>{value}</p>
  </div>
);

export const StatsDialog = ({ book, onOpenChange }) => {
  const [s, setS] = useState(null);
  useEffect(() => {
    setS(null);
    if (book) api.get(`/flipbooks/${book.id}/stats`).then((r) => setS(r.data)).catch(() => setS(false));
  }, [book]);
  if (!book) return null;
  const top = s ? s.pages.map((v, i) => ({ page: i + 1, v })).sort((a, b) => b.v - a.v).slice(0, 5) : [];
  const max = Math.max(1, ...top.map((t) => t.v));

  return (
    <Dialog open={!!book} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-[#131B2E] border-white/10" data-testid="stats-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Readers of “{book.title}”</DialogTitle>
          <DialogDescription>Your own visits aren't counted.</DialogDescription>
        </DialogHeader>
        {s === null && <p className="text-sm text-slate-400">Loading…</p>}
        {s === false && <p className="text-sm text-red-400">Couldn't load stats.</p>}
        {s && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Opens" value={s.views} testid="stats-views" />
              <Stat label="People" value={s.unique} testid="stats-unique" />
              <Stat label="Via link" value={s.sources.link} testid="stats-link" />
              <Stat label="Via embed" value={s.sources.embed} testid="stats-embed" />
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400 mb-2">Opens, last 30 days</p>
              <div className="h-36" data-testid="stats-daily-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.days}>
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ background: "#0B0F17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="views" fill={book.brand.color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400 mb-2">Most read pages</p>
              {top.every((t) => t.v === 0) ? <p className="text-sm text-slate-500">No page reads yet — share your link to get readers.</p> : (
                <div className="space-y-1.5" data-testid="stats-top-pages">
                  {top.filter((t) => t.v > 0).map((t) => (
                    <div key={t.page} className="flex items-center gap-3 text-sm">
                      <span className="w-14 font-mono text-xs text-slate-400">Page {t.page}</span>
                      <div className="flex-1 h-2 rounded bg-white/5"><div className="h-2 rounded" style={{ width: `${(t.v / max) * 100}%`, background: book.brand.color }} /></div>
                      <span className="w-8 text-right font-mono text-xs">{t.v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
