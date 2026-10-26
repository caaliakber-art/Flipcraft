import { useEffect, useState } from "react";
import { CalendarPlus, Loader2, Mail, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";

const fmt = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };

/* Dates to act on: the site suggests them from the issue text; nothing is shown to
   readers until someone ticks it here and saves the library. */
export function DatesDialog({ libraryId, item, onChange, onClose }) {
  const [rows, setRows] = useState(() => (item.deadlines || []).map((d) => ({ ...d, on: true, approved: true })));
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    api.get(`/libraries/${libraryId}/items/${item.flipbook_id}/deadline-suggestions`).then((r) => {
      setRows((cur) => {
        const have = new Set(cur.map((x) => `${x.date}|${x.title}`));
        return [...cur, ...r.data.filter((s) => !have.has(`${s.date}|${s.title}`) && !cur.some((x) => x.date === s.date && x.page === s.page)).map((s) => ({ ...s, on: false }))];
      });
    }).catch((e) => toast.error(errMsg(e))).finally(() => setBusy(false));
  }, [libraryId, item.flipbook_id]);
  const set = (i, patch) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const apply = () => {
    const chosen = rows.filter((r) => r.on && r.date && r.title.trim()).map((r) => ({ date: r.date, title: r.title.trim(), page: r.page ?? null }));
    onChange(chosen.sort((a, b) => a.date.localeCompare(b.date)));
    onClose();
    toast.success(chosen.length ? `${chosen.length} date${chosen.length > 1 ? "s" : ""} ready. Save changes to publish.` : "No dates. Save changes to publish.");
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0B0F17] border-white/10 text-slate-50 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="w-5 h-5" />Dates to act on: {item.label}</DialogTitle>
          <DialogDescription className="text-slate-400">Suggested from the issue text. Tick the real deadlines, fix the wording, and add any that were missed. Readers see them with an "Add to calendar" button, and they go into the issue email.</DialogDescription>
        </DialogHeader>
        {busy && <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Reading the issue for dates...</p>}
        {!busy && rows.length === 0 && <p className="text-sm text-slate-400">No dates found. Add one below if this issue has a deadline.</p>}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-lg border p-3 ${r.on ? "border-blue-400/50 bg-blue-400/5" : "border-white/10"}`} data-testid={`date-row-${i}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} className="w-4 h-4 accent-blue-400" aria-label="Show to readers" />
                <Input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} className="w-[160px]" />
                <Input value={r.title} onChange={(e) => set(i, { title: e.target.value, on: true })} placeholder="What is due" className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="w-4 h-4" /></Button>
              </div>
              {r.context && <p className="text-xs text-slate-500 mt-2 pl-6">Page {(r.page ?? 0) + 1}: "...{r.context}..."</p>}
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="secondary" onClick={() => setRows((l) => [...l, { date: "", title: "", on: true }])}><Plus className="w-4 h-4 mr-2" />Add a date</Button>
          <Button onClick={apply} data-testid="dates-apply">Use {rows.filter((r) => r.on).length} date{rows.filter((r) => r.on).length === 1 ? "" : "s"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* The issue email: preview exactly what subscribers get, send a test to yourself,
   then send to everyone. */
export function EmailDialog({ libraryId, item, onClose }) {
  const { account } = useAuth() || {};
  const [p, setP] = useState(null);
  const [to, setTo] = useState(account?.email || "");
  const [sending, setSending] = useState("");
  const load = () => api.get(`/libraries/${libraryId}/email/preview`, { params: { flipbook_id: item.flipbook_id } }).then((r) => setP(r.data)).catch((e) => { toast.error(errMsg(e)); onClose(); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (account?.email && !to) setTo(account.email); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (test, resend = false) => {
    setSending(test ? "test" : "all");
    try {
      const { data } = await api.post(`/libraries/${libraryId}/email/send`, { flipbook_id: item.flipbook_id, test_to: test ? to : null, resend });
      toast.success(test ? `Test sent to ${to}` : `Sent to ${data.sent} subscriber${data.sent === 1 ? "" : "s"}`);
      if (!test) load();
    } catch (e) {
      if (e?.response?.status === 409 && window.confirm("This issue was already emailed to subscribers. Send it again?")) { setSending(""); return send(false, true); }
      toast.error(errMsg(e));
    }
    setSending("");
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl bg-[#0B0F17] border-white/10 text-slate-50 max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5" />Email {item.label} to subscribers</DialogTitle>
          <DialogDescription className="text-slate-400">Every headline links to its own page in the issue, dates go straight to the calendar, and one button opens the full issue.</DialogDescription>
        </DialogHeader>
        {!p ? <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Building the email...</p> : (
          <>
            <div className="text-sm space-y-1">
              <div><span className="text-slate-400">Subject: </span>{p.subject}</div>
              {p.from && <div><span className="text-slate-400">From: </span>{p.from}</div>}
              {p.last_sent && <div className="text-amber-300">Last sent {new Date(p.last_sent.sent_at).toLocaleString()} to {p.last_sent.count} {p.last_sent.test ? "(test)" : "subscribers"}</div>}
            </div>
            <iframe title="Email preview" srcDoc={p.html} className="w-full flex-1 min-h-[360px] rounded-lg bg-white border border-white/10" sandbox="" data-testid="email-preview" />
            {!p.configured ? (
              <p className="text-sm rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 p-3">Sending isn't connected yet. The email goes out through Brevo (free for up to 300 emails a day). Once the Brevo key and a sender address are added to the server settings, the send buttons work.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="your@email.com" className="w-[240px]" />
                <Button variant="secondary" disabled={!!sending || !to} onClick={() => send(true)}>{sending === "test" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}Send me a test</Button>
                <Button className="ml-auto" disabled={!!sending || !p.recipients} onClick={() => window.confirm(`Send this issue to ${p.recipients} subscriber${p.recipients === 1 ? "" : "s"}?`) && send(false)} data-testid="email-send-all">
                  {sending === "all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}Send to {p.recipients} subscriber{p.recipients === 1 ? "" : "s"}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const datesLabel = (ds) => (ds?.length ? `${ds.length} date${ds.length > 1 ? "s" : ""}, next ${fmt(ds[0].date)}` : "Dates");
