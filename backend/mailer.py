"""The monthly issue email: every headline links to its own page in the issue,
the dates to act on can go straight into a calendar, and one button opens the
full issue. Table layout and inline styles, so it holds up in Outlook and Gmail."""
import html
from datetime import date

NAVY = "#204262"
INK = "#0a1626"
SLATE = "#44546a"
MIST = "#9db8d4"
FONT = "Roboto, 'Segoe UI', Helvetica, Arial, sans-serif"


def _fmt(iso: str) -> str:
    try:
        d = date.fromisoformat(iso)
        return d.strftime("%d %b %Y").lstrip("0")
    except ValueError:
        return iso


def compose(*, lib: dict, item: dict, heads: list, links: dict, unsub: str) -> tuple[str, str, str]:
    """links: issue, head(i), ics(i), ics_all, logo, site. Returns (subject, html, text)."""
    e = lambda v: html.escape(str(v or ""), quote=True)
    brand = lib["brand"]
    color = brand.get("color") or NAVY
    name = f"{item['kind']}, {item['label']}" if item.get("special") and item.get("date") else item.get("label", "")
    top = next((h["title"] for h in heads), "")
    subject = f"{lib['title']} | {name}" + (f": {top}" if top else "")
    pitch_t, pitch_x = lib.get("pitch_title") or "", lib.get("pitch_text") or ""

    sections, order = {}, []
    for i, h in enumerate(heads):
        if h["section"] not in sections:
            sections[h["section"]] = []
            order.append(h["section"])
        sections[h["section"]].append((i, h))

    def button(href, label, solid=True):
        bg, fg, bd = (color, "#ffffff", color) if solid else ("#ffffff", color, color)
        return (f'<a href="{e(href)}" style="display:inline-block;background:{bg};color:{fg};border:1px solid {bd};'
                f'font-family:{FONT};font-size:15px;font-weight:500;text-decoration:none;padding:12px 26px;border-radius:999px">{e(label)}</a>')

    rows = []
    deadlines = sorted(item.get("deadlines") or [], key=lambda d: d["date"])
    if deadlines:
        lines = "".join(
            f'<tr><td style="padding:10px 0;border-top:1px solid #e3e9f0;font-family:{FONT};font-size:14px;color:{INK};vertical-align:top;width:118px;font-weight:500">{e(_fmt(d["date"]))}</td>'
            f'<td style="padding:10px 0;border-top:1px solid #e3e9f0;font-family:{FONT};font-size:14px;color:{INK};line-height:1.45">{e(d["title"])}'
            f'<br><a href="{e(links["ics"](i))}" style="color:{color};font-size:13px;text-decoration:none">Add to calendar</a></td></tr>'
            for i, d in enumerate(deadlines))
        rows.append(
            f'<tr><td style="padding:8px 40px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;border-radius:14px">'
            f'<tr><td style="padding:20px 22px 12px"><div style="font-family:{FONT};font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:{SLATE}">Dates to act on</div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">{lines}</table>'
            + (f'<div style="padding-top:10px"><a href="{e(links["ics_all"])}" style="font-family:{FONT};font-size:13px;color:{color};text-decoration:none">Add all to calendar</a></div>' if len(deadlines) > 1 else "")
            + '</td></tr></table></td></tr>')

    for sec in order:
        items = "".join(
            f'<tr><td style="padding:9px 0;border-top:1px solid #edf1f5"><a href="{e(links["head"](i))}" style="font-family:{FONT};font-size:15.5px;line-height:1.45;color:{INK};text-decoration:none">{e(h["title"])}</a>'
            + (f'<span style="font-family:{FONT};font-size:12.5px;color:{MIST}">&nbsp;&nbsp;p{h["page"] + 1}</span>' if h.get("page") is not None else "")
            + "</td></tr>"
            for i, h in sections[sec])
        rows.append(
            f'<tr><td style="padding:22px 40px 0"><div style="font-family:{FONT};font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:{color};font-weight:500;padding-bottom:6px">{e(sec)}</div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{items}</table></td></tr>')

    logo = (f'<img src="{e(links["logo"])}" alt="{e(brand.get("name") or "")}" height="34" style="display:block;height:34px;border:0">'
            if links.get("logo") else f'<span style="font-family:{FONT};font-size:18px;color:#fff">{e(brand.get("name") or "")}</span>')
    bars = "".join(f'<td style="width:2px;background:#ffffff;height:{h}px"></td><td style="width:4px"></td>' for h in (16, 11, 13, 20, 13, 11, 16))
    body = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(subject)}</title></head>
