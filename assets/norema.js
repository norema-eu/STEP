/* Pagina NOREMA — attività, personale e ore, budget, flusso di cassa, criticità (legge NOREMA/data.json generato da build.py) */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = (n) => n == null ? "—" : "€ " + Math.round(Number(n)).toLocaleString("it-IT");
  const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const d = (dt) => `${String(dt.getDate()).padStart(2, "0")} ${MESI[dt.getMonth()]} ${dt.getFullYear()}`;
  const ym = (dt) => `${MESI[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
  const parse = (iso) => new Date(iso + "T00:00:00");
  const addM = (dt, m) => new Date(dt.getFullYear(), dt.getMonth() + m, dt.getDate());
  const addD = (dt, g) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + g);
  const mKey = (dt) => dt.getFullYear() * 12 + dt.getMonth();
  const pill = (p) => `<span class="pill ${esc(p.tema || "blu")}">${esc(p.acronimo)}</span>`;
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  fetch("data.json?v=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(render)
    .catch((e) => document.querySelector("main").insertAdjacentHTML("afterbegin", `<div class="empty">Impossibile caricare i dati (${esc(e.message)}).</div>`));

  // Profilo mensile dei costi NOREMA (mesi di progetto 1..durata), scalato al costo ammesso
  function profilo(p) {
    const D = p.durata_mesi || 24, N = p.norema, out = new Array(D).fill(0);
    const wpMesi = Object.fromEntries((p.wp || []).map((w) => [w.codice, [w.mese_inizio, w.mese_fine]]));
    // voci anche aggregate (es. "WP5+WP6 (residuo)"): il peso si ripartisce sui mesi di tutti i WP indicati
    const opw = (N.ore_per_wp || []).map((x) => ({ peso: x.costo || x.ore, wps: (String(x.wp).match(/WP\d+/g) || []).filter((c) => wpMesi[c]) }))
      .filter((x) => x.peso && x.wps.length);
    if (opw.length) {
      opw.forEach(({ peso, wps }) => {
        const mesi = wps.flatMap((c) => { const [a, b] = wpMesi[c]; return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
        mesi.forEach((m) => (out[m - 1] += peso / mesi.length));
      });
    } else {
      const resp = (N.attivita || []).filter((a) => a.ruolo_norema === "responsabile" && wpMesi[a.wp]);
      if (resp.length) resp.forEach((a) => { const [x, y] = wpMesi[a.wp]; for (let m = x; m <= y; m++) out[m - 1] += 1; });
      for (let m = 0; m < D; m++) out[m] += resp.length ? 0.25 : 1; // quota di coordinamento/gestione distribuita su tutta la durata
    }
    const s = out.reduce((a, b) => a + b, 0) || 1;
    return out.map((v) => (v / s) * N.costo);
  }

  // Erogazioni secondo l'art. 9 dell'Avviso, per la quota NOREMA
  // Costo reale del personale (uscite) e importi rendicontabili, per progetto
  function tariffe(PS) {
    return Object.fromEntries((PS?.persone || []).map((x) => {
      const annuo = x.costo_annuo ?? (x.ral ? x.ral * x.fattore_oneri : null);
      const reale = x.costo_orario ?? annuo / PS.ore_annue;
      const rend = x.tariffa_rend ?? (x.tariffa_rend_formula === "ral/1720" ? x.ral / 1720 : 30);
      return [x.id, { ...x, annuo, reale, rend, rendTQ: x.tariffa_rend_tq ?? rend }];
    }));
  }
  function reale(p, T, PS, tq) {
    const ore = PS?.ore?.[p.slug]; if (!ore) return null;
    const righe = Object.entries(ore).map(([id, h]) => ({ ...T[id], ore: h, uscita: h * T[id].reale, rendic: h * (tq ? T[id].rendTQ : T[id].rend) }));
    const pers = righe.reduce((a, x) => a + x.rendic, 0), stip = righe.reduce((a, x) => a + x.uscita, 0);
    const rend = pers * (1 + PS.forfait_b4), usc = stip + (PS.forfait_b4_uscita ? pers * PS.forfait_b4 : 0);
    const N = p.norema, contr = Math.min(N.contributo, rend * N.contributo / N.costo);
    return { righe, usc, rend, contr, pers };
  }

  function erogazioni(p, I, mode, tq) {
    const N = p.norema, K = N.costo, C = N.contributo, D = p.durata_mesi || 24, t0 = parse(p.data_inizio), r = C / K;
    const R = mode === "reale" && N.R ? (tq ? N.RTQ : N.R) : { usc: K, rend: K, contr: C };
    const base = profilo(p), prof = base.map((v) => v * R.usc / K), rq = R.rend / K;
    const cumul = (a, b) => base.slice(a, b).reduce((x, y) => x + y, 0) * rq;
    const ev = [], tetto = I.tetto_pct * C, lag = I.ritardo_li + I.ritardo_capofila;
    let erog = 0;
    const push = (tipo, rich, importo, nota) => { importo = Math.max(0, importo); erog += importo; ev.push({ tipo, rich, inc: addD(rich, lag), importo, nota }); };
    push("Anticipo", addD(t0, I.anticipo_giorni), I.anticipo_pct * C, `${Math.round(I.anticipo_pct * 100)}% del contributo, con fideiussione`);
    let prev = 0;
    I.sal_mesi.forEach((m, i) => {
      const costi = cumul(prev, m);
      const cum = cumul(0, m);
      push(`SAL ${i + 1} (mese ${m})`, addM(t0, m), Math.min(costi * r, tetto - erog),
        `costi rendicontati ${eur0(costi)}; cumulati ${Math.round((cum / K) * 100)}% del costo ammesso` + (i === 1 && cum / K < 0.4 ? " — sotto il 40% richiesto al 2° SAL" : ""));
      prev = m;
    });
    push("Saldo", addM(t0, D), R.contr - erog, R.contr < C - 0.5 ? `contributo residuo; contributo atteso ${eur0(R.contr)} invece di ${eur0(C)} concessi` : "contributo residuo a fronte di tutti i costi rendicontati");
    return { prof, ev, t0, D, R };
  }

  function render(X) {
    const P = X.progetti, I0 = X.ipotesi;
    $("#updated").textContent = "Aggiornato il " + new Date(X.aggiornato).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
    const K = P.reduce((a, p) => a + p.norema.costo, 0), C = P.reduce((a, p) => a + p.norema.contributo, 0);
    const PS = X.personale, T = tariffe(PS);
    P.forEach((p) => { p.norema.R = reale(p, T, PS, false); p.norema.RTQ = reale(p, T, PS, true); });
    const hasR = P.some((p) => p.norema.R);
    let mode = (hasR && (store.get("n_mode") || "reale")) || "ammesso";
    let tq = store.get("n_tq") === "1";
    const EXT = PS?.prestazioni_esterne;
    const I = { ...I0, ritardo_li: +(store.get("n_li") ?? I0.ritardo_li), ritardo_capofila: +(store.get("n_cf") ?? I0.ritardo_capofila) };

    // ---------- Attività
    const all = P.flatMap((p) => p.wp.map((w) => ({ p, w, a: (p.norema.attivita || []).find((x) => x.wp === w.codice) })).filter((x) => x.a));
    const minT = Math.min(...P.map((p) => mKey(parse(p.data_inizio)))), maxT = Math.max(...P.map((p) => mKey(addM(parse(p.data_inizio), (p.durata_mesi || 24) - 1))));
    const span = maxT - minT + 1, nowK = mKey(new Date());
    const head = Array.from({ length: span }, (_, i) => { const dt = new Date(Math.floor((minT + i) / 12), (minT + i) % 12, 1); return `<span>${dt.getMonth() % 3 === 0 ? esc(ym(dt)) : ""}</span>`; }).join("");
    $("#n-gantt").innerHTML = `<div class="h">Work package NOREMA</div><div class="h months">${head}</div>` + all.map(({ p, w, a }) => {
      const s = mKey(addM(parse(p.data_inizio), w.mese_inizio - 1)) - minT, e = mKey(addM(parse(p.data_inizio), w.mese_fine - 1)) - minT;
      const tl = nowK >= minT && nowK <= maxT ? `<i class="todayline" style="left:${((nowK - minT + 0.5) / span * 100).toFixed(2)}%"></i>` : "";
      return `<div class="lbl">${pill(p)} <b>${esc(w.codice)}</b>${esc(w.titolo)}<small>${a.ruolo_norema === "responsabile" ? "Responsabile NOREMA" : "Partecipazione NOREMA"} · M${w.mese_inizio}–M${w.mese_fine}</small></div>
        <div class="trk" style="--m:${span}"><span class="seg ${a.ruolo_norema === "responsabile" ? "on" : ""}" style="left:${(s / span * 100).toFixed(2)}%;width:${((e - s + 1) / span * 100).toFixed(2)}%;${a.ruolo_norema === "responsabile" ? `background:var(--p-${esc(p.tema)})` : ""}"></span>${tl}</div>`;
    }).join("");
    $("#n-attivita").innerHTML = P.map((p) => `<div class="card"><h3>${pill(p)}</h3>` + (p.norema.attivita || []).map((a) => {
      const w = p.wp.find((x) => x.codice === a.wp) || {}, t0 = parse(p.data_inizio);
      const per = w.mese_inizio ? `${ym(addM(t0, w.mese_inizio - 1))} – ${ym(addM(t0, w.mese_fine - 1))}` : esc(a.mesi || "");
      return `<div class="wpi"><b>${esc(a.wp)}</b> ${esc(a.titolo || w.titolo || "")}<span class="tag ${a.ruolo_norema === "responsabile" ? "resp" : "part"}">${a.ruolo_norema === "responsabile" ? "responsabile" : "partecipa"}</span>
        <div class="x">${per}${a.task_norema ? " · " + esc(a.task_norema) : ""}</div>${(a.deliverable_norema || []).length ? `<div class="x">Deliverable: ${a.deliverable_norema.map(esc).join("; ")}</div>` : ""}</div>`;
    }).join("") + `</div>`).join("");

    // ---------- Budget
    $("#n-budget-tot").innerHTML = `<thead><tr><th>Progetto</th><th>Capofila</th><th class="num">Costo ammesso NOREMA</th><th class="num">Contributo</th><th class="num">Intensità</th><th class="num">Cofinanziamento NOREMA</th><th class="num">Quota sul progetto</th></tr></thead><tbody>` +
      P.map((p) => `<tr><td>${pill(p)}</td><td>${esc(p.capofila)}</td><td class="num">${eur(p.norema.costo)}</td><td class="num">${eur(p.norema.contributo)}</td><td class="num">${Math.round(p.norema.contributo / p.norema.costo * 100)}%</td><td class="num">${eur(p.norema.costo - p.norema.contributo)}</td><td class="num">${Math.round(p.norema.costo / p.costo_progetto * 100)}%</td></tr>`).join("") +
      `</tbody><tfoot><tr><td>Totale</td><td></td><td class="num">${eur(K)}</td><td class="num">${eur(C)}</td><td class="num">${Math.round(C / K * 100)}%</td><td class="num">${eur(K - C)}</td><td></td></tr></tfoot>`;
    if (hasR) {
      const pp = Object.values(T);
      const rows = P.filter((p) => p.norema.R);
      const tU = rows.reduce((a, p) => a + p.norema.R.usc, 0), tRd = rows.reduce((a, p) => a + p.norema.R.rend, 0), tCa = rows.reduce((a, p) => a + p.norema.R.contr, 0), tK = rows.reduce((a, p) => a + p.norema.costo, 0), tC = rows.reduce((a, p) => a + p.norema.contributo, 0);
      $("#n-reale").innerHTML = `<h3 style="margin:22px 0 6px;font-size:18px;font-weight:600;color:var(--navy)">Costo reale del personale e rendicontazione</h3>
        <p class="lead" style="margin-top:0">Le entrate dipendono da come si rendiconta (costi standard o costo effettivo); le uscite da quanto NOREMA paga davvero. Il forfait B.4 (${Math.round(PS.forfait_b4 * 100)}%) si rendiconta ma ${PS.forfait_b4_uscita ? "è considerato anche come uscita" : "non genera uscite"}.</p>
        <div class="card scroll"><table class="tbl"><thead><tr><th>Persona</th><th>Inquadramento e calcolo</th><th class="num">Costo annuo</th><th class="num">€/h reale</th><th class="num">€/h rendicontato</th><th>Voce</th></tr></thead><tbody>` +
        pp.map((x) => `<tr><td><b>${esc(x.nome)}</b>${x.sostituisce ? `<div style="font-size:12px;color:var(--muted)">al posto di ${esc(x.sostituisce)}</div>` : ""}</td><td style="font-size:13px">${esc(x.inquadramento)}<div style="font-size:12px;color:var(--muted)">${esc(x.calcolo || "")}</div>${x.attenzione ? `<div class="nint">${esc(x.attenzione)}</div>` : ""}</td><td class="num">${x.annuo ? eur0(x.annuo) : "—"}</td><td class="num">${eur(x.reale)}</td><td class="num">${eur(x.rend)}${x.rendTQ !== x.rend ? `<div style="font-size:12px;color:var(--muted)">${eur(x.rendTQ)} come Titolare Qualificato</div>` : ""}</td><td>${esc(x.voce)}</td></tr>`).join("") +
        `</tbody></table><div class="note" style="font-size:12px;color:var(--muted);margin-top:8px">€/h reale = costo annuo ÷ ${PS.ore_annue.toLocaleString("it-IT")} ore (${esc(PS.ore_annue_nota)}). ${esc(PS.fonte_ccnl)}. Stime da verificare con il consulente del lavoro.</div></div>
        <div class="card scroll" style="margin-top:14px"><table class="tbl"><thead><tr><th>Progetto</th><th class="num">Ore NOREMA</th><th class="num">Uscite reali</th><th class="num">Costo rendicontabile</th><th class="num">Contributo atteso</th><th class="num">Differenza sul concesso</th><th class="num">Cofinanziamento effettivo</th><th class="num">Contributo atteso con Titolare Qualificato</th></tr></thead><tbody>` +
        rows.map((p) => { const R = p.norema.R; return `<tr><td>${pill(p)}${PS.ore_nota?.[p.slug] ? `<div style="font-size:12px;color:var(--muted);max-width:280px">${esc(PS.ore_nota[p.slug])}</div>` : ""}</td><td class="num">${R.righe.reduce((a, x) => a + x.ore, 0).toLocaleString("it-IT")}</td><td class="num">${eur(R.usc)}</td><td class="num">${eur(R.rend)}</td><td class="num">${eur(R.contr)}</td><td class="num ${R.contr < p.norema.contributo - 0.5 ? "neg" : ""}">${eur(R.contr - p.norema.contributo)}</td><td class="num">${eur(R.usc - R.contr)}</td><td class="num">${eur(p.norema.RTQ.contr)}${p.norema.RTQ.contr >= p.norema.contributo - 0.5 ? `<div style="font-size:11.5px;color:var(--muted)">limitato al concesso</div>` : ""}</td></tr>`
          + R.righe.map((x) => `<tr class="det"><td style="padding-left:22px;font-size:12.5px;color:var(--muted)">${esc(x.nome)}</td><td class="num" style="font-size:12.5px">${x.ore.toLocaleString("it-IT")}</td><td class="num" style="font-size:12.5px">${eur(x.uscita)}</td><td class="num" style="font-size:12.5px">${eur(x.rendic * (1 + PS.forfait_b4))}</td><td colspan="4"></td></tr>`).join(""); }).join("") +
        `</tbody><tfoot><tr><td>Totale</td><td></td><td class="num">${eur(tU)}</td><td class="num">${eur(tRd)}</td><td class="num">${eur(tCa)}</td><td class="num ${tCa < tC - 0.5 ? "neg" : ""}">${eur(tCa - tC)}</td><td class="num">${eur(tU - tCa)}</td><td class="num">${eur(rows.reduce((a, p) => a + p.norema.RTQ.contr, 0))}</td></tr></tfoot></table>
        <div class="note" style="font-size:12px;color:var(--muted);margin-top:8px">Costo rendicontabile = ore × €/h rendicontato, più forfait B.4. Confronto con il piano approvato: costo ammesso ${eur(tK)}, contributo concesso ${eur(tC)}. Il contributo atteso non supera mai quello concesso per progetto.</div></div>` +
        (EXT ? `<div class="card" style="margin-top:14px"><b>Prestazioni specialistiche esterne: ${eur(EXT.importo)}</b><div style="font-size:13px;margin-top:4px">${esc(EXT.nota)}</div></div>` : "");
    }
    $("#n-budget-prog").innerHTML = P.map((p) => {
      const N = p.norema;
      const voci = (N.voci || []).map((v) => `<tr><td>${esc(v.voce)}${v.dettaglio ? `<div class="x" style="color:var(--muted);font-size:12px">${esc(v.dettaglio)}</div>` : ""}</td><td class="num">${eur(v.importo)}</td></tr>`).join("");
      const pers = (N.personale || []).map((x) => `<tr><td>${esc(x.nome)}${x.ruolo ? `<div style="color:var(--muted);font-size:12px">${esc(x.ruolo)}</div>` : ""}</td><td class="num">${x.ore ?? x.ore_totali ?? "—"}</td><td class="num">${x.costo_orario ? eur(x.costo_orario) : "—"}</td><td class="num">${eur(x.costo)}</td></tr>`).join("");
      const opw = (N.ore_per_wp || []).map((x) => `${esc(x.wp)} ${x.ore ?? "—"} h`).join(" · ");
      return `<div class="nbud card"><h3>${pill(p)} <span style="font-weight:400;color:var(--muted);font-size:13px">costo ${eur(N.costo)} · contributo ${eur(N.contributo)}</span></h3>
        <div class="grid2"><div><table><thead><tr><th>Voce di costo</th><th class="num">Importo</th></tr></thead><tbody>${voci || `<tr><td colspan="2" class="empty">Voci non disponibili</td></tr>`}</tbody></table></div>
        <div><table><thead><tr><th>Personale</th><th class="num">Ore</th><th class="num">€/h</th><th class="num">Costo</th></tr></thead><tbody>${pers || `<tr><td colspan="4" class="empty">Dettaglio non disponibile</td></tr>`}</tbody></table>
        ${opw ? `<div class="note">Ore per WP: ${opw}</div>` : ""}</div></div>
        ${(N.note || []).length ? `<details class="note"><summary>Note di verifica sulle fonti (${N.note.length})</summary><ul>${N.note.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}</div>`;
    }).join("");

    // ---------- Cassa
    let sel = store.get("n_prog") || "tutti";
    $("#n-f-prog").innerHTML = `<button data-v="tutti">Tutti i progetti</button>` + P.map((p) => `<button data-v="${esc(p.slug)}">${esc(p.acronimo)}</button>`).join("");
    $("#n-li").value = I.ritardo_li; $("#n-cf").value = I.ritardo_capofila;
    const draw = () => {
      document.querySelectorAll("#n-f-prog button").forEach((b) => b.classList.toggle("on", b.dataset.v === sel));
      const Ps = P.filter((p) => sel === "tutti" || p.slug === sel);
      document.querySelectorAll("#n-f-mode button").forEach((b) => b.classList.toggle("on", b.dataset.v === mode));
      document.querySelectorAll("#n-f-tq button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "1") === tq));
      const tqEl = $("#n-f-tq"); if (tqEl) tqEl.style.display = mode === "reale" ? "" : "none";
      const runs = Ps.map((p) => ({ p, ...erogazioni(p, I, mode, tq) }));
      // mesi di calendario
      const months = new Map();
      const add = (dt, k, v) => { const key = mKey(dt); if (!months.has(key)) months.set(key, { key, out: 0, inn: 0, ev: [] }); months.get(key)[k] += v; return months.get(key); };
      runs.forEach(({ p, prof, ev, t0 }) => {
        prof.forEach((v, i) => add(addM(t0, i), "out", v));
        ev.forEach((e) => add(e.inc, "inn", e.importo).ev.push(`${p.acronimo}: ${e.tipo}`));
      });
      const extOn = EXT && mode === "reale" && sel === "tutti";
      if (extOn) {
        const top = [...months.values()].sort((a, b) => b.out - a.out).slice(0, EXT.mesi_punta);
        top.forEach((m) => { m.out += EXT.importo / top.length; m.ev.push(`Prestazioni esterne ${eur0(EXT.importo / top.length)}`); });
      }
      const keys = [...months.keys()]; const k0 = Math.min(...keys), k1 = Math.max(...keys);
      const rows = []; let cum = 0;
      for (let k = k0; k <= k1; k++) { const m = months.get(k) || { out: 0, inn: 0, ev: [] }; cum += m.inn - m.out; rows.push({ k, dt: new Date(Math.floor(k / 12), k % 12, 1), out: m.out, inn: m.inn, cum, ev: m.ev }); }
      const minRow = rows.reduce((a, b) => (b.cum < a.cum ? b : a), rows[0]);
      const totU = runs.reduce((a, r) => a + r.prof.reduce((x, y) => x + y, 0), 0) + (extOn ? EXT.importo : 0), totE = runs.reduce((a, r) => a + r.ev.reduce((x, e) => x + e.importo, 0), 0);
      $("#n-cassa-lead").innerHTML = (mode === "reale"
        ? `Uscite: <b>costo reale</b> del personale NOREMA (stipendi e compenso, vedi scheda Budget), distribuito sui mesi dei work package; il forfait B.4 non genera uscite. Entrate: contributo sui costi rendicontabili (costi standard; costo effettivo per l'apprendista; Claudia Abatecola a ${tq ? "34,70 €/h come Titolare Qualificato di PMI" : "30 €/h"}). ` + (EXT ? (extOn ? `Comprese prestazioni esterne per ${eur0(EXT.importo)} nei ${EXT.mesi_punta} mesi di punta, non rendicontabili. ` : `Le prestazioni esterne (${eur0(EXT.importo)}) compaiono solo nella vista "Tutti i progetti". `) : "")
        : `Uscite: costo ammesso NOREMA (costi standard + forfait) distribuito sui mesi dei work package. Entrate: contributo concesso. `) +
        `Anticipo, SAL e saldo incassati dopo ${I.ritardo_li} + ${I.ritardo_capofila} giorni dalla richiesta. <b>Massima esposizione di cassa: ${eur0(-Math.min(0, minRow.cum))}</b> (${ym(minRow.dt)}); a fine periodo il saldo per NOREMA è ${eur0(totE - totU)}.`;

      // grafico: barre entrate (su) e uscite (giù) + linea del saldo cumulato, un solo asse in euro
      const W = 1100, H = 340, padL = 70, padR = 16, padT = 14, padB = 36;
      const maxV = Math.max(...rows.map((r) => Math.max(r.inn, r.cum, 0)), 1), minV = Math.min(...rows.map((r) => Math.min(-r.out, r.cum, 0)), -1);
      const y = (v) => padT + (maxV - v) / (maxV - minV) * (H - padT - padB);
      const bw = (W - padL - padR) / rows.length, x = (i) => padL + i * bw;
      const step = (() => { const raw = (maxV - minV) / 5, p10 = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((f) => f * p10).find((s) => s >= raw); })();
      let grid = ""; for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${(v / 1000).toLocaleString("it-IT")}k</text>`;
      const bars = rows.map((r, i) => {
        const w = Math.max(2, bw - 3), bx = x(i) + 1.5;
        return (r.inn ? `<rect x="${bx}" y="${y(r.inn)}" width="${w}" height="${Math.max(1, y(0) - y(r.inn))}" rx="3" fill="var(--c-in)"/>` : "") +
          (r.out ? `<rect x="${bx}" y="${y(0) + 1}" width="${w}" height="${Math.max(1, y(-r.out) - y(0) - 1)}" rx="3" fill="var(--c-out)"/>` : "");
      }).join("");
      const line = rows.map((r, i) => `${i ? "L" : "M"}${(x(i) + bw / 2).toFixed(1)},${y(r.cum).toFixed(1)}`).join(" ");
      const xl = rows.map((r, i) => (r.dt.getMonth() % 3 === 0 ? `<text x="${x(i) + bw / 2}" y="${H - 12}" text-anchor="middle">${ym(r.dt)}</text>` : "")).join("");
      const hits = rows.map((r, i) => `<rect class="hit" data-i="${i}" x="${x(i)}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>`).join("");
      $("#n-chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g class="grid axis">${grid}</g><line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>${bars}<path d="${line}" fill="none" stroke="var(--c-cum)" stroke-width="2"/><circle cx="${x(rows.indexOf(minRow)) + bw / 2}" cy="${y(minRow.cum)}" r="5" fill="var(--c-cum)" stroke="#fff" stroke-width="2"/><g class="axis">${xl}</g>${hits}</svg>`;
      $("#n-legend").innerHTML = `<span><i style="background:var(--c-in)"></i>Entrate (contributo incassato)</span><span><i style="background:var(--c-out)"></i>Uscite (${mode === "reale" ? "costo reale" : "costo ammesso"} NOREMA)</span><span><i class="line" style="background:var(--c-cum)"></i>Saldo di cassa cumulato</span>`;
      const tip = $("#n-tip");
      document.querySelectorAll("#n-chart .hit").forEach((h) => {
        h.addEventListener("mousemove", (e) => { const r = rows[+h.dataset.i]; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - 230) + "px"; tip.style.top = e.clientY + 14 + "px";
          tip.innerHTML = `<b>${ym(r.dt)}</b><div><span>Entrate</span><span>${eur0(r.inn)}</span></div><div><span>Uscite</span><span>${eur0(r.out)}</span></div><div><span>Cumulato</span><span>${eur0(r.cum)}</span></div>${r.ev.length ? `<div style="display:block;color:var(--muted);margin-top:4px">${r.ev.map(esc).join("<br>")}</div>` : ""}`; });
        h.addEventListener("mouseleave", () => (tip.hidden = true));
      });

      $("#n-erog").innerHTML = `<thead><tr><th>Progetto</th><th>Erogazione</th><th>Richiesta entro</th><th>Incasso stimato NOREMA</th><th class="num">Importo NOREMA</th><th>Note</th></tr></thead><tbody>` +
        runs.flatMap(({ p, ev }) => ev.map((e) => `<tr><td>${pill(p)}</td><td>${esc(e.tipo)}</td><td>${d(e.rich)}</td><td>${d(e.inc)}</td><td class="num">${eur(e.importo)}</td><td style="font-size:12.5px;color:var(--muted)">${esc(e.nota)}</td></tr>`)).join("") + `</tbody>` +
        (() => { const per = runs.map(({ p, ev }) => `<tr class="sub"><td>${pill(p)}</td><td colspan="3">Totale erogazioni ${esc(p.acronimo)}</td><td class="num">${eur(ev.reduce((a, e) => a + e.importo, 0))}</td><td></td></tr>`).join("");
          const tot = runs.reduce((a, r) => a + r.ev.reduce((b, e) => b + e.importo, 0), 0);
          return `<tfoot>${runs.length > 1 ? per : ""}<tr class="tot"><td colspan="4">Totale erogazioni</td><td class="num">${eur(tot)}</td><td></td></tr></tfoot>`; })();
      $("#n-cassa").innerHTML = `<thead><tr><th>Mese</th><th class="num">Uscite</th><th class="num">Entrate</th><th class="num">Saldo del mese</th><th class="num">Cumulato</th><th>Eventi</th></tr></thead><tbody>` +
        rows.map((r) => `<tr class="${r.ev.length ? "ev" : ""}"><td>${ym(r.dt)}</td><td class="num">${eur0(r.out)}</td><td class="num">${r.inn ? eur0(r.inn) : "—"}</td><td class="num ${r.inn - r.out < 0 ? "neg" : ""}">${eur0(r.inn - r.out)}</td><td class="num ${r.cum < 0 ? "neg" : ""}">${eur0(r.cum)}</td><td style="font-size:12.5px">${r.ev.map(esc).join("; ")}</td></tr>`).join("") + `</tbody>` +
        (() => { const o = rows.reduce((a, r) => a + r.out, 0), n = rows.reduce((a, r) => a + r.inn, 0);
          return `<tfoot><tr class="tot"><td>Totale</td><td class="num">${eur0(o)}</td><td class="num">${eur0(n)}</td><td class="num ${n - o < 0 ? "neg" : ""}">${eur0(n - o)}</td><td class="num ${rows.at(-1).cum < 0 ? "neg" : ""}">${eur0(rows.at(-1).cum)}</td><td style="font-size:12.5px">Massima esposizione ${eur0(-Math.min(0, minRow.cum))} (${ym(minRow.dt)})</td></tr></tfoot>`; })();

      // KPI
      const all3 = P.map((p) => ({ p, ...erogazioni(p, I, mode, tq) }));
      const extK = EXT && mode === "reale";
      const U3 = all3.reduce((a, r) => a + r.prof.reduce((x, y) => x + y, 0), 0) + (extK ? EXT.importo : 0), E3 = all3.reduce((a, r) => a + r.ev.reduce((x, e) => x + e.importo, 0), 0);
      let mm = new Map(); all3.forEach(({ prof, ev, t0 }) => { prof.forEach((v, i) => { const k = mKey(addM(t0, i)); mm.set(k, (mm.get(k) || 0) - v); }); ev.forEach((e) => { const k = mKey(e.inc); mm.set(k, (mm.get(k) || 0) + e.importo); }); });
      if (extK) { const out = new Map(); all3.forEach(({ prof, t0 }) => prof.forEach((v, i) => { const k = mKey(addM(t0, i)); out.set(k, (out.get(k) || 0) + v); }));
        const top = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, EXT.mesi_punta); top.forEach(([k]) => mm.set(k, mm.get(k) - EXT.importo / top.length)); }
      let c2 = 0, worst = 0; [...mm.keys()].sort((a, b) => a - b).forEach((k) => { c2 += mm.get(k); worst = Math.min(worst, c2); });
      $("#kpis").innerHTML = [
        ["Costo ammesso NOREMA", eur0(K), "contributo concesso " + eur0(C)],
        [mode === "reale" ? "Uscite reali" : "Uscite", eur0(U3), mode === "reale" ? (extK ? `personale reale + ${eur0(EXT.importo)} esterni` : "personale a costo reale") : "pari al costo ammesso"],
        ["Contributo atteso", eur0(E3), (E3 < C - 0.5 ? `${eur0(E3 - C)} sul concesso` : "pari al concesso") + (mode === "reale" && tq ? " · Titolare Qualificato" : "")],
        ["Cofinanziamento", eur0(U3 - E3), mode === "reale" ? "effettivo, a carico di NOREMA" : "a carico di NOREMA"],
        ["Anticipi attesi", eur0(P.reduce((a, p) => a + I.anticipo_pct * p.norema.contributo, 0)), "40% del contributo, con fideiussione"],
        ["Max esposizione", eur0(-worst), "tre progetti insieme"],
      ].map(([l, v, n], i) => `<div class="kpi ${i === 5 ? "alert" : ""}"><div class="l">${l}</div><div class="v">${v}</div><div class="n">${esc(n)}</div></div>`).join("");
    };
    document.querySelectorAll("#n-f-prog button").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.v; store.set("n_prog", sel); draw(); }));
    if (hasR) {
      $("#n-f-mode").innerHTML = `<button data-v="reale">Costo reale</button><button data-v="ammesso">Costo ammesso</button>`;
      document.querySelectorAll("#n-f-mode button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.v; store.set("n_mode", mode); draw(); }));
      $("#n-f-tq").innerHTML = `<button data-v="0">Claudia 30 €/h</button><button data-v="1">Titolare Qualificato 34,70 €/h</button>`;
      document.querySelectorAll("#n-f-tq button").forEach((b) => b.addEventListener("click", () => { tq = b.dataset.v === "1"; store.set("n_tq", tq ? "1" : "0"); draw(); }));
    } else { $("#n-f-mode").remove(); $("#n-f-tq").remove(); }
    [["#n-li", "ritardo_li", "n_li"], ["#n-cf", "ritardo_capofila", "n_cf"]].forEach(([id, k, sk]) => $(id).addEventListener("change", (e) => { I[k] = Math.max(0, +e.target.value || 0); store.set(sk, I[k]); draw(); }));
    draw();

    // ---------- Personale e ore
    const ORE_ANNO = 1720, FTE_M = ORE_ANNO / 12;
    const num = (n) => n == null ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const oreAppr = (p) => (p.norema.voci || []).filter((v) => /^B\.1\.1/.test(v.voce)).reduce((a, v) => a + v.importo, 0) / 30;
    const chi = (x, p) => x.nome !== "da individuare" ? x.nome : (/deep learning/i.test(x.ruolo) ? "Esperto deep learning" : /full stack/i.test(x.ruolo) ? "Full stack developer" : "Figura da individuare");
    const names = [], cell = {};
    P.forEach((p) => (p.norema.personale || []).forEach((x) => {
      const n = chi(x, p); if (!names.includes(n)) names.push(n);
      cell[n + "|" + p.slug] = { ore: x.ore_totali ?? x.ore_wp1_wp4_formulario ?? null, parz: x.ore_totali == null && x.ore_wp1_wp4_formulario != null, nuova: x.nome === "da individuare" };
    }));
    if (X.personale && X.personale.ore) { // dati del personale reale (_norema/personale.json): prevalgono sull'estrazione dal formulario
      names.length = 0; Object.keys(cell).forEach((k) => delete cell[k]);
      X.personale.persone.forEach((q) => { const n = q.nome + (q.sostituisce ? ` (al posto di ${q.sostituisce})` : ""); names.push(n);
        P.forEach((p) => { const o = (X.personale.ore[p.slug] || {})[q.id]; if (o != null) cell[n + "|" + p.slug] = { ore: o, parz: !!(X.personale.ore_nota || {})[p.slug], nuova: q.id === "da_individuare" }; }); });
    }
    const totP = Object.fromEntries(P.map((p) => [p.slug, oreAppr(p)]));
    const nonAttr = Object.fromEntries(P.map((p) => [p.slug, totP[p.slug] - names.reduce((a, n) => a + (cell[n + "|" + p.slug]?.ore || 0), 0)]));
    const mesiCal = (() => { const a = Math.min(...P.map((p) => mKey(parse(p.data_inizio)))), b = Math.max(...P.map((p) => mKey(addM(parse(p.data_inizio), (p.durata_mesi || 24) - 1)))); return b - a + 1; })();
    const totAll = P.reduce((a, p) => a + totP[p.slug], 0);
    $("#n-pers").innerHTML = `<thead><tr><th>Persona</th>${P.map((p) => `<th class="num">${pill(p)}</th>`).join("")}<th class="num">Totale ore</th><th class="num">Media ore/anno</th><th class="num">% di 1.720 h</th></tr></thead><tbody>` +
      names.map((n) => {
        const cs = P.map((p) => cell[n + "|" + p.slug]), tot = cs.reduce((a, c) => a + (c?.ore || 0), 0), parz = cs.some((c) => c?.parz), nuova = cs.some((c) => c?.nuova);
        const anno = tot / (mesiCal / 12), pct = anno / ORE_ANNO;
        return `<tr><td>${esc(n)}${nuova ? ' <span class="b warn">da assumere</span>' : ""}</td>${cs.map((c) => `<td class="num">${c ? num(c.ore) + (c.parz ? "*" : "") : "—"}</td>`).join("")}<td class="num">${num(tot)}${parz ? "*" : ""}</td><td class="num">${num(anno)}${parz ? "*" : ""}</td><td class="num ${pct > 1 ? "neg" : ""}">${Math.round(pct * 100)}%${parz ? "*" : ""}</td></tr>`;
      }).join("") +
      (P.some((p) => nonAttr[p.slug] > 0.5) ? `<tr><td><i>Ore approvate non ancora attribuite a persone</i></td>${P.map((p) => `<td class="num">${nonAttr[p.slug] > 0.5 ? num(nonAttr[p.slug]) : "—"}</td>`).join("")}<td class="num">${num(P.reduce((a, p) => a + Math.max(0, nonAttr[p.slug]), 0))}</td><td></td><td></td></tr>` : "") +
      `</tbody><tfoot><tr><td>Totale ore approvate</td>${P.map((p) => `<td class="num">${num(totP[p.slug])}</td>`).join("")}<td class="num">${num(totAll)}</td><td class="num">${num(totAll / (mesiCal / 12))}</td><td class="num">${(totAll / (mesiCal / 12) / ORE_ANNO).toLocaleString("it-IT", { maximumFractionDigits: 1 })} FTE</td></tr></tfoot>`;
    $("#n-pers-note").innerHTML = `Ore del piano dei costi approvato su GeCoWEB Plus (voce B.1.1, costo standard 30 €/h). La media annua è calcolata sui ${mesiCal} mesi di calendario dei tre progetti insieme; 1.720 h è il monte ore annuo dell'Avviso (art. 4, voce B.1).<br>* PRONTI VIA: le righe del piano approvato non riportano i nominativi; abbinamento alle persone ricostruito, da confermare. HS-HumanSeal: abbinamento delle righe 1.430 h e 890 h a Abatecola e Mirabella ricostruito per ipotesi. SPACE.AI: le due righe da 380 h sono attribuite a Mirabella e a Ciampi (al posto di Caldarera).`;

    // carico mensile per progetto (ore per WP distribuite sui mesi del WP)
    const oreProf = (p) => {
      const D = p.durata_mesi || 24, out = new Array(D).fill(0), wpM = Object.fromEntries((p.wp || []).map((w) => [w.codice, [w.mese_inizio, w.mese_fine]]));
      (p.norema.ore_per_wp || []).forEach((x) => { const wps = (String(x.wp).match(/WP\d+/g) || []).filter((c) => wpM[c]); if (!x.ore || !wps.length) return;
        const ms = wps.flatMap((c) => { const [a, b] = wpM[c]; return Array.from({ length: b - a + 1 }, (_, i) => a + i); }); ms.forEach((m) => (out[m - 1] += x.ore / ms.length)); });
      return out;
    };
    const lm = new Map(); P.forEach((p) => oreProf(p).forEach((v, i) => { const k = mKey(addM(parse(p.data_inizio), i)); if (!lm.has(k)) lm.set(k, {}); lm.get(k)[p.slug] = (lm.get(k)[p.slug] || 0) + v; }));
    const lk = [...lm.keys()].sort((a, b) => a - b), lrows = lk.map((k) => ({ k, dt: new Date(Math.floor(k / 12), k % 12, 1), v: lm.get(k), tot: P.reduce((a, p) => a + (lm.get(k)[p.slug] || 0), 0) }));
    const peak = lrows.reduce((a, b) => (b.tot > a.tot ? b : a), lrows[0]);
    $("#n-load-lead").innerHTML = `Ore NOREMA per mese, sommando i tre progetti: le ore di ciascun WP sono distribuite in modo uniforme sui suoi mesi. Media <b>${num(totAll / lrows.length)} h/mese</b> (circa ${(totAll / lrows.length / FTE_M).toLocaleString("it-IT", { maximumFractionDigits: 1 })} persone a tempo pieno); picco <b>${num(peak.tot)} h</b> a ${ym(peak.dt)} (${(peak.tot / FTE_M).toLocaleString("it-IT", { maximumFractionDigits: 1 })} persone). Una persona a tempo pieno corrisponde a circa ${num(FTE_M)} h/mese.`;
    {
      const W = 1100, H = 300, padL = 56, padR = 16, padT = 14, padB = 34, maxV = Math.ceil(Math.max(...lrows.map((r) => r.tot), FTE_M) / FTE_M) * FTE_M;
      const y = (v) => padT + (1 - v / maxV) * (H - padT - padB), bw = (W - padL - padR) / lrows.length, x = (i) => padL + i * bw;
      let g = ""; for (let f = 1; f * FTE_M <= maxV + 1; f++) g += `<line x1="${padL}" x2="${W - padR}" y1="${y(f * FTE_M)}" y2="${y(f * FTE_M)}" stroke-dasharray="4 4"/><text x="${padL - 8}" y="${y(f * FTE_M) + 4}" text-anchor="end">${f} FTE</text>`;
      const bars = lrows.map((r, i) => { let acc = 0; return P.map((p) => { const v = r.v[p.slug] || 0; if (!v) return ""; const y1 = y(acc + v), y0 = y(acc); acc += v; return `<rect x="${x(i) + 1.5}" y="${y1}" width="${Math.max(2, bw - 3)}" height="${Math.max(1, y0 - y1 - 1)}" fill="var(--p-${esc(p.tema)})"/>`; }).join(""); }).join("");
      const xl = lrows.map((r, i) => (r.dt.getMonth() % 3 === 0 ? `<text x="${x(i) + bw / 2}" y="${H - 10}" text-anchor="middle">${ym(r.dt)}</text>` : "")).join("");
      const hits = lrows.map((r, i) => `<rect class="hit" data-i="${i}" x="${x(i)}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>`).join("");
      $("#n-load").innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g class="grid axis">${g}</g><line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>${bars}<g class="axis">${xl}</g>${hits}</svg>`;
      $("#n-load-legend").innerHTML = P.map((p) => `<span><i style="background:var(--p-${esc(p.tema)})"></i>${esc(p.acronimo)}</span>`).join("") + `<span><i class="line" style="background:var(--g2)"></i>Persone a tempo pieno equivalenti (FTE)</span>`;
      const tip = $("#n-tip");
      document.querySelectorAll("#n-load .hit").forEach((h) => {
        h.addEventListener("mousemove", (e) => { const r = lrows[+h.dataset.i]; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - 230) + "px"; tip.style.top = e.clientY + 14 + "px";
          tip.innerHTML = `<b>${ym(r.dt)}</b>` + P.filter((p) => r.v[p.slug]).map((p) => `<div><span>${esc(p.acronimo)}</span><span>${num(r.v[p.slug])} h</span></div>`).join("") + `<div><span>Totale</span><span>${num(r.tot)} h · ${(r.tot / FTE_M).toLocaleString("it-IT", { maximumFractionDigits: 1 })} FTE</span></div>`; });
        h.addEventListener("mouseleave", () => (tip.hidden = true));
      });
    }

    // calendario timesheet / SAL
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const per = P.flatMap((p) => { const t0 = parse(p.data_inizio), D = p.durata_mesi || 24, n = (p.norema.personale || []).length;
      const tappe = [...I0.sal_mesi.map((m, i) => [`SAL ${i + 1}`, i ? I0.sal_mesi[i - 1] + 1 : 1, m]), ["Saldo", I0.sal_mesi.at(-1) + 1, D]];
      return tappe.map(([t, a, b]) => ({ p, t, a, b, dal: addM(t0, a - 1), al: addD(addM(t0, b), -1), entro: addM(t0, b), n })); }).sort((u, v) => u.entro - v.entro);
    const next = per.find((r) => r.entro >= oggi);
    $("#n-ts").innerHTML = `<thead><tr><th>Progetto</th><th>Erogazione</th><th>Periodo dei timesheet</th><th>Richiesta entro</th><th class="num">Persone</th></tr></thead><tbody>` +
      per.map((r) => `<tr class="${r === next ? "ev" : ""}"><td>${pill(r.p)}</td><td>${esc(r.t)}</td><td>M${r.a}–M${r.b} · ${d(r.dal)} – ${d(r.al)}</td><td>${d(r.entro)}${r === next ? ' <span class="b warn">prossima</span>' : ""}</td><td class="num">${r.n}</td></tr>`).join("") + `</tbody>`;
    $("#n-ts-regole").innerHTML = `<p><b>Cosa serve per le ore NOREMA</b></p><ul>
      <li>Un timesheet (Modello 11) per ciascun Dipendente, compreso l'eventuale Titolare Qualificato di PMI, relativo al periodo rendicontato: per ogni giorno le ore lavorate e le ore dedicate al progetto.</li>
      <li>Firme: Dipendente, Legale Rappresentante di NOREMA e coordinatore dell'attività (project manager della mandataria).</li>
      <li>Per le ore a costi standard (B.1.1): la busta paga dell'ultimo mese rendicontato, da cui risultino il rapporto di lavoro per tutto il periodo e un inquadramento coerente con il costo standard applicato.</li>
      <li>CV dei Dipendenti da individuare o sostituiti, da caricare in rendicontazione.</li>
      <li>Il forfait del 20% (B.4) non si rendiconta: è riconosciuto in proporzione al personale rendicontato.</li></ul>
      <p class="src">Fonti: Avviso, art. 4 (voci B.1 e B.4) e art. 9 (documentazione per SAL e saldo); Modulistica e istruzioni, Modello 11 – Timesheet. L'art. 9 dell'Avviso cita il «modello 9» per i timesheet del personale, mentre la modulistica dedica al timesheet il Modello 11: usare il Modello 11 caricato tra i modelli di rendicontazione. Le date sono calcolate dalla Data di Concessione in Ipotesi.</p>`;

    // ---------- Criticità
    const CR = X.criticita || [], LV = { alta: 0, media: 1, bassa: 2 }, ST = { aperta: 0, in_attesa: 1, risolta: 2 };
    const bySlug = Object.fromEntries(P.map((p) => [p.slug, p]));
    const aperte = CR.filter((c) => c.stato !== "risolta");
    $("#n-crit-count").textContent = aperte.length ? aperte.length : "";
    let cf = store.get("n_crit") || "aperte";
    const drawCrit = () => {
      document.querySelectorAll("#n-f-crit button").forEach((b) => b.classList.toggle("on", b.dataset.v === cf));
      const L = (cf === "tutte" ? CR : aperte).slice().sort((a, b) => (ST[a.stato] - ST[b.stato]) || (LV[a.livello] - LV[b.livello]));
      $("#n-crit").innerHTML = L.length ? L.map((c) => {
        const lv = c.stato === "risolta" ? `<span class="b ok">Risolta</span>` : c.stato === "in_attesa" ? `<span class="b">In attesa</span>` : `<span class="b ${c.livello === "alta" ? "risk" : c.livello === "media" ? "warn" : ""}">Priorità ${esc(c.livello)}</span>`;
        return `<div class="card ncrit lv-${esc(c.stato === "risolta" ? "ok" : c.livello)}"><div class="ncrit-h"><div class="t">${esc(c.titolo)}</div><div class="tags">${lv}<span class="b">${esc(c.area)}</span>${(c.progetti || []).map((s) => bySlug[s] ? pill(bySlug[s]) : "").join("")}</div></div>
          <p>${esc(c.descrizione)}</p>
          <dl><dt>Azione</dt><dd>${esc(c.azione)}</dd><dt>Chi</dt><dd>${esc(c.chi)}</dd><dt>Fonte</dt><dd class="src">${esc(c.fonte)}</dd></dl></div>`;
      }).join("") : `<div class="empty">Nessuna criticità aperta.</div>`;
    };
    document.querySelectorAll("#n-f-crit button").forEach((b) => b.addEventListener("click", () => { cf = b.dataset.v; store.set("n_crit", cf); drawCrit(); }));
    drawCrit();

    // ---------- Ipotesi
    $("#n-ipotesi").innerHTML = `<div class="nip">
      <p><b>Regole di erogazione</b> (Avviso STEP Lazio, art. 9; manuale GeCoWEB Plus, "Allegati generali – Fideiussione"):</p>
      <ul><li>Anticipo obbligatorio del ${Math.round(I.anticipo_pct * 100)}% del contributo, da richiedere entro ${I.anticipo_giorni} giorni dalla Data di Concessione, garantito da fideiussione pari al 44% del contributo (40% maggiorato del 10%).</li>
      <li>SAL obbligatori entro ${I.sal_mesi.join(" e ")} mesi dalla Data di Concessione (progetti fino a 10 milioni); con il 2° SAL vanno rendicontati costi pari almeno al 40% dei costi ammessi.</li>
      <li>Ogni SAL eroga il contributo sui costi rendicontati senza scomputare l'anticipo; anticipo e SAL insieme non superano l'${Math.round(I.tetto_pct * 100)}% del contributo.</li>
      <li>Saldo a fine progetto (${P[0].durata_mesi || 24} mesi), al netto di quanto già erogato.</li>
      <li>I pagamenti sono erogati al capofila, che li gira ai partner (indicazione della tutor del 02/11/2026, da prevedere nell'ATS).</li></ul>
      <p><b>Ipotesi di questa stima</b> (modificabili):</p>
      <ul><li>Data di Concessione: ${P.map((p) => `${esc(p.acronimo)} ${d(parse(p.data_inizio))}`).join(" · ")}. Da aggiornare all'arrivo del decreto di concessione.</li>
      <li>Ogni richiesta è presentata all'ultimo giorno utile; incasso di NOREMA dopo ${I.ritardo_li} giorni (Lazio Innova) + ${I.ritardo_capofila} giorni (trasferimento del capofila). I due valori si cambiano nella scheda Flusso di cassa.</li>
      <li>Uscite (vista "Costo reale", predefinita): ore di ciascuna persona × costo orario reale, cioè costo annuo ÷ ${PS ? PS.ore_annue.toLocaleString("it-IT") : "—"} ore. Chiara Mirabella: impiegata III livello CCNL Terziario. Lucia Ciampi (al posto di Valentina Caldarera): apprendista IV livello. Claudia Abatecola: compenso di amministratrice 2.000 €/mese. Figure da individuare: 30 €/h. Il forfait B.4 non genera uscite. Nella vista "Costo ammesso" le uscite sono pari al costo ammesso.</li>
      <li>Entrate: contributo (${Math.round(C / K * 100)}%) sul costo rendicontabile. Ore a costi standard: 30 €/h, fascia bassa. Apprendista: costo effettivo RAL/1.720, perché agli apprendisti non si applicano i costi standard (FAQ 18 luglio, n. 5). Più il forfait B.4. Il contributo atteso non supera quello concesso.</li>
      <li>Le uscite sono distribuite sui mesi dei work package in base alle ore di NOREMA per WP; dove le ore per WP non sono disponibili, sui WP di cui NOREMA è responsabile, con una quota costante di gestione.</li>
      <li><b>Da verificare:</b> le ore di Claudia Abatecola sono ammissibili solo come «Titolare Qualificato di PMI» (34,70 €/h figurativi, con dottorato o 4 anni di esperienza da ricercatrice) oppure con incarico tecnico deliberato dal CdA, e mai per l'amministratore unico (Avviso, Appendice 1, definizione di «Dipendente»). La vista "Costo reale" offre due scenari: 30 €/h (piano approvato) e 34,70 €/h come Titolare Qualificato (esperienza da tecnologo, CCNL Ricerca, da far confermare alla tutor; serve una variazione tramite il capofila).</li>
      ${EXT ? `<li>Prestazioni specialistiche esterne: ${eur0(EXT.importo)} distribuiti sui ${EXT.mesi_punta} mesi con le uscite più alte. Non sono nel piano dei costi di NOREMA: senza variazione non sono rendicontabili e non generano contributo.</li>` : ""}
      <li>Non sono considerati il premio della fideiussione, l'IVA e gli eventuali tempi di istruttoria aggiuntivi.</li></ul>
      <p class="src">Fonti: Avviso STEP Lazio (Det. G08307 del 30/06/2025) art. 9; piano dei costi approvato GeCoWEB Plus (22/10/2026); formulari presentati; dati di progetto della cabina di regia.</p></div>`;

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
