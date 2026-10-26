import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { api, errMsg } from "../lib/api";

const fmtTime = (s) => (!s ? "0s" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

export function LibraryStats({ id }) {
  const [s, setS] = useState(null);
  useEffect(() => { api.get(`/libraries/${id}/stats`).then((r) => setS(r.data)).catch(() => setS(false)); }, [id]);
  if (s === false) return <p className="text-sm text-slate-400">Reader numbers couldn't be loaded.</p>;
  if (!s) return <p className="text-sm text-slate-500">Loading reader numbers...</p>;
  const peak = Math.max(1, ...s.days.map((d) => d.views));
  const regionMax = Math.max(1, ...s.regions.map((r) => r.views));
  return (
    <div className="space-y-5" data-testid="library-stats">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Tile label="Issue opens" value={s.views} />
        <Tile label="Readers" value={s.readers} hint="Distinct browsers" />
        <Tile label="Pages read" value={s.pages_read} />
        <Tile label="Avg. time per issue" value={fmtTime(s.avg_seconds)} />
        <Tile label="Marked useful" value={s.useful || 0} />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <div className="text-xs text-slate-400 mb-3">Opens, last 30 days</div>
        <div className="flex items-end gap-[3px] h-20">
          {s.days.map((d) => <div key={d.date} title={`${d.date}: ${d.views}`} className="flex-1 rounded-t-sm bg-blue-400/70 min-h-[2px]" style={{ height: `${(d.views / peak) * 100}%` }} />)}
        </div>
      </div>
      <div className="grid md:grid-cols-[1fr_240px] gap-4">
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 bg-white/[0.03]">
              <tr><th className="text-left font-medium p-3">Issue</th><th className="text-right font-medium p-3">Opens</th><th className="text-right font-medium p-3">Readers</th><th className="text-right font-medium p-3 hidden sm:table-cell">Pages / reader</th><th className="text-right font-medium p-3 hidden sm:table-cell">Avg. time</th><th className="text-right font-medium p-3">Useful</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {s.items.map((r) => (
                <tr key={r.flipbook_id}>
                  <td className="p-3">{r.label}{r.top_pages.length > 0 && <div className="text-xs text-slate-500">Most read: page {r.top_pages.map((p) => p.page + 1).join(", ")}</div>}</td>
                  <td className="p-3 text-right tabular-nums">{r.views}</td>
                  <td className="p-3 text-right tabular-nums">{r.readers}</td>
                  <td className="p-3 text-right tabular-nums hidden sm:table-cell">{r.avg_pages}</td>
                  <td className="p-3 text-right tabular-nums hidden sm:table-cell">{fmtTime(r.avg_seconds)}</td>
                  <td className="p-3 text-right tabular-nums">{r.useful || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-white/10 p-4">
          <div className="text-xs text-slate-400 mb-3">Where readers are</div>
          {s.regions.length === 0 ? <p className="text-sm text-slate-500">No readers yet.</p> : (
            <ul className="space-y-2">
              {s.regions.slice(0, 8).map((r) => (
                <li key={r.name} className="text-sm">
                  <div className="flex justify-between"><span>{r.name}</span><span className="tabular-nums text-slate-400">{r.views}</span></div>
                  <div className="h-1 mt-1 rounded bg-white/5"><div className="h-1 rounded bg-blue-400/70" style={{ width: `${(r.views / regionMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-500 mt-3">From each reader's time zone. Your own visits while signed in aren't counted.</p>
        </div>
      </div>
    </div>
  );
}

const STATUS = { new: "New", contacted: "Contacted", added: "Added to list" };

export function Subscribers({ id, title }) {
  const [list, setList] = useState(null);
  const load = () => api.get(`/libraries/${id}/subscribers`).then((r) => setList(r.data)).catch(() => setList(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setStatus = async (sid, status) => {
    setList((l) => l.map((x) => (x.id === sid ? { ...x, status } : x)));
    try { await api.put(`/libraries/${id}/subscribers/${sid}`, { status }); } catch (e) { toast.error(errMsg(e)); load(); }
  };
  const remove = async (sid) => {
    try { await api.delete(`/libraries/${id}/subscribers/${sid}`); setList((l) => l.filter((x) => x.id !== sid)); } catch (e) { toast.error(errMsg(e)); }
  };
  const exportCsv = () => {
    const cols = ["name", "email", "organisation", "phone", "interests", "wants_credentials", "message", "status", "created_at"];
    const esc = (v) => `"${String(Array.isArray(v) ? v.join("; ") : v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...list.map((x) => cols.map((c) => esc(x[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${title || "library"} subscribers.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  if (list === false) return <p className="text-sm text-slate-400">Subscribers couldn't be loaded.</p>;
  if (!list) return <p className="text-sm text-slate-500">Loading subscribers...</p>;
  return (
    <div className="space-y-3" data-testid="library-subscribers">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">People who asked to join from the library's Subscribe button.</p>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!list.length}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500 rounded-xl border border-dashed border-white/10 p-6 text-center">No subscribers yet. They'll appear here as soon as someone subscribes.</p> : (
        <div className="divide-y divide-white/5 rounded-xl border border-white/10">
          {list.map((x) => (
            <div key={x.id} className="p-3 flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{x.name}<span className="text-slate-400 font-normal">{x.organisation && `, ${x.organisation}`}</span></div>
                <div className="text-sm text-slate-300"><a href={`mailto:${x.email}`} className="hover:underline">{x.email}</a>{x.phone && <span className="text-slate-400">  ·  {x.phone}</span>}</div>
                {x.wants_credentials && <div className="inline-block mt-1 text-[11px] font-medium rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5">Requested credentials</div>}
                {x.interests?.length > 0 && <div className="text-xs text-slate-400 mt-1">Interested in {x.interests.join(", ")}</div>}
                {x.message && <div className="text-sm text-slate-300 mt-1 italic">“{x.message}”</div>}
                <div className="text-xs text-slate-500 mt-1">{fmtDate(x.created_at)}</div>
              </div>
              <select value={x.status} onChange={(e) => setStatus(x.id, e.target.value)} className="h-9 rounded-md bg-black/30 border border-white/10 px-2 text-sm" aria-label="Status">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Button variant="ghost" size="icon" onClick={() => remove(x.id)} aria-label="Remove subscriber"><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
