import { Link } from "react-router-dom";
import { Eye, Loader2, PenLine, Share2, Trash2, AlertTriangle, Layers, BarChart3 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { fileUrl } from "../lib/api";

export const FlipbookCard = ({ book, onShare, onDelete, onStats, index }) => {
  const ready = book.status === "ready";
  const ratio = book.page_width && book.page_height ? `${book.page_width} / ${book.page_height}` : "3 / 4";
  return (
    <div className="fc-rise group rounded-xl bg-[#131B2E] border border-white/10 overflow-hidden hover:border-white/25 transition-colors" style={{ animationDelay: `${index * 50}ms` }} data-testid="flipbook-card-item">
      <div className="relative bg-black/30 p-5 flex justify-center fc-stage-grid">
        <div className="w-2/3 max-w-[180px] rounded-sm overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.5)] bg-white transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-[1.03]" style={{ aspectRatio: ratio }}>
          {book.thumbs[0] ? <img src={fileUrl(book.thumbs[0])} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
        </div>
        {book.status === "processing" && (
          <div className="absolute inset-0 bg-[#0B0F17]/75 grid place-items-center text-center" data-testid="flipbook-card-processing">
            <div>
              <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
              <p className="text-sm mt-2">Converting {book.pages_done}/{book.page_count || "…"}</p>
            </div>
          </div>
        )}
        {book.status === "failed" && (
          <div className="absolute inset-0 bg-[#0B0F17]/80 grid place-items-center text-center px-4" data-testid="flipbook-card-failed">
            <div><AlertTriangle className="w-6 h-6 text-red-400 mx-auto" /><p className="text-sm mt-2">Conversion failed</p></div>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-display font-semibold truncate" title={book.title} data-testid="flipbook-card-title">{book.title}</h3>
          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1"><Layers className="w-3 h-3" />{book.page_count} pages · {book.overlays.length} media · {new Date(book.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={() => onStats(book)} disabled={!ready} className="w-full flex items-center justify-between rounded-md bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.07] transition-colors disabled:opacity-40" data-testid="flipbook-card-stats-btn">
          <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Readers</span>
          <span className="font-mono" data-testid="flipbook-card-views">{book.views || 0} opens</span>
        </button>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" disabled={!ready} asChild={ready}>
            {ready ? <Link to={`/edit/${book.id}`} data-testid="flipbook-card-edit-btn"><PenLine className="w-3.5 h-3.5 mr-1.5" />Edit & add media</Link> : <span>Edit & add media</span>}
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} asChild={ready}>
            {ready ? <Link to={`/view/${book.id}`} target="_blank" data-testid="flipbook-card-view-btn"><Eye className="w-3.5 h-3.5" /></Link> : <span><Eye className="w-3.5 h-3.5" /></span>}
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} onClick={() => onShare(book)} data-testid="flipbook-card-share-btn"><Share2 className="w-3.5 h-3.5" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="secondary" className="hover:bg-red-500/20 hover:text-red-300" data-testid="flipbook-card-delete-btn"><Trash2 className="w-3.5 h-3.5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#131B2E] border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{book.title}”?</AlertDialogTitle>
                <AlertDialogDescription>The share link and any embeds will stop working.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="delete-cancel-btn">Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => onDelete(book)} data-testid="delete-confirm-btn">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};
