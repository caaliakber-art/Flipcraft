import { useEffect, useRef, useState } from "react";
import { Copy, KeyRound, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { api, copyText, errMsg, fileUrl, getStudioKey, setStudioKey, uploadMedia } from "../lib/api";

const Field = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium tracking-wider uppercase text-slate-400">{label}</span>
    {children}
  </label>
);

export const BrandDialog = ({ open, onOpenChange, brand, onSaved }) => {
  const [form, setForm] = useState(brand);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const fileRef = useRef(null);
  useEffect(() => { if (open) setForm(brand); }, [open, brand]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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

  const restore = () => {
    if (!/^[a-f0-9]{48}$/.test(newKey.trim())) return toast.error("That doesn't look like a studio key");
    setStudioKey(newKey.trim());
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#131B2E] border-white/10 max-h-[90vh] overflow-y-auto" data-testid="brand-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Your branding</DialogTitle>
          <DialogDescription>Saved once, shown on every flipbook you share.</DialogDescription>
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
          <Button className="w-full" disabled={busy} onClick={save} data-testid="brand-settings-save-btn">Save branding</Button>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3" data-testid="studio-key-section">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold"><KeyRound className="w-4 h-4" />Your private studio key</div>
            <p className="text-xs text-slate-400">There's no login. This key, saved in this browser, is what lets you edit your flipbooks. Keep a copy to use them on another device or after clearing your browser.</p>
            <div className="flex gap-2">
              <Input readOnly value={getStudioKey()} className="font-mono text-xs" type="password" data-testid="studio-key-input" />
              <Button variant="secondary" onClick={async () => { await copyText(getStudioKey()); toast.success("Studio key copied — keep it somewhere safe"); }} data-testid="studio-key-copy-btn"><Copy className="w-4 h-4" /></Button>
            </div>
            <div className="flex gap-2">
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Paste a key from another device" className="font-mono text-xs" data-testid="studio-key-restore-input" />
              <Button variant="secondary" onClick={restore} data-testid="studio-key-restore-btn">Use</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
