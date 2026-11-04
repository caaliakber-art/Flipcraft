import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Copy, Headphones, Loader2, Mail, Mic, Plus, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, errMsg, fileUrl } from "../lib/api";
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

const mins = (secs) => { const s = Math.round(secs || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const parseTime = (v) => { const t = String(v || "").trim(); if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null; return t.split(":").map(Number).reduce((n, x) => n * 60 + x, 0); };
const audioLength = (file) => new Promise((resolve) => {
  const el = document.createElement("audio"); const url = URL.createObjectURL(file);
  const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
  el.preload = "metadata"; el.onloadedmetadata = () => done(el.duration); el.onerror = () => done(0); el.src = url;
  setTimeout(() => done(0), 8000);
});

/* Chapters for the player: a title, where it starts and the page it opens. With the AI voice
   they are set automatically; with your own recording you type the start times. */
function ChapterEditor({ base, a, sections, onSaved }) {
  const seed = () => (a.chapters?.length ? a.chapters.map((c) => ({ title: c.title, page: c.page || 0, time: mins(c.start) }))
    : sections.map((s, i) => ({ title: s.title, page: s.page || 0, time: i === 0 ? "0:00" : "" })));
  const [rows, setRows] = useState(seed);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(seed()); }, [a.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i, patch) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const bad = rows.some((r) => r.title.trim() && r.time.trim() && parseTime(r.time) === null);
  const save = async () => {
    setBusy(true);
    try {
      const body = rows.filter((r) => r.title.trim() && r.time.trim()).map((r) => ({ title: r.title.trim(), page: Math.max(0, r.page || 0), start: parseTime(r.time) }));
      onSaved((await api.put(`${base}/chapters`, body)).data); toast.success("Chapters saved");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="rounded-lg border border-white/10 p-3 space-y-2" data-testid="audio-chapters">
      <p className="text-sm font-medium">Chapters</p>
      <p className="text-xs text-slate-400">Type where each part starts, as minutes:seconds (for example 1:45). Leave a time blank to skip that chapter. Without chapters, readers get a plain player.</p>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input value={r.time} onChange={(e) => set(i, { time: e.target.value })} placeholder="m:ss" className={`w-[76px] ${r.time.trim() && parseTime(r.time) === null ? "border-amber-400" : ""}`} aria-label="Start time" />
          <Input value={r.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Chapter title" className="flex-1" />
          <Input type="number" min={1} value={(r.page || 0) + 1} onChange={(e) => set(i, { page: Math.max(0, (parseInt(e.target.value, 10) || 1) - 1) })} className="w-[76px]" aria-label="Page" title="Page this chapter opens" />
          <Button variant="ghost" size="icon" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label="Remove chapter"><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRows((l) => [...l, { title: "", page: 0, time: "" }])}><Plus className="w-4 h-4 mr-1.5" />Add a chapter</Button>
        <Button size="sm" className="ml-auto" disabled={busy || bad} onClick={save}>{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Save chapters</Button>
      </div>
    </div>
  );
}

/* Audio briefing: Gemini drafts a spoken script from the issue; nothing is voiced until
   someone here has read, corrected and approved the words. */
export function AudioDialog({ libraryId, item, onClose }) {
  const [a, setA] = useState(null);
  const [sections, setSections] = useState([]);
  const [busy, setBusy] = useState("");
  const base = `/libraries/${libraryId}/items/${item.flipbook_id}/audio`;
  const take = (d) => { setA(d); if (d.script && d.status !== "generating") setSections(d.script.map((x) => ({ ...x }))); };
  useEffect(() => { api.get(base).then((r) => take(r.data)).catch((e) => toast.error(errMsg(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (a?.status !== "generating") return undefined;
    const t = setInterval(() => api.get(base).then((r) => { if (r.data.status !== "generating") { take(r.data); if (r.data.status === "ready") toast.success("Audio ready"); else toast.error(r.data.error || "The audio couldn't be made"); } }), 5000);
    return () => clearInterval(t);
  }, [a?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (kind, fn) => { setBusy(kind); try { take((await fn()).data); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const words = sections.reduce((n, s) => n + s.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const set = (i, patch) => setSections((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const fileRef = useRef(null);
  const copyScript = () => { navigator.clipboard?.writeText(sections.map((x) => x.text.trim()).filter(Boolean).join("\n\n")).then(() => toast.success("Script copied"), () => toast.error("Couldn't copy")); };
  const upload = async (f) => {
    if (a?.path && !window.confirm("Replace the audio that's live now with this recording?")) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", f); fd.append("duration", String(await audioLength(f))); fd.append("chapters", JSON.stringify(a?.source === "upload" ? (a.chapters || []) : []));
      take((await api.post(`${base}/upload`, fd, { timeout: 300000 })).data); toast.success("Recording published. Add chapter times below if you like.");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const payload = () => ({ sections: sections.filter((s) => s.title.trim() && s.text.trim()).map((s) => ({ title: s.title.trim(), page: Math.max(0, s.page || 0), text: s.text.trim() })) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl bg-[#0B0F17] border-white/10 text-slate-50 max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Headphones className="w-5 h-5" />Audio briefing: {item.label}</DialogTitle>
          <DialogDescription className="text-slate-400">A spoken summary of about 6 minutes, with chapters that open the right page. Either approve the script for the AI voice (it reads exactly these words) or upload your own recording.</DialogDescription>
        </DialogHeader>
        {!a ? <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading...</p> : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {a.path && (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 space-y-2" data-testid="audio-ready">
                <p className="text-sm text-emerald-300">Live with the issue: {a.source === "upload" ? `your recording${a.file_name ? ` (${a.file_name})` : ""}` : "AI voice"}, {mins(a.duration)} long.{a.status === "ready" && a.edited_after ? " The script has changed since; approve again to remake it with the AI voice, or upload a new recording." : ""}</p>
                <audio controls src={fileUrl(a.path)} className="w-full" preload="none" />
                {a.status !== "generating" && <button className="text-xs text-red-300 hover:underline" disabled={!!busy} onClick={() => window.confirm("Take the audio off this issue? The script stays here.") && run("off", () => api.delete(`${base}?keep_script=1`).then(() => api.get(base)))}>Take audio off the issue</button>}
              </div>
            )}
            {a.status === "generating" && <p className="rounded-lg border border-blue-400/30 bg-blue-400/5 p-3 text-sm text-blue-200 flex items-center gap-2" data-testid="audio-generating"><Loader2 className="w-4 h-4 animate-spin" />Making the audio from the approved script. This takes a few minutes; you can close this window.{a.path ? " Readers keep hearing the current version until the new one is ready." : ""}</p>}
            {a.status === "failed" && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{a.error || "The audio couldn't be made."} You can approve again.{a.path ? " The earlier version is still live." : ""}</p>}
            {a.status !== "generating" && (
              <div className="rounded-lg border border-white/10 p-3 space-y-2" data-testid="audio-own">
                <p className="text-sm font-medium flex items-center gap-2"><Mic className="w-4 h-4" />Use your own recording</p>
                <p className="text-xs text-slate-400">Record or generate it in your voice app, export as MP3 or M4A (WAV works too), and upload it here. It replaces whatever is live now. {sections.length ? "Copy the script below to read from." : "Draft a script first if you'd like something to read from."}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => fileRef.current?.click()} data-testid="audio-upload">{busy === "upload" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}{busy === "upload" ? "Uploading..." : "Upload recording"}</Button>
                  {sections.length > 0 && <Button size="sm" variant="ghost" onClick={copyScript}><Copy className="w-4 h-4 mr-1.5" />Copy script</Button>}
                </div>
                <input ref={fileRef} type="file" accept=".mp3,.m4a,.aac,.wav,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
              </div>
            )}
            {a.path && a.status !== "generating" && <ChapterEditor base={base} a={a} sections={sections} onSaved={take} />}
            {!sections.length && a.status !== "generating" && (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400 mb-4">Start with a draft written from this issue. It takes about half a minute.</p>
                <Button onClick={() => run("draft", () => api.post(`${base}/draft`))} disabled={!!busy} data-testid="audio-draft">{busy === "draft" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Draft the script</Button>
              </div>
            )}
            {sections.length > 0 && a.status !== "generating" && (
              <>
                <p className="text-xs text-slate-400">{sections.length} parts, {words} words, about {Math.max(1, Math.round(words / 150))} minutes. Write dates and numbers as they should be spoken.</p>
                {sections.map((s, i) => (
                  <div key={i} className="rounded-lg border border-white/10 p-3 space-y-2" data-testid={`audio-section-${i}`}>
                    <div className="flex gap-2">
                      <Input value={s.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Chapter title" className="flex-1" />
                      <Input type="number" min={1} value={(s.page || 0) + 1} onChange={(e) => set(i, { page: Math.max(0, (parseInt(e.target.value, 10) || 1) - 1) })} className="w-[84px]" aria-label="Page" title="Page this chapter opens" />
                      <Button variant="ghost" size="icon" onClick={() => setSections((l) => l.filter((_, j) => j !== i))} aria-label="Remove part"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <textarea value={s.text} onChange={(e) => set(i, { text: e.target.value })} rows={Math.min(10, Math.max(3, Math.ceil(s.text.length / 90)))} className="w-full rounded-md bg-transparent border border-input px-3 py-2 text-sm leading-relaxed" />
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                  <Button variant="secondary" size="sm" onClick={() => setSections((l) => [...l, { title: "", page: 0, text: "" }])}><Plus className="w-4 h-4 mr-1.5" />Add a part</Button>
                  <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => run("redraft", () => api.post(`${base}/draft`))}>{busy === "redraft" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Draft again</Button>
                  {a.status !== "none" && <Button variant="ghost" size="sm" className="text-red-300" disabled={!!busy} onClick={() => window.confirm("Remove the audio and script for this issue?") && api.delete(base).then(() => { setA({ status: "none" }); setSections([]); })}>Remove</Button>}
                  <Button variant="secondary" size="sm" className="ml-auto" disabled={!!busy} onClick={() => run("save", () => api.put(`${base}/script`, payload()))}>{busy === "save" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Save draft</Button>
                  <Button size="sm" disabled={!!busy || !payload().sections.length} data-testid="audio-approve"
                    onClick={() => window.confirm("Approve this script? The audio will read exactly these words and appear with the issue.") && run("approve", () => api.post(`${base}/approve`, payload()))}>Approve and make audio</Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
