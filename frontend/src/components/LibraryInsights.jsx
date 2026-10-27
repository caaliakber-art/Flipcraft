import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { api, errMsg } from "../lib/api";

const CHANNEL_NAMES = { linkedin: "LinkedIn", whatsapp: "WhatsApp", email: "Email", copy: "Copied link", share: "Phone share menu", website: "Your website", search: "Search engines", x: "X (Twitter)", facebook: "Facebook", direct: "Direct or bookmarked", other: "Other" };
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
      <div className="rounded-xl border border-white/10 p-4" data-testid="channels">
        <div className="text-xs text-slate-400 mb-3">How readers arrived</div>
        {!s.channels?.length ? <p className="text-sm text-slate-500">No visits yet. Links shared from the library's Share button are tagged, so LinkedIn, WhatsApp and email show up here.</p> : (
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
            {s.channels.map((c) => {
              const max = Math.max(...s.channels.map((x) => x.views));
              return (
                <div key={c.name} className="text-sm">
                  <div className="flex justify-between"><span>{CHANNEL_NAMES[c.name] || c.name}</span><span className="tabular-nums text-slate-400">{c.views}</span></div>
                  <div className="h-1 mt-1 rounded bg-white/5"><div className="h-1 rounded bg-blue-400/70" style={{ width: `${(c.views / max) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* Every question asked through Ask, newest first: what readers want, and where
   the issues had no answer (a topic worth writing about). */
export function Questions({ id, lib }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => { api.get(`/libraries/${id}/questions`).then((r) => setList(r.data)).catch(() => setList(false)); }, [id]);
  if (list === false) return <p className="text-sm text-slate-400">Questions couldn't be loaded.</p>;
  if (!list) return <p className="text-sm text-slate-500">Loading questions...</p>;
  if (!list.length) return <p className="text-sm text-slate-500 rounded-xl border border-dashed border-white/10 p-6 text-center">No questions yet. They'll appear here when readers use Ask on the library.</p>;
  const label = (fid) => (lib?.items || []).find((i) => i.flipbook_id === fid)?.label || "Issue";
  const gaps = list.filter((q) => !q.covered).length;
  const shown = filter === "gaps" ? list.filter((q) => !q.covered) : filter === "talk" ? list.filter((q) => q.handover) : list;
  return (
    <div className="space-y-3" data-testid="library-questions">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[["all", `All ${list.length}`], ["gaps", `Not covered ${gaps}`], ["talk", `Needs a conversation ${list.filter((q) => q.handover).length}`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`h-8 px-3 rounded-full ${filter === k ? "bg-white text-slate-900" : "border border-white/10 text-slate-300 hover:bg-white/5"}`}>{l}</button>
        ))}
        <span className="text-xs text-slate-500 ml-auto">"Not covered" questions are ideas for the next issue.</span>
      </div>
      <div className="divide-y divide-white/5 rounded-xl border border-white/10">
        {shown.slice(0, 100).map((q) => (
          <button key={q.id} onClick={() => setOpen(open === q.id ? null : q.id)} className="w-full text-left p-3 hover:bg-white/[0.03]">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm">{q.question}</div>
                <div className="text-xs text-slate-500 mt-0.5">{fmtDate(q.created_at)}{q.follow_up ? " · follow-up" : ""}{q.sources?.length ? ` · ${q.sources.map(([f, p]) => `${label(f)} p${p + 1}`).join(", ")}` : ""}</div>
              </div>
              {!q.covered && <span className="shrink-0 text-[11px] rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5">Not covered</span>}
              {q.handover && <span className="shrink-0 text-[11px] rounded-full bg-blue-400/15 text-blue-300 px-2 py-0.5">Needs a conversation</span>}
            </div>
            {open === q.id && <p className="mt-2 text-sm text-slate-300 whitespace-pre-line rounded-lg bg-white/[0.03] p-3">{q.answer}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

const STATUS = { new: "New", contacted: "Contacted", added: "Added to list", unsubscribed: "Unsubscribed" };

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
    const cols = ["name", "email", "organisation", "phone", "interests", "wants_credentials", "source", "newsletter", "message", "transcript", "status", "created_at"];
    const flat = (v) => (Array.isArray(v) ? v.map((t) => (t && typeof t === "object" ? `Q: ${t.q} A: ${t.a}` : t)).join("; ") : v ?? "");
    const esc = (v) => `"${String(flat(v)).replace(/"/g, '""')}"`;
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
        <p className="text-sm text-slate-400">People who subscribed, and readers who asked for a conversation from an Ask answer.</p>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!list.length}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500 rounded-xl border border-dashed border-white/10 p-6 text-center">No subscribers yet. They'll appear here as soon as someone subscribes.</p> : (
        <div className="divide-y divide-white/5 rounded-xl border border-white/10">
          {list.map((x) => (
            <div key={x.id} className="p-3 flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{x.name}<span className="text-slate-400 font-normal">{x.organisation && `, ${x.organisation}`}</span></div>
                <div className="text-sm text-slate-300"><a href={`mailto:${x.email}`} className="hover:underline">{x.email}</a>{x.phone && <span className="text-slate-400">  ·  {x.phone}</span>}</div>
                {x.source === "ask" && <div className="inline-block mt-1 mr-1 text-[11px] font-medium rounded-full bg-blue-400/15 text-blue-300 px-2 py-0.5">Asked for a conversation{x.asked_at ? `, ${fmtDate(x.asked_at)}` : ""}</div>}
                {x.newsletter === false && <div className="inline-block mt-1 mr-1 text-[11px] rounded-full bg-white/5 text-slate-400 px-2 py-0.5">Not on the issue email</div>}
                {x.wants_credentials && <div className="inline-block mt-1 text-[11px] font-medium rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5">Requested credentials</div>}
                {x.transcript?.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Their questions ({x.transcript.length})</summary>
                    <div className="mt-2 space-y-2 rounded-lg bg-white/[0.03] p-3">
                      {x.transcript.map((t, i) => <div key={i}><div className="text-slate-200">{t.q}</div><div className="text-slate-400 text-xs mt-0.5 whitespace-pre-line">{t.a}</div></div>)}
                    </div>
                  </details>
                )}
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
