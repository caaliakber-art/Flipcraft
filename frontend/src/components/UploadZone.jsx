import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";

export const UploadZone = ({ onCreated }) => {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const [pct, setPct] = useState(null);

  const send = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return toast.error("Please choose a PDF file");
    if (file.size > 100 * 1024 * 1024) return toast.error("PDF must be under 100 MB");
    const fd = new FormData();
    fd.append("file", file);
    try {
      setPct(0);
      const { data } = await api.post("/flipbooks", fd, { onUploadProgress: (e) => setPct(Math.round((e.loaded / (e.total || 1)) * 100)) });
      toast.success("Uploaded — converting pages now");
      onCreated(data);
    } catch (e) {
      toast.error(errMsg(e, "Upload failed"));
    } finally {
      setPct(null);
    }
  };

  return (
    <div
      onClick={() => pct === null && ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files?.[0]); }}
      className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-10 sm:p-14 transition-colors duration-200 ${drag ? "border-blue-400 bg-blue-500/10" : "border-white/15 bg-[#131B2E]/60 hover:border-blue-400/60 hover:bg-[#131B2E]"}`}
      data-testid="pdf-upload-dropzone"
    >
      <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} data-testid="pdf-upload-input" />
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 shrink-0 rounded-xl bg-blue-500/15 grid place-items-center transition-transform duration-300 group-hover:-translate-y-1">
          {pct === null ? <FileUp className="w-7 h-7 text-blue-400" /> : <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />}
        </div>
        <div>
          <p className="font-display text-xl font-semibold">{pct === null ? "Drop a PDF to make a flipbook" : `Uploading… ${pct}%`}</p>
          <p className="text-sm text-slate-400 mt-1">or click to browse · up to 100 MB · every page becomes a turnable page</p>
        </div>
      </div>
      {pct !== null && <div className="absolute left-0 bottom-0 h-1 bg-blue-500 rounded-b-2xl transition-[width]" style={{ width: `${pct}%` }} />}
    </div>
  );
};
