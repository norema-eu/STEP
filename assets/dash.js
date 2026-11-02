/* Cabina di regia STEP — legge DASHBOARD/data.json generato da build.py */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = (n) => n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 });
  const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const d = (iso) => { if (!iso) return "da definire"; const x = new Date(iso + "T00:00:00"); return `${String(x.getDate()).padStart(2, "0")} ${MESI[x.getMonth()]} ${x.getFullYear()}`; };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = (iso) => Math.round((new Date(iso + "T00:00:00") - today) / 864e5);
  const STATI = { completato: ["ok", "Completato"], in_corso: ["prog", "In corso"], da_avviare: ["todo", "Da avviare"], in_ritardo: ["risk", "In ritardo"], attenzione: ["warn", "Attenzione"] };
  const badge = (s) => { const [c, l] = STATI[s] || ["todo", s || "—"]; return `<span class="b ${c}">${esc(l)}</span>`; };
  const pill = (p) => `<span class="pill ${esc(p.tema || "blu")}">${esc(p.acronimo)}</span>`;
  const isNorema = (n) => /norema/i.test(n || "");

  fetch("data.json?v=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(render)
    .catch((e) => document.querySelector("main").insertAdjacentHTML("afterbegin", `<div class="empty">Impossibile caricare i dati (${esc(e.message)}).</div>`));

  function render(D) {
    const P = D.progetti;
    $("#updated").textContent = "Aggiornato il " + new Date(D.aggiornato).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });

    // tutte le scadenze e criticità con riferimento al progetto
    const scad = P.flatMap((p) => (p.scadenze || []).map((s) => ({ ...s, p })));
    const crit = P.flatMap((p) => (p.criticita || []).filter((c) => c.stato !== "risolta").map((c) => ({ ...c, p })));
    const aperte = scad.filter((s) => s.stato !== "completato");
    const sum = (f) => P.reduce((a, p) => a + (f(p) || 0), 0);
    const nor = (p) => (p.partner || []).find((x) => isNorema(x.nome)) || {};

    $("#kpis").innerHTML = [
      ["Progetti", P.length, "STEP Lazio finanziati"],
      ["Costo ammesso", eur0(sum((p) => p.budget.costo_ammesso)), "totale tre progetti"],
      ["Contributo concesso", eur0(sum((p) => p.budget.contributo_concesso)), "totale tre progetti"],
      ["Quota NOREMA", eur0(sum((p) => nor(p).costo_ammesso)), "contributo " + eur0(sum((p) => nor(p).contributo_concesso))],
      ["Adempimenti da fare", aperte.length, aperte.filter((s) => !s.data).length + " ancora senza data"],
      ["Criticità aperte", crit.length, crit.filter((c) => c.livello === "alta").length + " ad alta priorità"],
    ].map(([l, v, n], i) => `<div class="kpi ${i === 5 && crit.length ? "alert" : ""}"><div class="l">${l}</div><div class="v">${v}</div><div class="n">${esc(n)}</div></div>`).join("");

    // Riepilogo progetti
    $("#progetti").innerHTML = P.map((p) => {
      const n = nor(p);
      const da = (p.scadenze || []).filter((s) => s.stato !== "completato");
      const nx = da.filter((s) => s.data).sort((a, b) => a.data.localeCompare(b.data))[0] || da[0];
      const cr = (p.criticita || []).filter((c) => c.stato !== "risolta").length;
      return `<div class="card proj ${esc(p.tema)}">
        <h3>${esc(p.acronimo)}</h3><div class="st">${esc(p.stato)}</div>
        <dl class="kv">
          <dt>CUP</dt><dd><b>${esc(p.cup)}</b></dd>
          <dt>Domanda</dt><dd>${esc(p.protocollo)}</dd>
          <dt>Capofila</dt><dd>${esc(p.capofila)}</dd>
          <dt>Concessione</dt><dd>${esc(p.concessione || "—")}</dd>
          <dt>Durata</dt><dd>${p.durata_mesi ? p.durata_mesi + " mesi" : "—"}${p.data_avvio ? " · avvio " + d(p.data_avvio) : " · avvio da definire"}</dd>
          <dt>Partner</dt><dd>${(p.partner || []).length}</dd>
          <dt>Costo ammesso</dt><dd>${eur(p.budget.costo_ammesso)}</dd>
          <dt>Contributo</dt><dd>${eur(p.budget.contributo_concesso)}</dd>
        </dl>
        <div class="norema"><b>NOREMA</b> · ${esc(n.wp || n.ruolo || "")}<br>Costo ${eur(n.costo_ammesso)} · contributo ${eur(n.contributo_concesso)}</div>
        ${nx ? `<div class="next">Prossimo adempimento: <b>${esc(nx.titolo)}</b> · ${d(nx.data)}</div>` : ""}
        <div class="foot"><span>${da.length} da fare · ${cr ? `<span style="color:var(--risk)">${cr} criticità</span>` : "nessuna criticità"}</span><a href="../${esc(p.slug)}/">Apri dashboard →</a></div>
      </div>`;
    }).join("");

    $("#confronto").innerHTML = `<thead><tr><th>Progetto</th><th>Capofila</th><th class="num">Costo ammesso</th><th class="num">Contributo</th><th class="num">Costo NOREMA</th><th class="num">Contributo NOREMA</th><th>WP NOREMA</th></tr></thead><tbody>` +
      P.map((p) => { const n = nor(p); return `<tr><td>${pill(p)}</td><td>${esc(p.capofila)}</td><td class="num">${eur(p.budget.costo_ammesso)}</td><td class="num">${eur(p.budget.contributo_concesso)}</td><td class="num">${eur(n.costo_ammesso)}</td><td class="num">${eur(n.contributo_concesso)}</td><td>${esc((n.wp || "").replace(/ · /g, ", "))}</td></tr>`; }).join("") +
      `</tbody><tfoot><tr><td>Totale</td><td></td><td class="num">${eur(sum((p) => p.budget.costo_ammesso))}</td><td class="num">${eur(sum((p) => p.budget.contributo_concesso))}</td><td class="num">${eur(sum((p) => nor(p).costo_ammesso))}</td><td class="num">${eur(sum((p) => nor(p).contributo_concesso))}</td><td></td></tr></tfoot>`;

    // Scadenzario con filtri
    let fp = "tutti", fs = "aperte";
    $("#f-progetto").innerHTML = `<button data-v="tutti" class="on">Tutti</button>` + P.map((p) => `<button data-v="${esc(p.slug)}">${esc(p.acronimo)}</button>`).join("");
    const drawScad = () => {
      const rows = scad.filter((s) => (fp === "tutti" || s.p.slug === fp) && (fs === "tutte" || (fs === "aperte" ? s.stato !== "completato" : s.stato === "completato")))
        .sort((a, b) => (b.data || "9999").localeCompare(a.data || "9999"));
      $("#scad").innerHTML = `<thead><tr><th>Data</th><th>Progetto</th><th>Adempimento</th><th>Chi</th><th>Stato</th></tr></thead><tbody>` +
        (rows.length ? rows.map((s) => {
          const g = s.data ? days(s.data) : null;
          const rel = g == null ? "" : g === 0 ? "oggi" : g > 0 ? "tra " + g + " gg" : "";
          return `<tr class="${g != null && g < 0 && s.stato === "completato" ? "past" : ""}"><td class="dt">${d(s.data)}<small>${rel}</small></td><td>${pill(s.p)}</td><td><b>${esc(s.titolo)}</b><div class="x">${esc(s.descrizione || "")}</div></td><td>${esc(s.chi || "—")}</td><td>${badge(s.stato)}</td></tr>`;
        }).join("") : `<tr><td colspan="5" class="empty">Nessun adempimento con questi filtri.</td></tr>`) + `</tbody>`;
    };
    const seg = (id, set) => document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b)); set(b.dataset.v); drawScad();
    }));
    seg("f-progetto", (v) => (fp = v)); seg("f-stato", (v) => (fs = v)); drawScad();

    // Anagrafica
    const byslug = Object.fromEntries(P.map((p) => [p.slug, p]));
    const orgs = D.organizzazioni || [];
    const drawOrgs = (q) => {
      const t = (q || "").toLowerCase().trim();
      const list = orgs.filter((o) => !t || JSON.stringify(o).toLowerCase().includes(t));
      $("#orgs").innerHTML = list.length ? list.map((o) => {
        const parts = o.partecipazioni || [];
        const tot = parts.reduce((a, x) => a + (x.costo_ammesso || 0), 0), totc = parts.reduce((a, x) => a + (x.contributo_concesso || 0), 0);
        const info = [o.tipo, o.dimensione ? "impresa " + o.dimensione : null, o.piva ? "P.IVA " + o.piva : null].filter(Boolean).join(" · ");
        const sede = [o.sede_legale ? esc(o.sede_legale) : null, o.pec ? `PEC <a href="mailto:${esc(o.pec)}">${esc(o.pec)}</a>` : null, o.sito ? `<a href="${esc(/^https?:/.test(o.sito) ? o.sito : "https://" + o.sito)}" target="_blank" rel="noopener">${esc(o.sito)}</a>` : null].filter(Boolean);
        return `<div class="card org">
          <h3>${esc(o.nome)}</h3>
          <div class="sub2">${esc(info)}${sede.length ? "<br>" + sede.join(" · ") : ""}${o.legale_rappresentante ? "<br>Legale rappresentante: " + esc(o.legale_rappresentante) : ""}</div>
          <div class="pills">${parts.map((x) => pill(byslug[x.slug])).join("")}</div>
          <table><thead><tr><th>Progetto</th><th>Ruolo e WP</th><th class="num">Costo</th><th class="num">Contributo</th><th>RNA</th></tr></thead><tbody>
          ${parts.map((x) => `<tr><td>${esc(byslug[x.slug].acronimo)}</td><td>${esc(x.ruolo || "")}${x.wp ? `<br><span class="x" style="color:var(--muted)">${esc(x.wp)}</span>` : ""}</td><td class="num">${eur(x.costo_ammesso)}</td><td class="num">${eur(x.contributo_concesso)}</td><td>${esc(x.rna || "—")}</td></tr>`).join("")}
          ${parts.length > 1 ? `<tr><td><b>Totale</b></td><td></td><td class="num"><b>${eur(tot)}</b></td><td class="num"><b>${eur(totc)}</b></td><td></td></tr>` : ""}
          </tbody></table>
          ${(o.referenti || []).length ? `<ul class="refs">${o.referenti.map((r) => `<li><b>${esc(r.nome)}</b>${r.ruolo ? " · " + esc(r.ruolo) : ""}${r.email ? ` · <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ""}${r.telefono ? " · " + esc(r.telefono) : ""}</li>`).join("")}</ul>` : ""}
          ${o.note ? `<div class="note">${esc(o.note)}</div>` : ""}
        </div>`;
      }).join("") : `<div class="empty">Nessun partner trovato.</div>`;
    };
    $("#q").addEventListener("input", (e) => drawOrgs(e.target.value)); drawOrgs("");

    // Criticità aperte
    const ord = { alta: 0, media: 1 };
    $("#crit").innerHTML = crit.length ? crit.sort((a, b) => (ord[a.livello] ?? 2) - (ord[b.livello] ?? 2) || (b.data || "").localeCompare(a.data || ""))
      .map((c) => `<li><div class="d">${d(c.data)}</div><div><div class="t">${pill(c.p)} ${esc(c.titolo)} <span class="b ${c.livello === "alta" ? "risk" : "warn"}">${c.livello === "alta" ? "Priorità alta" : "Da monitorare"}</span></div><div class="x">${esc(c.descrizione)}</div></div></li>`).join("")
      : `<li class="empty">Nessuna criticità aperta.</li>`;

    // Interlocuzioni con la tutor
    const T = D.tutor || {}, IL = (D.interlocuzioni || []).slice().sort((a, b) => b.data.localeCompare(a.data));
    $("#tutor-info").innerHTML = T.nome ? `Tutor Lazio Innova: <b>${esc(T.nome)}</b>${T.email ? ` · <a href="mailto:${esc(T.email)}">${esc(T.email)}</a>` : ""} · dalla più recente alla più vecchia.` : "";
    let ft = "tutti";
    $("#f-tutor").innerHTML = `<button data-v="tutti" class="on">Tutti</button>` + P.map((p) => `<button data-v="${esc(p.slug)}">${esc(p.acronimo)}</button>`).join("");
    const drawTutor = () => {
      const rows = IL.filter((x) => ft === "tutti" || (x.progetti || []).includes(ft));
      $("#tutor").innerHTML = rows.length ? rows.map((x) => `<div class="card tl-item">
        <div class="tl-head"><span class="tl-date">${d(x.data)}</span>${(x.progetti || []).map((s) => byslug[s] ? pill(byslug[s]) : "").join(" ")}<span class="x">${esc([x.canale, x.con].filter(Boolean).join(" · "))}</span></div>
        ${(x.punti || []).length ? `<ul class="tl-list">${x.punti.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${(x.azioni || []).length ? `<div class="tl-act"><b>Azioni conseguenti</b><ul class="tl-list">${x.azioni.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
      </div>`).join("") : `<div class="empty">Nessuna interlocuzione registrata.</div>`;
    };
    document.querySelectorAll("#f-tutor button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#f-tutor button").forEach((x) => x.classList.toggle("on", x === b)); ft = b.dataset.v; drawTutor();
    }));
    drawTutor();

    // schede
    const links = [...document.querySelectorAll(".tabs a")], sections = [...document.querySelectorAll("main section[id]")];
    const activate = (id, push) => {
      if (!sections.some((s) => s.id === id)) id = sections[0].id;
      sections.forEach((s) => (s.hidden = s.id !== id));
      links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + id));
      if (push) history.replaceState(null, "", "#" + id);
    };
    links.forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); activate(a.getAttribute("href").slice(1), true); }));
    window.addEventListener("hashchange", () => activate(location.hash.slice(1), false));
    activate(location.hash.slice(1), false);
  }
})();
