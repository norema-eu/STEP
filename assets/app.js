/* Rendering pagina progetto STEP — legge data.json dalla stessa cartella */
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

  async function load() {
    const inline = document.getElementById("project-data");
    if (inline) return JSON.parse(inline.textContent);
    const r = await fetch("data.json?v=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error("data.json non disponibile, HTTP " + r.status);
    return r.json();
  }

  function render(D) {
    const P = D.progetto;
    document.title = `${P.acronimo} · STEP Lazio · NOREMA`;
    $("#updated").textContent = "Aggiornato il " + new Date(D.aggiornato).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
    $("#acr").textContent = P.acronimo;
    $("#title").textContent = P.titolo || "";
    $("#chips").innerHTML = [
      `<span class="chip status">${esc(P.stato)}</span>`,
      `<span class="chip">Domanda <b>${esc(P.protocollo)}</b></span>`,
      P.concessione ? `<span class="chip">Concessione <b>${esc(P.concessione)}</b></span>` : "",
      `<span class="chip">Capofila <b>${esc(P.capofila)}</b></span>`,
      P.punteggio ? `<span class="chip">Punteggio <b>${esc(P.punteggio)}</b></span>` : ""
    ].join("");
    $("#cup").textContent = P.cup || "—";
    $("#cup-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(P.cup); $("#cup-copy").textContent = "Copiato"; setTimeout(() => ($("#cup-copy").textContent = "Copia"), 1500); } catch (e) {}
    });

    // KPI
    const next = (D.scadenze || []).filter((s) => s.data && days(s.data) >= 0 && s.stato !== "completato").sort((a, b) => a.data.localeCompare(b.data))[0];
    const crit = (D.criticita || []).filter((c) => c.stato !== "risolta").length;
    $("#kpis").innerHTML = `
      <div class="kpi"><div class="l">Costo ammesso</div><div class="v">${eur0(D.budget.costo_ammesso)}</div><div class="n">intero progetto</div></div>
      <div class="kpi"><div class="l">Contributo concesso</div><div class="v">${eur0(D.budget.contributo_concesso)}</div><div class="n">${D.budget.costo_ammesso ? Math.round(D.budget.contributo_concesso / D.budget.costo_ammesso * 100) + "% del costo" : ""}</div></div>
      <div class="kpi ${next && days(next.data) <= 7 ? "alert" : ""}"><div class="l">Prossima scadenza</div><div class="v">${next ? (days(next.data) === 0 ? "oggi" : days(next.data) + " gg") : "—"}</div><div class="n">${next ? esc(next.titolo) + " · " + d(next.data) : "nessuna in calendario"}</div></div>
      <div class="kpi ${crit ? "alert" : ""}"><div class="l">Criticità aperte</div><div class="v">${crit}</div><div class="n">${(D.partner || []).length} partner nel partenariato</div></div>`;

    // Sintesi
    $("#sintesi").innerHTML = `<p style="margin:0">${esc(P.sintesi || "")}</p>` +
      (P.periodo ? `<p class="lead" style="margin:10px 0 0">${esc(P.periodo)}</p>` : "");

    // Partner & budget
    const tot = D.budget.costo_ammesso || 1;
    $("#partner").innerHTML = (D.partner || []).map((p) => `
      <tr><td><b>${esc(p.nome)}</b><span class="role">${esc(p.ruolo)}${p.referente ? " · " + esc(p.referente) : ""}</span></td>
      <td class="num">${eur(p.costo_ammesso)}</td><td class="num">${eur(p.contributo_concesso)}</td>
      <td class="num">${p.costo_ammesso ? Math.round(p.contributo_concesso / p.costo_ammesso * 100) + "%" : "—"}</td>
      <td><div class="bar" title="${Math.round(p.costo_ammesso / tot * 100)}% del progetto"><i style="width:${(p.costo_ammesso / tot * 100).toFixed(1)}%"></i></div></td>
      <td>${esc(p.rna || "—")}</td></tr>`).join("");
    $("#partner-tot").innerHTML = `<tr><td>Totale progetto</td><td class="num">${eur(D.budget.costo_ammesso)}</td><td class="num">${eur(D.budget.contributo_concesso)}</td><td class="num">${Math.round(D.budget.contributo_concesso / tot * 100)}%</td><td></td><td></td></tr>`;

    // Ruoli dei partner
    $("#ruoli").innerHTML = (D.partner || []).map((p) => `
      <div class="card role-card">
        <div class="role-head"><b>${esc(p.nome)}</b><span class="b prog">${esc(p.tipo || "")}</span></div>
        ${p.wp ? `<div class="role-wp">${esc(p.wp)}</div>` : ""}
        <p>${esc(p.descrizione || "")}</p>
        ${p.team ? `<div class="x">${esc(p.team)}</div>` : ""}
      </div>`).join("");

    // Spesa rendicontata
    const sp = D.budget.rendicontato || [];
    $("#spesa").innerHTML = sp.length ? sp.map((r) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>${esc(r.partner)}</span><span>${eur0(r.importo)} / ${eur0(r.previsto)}</span></div><div class="bar"><i style="width:${Math.min(100, r.importo / r.previsto * 100).toFixed(1)}%"></i></div></div>`).join("")
      : `<div class="empty">${esc(D.budget.nota_rendicontazione || "Nessuna spesa rendicontata.")}</div>`;

    // WP gantt
    const wps = D.wp || [];
    if (wps.length && P.durata_mesi) {
      const m = P.durata_mesi;
      let monthsNow = null;
      if (P.data_avvio) { const s = new Date(P.data_avvio + "T00:00:00"); monthsNow = (today - s) / (30.44 * 864e5); }
      const head = Array.from({ length: m }, (_, i) => `<span>${(i + 1) % 3 === 0 || i === 0 ? "M" + (i + 1) : ""}</span>`).join("");
      $("#gantt").innerHTML = `<div class="h">Attività</div><div class="h months">${head}</div>` + wps.map((w) => {
        const left = ((w.mese_inizio - 1) / m * 100).toFixed(2), width = ((w.mese_fine - w.mese_inizio + 1) / m * 100).toFixed(2);
        const tl = monthsNow != null && monthsNow >= 0 && monthsNow <= m ? `<i class="todayline" style="left:${(monthsNow / m * 100).toFixed(2)}%"></i>` : "";
        return `<div class="lbl"><b>${esc(w.codice)}</b>${esc(w.titolo)}<small>${esc(w.responsabile || "")} · M${w.mese_inizio}–M${w.mese_fine} · ${badge(w.stato)}</small></div>
                <div class="trk" style="--m:${m}"><span class="seg ${w.stato === "in_corso" ? "on" : ""}" style="left:${left}%;width:${width}%"></span>${tl}</div>`;
      }).join("");
      $("#gantt-note").textContent = P.data_avvio ? "La linea rossa indica la data di oggi." : "Mesi conteggiati dalla data di avvio, non ancora fissata (decorre dalla firma dell'Atto di Impegno).";
    } else { $("#gantt").outerHTML = `<div class="empty">Piano di lavoro in caricamento.</div>`; }

    // Scadenze
    const sc = (D.scadenze || []).slice().sort((a, b) => (a.data || "9999").localeCompare(b.data || "9999"));
    $("#scadenze").innerHTML = sc.length ? sc.map((s) => {
      const past = s.data && days(s.data) < 0;
      const dd = s.data ? (past ? "" : days(s.data) === 0 ? "oggi" : "tra " + days(s.data) + " gg") : "";
      return `<li class="${past && s.stato === "completato" ? "past" : ""}"><div class="d">${d(s.data)}<small>${dd}</small></div>
        <div><div class="t">${esc(s.titolo)}</div><div class="x">${esc(s.descrizione || "")}${s.chi ? " — <i>" + esc(s.chi) + "</i>" : ""}</div></div>${badge(s.stato)}</li>`;
    }).join("") : `<li class="empty">Nessuna scadenza.</li>`;

    // Criticità
    const cr = D.criticita || [];
    $("#criticita").innerHTML = cr.length ? cr.map((c) => `<li><div class="d">${d(c.data)}</div><div><div class="t">${esc(c.titolo)} ${c.stato === "risolta" ? '<span class="b ok">Risolta</span>' : `<span class="b ${c.livello === "alta" ? "risk" : "warn"}">${c.livello === "alta" ? "Priorità alta" : "Da monitorare"}</span>`}</div><div class="x">${esc(c.descrizione)}</div></div></li>`).join("") : `<li class="empty">Nessuna criticità aperta.</li>`;

    // Comunicazioni
    const fe = (D.comunicazioni || []).slice().sort((a, b) => b.data.localeCompare(a.data));
    $("#feed").innerHTML = fe.length ? fe.map((f) => `<li><div class="d">${d(f.data)}</div><div><div class="t">${esc(f.titolo)}</div><div class="x">${esc(f.sintesi)}</div></div></li>`).join("") : `<li class="empty">Nessuna comunicazione registrata.</li>`;

    // Riunioni
    const ri = (D.riunioni || []).slice().sort((a, b) => b.data.localeCompare(a.data));
    $("#riunioni").innerHTML = ri.length ? ri.map((r) => `<li><div class="d">${d(r.data)}</div><div><div class="t">${esc(r.titolo)}</div><div class="x">${esc(r.esito || "")}</div></div></li>`).join("") : `<li class="empty">Nessuna riunione registrata.</li>`;

    // Documenti
    const ico = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`;
    const docs = D.documenti || [];
    const url = (f) => "documenti/" + f.split("/").map(encodeURIComponent).join("/");
    const ext = (f) => (f.split(".").pop() || "").toUpperCase();
    const cats = [];
    docs.forEach((x) => { const c = x.categoria || "Altro"; if (!cats.includes(c)) cats.push(c); });
    $("#documenti").innerHTML = docs.length ? cats.map((c) => `<div class="doc-cat">${esc(c)}</div>` + docs.map((x, i) => [x, i]).filter(([x]) => (x.categoria || "Altro") === c).map(([x, i]) => `
      <div class="doc ${x.file ? "has-file" : "no-file"}" data-i="${i}" ${x.file ? 'tabindex="0" role="button"' : ""}>${ico}
        <div style="flex:1;min-width:0"><div class="doc-name">${esc(x.nome)} ${x.stato !== "completato" ? badge(x.stato) : ""}</div>
        <div class="x">${x.data ? d(x.data) : ""}${x.data && x.nota ? " · " : ""}${x.nota ? esc(x.nota) : ""}${!x.file ? (x.data || x.nota ? " · " : "") + "non ancora disponibile" : ""}</div></div>
        ${x.file ? `<a class="b ok dl" href="${url(x.file)}" download title="Scarica ${esc(x.nome)}">${esc(ext(x.file))} ↓</a>` : ""}
      </div>`).join("")).join("") : `<div class="empty">Nessun documento.</div>`;

    const body = $("#viewer-body"), vt = $("#viewer-title"), vdl = $("#viewer-dl");
    let token = 0;
    const msg = (t) => { body.innerHTML = `<div class="empty">${esc(t)}</div>`; };
    async function renderPdf(src, my) {
      if (!window.pdfjsLib) throw new Error("visualizzatore non caricato");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ url: src, withCredentials: true }).promise;
      if (my !== token) return;
      body.innerHTML = "";
      const width = body.clientWidth - 24, dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= pdf.numPages; n++) {
        if (my !== token) return;
        const page = await pdf.getPage(n);
        const vp0 = page.getViewport({ scale: 1 }), scale = width / vp0.width, vp = page.getViewport({ scale: scale * dpr });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height; c.style.width = width + "px"; c.style.height = (vp.height / dpr) + "px";
        c.className = "pdf-page"; body.appendChild(c);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      }
    }
    async function renderHtml(src, my) {
      const r = await fetch(src, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      if (my !== token) return;
      body.innerHTML = "";
      const host = document.createElement("div"); body.appendChild(host);
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = [...doc.querySelectorAll("style")].map((s) => s.outerHTML).join("") + doc.body.innerHTML;
    }
    const show = async (i) => {
      const x = docs[i]; if (!x || !x.file) return;
      const my = ++token;
      document.querySelectorAll(".doc.sel").forEach((e) => e.classList.remove("sel"));
      const el = document.querySelector(`.doc[data-i="${i}"]`); if (el) el.classList.add("sel");
      vt.textContent = x.nome;
      vdl.hidden = false; vdl.href = url(x.file); vdl.textContent = "Scarica " + ext(x.file);
      if (window.innerWidth < 860) document.querySelector(".docs-viewer").scrollIntoView({ behavior: "smooth", block: "start" });
      const pv = x.anteprima || (x.file.toLowerCase().endsWith(".pdf") ? x.file : null);
      if (!pv) return msg("Anteprima non disponibile per questo formato: scarica il file.");
      msg("Caricamento anteprima…");
      try { pv.toLowerCase().endsWith(".pdf") ? await renderPdf(url(pv), my) : await renderHtml(url(pv), my); }
      catch (e) { if (my === token) msg("Anteprima non disponibile (" + e.message + "). Usa il pulsante per scaricare il file."); }
    };
    document.querySelectorAll(".doc.has-file").forEach((el) => {
      el.addEventListener("click", (e) => { if (e.target.closest("a.dl")) return; show(+el.dataset.i); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(+el.dataset.i); } });
    });
    const first = docs.findIndex((x) => x.file);

    $("#fonte").textContent = D.fonte || "";

    // Navigazione a schede: una sezione alla volta
    const links = [...document.querySelectorAll(".tabs a")];
    const sections = [...document.querySelectorAll("main section[id]")];
    const activate = (id, push) => {
      if (!sections.some((s) => s.id === id)) id = sections[0].id;
      sections.forEach((s) => (s.hidden = s.id !== id));
      links.forEach((a) => { const on = a.getAttribute("href") === "#" + id; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      if (push) history.replaceState(null, "", "#" + id);
      const tabs = document.querySelector(".tabs");
      if (push && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: "start" });
      if (id === "documenti-s" && !document.querySelector(".doc.sel") && first >= 0) show(first);
    };
    links.forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); activate(a.getAttribute("href").slice(1), true); }));
    window.addEventListener("hashchange", () => activate(location.hash.slice(1), false));
    activate(location.hash.slice(1), false);
  }

  load().then(render).catch((e) => { document.body.insertAdjacentHTML("beforeend", `<div class="wrap empty">Impossibile caricare i dati del progetto (${esc(e.message)}).</div>`); });
})();
