import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { errMsg } from "../lib/api";
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
    <Shell title="Sign in" subtitle="Welcome back to your flipbook studio." footer={<>New to FlipCraft? <Link to="/signup" className="text-blue-400 hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email"><Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="login-email" /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="login-password" /></Field>
        <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in</Button>
      </form>
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
