# STEP Lazio — pagine di progetto NOREMA

Sito statico pubblicato su **step.norema.eu** (hosting SiteGround), in sola visualizzazione.

| Indirizzo | Contenuto | Accesso |
|---|---|---|
| step.norema.eu/SPACE_AI | Pagina partner SPACE.AI | credenziali partner SPACE.AI |
| step.norema.eu/PRONTI_VIA | Pagina partner PRONTI VIA | credenziali partner PRONTI VIA |
| step.norema.eu/HUMAN_SEAL | Pagina partner HS-HumanSeal | credenziali partner HumanSeal |
| step.norema.eu/NOREMA | Dashboard interna | solo team NOREMA |

## Come funziona

- Ogni cartella progetto contiene `index.html` (uguale per tutti) e **`data.json`**, l'unica fonte dei dati della pagina.
- Claude aggiorna `data.json` (ogni mattina e a richiesta) leggendo SharePoint e la posta, poi rigenera le pagine con `python3 build.py` e fa il commit qui.
- Su SiteGround uno script (`deploy/sync.sh`) scarica le novità ogni 15 minuti e le copia nel sito.
- I dati stanno **dentro** la cartella protetta: senza credenziali non si legge né la pagina né `data.json`.

## Installazione su SiteGround (una tantum)

1. **Sottodominio** — Site Tools → Domain → Subdomains: crea `step.norema.eu`. Poi Security → SSL Manager: attiva Let's Encrypt per il sottodominio, e Security → HTTPS Enforce.
2. **Chiave di accesso a GitHub** — Site Tools → Devs → SSH Keys Manager: genera una chiave e copiane la parte pubblica. Su GitHub: repository STEP → Settings → Deploy keys → Add deploy key, incolla la chiave, **lascia disattivato "Allow write access"**.
3. **Prima copia del repository** — collegati in SSH (o dal terminale di Site Tools) ed esegui:
   ```
   git clone git@github.com:norema-eu/STEP.git ~/step-repo
   chmod +x ~/step-repo/deploy/sync.sh
   ~/step-repo/deploy/sync.sh
   ```
   Se il percorso del sottodominio non è `~/www/step.norema.eu/public_html`, correggi `SITE_DIR` nello script.
4. **Cron** — Site Tools → Devs → Cron Jobs, intervallo ogni 15 minuti, comando:
   ```
   /bin/bash $HOME/step-repo/deploy/sync.sh >/dev/null 2>&1
   ```
5. **Protezione** — Site Tools → Security → Protected URLs: crea un utente per progetto (es. `spaceai`, `prontivia`, `humanseal`, `norema`) e proteggi le cartelle `/SPACE_AI`, `/PRONTI_VIA`, `/HUMAN_SEAL`, `/NOREMA` assegnando a ciascuna solo l'utente giusto. Lo script di sincronizzazione non modifica mai queste protezioni.

## Aggiornare a mano

Modificare `<PROGETTO>/data.json`, eseguire `python3 build.py`, fare commit e push su `main`. Entro 15 minuti la pagina è online.
`python3 build.py --preview` crea in `preview/` una versione autonoma da aprire nel browser (non va pubblicata).

## Documenti scaricabili e anteprime

- I file vanno in `<PROGETTO>/documenti/` e si elencano in `data.json` → `documenti` con il campo `file` (e `categoria`, `stato`, `data`, `nota`).
- PDF: anteprima diretta. Word (.docx): anteprima PDF in `documenti/anteprime/` con `soffice --headless --convert-to pdf --outdir <PROGETTO>/documenti/anteprime <file>.docx`. Excel (.xlsx): anteprima HTML con `python3 xlsx_preview.py <PROGETTO>/documenti/<file>.xlsx`. Indicare il percorso nel campo `anteprima` (es. `anteprime/nome.pdf`).
- Non pubblicare mai documenti antimafia (dichiarazioni familiari conviventi, schede B.D.N.A., moduli conviventi), visure o documenti d'identità.
