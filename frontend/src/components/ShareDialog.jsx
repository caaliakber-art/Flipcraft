import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { copyText } from "../lib/api";

export const ShareDialog = ({ book, open, onOpenChange }) => {
  const [w, setW] = useState("100%");
  const [h, setH] = useState("600");
  if (!book) return null;
  const origin = window.location.origin;
  const link = `${origin}/view/${book.id}`;
  const height = /^\d+$/.test(h) ? `${h}px` : h;
  const embed = `<iframe src="${origin}/embed/${book.id}" width="${w}" height="${h}" style="border:none;width:${/^\d+$/.test(w) ? w + "px" : w};height:${height}" allow="autoplay; fullscreen" allowfullscreen title="${book.title.replace(/"/g, "&quot;")}"></iframe>`;
  const copy = async (t, label) => {
    await copyText(t);
    toast.success(`${label} copied`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#131B2E] border-white/10" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Share “{book.title}”</DialogTitle>
          <DialogDescription>Anyone with the link can view. Only you can edit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wider uppercase text-slate-400">Public link</p>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" data-testid="share-link-input" />
              <Button onClick={() => copy(link, "Link")} data-testid="share-copy-link-btn"><Copy className="w-4 h-4" /></Button>
              <Button variant="secondary" asChild>
                <a href={link} target="_blank" rel="noreferrer" data-testid="share-open-link-btn"><ExternalLink className="w-4 h-4" /></a>
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wider uppercase text-slate-400">Embed on your website</p>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-slate-400">Width
                <Input value={w} onChange={(e) => setW(e.target.value)} className="mt-1" data-testid="share-embed-width-input" />
              </label>
              <label className="flex-1 text-xs text-slate-400">Height
                <Input value={h} onChange={(e) => setH(e.target.value)} className="mt-1" data-testid="share-embed-height-input" />
              </label>
            </div>
            <textarea readOnly value={embed} rows={4} className="w-full rounded-md bg-black/30 border border-white/10 p-3 font-mono text-xs text-slate-300 resize-none" data-testid="share-embed-code" />
            <Button className="w-full" onClick={() => copy(embed, "Embed code")} data-testid="share-copy-embed-btn">
              <Copy className="w-4 h-4 mr-2" /> Copy embed code
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
