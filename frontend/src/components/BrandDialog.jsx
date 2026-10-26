import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { api, errMsg, fileUrl, uploadMedia } from "../lib/api";

const Field = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium tracking-wider uppercase text-slate-400">{label}</span>
    {children}
  </label>
);

export const BrandDialog = ({ open, onOpenChange, brand, onSaved }) => {
  const [form, setForm] = useState(brand);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const stripeRef = useRef(null);
  useEffect(() => { if (open) setForm(brand); }, [open, brand]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = (key) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setBusy(true); const r = await uploadMedia(file); setForm((f) => ({ ...f, [key]: r.path })); }
    catch (err) { toast.error(errMsg(err, "Upload failed")); }
    finally { setBusy(false); }
  };

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBusy(true);
      const r = await uploadMedia(file);
      setForm((f) => ({ ...f, logo: r.path }));
    } catch (err) {
      toast.error(errMsg(err, "Logo upload failed"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    try {
      setBusy(true);
      const { data } = await api.put("/brand", form);
      onSaved(data);
      toast.success("Branding saved — it now appears on all your flipbooks");
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#131B2E] border-white/10 max-h-[90vh] overflow-y-auto" data-testid="brand-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Your branding</DialogTitle>
          <DialogDescription>Workspace branding, shown on every flipbook and library you publish.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <Field label="Logo">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-black/30 border border-white/10 grid place-items-center overflow-hidden">
                {form.logo ? <img src={fileUrl(form.logo)} alt="logo" className="max-w-full max-h-full object-contain" data-testid="brand-logo-preview" /> : <span className="text-[10px] text-slate-500">none</span>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogo} data-testid="brand-logo-file-input" />
              <Button variant="secondary" disabled={busy} onClick={() => fileRef.current.click()} data-testid="brand-logo-upload-btn"><Upload className="w-4 h-4 mr-2" />Upload</Button>
              {form.logo && <Button variant="ghost" size="icon" onClick={() => setForm((f) => ({ ...f, logo: "" }))} data-testid="brand-logo-remove-btn"><X className="w-4 h-4" /></Button>}
            </div>
          </Field>
          <Field label="Brand name">
            <Input value={form.name} onChange={set("name")} placeholder="Acme Studio" data-testid="brand-name-input" />
          </Field>
          <Field label="Accent colour">
            <div className="flex gap-2">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : "#3B82F6"} onChange={set("color")} className="h-10 w-14 rounded-md bg-transparent border border-white/10 cursor-pointer" data-testid="brand-color-picker" />
              <Input value={form.color} onChange={set("color")} className="font-mono" data-testid="brand-color-input" />
            </div>
          </Field>
          <Field label="Website (logo links here)">
            <Input value={form.website} onChange={set("website")} placeholder="https://example.com" data-testid="brand-website-input" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Secondary colour">
              <div className="flex gap-2">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.color2 || "") ? form.color2 : "#44546A"} onChange={set("color2")} className="h-10 w-12 rounded-md bg-transparent border border-white/10 cursor-pointer" />
                <Input value={form.color2 || ""} onChange={set("color2")} className="font-mono" />
              </div>
            </Field>
            <Field label="Font">
              <select value={form.font || "Inter"} onChange={set("font")} className="h-10 w-full rounded-md bg-black/30 border border-white/10 px-2 text-sm">
                {["Inter", "Roboto", "Georgia"].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Brand stripe or pattern (optional, shown under the library header)">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-10 rounded-md bg-black/30 border border-white/10 overflow-hidden grid place-items-center">
                {form.stripe ? <img src={fileUrl(form.stripe)} alt="stripe" className="h-2 w-full object-cover object-left" /> : <span className="text-[10px] text-slate-500">none</span>}
              </div>
              <input ref={stripeRef} type="file" accept="image/*" hidden onChange={upload("stripe")} />
              <Button variant="secondary" disabled={busy} onClick={() => stripeRef.current.click()}><Upload className="w-4 h-4" /></Button>
              {form.stripe && <Button variant="ghost" size="icon" onClick={() => setForm((f) => ({ ...f, stripe: "" }))}><X className="w-4 h-4" /></Button>}
            </div>
          </Field>
          <Field label="Footer text (e.g. firm name and cities)">
            <Input value={form.footer || ""} onChange={set("footer")} placeholder="Singhvi Dev & Unni LLP, Bengaluru and Mumbai" />
          </Field>
          <Button className="w-full" disabled={busy} onClick={save} data-testid="brand-settings-save-btn">Save branding</Button>

        </div>
      </DialogContent>
    </Dialog>
  );
};
