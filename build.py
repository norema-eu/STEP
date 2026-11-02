#!/usr/bin/env python3
"""Genera le pagine dei progetti dal modello comune.

- Copia _template/index.html in ogni cartella progetto che contiene data.json.
- Con --preview crea anche preview/<PROGETTO>.html autocontenuta (CSS, JS e dati incorporati),
  utile per vedere la pagina senza server.
"""
import hashlib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
TEMPLATE = (ROOT / "_template" / "index.html").read_text(encoding="utf-8")
DASH = ROOT / "DASHBOARD"  # cabina di regia interna NOREMA (generata, non è un progetto)
PROJECTS = [p.parent for p in ROOT.glob("*/data.json")
            if not p.parent.name.startswith(("_", ".")) and p.parent != DASH]

# chiave per riconoscere la stessa organizzazione nei diversi progetti
ORG_KEYS = ["iptsat", "norema", "sapienza", "readylab", "ro technology", "dev4u", "microsis", "main project", "olympos"]


def org_key(name: str) -> str:
    n = (name or "").lower().replace("-", " ")
    for k in ORG_KEYS:
        if k in n:
            return k
    return n.split(" s.r.l")[0].strip()


def build_dashboard(ver: str) -> None:
    """Unisce i data.json dei progetti (e l'anagrafica in _anagrafica/partner.json) in DASHBOARD/data.json."""
    progetti, orgs = [], {}
    for folder in sorted(PROJECTS):
        d = json.loads((folder / "data.json").read_text(encoding="utf-8"))
        p = dict(d["progetto"])
        p.update(slug=folder.name, budget=d.get("budget", {}), partner=d.get("partner", []),
                 scadenze=d.get("scadenze", []), criticita=d.get("criticita", []), aggiornato=d.get("aggiornato"))
        progetti.append(p)
        for x in p["partner"]:
            o = orgs.setdefault(org_key(x["nome"]), {"nome": x["nome"], "tipo": None, "referenti": [], "partecipazioni": []})
            o["partecipazioni"].append({"slug": folder.name, "ruolo": x.get("tipo") or x.get("ruolo"), "wp": x.get("wp"),
                                        "costo_ammesso": x.get("costo_ammesso"), "contributo_concesso": x.get("contributo_concesso"),
                                        "rna": x.get("rna")})
            if x.get("referente") and not any(r["nome"] == x["referente"] for r in o["referenti"]):
                o["referenti"].append({"nome": x["referente"], "ruolo": f"referente {p['acronimo']}"})
    ana = ROOT / "_anagrafica" / "partner.json"
    if ana.exists():
        for a in json.loads(ana.read_text(encoding="utf-8")).get("organizzazioni", []):
            k = org_key(a.get("nome") or a.get("nome_breve") or "")
            if k not in orgs:
                continue
            o = orgs[k]
            for f in ("nome", "tipo", "dimensione", "piva", "codice_fiscale", "sede_legale", "pec", "sito", "legale_rappresentante", "note"):
                if a.get(f):
                    o[f] = a[f]
            if len(o.get("nome", "")) > 60 and a.get("nome_breve"):
                o["nome_completo"], o["nome"] = o["nome"], a["nome_breve"]
            if a.get("referenti"):
                o["referenti"] = a["referenti"]
    inter = ROOT / "_interlocuzioni" / "tutor.json"
    tutor = json.loads(inter.read_text(encoding="utf-8")) if inter.exists() else {}
    order = {"norema": 0}
    out = {"aggiornato": max(p["aggiornato"] or "" for p in progetti), "progetti": progetti,
           "tutor": tutor.get("tutor"), "interlocuzioni": tutor.get("interlocuzioni", []),
           "organizzazioni": sorted(orgs.values(), key=lambda o: (order.get(org_key(o["nome"]), 1), -len(o["partecipazioni"]), o["nome"]))}
    DASH.mkdir(exist_ok=True)
    (DASH / "data.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    html = (ROOT / "_dashboard" / "index.html").read_text(encoding="utf-8")
    for a in ("style.css", "dash.css", "dash.js"):
        html = html.replace(f'../assets/{a}"', f'../assets/{a}?v={ver}"')
    (DASH / "index.html").write_text(html, encoding="utf-8")
    print("ok  DASHBOARD/index.html + data.json")


def build_aliases() -> None:
    """Il server distingue maiuscole e minuscole: /dashboard, /space_ai ecc. reindirizzano alle cartelle vere."""
    for folder in sorted(PROJECTS) + [DASH]:
        low = ROOT / folder.name.lower()
        if low == folder:
            continue
        low.mkdir(exist_ok=True)
        (low / "index.html").write_text(
            '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
            f'<script>location.replace("../{folder.name}/"+location.search+location.hash)</script>'
            f'<meta http-equiv="refresh" content="0;url=../{folder.name}/"><a href="../{folder.name}/">{folder.name}</a>',
            encoding="utf-8")
    print("ok  alias in minuscolo")


def main(preview: bool) -> None:
    css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
    extra = "".join((ROOT / "assets" / f).read_text(encoding="utf-8") for f in ("dash.css", "dash.js"))
    # versione dei file statici: forza il browser a ricaricarli quando cambiano
    ver = hashlib.sha1((css + js + extra).encode("utf-8")).hexdigest()[:10]
    build_dashboard(ver)
    build_aliases()
    page = (TEMPLATE.replace('href="../assets/style.css"', f'href="../assets/style.css?v={ver}"')
                    .replace('src="../assets/app.js"', f'src="../assets/app.js?v={ver}"'))
    for folder in sorted(PROJECTS):
        data = json.loads((folder / "data.json").read_text(encoding="utf-8"))  # valida il JSON
        (folder / "index.html").write_text(page, encoding="utf-8")
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
