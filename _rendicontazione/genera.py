"""Genera la sezione Rendicontazione della pagina NOREMA:
- ore mensili pianificate per persona e progetto (prospetti ore-uomo; PRONTI VIA stimato dal profilo dei WP)
- bozze di lettera di incarico / atto di assegnazione (Word, grafica NOREMA)
- timesheet mensili precompilati sul Modello 11 (Word)
Uscita: NOREMA/rendicontazione/... e NOREMA/rendicontazione.json
Uso: python3 _rendicontazione/genera.py
"""
import json, datetime as dt, calendar, pathlib, shutil
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "_rendicontazione"
OUT = ROOT / "NOREMA" / "rendicontazione"
BLU, TEAL, GHIACCIO = RGBColor(0x00, 0x2A, 0x5C), RGBColor(0x0B, 0xB9, 0xB7), "EEF1F4"
FONT = "Montserrat"
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
GSETT = ["L", "M", "M", "G", "V", "S", "D"]

ND = json.loads((ROOT / "NOREMA" / "data.json").read_text(encoding="utf-8"))
PS = json.loads((ROOT / "_norema" / "personale.json").read_text(encoding="utf-8"))
PROG = {p["slug"]: p for p in ND["progetti"]}
INFO = {s: json.loads((ROOT / s / "data.json").read_text(encoding="utf-8"))["progetto"] for s in PROG}
TQ_ORARIO = 34.70

# persone NOREMA per cui si producono documenti
PERSONE = {
    "claudia": {"nome": "Claudia Abatecola", "titolo": "Dott.ssa", "alias": ["Claudia Abatecola"],
                "qualita": "Amministratrice Unica e Legale Rappresentante – Titolare Qualificato di PMI",
                "tipo": "tq", "orario": TQ_ORARIO},
    "chiara": {"nome": "Chiara Mirabella", "titolo": "Dott.ssa", "alias": ["Chiara Mirabella"],
               "qualita": "Dipendente", "tipo": "standard", "inquadramento": "Impiegata a tempo indeterminato, III livello CCNL Terziario, Distribuzione e Servizi",
               "orario": 30.0},
    "lucia": {"nome": "Lucia Ciampi", "titolo": "Dott.ssa", "alias": ["Lucia Ciampi", "Valentina Caldarera"],
              "qualita": "Dipendente", "tipo": "effettivo", "inquadramento": "Apprendista professionalizzante, IV livello CCNL Terziario, Distribuzione e Servizi",
              "ral": next(x["ral"] for x in PS["persone"] if x["id"] == "lucia")},
}
PERSONE["lucia"]["orario"] = round(PERSONE["lucia"]["ral"] / 1720, 2)

