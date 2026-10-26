import { useRef } from "react";
import { Film, Image as ImageIcon, Link2, Youtube } from "lucide-react";

const LABELS = { "YouTube / Vimeo": "YouTube", "Video file": "Video", "Web link": "Link" };

const Tool = ({ icon: Icon, label, sub, onClick, testid, disabled, row }) => (
  <button onClick={onClick} disabled={disabled} data-testid={testid}
    className={`text-left rounded-lg border border-white/10 bg-white/[0.02] flex items-start hover:bg-white/[0.06] hover:border-white/20 active:scale-[0.98] disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 ${row ? "flex-1 flex-col items-center gap-1 px-1 py-2" : "w-full gap-3 p-3"}`}>
    <Icon className={`w-5 h-5 text-blue-400 shrink-0 ${row ? "" : "mt-0.5"}`} />
    {row ? <span className="text-[11px] font-semibold">{LABELS[label] || label}</span> : <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[11px] text-slate-400">{sub}</span></span>}
  </button>
);

export const ToolRail = ({ onFile, onEmbed, onLink, busy, row = false }) => {
  const vid = useRef(null);
  const img = useRef(null);
  const sfx = row ? "-mobile" : "";
  const pick = (kind) => (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f, kind); };
  return (
    <div className={row ? "flex gap-2" : "space-y-2"}>
      {!row && <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400 mb-3">Add to this page</p>}
      <input ref={vid} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={pick("video")} data-testid={`editor-video-file-input${sfx}`} />
      <input ref={img} type="file" accept="image/*" hidden onChange={pick("image")} data-testid={`editor-image-file-input${sfx}`} />
      <Tool row={row} icon={Film} label="Video file" sub="MP4, WEBM, MOV · 300 MB" onClick={() => vid.current.click()} disabled={busy} testid={`editor-add-video-btn${sfx}`} />
      <Tool row={row} icon={Youtube} label="YouTube / Vimeo" sub="Paste a link" onClick={onEmbed} disabled={busy} testid={`editor-add-embed-btn${sfx}`} />
      <Tool row={row} icon={ImageIcon} label="Picture" sub="JPG, PNG, GIF, WEBP" onClick={() => img.current.click()} disabled={busy} testid={`editor-add-image-btn${sfx}`} />
      <Tool row={row} icon={Link2} label="Web link" sub="Clickable area" onClick={onLink} disabled={busy} testid={`editor-add-link-btn${sfx}`} />
    </div>
  );
};
