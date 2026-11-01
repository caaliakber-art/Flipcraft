"""Rebuilds readable paragraphs from a PDF page for the "Read as text" view.
PDF text comes out line by line; lines are joined back into paragraphs using the gaps
between them, bullets and bold headlines. Output strings use two markers:
"## " starts a heading; "\x01lead\x02rest" is a paragraph with a bold lead-in."""
import re

BULLET = re.compile(r"^[-•▪●➢+\-–•]\s*")
NOISE = re.compile(r"(?i)^(monthly communique\s*\|.*|page \d+ of \d+|bengalur.{0,6}mumbai|singhvi|dev\s*&\s*unni( llp)?|chartered accountants)$")


def _bold(span) -> bool:
    return bool(span.get("flags", 0) & 16) or "bold" in span.get("font", "").lower()


def paragraphs(page) -> list:
    lines = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for ln in block.get("lines", []):
            spans = [s for s in ln.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            text = re.sub(r"\s+", " ", "".join(s["text"] for s in ln["spans"])).strip()
            x0, y0, x1, y1 = ln["bbox"]
            lead = ""
            for s in spans:  # bold run at the start of the line (a bullet glyph doesn't count)
                if not lead and BULLET.fullmatch(s["text"].strip() + " "):
                    continue
                if _bold(s):
                    lead += s["text"]
                else:
                    break
            lines.append({"t": text, "x": x0, "y0": y0, "y1": y1, "h": max(y1 - y0, 1),
                          "bold": all(_bold(s) for s in spans), "lead": re.sub(r"\s+", " ", lead).strip(),
                          "size": max(s.get("size", 0) for s in spans)})
    out, cur = [], None

    def flush():
        nonlocal cur
        if not cur:
            return
        t = re.sub(r"\s+", " ", cur["t"]).strip()
        t = BULLET.sub("", t).strip()
        if t and not NOISE.match(t):
            if cur["heading"]:
                out.append("## " + t)
            elif cur["lead"] and len(cur["lead"]) < len(t) and t.startswith(BULLET.sub("", cur["lead"]).strip()):
                lead = BULLET.sub("", cur["lead"]).strip()
                out.append("\x01" + lead + "\x02" + t[len(lead):].strip())
            elif re.match(r"^[^.:;]{8,150}:\s", t):  # "Headline: the update..."
                lead, rest = t.split(":", 1)
                out.append("\x01" + lead.strip() + ":\x02" + rest.strip())
            else:
                out.append(t)
        cur = None

    for ln in lines:
        t = ln["t"]
        starts_new = (cur is None or BULLET.match(t) or ln["bold"] != cur["bold"] and (ln["bold"] or cur["heading"])
                      or ln["y0"] - cur["y1"] > ln["h"] * 0.6 or ln["y0"] < cur["y1"] - ln["h"]
                      or abs(ln["x"] - cur["x"]) > 120)
        if starts_new:
            flush()
            heading = ln["bold"] and len(t) < 90 and not t.rstrip().endswith((".", ";", ","))
            cur = {"t": t, "x": ln["x"], "y1": ln["y1"], "bold": ln["bold"], "heading": heading, "lead": ln["lead"]}
        else:
            joiner = "" if cur["t"].endswith("-") and not cur["t"].endswith(" -") else " "
            cur["t"] = (cur["t"][:-1] if joiner == "" else cur["t"]) + joiner + t
            cur["y1"] = ln["y1"]
            if cur["heading"] and len(cur["t"]) > 140:
                cur["heading"] = False
    flush()
    return out