# festività nazionali + patrono di Roma
def pasquetta(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = divmod(b, 4); f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7; m = (a + 11 * h + 22 * l) // 451
    mese, giorno = divmod(h + l - 7 * m + 114, 31)
    return dt.date(y, mese, giorno + 1) + dt.timedelta(days=1)
def festivi(y):
    fis = [(1, 1), (1, 6), (4, 25), (5, 1), (6, 2), (6, 29), (8, 15), (11, 1), (12, 8), (12, 25), (12, 26)]
    return {dt.date(y, m, d) for m, d in fis} | {pasquetta(y)}

def add_m(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    return dt.date(d.year + y, m + 1, 1)

def ripartisci(tot, pesi):
    """ore intere che sommano a tot, proporzionali ai pesi (resto più grande)"""
    s = sum(pesi)
    if not s or not tot: return [0] * len(pesi)
    raw = [tot * w / s for w in pesi]; out = [int(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[: round(tot) - sum(out)]:
        out[i] += 1
    return out

# ---------- ore mensili pianificate per persona (M1..M24) e WP attivi
def piano(slug):
    p = PROG[slug]; D = p.get("durata_mesi") or 24
    pf = ROOT / "_personale" / f"{slug}.json"
    res = {}
    if pf.exists():
        d = json.loads(pf.read_text(encoding="utf-8"))
        nor = next((pa for pa in d["partner"] if "norema" in pa["nome"].lower()), None)
        for pid, P in PERSONE.items():
            q = next((x for x in (nor or {}).get("persone", []) if x["nome"] in P["alias"] and x.get("mensile")), None)
            if q:
                mens = [sum(v[i] for v in q["mensile"].values()) for i in range(D)]
                wpm = [[w for w, v in q["mensile"].items() if v[i]] for i in range(D)]
                res[pid] = {"fonte": "prospetto ore-uomo", "ore_wp": q.get("ore_per_wp", {}), "mensile": mens, "wp_mese": wpm, "ruolo": q.get("ruolo", "")}
    missing = [pid for pid in PERSONE if pid not in res and PS["ore"].get(slug, {}).get(pid)]
    if missing:
        wpm_rng = {w["codice"]: (w["mese_inizio"], w["mese_fine"]) for w in p["wp"]}
        prof, attivi = [0.0] * D, [set() for _ in range(D)]
        for x in p["norema"]["ore_per_wp"]:
            codes = [c for c in __import__("re").findall(r"WP\d+", str(x["wp"])) if c in wpm_rng]
            if not x.get("ore") or not codes: continue
            ms = [m for c in codes for m in range(wpm_rng[c][0], wpm_rng[c][1] + 1)]
            for m in ms:
                prof[m - 1] += x["ore"] / len(ms)
            for c in codes:
                for m in range(wpm_rng[c][0], wpm_rng[c][1] + 1): attivi[m - 1].add(c)
        for pid in missing:
            tot = PS["ore"][slug][pid]
            res[pid] = {"fonte": "stima dal profilo dei WP (ore della persona distribuite come le ore NOREMA nel progetto)", "ore_wp": {},
                        "mensile": ripartisci(tot, prof), "wp_mese": [sorted(a, key=lambda c: int(c[2:])) for a in attivi], "ruolo": ""}
    return res

# ---------- helpers Word
def font(run, size=10, bold=False, color=None, italic=False):
    run.font.name = FONT; run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size); run.bold = bold; run.italic = italic
    if color is not None: run.font.color.rgb = color
    return run
def par(doc_or_cell, text="", size=10, bold=False, color=None, align=None, italic=False, space_after=4):
    p = doc_or_cell.add_paragraph()
    if text: font(p.add_run(text), size, bold, color, italic)
    if align: p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    return p
def shade(cell, hexcol):
    tcPr = cell._element.get_or_add_tcPr(); s = OxmlElement("w:shd")
    s.set(qn("w:val"), "clear"); s.set(qn("w:color"), "auto"); s.set(qn("w:fill"), hexcol); tcPr.append(s)
def cell_txt(cell, text, size=9, bold=False, color=None, align=None, italic=False):
    cell.text = ""; p = cell.paragraphs[0]; font(p.add_run(text), size, bold, color, italic)
    p.paragraph_format.space_after = Pt(0)
    if align: p.alignment = align
def box(ok): return "☒" if ok else "☐"
def it(n, dec=2): return f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
def dfmt(d): return d.strftime("%d/%m/%Y")
def footer(doc, testo):
    for s in doc.sections:
        p = s.footer.paragraphs[0]; p.text = ""; font(p.add_run(testo), 7.5, color=BLU); p.alignment = WD_ALIGN_PARAGRAPH.CENTER

def wp_titolo(slug, code):
    w = next((w for w in PROG[slug]["wp"] if w["codice"] == code), None)
    return f"{code} – {w['titolo']}" if w else code

# ---------- lettera di incarico / atto di assegnazione
def lettera(slug, pid, pl, path):
    P, p, inf = PERSONE[pid], PROG[slug], INFO[slug]
    t0 = dt.date.fromisoformat(p["data_inizio"]); fm = add_m(t0, p.get("durata_mesi") or 24); fine = fm.replace(day=min(t0.day, calendar.monthrange(fm.year, fm.month)[1])) - dt.timedelta(days=1)
    tot = sum(pl["mensile"])
    doc = Document(); s = doc.sections[0]
    s.top_margin, s.bottom_margin, s.left_margin, s.right_margin = Cm(3.5), Cm(3), Cm(2.5), Cm(2.5)
    hp = s.header.paragraphs[0]; hp.add_run().add_picture(str(SRC / "logo_norema_color.png"), width=Cm(4.2))
    footer(doc, "NOREMA S.r.l. — Via di San Martino ai Monti, 34-35, 00184 Roma — Tel 06 96520960 — info@norema.eu — www.norema.eu")
    par(doc, "BOZZA – da verificare prima della firma", 8, True, TEAL, WD_ALIGN_PARAGRAPH.RIGHT)
    par(doc, f"Roma, [data]", 10, align=WD_ALIGN_PARAGRAPH.RIGHT, space_after=12)
    if P["tipo"] == "tq":
        par(doc, "Atto di assegnazione al progetto dell'Amministratrice Unica", 15, True, BLU, space_after=2)
        par(doc, "Titolare Qualificato di PMI", 11, False, TEAL, space_after=10)
    else:
        par(doc, f"Alla {P['titolo']} {P['nome']}", 10, space_after=10)
        par(doc, "Lettera di incarico – assegnazione al progetto", 15, True, BLU, space_after=10)
    par(doc, f"Oggetto: Avviso «STEP Lazio» – PR FESR Lazio 2021-2027 – Progetto «{p['acronimo']}» – {inf.get('titolo','')} – Domanda {inf.get('protocollo','')} – CUP {inf.get('cup','')}", 10, True, BLU, space_after=10)
    corpo = []
    if P["tipo"] == "tq":
        corpo += [f"La sottoscritta Claudia Abatecola, in qualità di Amministratrice Unica e Legale Rappresentante di NOREMA S.r.l. (sede legale Viale Anicio Gallo 102, 00174 Roma, P.IVA IT15893071009), partner del progetto in epigrafe con mandataria {p['capofila']},",
                  "premesso che l'Avviso ammette i costi dell'amministratore di PMI che rientra nella definizione di Titolare Qualificato di PMI (Appendice 1, definizioni «Dipendente» e «Titolare Qualificato di PMI»), valorizzati a un costo figurativo di 34,70 €/h;",
                  "dichiara di possedere il requisito di Titolare Qualificato di PMI alla Data della Domanda, in ragione di almeno quattro anni di esperienza a tempo pieno come ricercatrice/tecnologa presso il Consiglio Nazionale delle Ricerche [estremi del servizio: periodi, profilo, struttura], documentata nel curriculum vitae allegato;",
                  "DISPONE di dedicarsi alle attività di sviluppo sperimentale del progetto alle condizioni che seguono."]
    else:
        corpo += [f"NOREMA S.r.l., partner del progetto in epigrafe con mandataria {p['capofila']}, nella persona dell'Amministratrice Unica e Legale Rappresentante Claudia Abatecola,",
                  f"ASSEGNA la S.V., dipendente di NOREMA con inquadramento «{P['inquadramento']}», alle attività di sviluppo sperimentale del progetto alle condizioni che seguono."]
    for t in corpo: par(doc, t, 10, space_after=6)
    par(doc, "1. Attività e work package", 11, True, BLU, space_after=3)
    wps = pl["ore_wp"] or {}
    if wps:
        tb = doc.add_table(rows=1, cols=2); tb.style = "Table Grid"; tb.alignment = WD_TABLE_ALIGNMENT.CENTER
        for c, t in zip(tb.rows[0].cells, ["Work package", "Ore pianificate"]): cell_txt(c, t, 9, True, RGBColor(255, 255, 255)); shade(c, "002A5C")
        for i, (w, h) in enumerate(wps.items()):
            r = tb.add_row().cells; cell_txt(r[0], wp_titolo(slug, w), 9); cell_txt(r[1], it(h, 0), 9, align=WD_ALIGN_PARAGRAPH.RIGHT)
            if i % 2: [shade(c, GHIACCIO) for c in r]
        r = tb.add_row().cells; cell_txt(r[0], "Totale", 9, True); cell_txt(r[1], it(tot, 0), 9, True, align=WD_ALIGN_PARAGRAPH.RIGHT)
        par(doc, "", space_after=4)
    else:
        att = sorted({w for m in pl["wp_mese"] for w in m}, key=lambda c: int(c[2:]))
        par(doc, "Work package in cui opera NOREMA: " + "; ".join(wp_titolo(slug, w) for w in att) + ".", 10, space_after=3)
        par(doc, f"Ore pianificate complessive: {it(tot, 0)}. La ripartizione per work package è da definire con la mandataria in coerenza con il piano dei costi approvato.", 10, space_after=6)
    par(doc, "Le attività consistono in attività tecniche di sviluppo sperimentale collegate ai task e ai deliverable dei work package indicati. Non rientrano nell'incarico, e non vanno imputate al progetto, attività amministrative, contabili o commerciali (Avviso, art. 4, voce B.1) né attività di coordinamento del progetto, riservate alla mandataria.", 10, space_after=6)
    par(doc, "2. Durata", 11, True, BLU, space_after=3)
    par(doc, f"Dal {dfmt(t0)} al {dfmt(fine)} (24 mesi), salvo proroghe o variazioni autorizzate da Lazio Innova. Le ore mensili pianificate sono riportate nel prospetto della rendicontazione NOREMA e hanno valore indicativo.", 10, space_after=6)
    par(doc, "3. Valorizzazione", 11, True, BLU, space_after=3)
    if P["tipo"] == "tq":
        v = "Costo figurativo di 34,70 €/h come Titolare Qualificato di PMI, senza compenso aggiuntivo rispetto all'emolumento di amministratrice, nei limiti del piano dei costi approvato e delle eventuali variazioni autorizzate."
    elif P["tipo"] == "standard":
        v = "Voce B.1.1 – costi standard orari, fascia bassa (30 €/h), in coerenza con l'inquadramento risultante dalla busta paga."
    else:
        v = f"Voce B.1.2 – costo effettivo: agli apprendisti non si applicano i costi standard (FAQ del 18/07/2025, n. 5). Costo orario = RAL / 1.720 = {it(P['ral'])} / 1.720 = {it(P['orario'])} €/h. Le ore di formazione obbligatoria dell'apprendistato non sono imputabili al progetto."
    par(doc, v, 10, space_after=6)
    par(doc, "4. Obblighi", 11, True, BLU, space_after=3)
    for t in ["registrare ogni giorno, sul timesheet conforme al Modello 11 dell'Avviso, le ore lavorate e le ore dedicate al progetto, con la descrizione delle attività svolte nel mese;",
              "firmare il timesheet al termine di ogni mese e comunque prima di ogni richiesta di erogazione (SAL o saldo);",
              "non imputare le stesse ore ad altri progetti finanziati (divieto di doppio finanziamento) e conservare la documentazione delle attività svolte;",
              "riportare il CUP del progetto su tutti i documenti relativi alle attività."]:
        p_ = par(doc, "– " + t, 10, space_after=2)
    par(doc, "", space_after=8)
    if P["tipo"] == "tq":
        par(doc, "Allegati: curriculum vitae; documentazione del servizio presso il CNR.", 9, italic=True, space_after=14)
        par(doc, "L'Amministratrice Unica", 10, align=WD_ALIGN_PARAGRAPH.RIGHT, space_after=2)
        par(doc, "Claudia Abatecola", 10, True, align=WD_ALIGN_PARAGRAPH.RIGHT)
    else:
        tb = doc.add_table(rows=2, cols=2)
        cell_txt(tb.rows[0].cells[0], "Per accettazione", 10); cell_txt(tb.rows[0].cells[1], "NOREMA S.r.l. – L'Amministratrice Unica", 10, align=WD_ALIGN_PARAGRAPH.RIGHT)
        cell_txt(tb.rows[1].cells[0], f"\n{P['nome']}", 10, True); cell_txt(tb.rows[1].cells[1], "\nClaudia Abatecola", 10, True, align=WD_ALIGN_PARAGRAPH.RIGHT)
    par(doc, "", space_after=10)
    par(doc, "NOREMA S.r.l. · Sede legale Viale Anicio Gallo, 102 – 00174 Roma · P.IVA IT15893071009 · REA RM-1621151 · PEC norema@pec.it", 7.5, color=BLU)
    doc.save(path)

# ---------- timesheet Modello 11 (un mese)
def timesheet(slug, pid, pl, i, path):
    P, p, inf = PERSONE[pid], PROG[slug], INFO[slug]
    t0 = dt.date.fromisoformat(p["data_inizio"]); m0 = add_m(t0, i)
    dal = t0 if i == 0 else m0; al = add_m(m0, 1) - dt.timedelta(days=1)
    n = calendar.monthrange(m0.year, m0.month)[1]; fest = festivi(m0.year)
    ore = pl["mensile"][i]
    doc = Document(); s = doc.sections[0]
    s.orientation = WD_ORIENT.LANDSCAPE; s.page_width, s.page_height = s.page_height, s.page_width
    s.top_margin = s.bottom_margin = Cm(1.2); s.left_margin = s.right_margin = Cm(1.5)
    footer(doc, f"Timesheet {P['nome']} – {p['acronimo']} – {MESI[m0.month-1]} {m0.year} (M{i+1}) · bozza precompilata da NOREMA: ore pianificate indicative, da sostituire con le ore effettivamente lavorate")
    par(doc, "Programma FESR Lazio 2021-2027 – Avviso STEP Lazio", 10, True, BLU, space_after=0)
    par(doc, "TIMESHEET (Modello 11)", 14, True, BLU, space_after=2)
    par(doc, "Spettabile Lazio Innova – Oggetto: documentazione a corredo di richiesta di erogazione a SAL o saldo per Attività di Sviluppo Sperimentale", 9, space_after=6)
    tb = doc.add_table(rows=4, cols=6); tb.style = "Table Grid"
    def row(r, cells):
        for c, (t, b) in zip(tb.rows[r].cells, cells): cell_txt(c, t, 9, b)
    a = tb.rows[0].cells; a[1].merge(a[5]); cell_txt(a[0], "Progetto", 9, True); cell_txt(a[1], f"{p['acronimo']} – {inf.get('titolo','')} – Domanda {inf.get('protocollo','')} – CUP {inf.get('cup','')}", 9)
    a = tb.rows[1].cells; a[1].merge(a[5]); cell_txt(a[0], "Beneficiario", 9, True); cell_txt(a[1], "NOREMA S.r.l. (partner; mandataria " + p["capofila"] + ")", 9)
    row(2, [("Timesheet relativo a", True), (f"{P['titolo']} {P['nome']}", False), ("dal", True), (dfmt(dal), False), ("al", True), (dfmt(al), False)])
    a = tb.rows[3].cells; a[1].merge(a[5]); cell_txt(a[0], "nella sua qualità di", 9, True); cell_txt(a[1], P["qualita"], 9)
    par(doc, "", space_after=2)
    st = P["tipo"] == "standard"
    righe = [f"{box(st)} Dipendente valorizzato a Costi Standard Orari con inquadramento: {P.get('inquadramento','') if st else '________________'}",
             f"      e pertanto rientrante in   {box(False)} Fascia Alta   {box(False)} Fascia Media   {box(st)} Fascia Bassa",
             f"{box(P['tipo']=='tq')} Titolare Qualificato di PMI",
             f"{box(False)} Borsista o assegnista di ricerca impegnato esclusivamente nell'Attività di Sviluppo Sperimentale in oggetto",
             f"{box(False)} Altra risorsa umana valorizzata in termini di tempo uomo mediante fatturazione",
             f"per   {box(True)} Attività di Sviluppo Sperimentale   {box(False)} Consulenza e Servizi per le PMI"]
    if P["tipo"] == "effettivo":
        righe.insert(0, f"Dipendente non valorizzabile a costi standard (apprendista) – inquadramento: {P['inquadramento']}")
    for t in righe: par(doc, t, 8.5, space_after=0)
    par(doc, "", space_after=2)
    par(doc, "Descrizione della specifica attività svolta dalla risorsa umana nel periodo di riferimento", 10, True, BLU, space_after=2)
    wps = pl["wp_mese"][i]
    desc = ("Attività tecniche di sviluppo sperimentale nei work package: " + "; ".join(wp_titolo(slug, w) for w in wps) + ". [Descrivere le attività effettivamente svolte nel mese, collegandole a task e deliverable.]") if wps else "[Nessuna ora pianificata nel mese: compilare solo se sono state svolte attività sul progetto.]"
    t1 = doc.add_table(rows=1, cols=1); t1.style = "Table Grid"; cell_txt(t1.rows[0].cells[0], desc, 9)
    par(doc, "", space_after=2)
    if P["tipo"] == "effettivo":
        par(doc, "Elementi per il calcolo del costo orario (dipendenti non valorizzabili a costi standard)", 10, True, BLU, space_after=2)
        t2 = doc.add_table(rows=2, cols=2); t2.style = "Table Grid"
        cell_txt(t2.rows[0].cells[0], "Totale Retribuzione Annua Lorda (RAL)", 9, True); cell_txt(t2.rows[0].cells[1], "Costo Orario (RAL/1.720)", 9, True)
        cell_txt(t2.rows[1].cells[0], f"€ {it(P['ral'])}", 9); cell_txt(t2.rows[1].cells[1], f"€ {it(P['orario'])}", 9)
        par(doc, "", space_after=2)
    par(doc, "Dettaglio ore lavorative (hl) e ore dedicate alle attività progettuali (hp) e relativa valorizzazione", 10, True, BLU, space_after=1)
    par(doc, f"Ore pianificate nel mese per il progetto (prospetto NOREMA, valore indicativo): {ore} h. Indicare per ciascun giorno le ore effettivamente lavorate e dedicate al progetto.", 8.5, italic=True, space_after=2)
    cols = n + 5
    t3 = doc.add_table(rows=4, cols=cols); t3.style = "Table Grid"; t3.autofit = False
    tblPr = t3._tbl.tblPr; lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); tblPr.append(lay)
    mar = OxmlElement("w:tblCellMar")
    for side in ("left", "right"):
        e = OxmlElement(f"w:{side}"); e.set(qn("w:w"), "20"); e.set(qn("w:type"), "dxa"); mar.append(e)
    tblPr.append(mar)
    hdr = [f"{MESI[m0.month-1]} {m0.year}", "gg"] + [str(d) for d in range(1, n + 1)] + ["totale", "orario", "mensile"]
    wd = ["", ""] + [GSETT[dt.date(m0.year, m0.month, d).weekday()] for d in range(1, n + 1)] + ["ore", "€", "€"]
    for j in range(cols):
        cell_txt(t3.rows[0].cells[j], hdr[j], 6.5, True, align=WD_ALIGN_PARAGRAPH.CENTER)
        cell_txt(t3.rows[1].cells[j], wd[j], 6.5, align=WD_ALIGN_PARAGRAPH.CENTER)
    cell_txt(t3.rows[2].cells[1], "hl", 7.5, True, align=WD_ALIGN_PARAGRAPH.CENTER); cell_txt(t3.rows[3].cells[1], "hp", 7.5, True, align=WD_ALIGN_PARAGRAPH.CENTER)
    cell_txt(t3.rows[3].cells[cols - 2], it(P["orario"]), 7, align=WD_ALIGN_PARAGRAPH.CENTER)
    for d in range(1, n + 1):
        g = dt.date(m0.year, m0.month, d)
        if g.weekday() >= 5 or g in fest or g < dal:
            for r in range(4): shade(t3.rows[r].cells[d + 1], "D9DEE5")
    widths = [Cm(2.4), Cm(0.8)] + [Cm(0.62)] * n + [Cm(1.1), Cm(1.0), Cm(1.3)]
    grid = t3._tbl.tblGrid
    for gc, w in zip(grid.findall(qn("w:gridCol")), widths): gc.set(qn("w:w"), str(int(w.twips)))
    for r in t3.rows:
        r.height = Cm(0.55)
        for c, w in zip(r.cells, widths): c.width = w
    par(doc, "Giorni in grigio: sabato, domenica, festività" + (" e giorni precedenti l'avvio del progetto" if i == 0 else "") + ". Costo mensile = totale hp × costo orario.", 7.5, italic=True, space_after=4)
    par(doc, "Dichiarazione del datore di lavoro", 10, True, BLU, space_after=1)
    par(doc, "La sottoscritta Claudia Abatecola, codice fiscale ____________________, in qualità di Legale Rappresentante di NOREMA S.r.l., codice fiscale 15893071009, DICHIARA ai sensi degli artt. 46 e 47 del D.P.R. 445/2000, consapevole delle sanzioni penali previste dall'art. 76 in caso di dichiarazioni non veritiere, che con riferimento al Dipendente oggetto del presente documento sono state adempiute e verificate le prescrizioni fiscali, contributive ed assistenziali previste dalla normativa vigente; E ALLEGA tramite GeCoWEB Plus copia conforme del libro unico del lavoro per ciascun mese rendicontato e " + ("copia della busta paga dell'ultimo mese rendicontato." if st else ("copia di tutte le buste paga rendicontate con le attestazioni di pagamento e gli estratti conto." if P["tipo"] == "effettivo" else "la documentazione del requisito di Titolare Qualificato di PMI.")), 8, space_after=4)
    t4 = doc.add_table(rows=2, cols=3)
    for c, t in zip(t4.rows[0].cells, ["Il Dipendente o altra Risorsa Umana", "Il Coordinatore dell'Attività (mandataria)", "Il Legale Rappresentante"]): cell_txt(c, t, 8.5, True, align=WD_ALIGN_PARAGRAPH.CENTER)
    for c, t in zip(t4.rows[1].cells, [P["nome"], "", "Claudia Abatecola"]): cell_txt(c, "\n" + t, 8.5, align=WD_ALIGN_PARAGRAPH.CENTER)
    doc.save(path)

# ---------- main
def main():
    if OUT.exists(): shutil.rmtree(OUT)
    man = {"generato": dt.date.today().isoformat(), "progetti": []}
    for slug in ["HUMAN_SEAL", "SPACE_AI", "PRONTI_VIA"]:
        p = PROG[slug]; t0 = dt.date.fromisoformat(p["data_inizio"]); D = p.get("durata_mesi") or 24
        pl = piano(slug); (OUT / slug / "timesheet").mkdir(parents=True, exist_ok=True); (OUT / slug / "lettere").mkdir(parents=True, exist_ok=True)
        persone = []
        for pid in PERSONE:
            if pid not in pl: continue
            q = pl[pid]; lf = f"rendicontazione/{slug}/lettere/Lettera_incarico_{slug}_{pid}.docx"
            lettera(slug, pid, q, ROOT / "NOREMA" / lf)
            mesi = []
            for i in range(D):
                m0 = add_m(t0, i); tf = f"rendicontazione/{slug}/timesheet/Timesheet_{slug}_{pid}_{m0:%Y-%m}_M{i+1:02d}.docx"
                timesheet(slug, pid, q, i, ROOT / "NOREMA" / tf)
                mesi.append({"m": i + 1, "mese": f"{m0:%Y-%m}", "ore": q["mensile"][i], "wp": q["wp_mese"][i], "file": tf})
            persone.append({"id": pid, "nome": PERSONE[pid]["nome"], "tipo": PERSONE[pid]["tipo"], "orario": PERSONE[pid]["orario"], "fonte": q["fonte"],
                            "ore_totali": sum(q["mensile"]), "lettera": lf, "mesi": mesi})
        man["progetti"].append({"slug": slug, "persone": persone})
    (ROOT / "NOREMA" / "rendicontazione.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
