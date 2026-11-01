import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, copyText, errMsg } from "../lib/api";

/* The owner adds colleagues and resets their passwords here; nobody can sign up alone. */
function PasswordShown({ who, pw, onClose }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-[#0B0F17] border-white/10 text-slate-50">
        <DialogHeader>
          <DialogTitle>Temporary password for {who}</DialogTitle>
          <DialogDescription className="text-slate-400">Share it with them directly (Teams or WhatsApp). It's shown only once. They'll be asked to choose their own password after signing in.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md bg-white/5 border border-white/10 px-3 py-2.5 font-mono text-[15px]" data-testid="temp-password">{pw}</code>
          <Button variant="secondary" onClick={() => copyText(pw).then(() => toast.success("Copied"))}><Copy className="w-4 h-4 mr-2" />Copy</Button>
        </div>
        <p className="text-xs text-slate-500">Sign-in page: {window.location.origin}/login</p>
      </DialogContent>
    </Dialog>
  );
}

export function ChangePassword({ open, onClose, forced = false }) {
  const [f, setF] = useState({ current: "", a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.a !== f.b) return toast.error("The two new passwords don't match");
    setBusy(true);
    try { await api.post("/auth/password", { current: f.current, new: f.a }); toast.success("Password changed"); onClose(true); }
    catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !forced && onClose(false)}>
      <DialogContent className="max-w-md bg-[#0B0F17] border-white/10 text-slate-50">
        <DialogHeader>
          <DialogTitle>{forced ? "Choose your own password" : "Change password"}</DialogTitle>
          <DialogDescription className="text-slate-400">{forced ? "You signed in with a temporary password. Please replace it with one only you know." : "Use at least 8 characters."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" required placeholder={forced ? "Temporary password" : "Current password"} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" data-testid="pw-current" />
          <Input type="password" required minLength={8} placeholder="New password" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} autoComplete="new-password" data-testid="pw-new" />
          <Input type="password" required minLength={8} placeholder="New password again" value={f.b} onChange={(e) => setF({ ...f, b: e.target.value })} autoComplete="new-password" data-testid="pw-new2" />
          <Button type="submit" className="w-full" disabled={busy} data-testid="pw-save">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save password</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Team({ account }) {
  const [t, setT] = useState(null);
  const [f, setF] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [requests, setRequests] = useState(null);
  const load = useCallback(() => api.get("/team").then((r) => setT(r.data)).catch(() => setT(false)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (account?.user?.is_admin) api.get("/admin/requests").then((r) => setRequests(r.data)).catch(() => {}); }, [account]);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const { data } = await api.post("/team", f); setShown({ who: f.name, pw: data.password }); setF({ name: "", email: "" }); load(); }
    catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const reset = async (m) => {
    if (!window.confirm(`Give ${m.name} a new temporary password? Their current password stops working.`)) return;
    try { const { data } = await api.post(`/team/${m.user_id}/reset`); setShown({ who: m.name, pw: data.password }); } catch (err) { toast.error(errMsg(err)); }
  };
  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.name}? They won't be able to sign in any more.`)) return;
    try { await api.delete(`/team/${m.user_id}`); load(); } catch (err) { toast.error(errMsg(err)); }
  };
  if (t === false) return null;
  return (
    <section className="space-y-4" data-testid="team-section">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-base md:text-lg font-semibold">Team <span className="text-slate-500 font-mono text-sm ml-2">{t?.members.length ?? 0}</span></h2>
        <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)} data-testid="change-password"><KeyRound className="w-4 h-4 mr-2" />Change my password</Button>
      </div>
      {!t ? <p className="text-sm text-slate-500">Loading...</p> : (
        <div className="rounded-xl border border-white/10 divide-y divide-white/5">
          {t.members.map((m) => (
            <div key={m.user_id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{m.name} {m.role === "owner" && <span className="text-[11px] rounded-full bg-blue-400/15 text-blue-300 px-2 py-0.5 ml-1">Owner</span>}</div>
                <div className="text-xs text-slate-400">{m.email}</div>
              </div>
              {t.can_manage && m.role !== "owner" && <>
                <Button variant="secondary" size="sm" onClick={() => reset(m)} data-testid={`reset-${m.email}`}>Reset password</Button>
                <Button variant="ghost" size="icon" onClick={() => remove(m)} aria-label={`Remove ${m.name}`}><Trash2 className="w-4 h-4" /></Button>
              </>}
            </div>
          ))}
          {t.can_manage && (
            <form onSubmit={add} className="p-3 flex flex-wrap items-center gap-2" data-testid="team-add">
              <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className="w-[180px]" data-testid="team-name" />
              <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Work email" className="flex-1 min-w-[200px]" data-testid="team-email" />
              <Button type="submit" disabled={busy} data-testid="team-add-btn">{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}Add person</Button>
            </form>
          )}
        </div>
      )}
      {t?.can_manage && <p className="text-xs text-slate-500">People you add share this workspace: its libraries, flipbooks and brand. Nobody else can create a FlipCraft account; others can only request access.</p>}
      {requests && requests.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 space-y-2" data-testid="access-requests">
          <p className="text-sm font-medium text-amber-200">Access requests</p>
          {requests.map((r) => (
            <div key={r.id} className="text-sm flex items-start gap-3">
              <div className="flex-1"><span className="font-medium">{r.name}</span>{r.organisation && <span className="text-slate-400">, {r.organisation}</span>} <a href={`mailto:${r.email}`} className="text-blue-300 hover:underline">{r.email}</a>{r.message && <div className="text-xs text-slate-400 italic">"{r.message}"</div>}</div>
              <Button variant="ghost" size="sm" onClick={() => api.delete(`/admin/requests/${r.id}`).then(() => setRequests((l) => l.filter((x) => x.id !== r.id)))}>Dismiss</Button>
            </div>
          ))}
        </div>
      )}
      {shown && <PasswordShown who={shown.who} pw={shown.pw} onClose={() => setShown(null)} />}
      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </section>
  );
}