<body style="margin:0;padding:0;background:#e9eef3">
<div style="display:none;max-height:0;overflow:hidden">{e(pitch_t + " " + (top or ""))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9eef3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:{INK};background-image:linear-gradient(120deg,{INK},{color});padding:30px 40px 28px">
  {logo}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr valign="bottom">{bars}<td style="padding-left:10px;font-family:{FONT};font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:{MIST}">{e(pitch_t or lib['title'])}</td></tr></table>
  <div style="font-family:{FONT};font-size:30px;line-height:1.15;font-weight:300;color:#ffffff;margin-top:12px">{e(lib['title'])}<br><span style="color:{MIST}">{e(name)}</span></div>
</td></tr>
{f'<tr><td style="padding:26px 40px 6px;font-family:{FONT};font-size:15px;line-height:1.6;color:{SLATE}">{e(pitch_x)}</td></tr>' if pitch_x else ''}
{''.join(rows)}
<tr><td align="center" style="padding:34px 40px 10px">{button(links['issue'], 'Read the full issue')}</td></tr>
<tr><td align="center" style="padding:0 40px 34px;font-family:{FONT};font-size:13px;color:{SLATE}">Each headline opens the issue at its page.</td></tr>
<tr><td style="background:#f4f6f8;padding:22px 40px;font-family:{FONT};font-size:12px;line-height:1.6;color:#6b7a8c">
  {e(brand.get('footer') or brand.get('name') or '')}<br>
  {f'<a href="{e(links["site"])}" style="color:#6b7a8c">{e(links["site"].replace("https://", "").replace("http://", "").rstrip("/"))}</a><br>' if links.get('site') else ''}
  You're receiving this because you subscribed to the {e(lib['title'])}. <a href="{unsub}" style="color:#6b7a8c">Unsubscribe</a>
</td></tr>
</table></td></tr></table></body></html>"""

    text = [f"{lib['title']} | {name}", pitch_t, pitch_x, ""]
    if deadlines:
        text += ["DATES TO ACT ON"] + [f"- {_fmt(d['date'])}: {d['title']}" for d in deadlines] + [""]
    for sec in order:
        text.append(sec.upper())
        text += [f"- {h['title']}\n  {links['head'](i)}" for i, h in sections[sec]]
        text.append("")
    text += [f"Read the full issue: {links['issue']}", "", f"Unsubscribe: {unsub}"]
    return subject, body, "\n".join(t for t in text if t is not None)


def ics(events: list[dict], *, prodid: str, url: str) -> str:
    """All-day calendar events with a reminder three days before."""
    import uuid
    from datetime import datetime, timezone
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    esc = lambda v: str(v).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    out = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{esc(prodid)}//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    for ev in events:
        d = date.fromisoformat(ev["date"])
        nxt = date.fromordinal(d.toordinal() + 1)
        out += ["BEGIN:VEVENT", f"UID:{uuid.uuid4()}@flipcraft", f"DTSTAMP:{stamp}",
                f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{nxt:%Y%m%d}",
                f"SUMMARY:{esc(ev['title'])}", f"DESCRIPTION:{esc(ev.get('note', ''))}", f"URL:{url}",
                "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(ev['title'])}", "TRIGGER:-P3D", "END:VALARM", "END:VEVENT"]
    out.append("END:VCALENDAR")
    return "\r\n".join(out) + "\r\n"
