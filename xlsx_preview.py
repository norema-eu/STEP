#!/usr/bin/env python3
"""Crea un'anteprima HTML leggibile di un file .xlsx (tutti i fogli) per il riquadro documenti."""
import html, sys, datetime, pathlib, warnings
import openpyxl
warnings.filterwarnings("ignore")

CSS = """:host,body{display:block;margin:0;font:13px/1.45 Montserrat,system-ui,sans-serif;color:#0D2436;background:#fff}
h2{font-weight:500;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#01A79C;margin:18px 14px 8px}
.w{overflow:auto;margin:0 14px 18px;border:1px solid #DDE3E6;border-radius:8px}
table{border-collapse:collapse;min-width:100%}td{padding:6px 9px;border-bottom:1px solid #E7EAE9;vertical-align:top;max-width:340px;min-width:90px}
tr:first-child td{background:#242965;color:#fff;font-weight:500;position:sticky;top:0}
tr:nth-child(even) td{background:#F4FAFA}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}"""

def fmt(v):
    if v is None: return "", False
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        s = f"{v:,.2f}" if isinstance(v, float) and v != int(v) else f"{int(v):,}" if float(v).is_integer() else f"{v:,.2f}"
        return s.replace(",", "X").replace(".", ",").replace("X", "."), True
    if isinstance(v, (datetime.date, datetime.datetime)): return v.strftime("%d/%m/%Y"), False
    return str(v), False

def convert(src: pathlib.Path, dst: pathlib.Path):
    wb = openpyxl.load_workbook(src, data_only=True, read_only=True)
    parts = [f"<!doctype html><html lang='it'><head><meta charset='utf-8'><meta name='robots' content='noindex'><style>{CSS}</style></head><body>"]
    for ws in wb.worksheets:
        rows = [r for r in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in r)]
        if not rows: continue
        last = max(max((i for i, c in enumerate(r) if c not in (None, "")), default=0) for r in rows) + 1
        parts.append(f"<h2>{html.escape(ws.title)}</h2><div class='w'><table>")
        for r in rows:
            cells = []
            for c in list(r)[:last]:
                t, num = fmt(c)
                cells.append(f"<td class='n'>{html.escape(t)}</td>" if num else f"<td>{html.escape(t)}</td>")
            parts.append("<tr>" + "".join(cells) + "</tr>")
        parts.append("</table></div>")
    parts.append("</body></html>")
    dst.write_text("".join(parts), encoding="utf-8")

if __name__ == "__main__":
    for a in sys.argv[1:]:
        p = pathlib.Path(a); out = p.parent / "anteprime" / (p.stem + ".html")
        out.parent.mkdir(exist_ok=True); convert(p, out); print("ok", out)
