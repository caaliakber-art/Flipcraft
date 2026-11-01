import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";

const Field = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium tracking-wider uppercase text-slate-400">{label}</span>
    {children}
  </label>
);

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-50 grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8 fc-rise">
        <div className="flex items-center gap-3 justify-center">
          <div className="w-9 h-9 rounded-md bg-blue-500 grid place-items-center"><BookOpen className="w-4 h-4 text-white" /></div>
          <span className="font-display font-bold text-xl tracking-tight">FlipCraft</span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#131B2E] p-6 space-y-5">
          <div>
            <h1 className="font-display text-xl font-semibold">{title}</h1>
            <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
        <p className="text-center text-sm text-slate-400">{footer}</p>
      </div>
    </div>
  );
}

export function Login() {
  const { account, login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  if (account) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      await login(form.email, form.password);
      nav("/", { replace: true });
    } catch (err) {
      toast.error(errMsg(err, "Could not sign in"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Sign in" subtitle="Welcome back to your flipbook studio." footer={<>New to FlipCraft? <Link to="/signup" className="text-blue-400 hover:underline" data-testid="login-request-access">Request access</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email"><Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="login-email" /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="login-password" /></Field>
        <div className="-mt-2 text-right"><Link to="/forgot" className="text-sm text-blue-400 hover:underline" data-testid="login-forgot-password-link">Forgot password?</Link></div>
        <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in</Button>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post("/auth/forgot", { email }); setSent(true); } catch (err) { if (err?.response?.status === 503) setSent("ask"); else toast.error(errMsg(err, "Could not send the email")); } finally { setBusy(false); }
  };
  return (
    <Shell title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<Link to="/login" className="text-blue-400 hover:underline">Back to sign in</Link>}>
      {sent === "ask" ? (
        <p className="text-sm text-slate-300 leading-relaxed" data-testid="forgot-ask">Ask the person who set up your FlipCraft account to reset your password. They can do it in a few seconds from <b>Team</b> on their dashboard, and you'll choose your own password when you next sign in.</p>
      ) : sent ? (
        <p className="text-sm text-slate-300 leading-relaxed" data-testid="forgot-sent">If an account exists for <b>{email}</b>, a reset link is on its way. It works once and expires in 30 minutes. Check your spam folder if it hasn't arrived in a few minutes.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Work email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email" /></Field>
          <Button type="submit" className="w-full" disabled={busy} data-testid="forgot-submit">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Email me a reset link</Button>
        </form>
      )}
    </Shell>
  );
}

export function Reset() {
  const nav = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.a !== pw.b) return toast.error("The two passwords don't match");
    setBusy(true);
    try { await api.post("/auth/reset", { token, password: pw.a }); toast.success("Password changed. Please sign in."); nav("/login", { replace: true }); }
    catch (err) { toast.error(errMsg(err, "Could not change the password")); setBusy(false); }
  };
  return (
    <Shell title="Choose a new password" subtitle="Use at least 8 characters." footer={<Link to="/forgot" className="text-blue-400 hover:underline">Ask for a new link</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password"><Input type="password" required minLength={8} autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} data-testid="reset-password" /></Field>
        <Field label="Type it again"><Input type="password" required minLength={8} autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} data-testid="reset-password-2" /></Field>
        <Button type="submit" className="w-full" disabled={busy || !token} data-testid="reset-submit">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save new password</Button>
      </form>
    </Shell>
  );
}

export function RequestAccess() {
  const [f, setF] = useState({ name: "", email: "", organisation: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post("/auth/request-access", f); setDone(true); } catch (err) { toast.error(errMsg(err, "Could not send your request")); } finally { setBusy(false); }
  };
  return (
    <Shell title="Request access" subtitle="FlipCraft is invite-only for now. Tell us about you and we'll be in touch." footer={<>Already have an account? <Link to="/login" className="text-blue-400 hover:underline">Sign in</Link></>}>
      {done ? <p className="text-sm text-slate-300 leading-relaxed" data-testid="request-done">Thank you. We've received your request and will reply by email.</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Your name"><Input required value={f.name} onChange={set("name")} autoComplete="name" data-testid="request-name" /></Field>
          <Field label="Work email"><Input type="email" required value={f.email} onChange={set("email")} autoComplete="email" data-testid="request-email" /></Field>
          <Field label="Organisation"><Input value={f.organisation} onChange={set("organisation")} autoComplete="organization" /></Field>
          <Field label="What would you like to publish? (optional)"><Input value={f.message} onChange={set("message")} placeholder="e.g. a monthly client newsletter" /></Field>
          <input value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <Button type="submit" className="w-full" disabled={busy} data-testid="request-submit">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Request access</Button>
        </form>
      )}
    </Shell>
  );
}

export function Signup() {
  const { account, signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", workspace: "", accept_terms: false });
  const [busy, setBusy] = useState(false);
  if (account) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.accept_terms) return toast.error("Please accept the Terms of Service and Privacy Policy");
    try {
      setBusy(true);
      await signup(form);
      nav("/", { replace: true });
    } catch (err) {
      toast.error(errMsg(err, "Could not create the account"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Create your account" subtitle="Set up a workspace for your organisation." footer={<>Already have an account? <Link to="/login" className="text-blue-400 hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name"><Input required value={form.name} onChange={set("name")} autoComplete="name" data-testid="signup-name" /></Field>
        <Field label="Work email"><Input type="email" required value={form.email} onChange={set("email")} autoComplete="email" data-testid="signup-email" /></Field>
        <Field label="Password (8+ characters)"><Input type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" data-testid="signup-password" /></Field>
        <Field label="Organisation name"><Input required value={form.workspace} onChange={set("workspace")} placeholder="e.g. Singhvi Dev & Unni LLP" data-testid="signup-workspace" /></Field>
        <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
          <Checkbox checked={form.accept_terms} onCheckedChange={(v) => setForm({ ...form, accept_terms: v === true })} className="mt-0.5" data-testid="signup-terms" />
          <span>I agree to the <Link to="/terms" target="_blank" className="text-blue-400 hover:underline">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="text-blue-400 hover:underline">Privacy Policy</Link>.</span>
        </label>
        <Button type="submit" className="w-full" disabled={busy} data-testid="signup-submit">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create account</Button>
      </form>
    </Shell>
  );
}
