"""Read the 'In this issue' contents from a newsletter's first page and link
each headline to the page it appears on."""
import re

BULLETS = set("•▪●➢‣◦")
ACRONYMS = {"GST", "FEMA", "SEBI", "FTP", "GSTAT", "CSR", "IFSC", "RBI", "DGFT", "AIF", "AIFS", "TDS", "TCS", "ICAI", "MCA", "IBC", "LLP", "SEZ", "DTAA"}
SMALL = {"and", "of", "the", "for", "to", "in", "on", "&"}


def _clean(t):
    return re.sub(r"\s+", " ", t).strip()


def _norm(t):
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", t.lower()))


def _is_bullet(ch):
    return ch in BULLETS or "" <= ch <= ""


def _section_name(s):
    out = []
    for i, w in enumerate(s.strip().split()):
        if w.upper() in ACRONYMS:
            out.append(w.upper())
        elif i and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w.lower().capitalize())
    name = " ".join(out)
    return "FTP" if name == "FTP" else name


def parse_toc(doc):
    try:
        raw = doc[0].get_text()
    except Exception:
        return []
    m = re.search(r"In this [A-Za-z]+", raw)
    if not m:
        return []
    sections, st = [], {"cur": None, "buf": None}

    def flush():
        if st["buf"] and st["cur"] is not None:
            st["cur"]["items"].append(_clean(st["buf"]))
        st["buf"] = None

    for line in raw[m.end():].split("\n"):
        s = line.strip()
        if not s:
            continue
        if _is_bullet(s[0]):
            flush()
            st["buf"] = s[1:].strip()
            continue
        letters = re.sub(r"[^A-Za-z]", "", s)
        if len(letters) >= 3 and letters.isupper() and len(s) < 60:
            flush()
            st["cur"] = {"section": _section_name(s), "items": []}
            sections.append(st["cur"])
            continue
        if st["buf"] is not None:
            st["buf"] += " " + s
    flush()

    pages = [_norm(p.get_text()) for p in doc]

    def locate(title):
        n = _norm(title).strip()
        for size in (32, 22):
            key = n[:size].strip()
            if len(key) < 12:
                continue
            for i in range(1, len(pages)):
                if key in pages[i]:
                    return i
        return None

    out = []
    for sec in sections:
        items, last = [], None
        for title in sec["items"]:
            p = locate(title)
            if p is None:
                p = last
            last = p if p is not None else last
            items.append({"title": title, "page": p})
        # headlines before the first located one take the next located page
        nxt = None
        for it in reversed(items):
            if it["page"] is None:
                it["page"] = nxt
            nxt = it["page"]
        if not items:
            continue
        same = next((o for o in out if o["section"] == sec["section"]), None)
        if same:
            same["items"].extend(items)
        else:
            out.append({"section": sec["section"], "items": items})
    for o in out:
        o["items"] = o["items"][:12]
    return out[:12]
