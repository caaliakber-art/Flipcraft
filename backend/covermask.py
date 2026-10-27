"""Where a cover's own contents list starts, and the colours behind it, so the reader
can cover that list with a matching panel when the linked index sits beside it."""
import re
from typing import Optional

HEAD = re.compile(r"^\s*(in this|inside this|contents\b|what'?s inside)", re.I)


def cover_mask(page) -> Optional[dict]:
    h, w = page.rect.height, page.rect.width
    cut = None
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            text = "".join(s.get("text", "") for s in line.get("spans", []))
            y0 = line["bbox"][1]
            if HEAD.match(text) and y0 > h * 0.08 and (cut is None or y0 < cut):
                cut = y0
    if cut is None or cut > h * 0.45:
        return None
    frac = max(0.0, (cut - 4) / h)
    scale = 120 / max(w, 1)
    import pymupdf as fitz
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)

    def at(fy: float) -> str:
        y = min(pix.height - 1, max(0, int(fy * pix.height)))
        r, g, b = pix.pixel(max(1, int(pix.width * 0.03)), y)[:3]
        return f"#{r:02x}{g:02x}{b:02x}"

    return {"cut": round(frac, 4), "top": at(frac + 0.02), "mid": at((frac + 1) / 2), "bottom": at(0.985)}
