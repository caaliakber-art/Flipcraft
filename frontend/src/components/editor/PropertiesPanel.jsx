import { Trash2, Copy } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { toEmbed } from "../../lib/api";

const NAMES = { video: "Uploaded video", youtube: "YouTube / Vimeo", image: "Picture", link: "Web link" };

const Field = ({ label, children, hint }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-medium tracking-wider uppercase text-slate-400">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-red-400">{hint}</span>}
  </label>
);

const Num = ({ k, o, onChange }) => (
  <label className="text-[11px] text-slate-400 font-mono">{k.toUpperCase()}
    <Input type="number" step="0.5" value={Math.round(o[k] * 10) / 10} onChange={(e) => onChange({ ...o, [k]: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })} className="h-8 text-xs mt-1" data-testid={`prop-${k}-input`} />
  </label>
);

export const PropertiesPanel = ({ o, onChange, onDelete, onDuplicate, sound, onSound, hardCover, onHardCover, page, total }) => {
  if (!o) {
    return (
      <div className="space-y-6" data-testid="properties-empty">
        <div>
          <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400">Page</p>
          <p className="font-display text-2xl font-bold mt-1">{page + 1} <span className="text-slate-500 text-base font-normal">of {total}</span></p>
        </div>
        <p className="text-sm text-slate-400">Pick something from the left to drop it on this page, or click an item on the page to edit it.</p>
        <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
          <span className="text-sm">Page-flip sound on by default</span>
          <Switch checked={sound} onCheckedChange={onSound} data-testid="editor-sound-default-switch" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-white/10 p-3 gap-3">
          <span className="text-sm">Hardcover look for front & back covers</span>
          <Switch checked={hardCover} onCheckedChange={onHardCover} data-testid="editor-hardcover-switch" />
        </div>
      </div>
    );
  }
  const set = (k) => (e) => onChange({ ...o, [k]: e.target.value });
  const badUrl = o.url && !/^(https?:\/\/|mailto:|tel:)/.test(o.url);
  return (
    <div className="space-y-5" data-testid="properties-panel">
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold">{NAMES[o.type]}</p>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onDuplicate} title="Duplicate" data-testid="prop-duplicate-btn"><Copy className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="hover:text-red-300" onClick={onDelete} title="Delete" data-testid="prop-delete-btn"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
      {o.type === "youtube" && (
        <Field label="Video link" hint={o.src && !toEmbed(o.src) ? "Only YouTube or Vimeo links work" : ""}>
          <Input value={o.src} onChange={set("src")} placeholder="https://youtu.be/…" data-testid="prop-embed-url-input" />
        </Field>
      )}
      {(o.type === "link" || o.type === "image") && (
        <Field label={o.type === "link" ? "Opens this address" : "Clicking the picture opens (optional)"} hint={badUrl ? "Start with https://, mailto: or tel:" : o.type === "link" && !o.url ? "Add an address for this link" : ""}>
          <Input value={o.url} onChange={set("url")} placeholder="https://example.com" data-testid="prop-link-url-input" />
        </Field>
      )}
      <Field label="Label (shown on hover)">
        <Input value={o.label} onChange={set("label")} placeholder="Optional" data-testid="prop-label-input" />
      </Field>
      {(o.type === "video" || o.type === "youtube") && (
        <div className="flex items-center justify-between rounded-lg border border-white/10 p-3 gap-3">
          <span className="text-sm">Play automatically (muted) when this page opens</span>
          <Switch checked={!!o.autoplay} onCheckedChange={(v) => onChange({ ...o, autoplay: v })} data-testid="prop-autoplay-switch" />
        </div>
      )}
      <div>
        <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400 mb-2">Position & size (% of page)</p>
        <div className="grid grid-cols-2 gap-2">{["x", "y", "w", "h"].map((k) => <Num key={k} k={k} o={o} onChange={onChange} />)}</div>
      </div>
      <p className="text-[11px] text-slate-500">Tip: drag to move, pull the corners to resize, press Delete to remove.</p>
    </div>
  );
};
