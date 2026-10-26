"""Suggest 'dates to act on' from an issue's page text.

Only suggestions: the firm reviews them in the dashboard before readers see any.
A date counts when the words around it read like an obligation or a deadline
(due date, extended to, on or before, till ...), it is not a document date
("dated 07.09.2026", "Notification No. ..."), it is not the old side of a
change ("extended from 30.09.2026 to ..."), and it is not already past when
the issue came out.
"""
import re
from datetime import date

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
DATE_RE = re.compile(
    r"(?P<n>\b(?P<d1>\d{1,2})[./-](?P<m1>\d{1,2})[./-](?P<y1>20\d{2})\b)"
    r"|(?P<w>\b(?P<d2>\d{1,2})(?:st|nd|rd|th)?\s+" + MON.replace("(", "(?P<m2>", 1) + r"[,\s]+(?P<y2>20\d{2})\b)"
    r"|(?P<a>\b" + MON.replace("(", "(?P<m3>", 1) + r"\s+(?P<d3>\d{1,2})(?:st|nd|rd|th)?,?\s+(?P<y3>20\d{2})\b)",
    re.I,
)
ACT = re.compile(r"due date|last date|extended|on or before|deadline|\btill\b|\buntil\b|\bby\b|due by|to be filed|to be furnished|must be|window|valid up ?to|upto", re.I)


def _parse(m) -> date | None:
    try:
        if m.group("n"):
            return date(int(m.group("y1")), int(m.group("m1")), int(m.group("d1")))
        if m.group("w"):
            return date(int(m.group("y2")), MONTHS[m.group("m2")[:3].lower()], int(m.group("d2")))
        return date(int(m.group("y3")), MONTHS[m.group("m3")[:3].lower()], int(m.group("d3")))
    except (ValueError, KeyError):
        return None


def _headline_for(text: str, pos: int, heads: list[dict]) -> str | None:
    """The contents-page headline whose words appear last before this point on the page."""
    best, at = None, -1
    low = text.lower()
    for h in heads:
        key = re.sub(r"\s+", " ", h["title"].lower())[:28]
        i = low.rfind(key, 0, pos)
        if i > at:
            best, at = h["title"], i
    return best


def suggest(pages: list[str], issue_month: str, toc: list[dict]) -> list[dict]:
    try:
        y, mth = (int(x) for x in issue_month.split("-"))
        start = date(y, mth, 1)
    except (ValueError, AttributeError):
        start = date.today().replace(day=1)
    latest = date(start.year + 3, start.month, 1)
    heads_by_page: dict[int, list[dict]] = {}
    for s in toc or []:
        for h in s.get("items", []):
            if h.get("page") is not None:
                heads_by_page.setdefault(h["page"], []).append(h)
    out, seen = [], set()
    for pno, raw in enumerate(pages):
        if pno == 0 and heads_by_page:
            continue  # the contents page repeats headlines without the detail
        text = " ".join((raw or "").split())
        for m in DATE_RE.finditer(text):
            d = _parse(m)
            if not d or d < start or d > latest:
                continue
            before = text[max(0, m.start() - 140):m.start()]
            after = text[m.end():m.end() + 40]
            if re.search(r"(dated|dt\.?|no\.?\s*\S{0,25})\s*$", before, re.I):
                continue
            if re.search(r"\bfrom\s*$", before, re.I) and re.match(r"\s*to\b", after, re.I):
                continue  # the old date in "extended from X to Y"
            if not ACT.search(before + " " + after):
                continue
            title = _headline_for(text, m.start(), heads_by_page.get(pno, []) + [h for p, hs in heads_by_page.items() if p < pno for h in hs[-1:]])
            context = (before[-120:] + m.group(0) + after).strip()
            title = title or re.sub(r"^[^A-Z]*", "", context)[:110]
            key = (d.isoformat(), title)
            if key in seen:
                continue
            seen.add(key)
            out.append({"date": d.isoformat(), "title": title[:200], "page": pno, "context": context[:240]})
    out.sort(key=lambda r: r["date"])
    return out[:20]
