#!/usr/bin/env python3
"""Genera le pagine dei progetti dal modello comune.

- Copia _template/index.html in ogni cartella progetto che contiene data.json.
- Con --preview crea anche preview/<PROGETTO>.html autocontenuta (CSS, JS e dati incorporati),
  utile per vedere la pagina senza server.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
TEMPLATE = (ROOT / "_template" / "index.html").read_text(encoding="utf-8")
PROJECTS = [p.parent for p in ROOT.glob("*/data.json") if not p.parent.name.startswith(("_", "."))]


def main(preview: bool) -> None:
    css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
    for folder in sorted(PROJECTS):
        data = json.loads((folder / "data.json").read_text(encoding="utf-8"))  # valida il JSON
        (folder / "index.html").write_text(TEMPLATE, encoding="utf-8")
        print(f"ok  {folder.name}/index.html")
        if preview:
            out = ROOT / "preview"
            out.mkdir(exist_ok=True)
            html = TEMPLATE.replace('<link rel="stylesheet" href="../assets/style.css">', f"<style>{css}</style>")
            html = html.replace('<script src="../assets/app.js"></script>', f"<script>{js}</script>")
            blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
            html = html.replace("<!--DATA-->", f'<script id="project-data" type="application/json">{blob}</script>')
            (out / f"{folder.name}.html").write_text(html, encoding="utf-8")
            print(f"ok  preview/{folder.name}.html")


if __name__ == "__main__":
    main("--preview" in sys.argv)
