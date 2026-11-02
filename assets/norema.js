/* Pagina NOREMA — attività, budget e ipotesi di flusso di cassa (legge NOREMA/data.json generato da build.py) */
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
    const opw = (N.ore_per_wp || []).filter((x) => (x.costo || x.ore) && wpMesi[x.wp]);
    if (opw.length) {
      opw.forEach((x) => { const [a, b] = wpMesi[x.wp], peso = x.costo || x.ore, n = b - a + 1; for (let m = a; m <= b; m++) out[m - 1] += peso / n; });
    } else {
      const resp = (N.attivita || []).filter((a) => a.ruolo_norema === "responsabile" && wpMesi[a.wp]);
      if (resp.length) resp.forEach((a) => { const [x, y] = wpMesi[a.wp]; for (let m = x; m <= y; m++) out[m - 1] += 1; });
      for (let m = 0; m < D; m++) out[m] += resp.length ? 0.25 : 1; // quota di coordinamento/gestione distribuita su tutta la durata
    }
    const s = out.reduce((a, b) => a + b, 0) || 1;
    return out.map((v) => (v / s) * N.costo);
  }

  // Erogazioni secondo l'art. 9 dell'Avviso, per la quota NOREMA
  function erogazioni(p, I) {
    const N = p.norema, K = N.costo, C = N.contributo, D = p.durata_mesi || 24, t0 = parse(p.data_inizio), prof = profilo(p), r = C / K;
    const cumul = (a, b) => prof.slice(a, b).reduce((x, y) => x + y, 0);
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
    push("Saldo", addM(t0, D), C - erog, "contributo residuo a fronte di tutti i costi rendicontati");
    return { prof, ev, t0, D };
  }

  function render(X) {
    const P = X.progetti, I0 = X.ipotesi;
    $("#updated").textContent = "Aggiornato il " + new Date(X.aggiornato).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
    const K = P.reduce((a, p) => a + p.norema.costo, 0), C = P.reduce((a, p) => a + p.norema.contributo, 0);
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
    $("#n-budget-prog").innerHTML = P.map((p) => {
      const N = p.norema;
      const voci = (N.voci || []).map((v) => `<tr><td>${esc(v.voce)}${v.dettaglio ? `<div class="x" style="color:var(--muted);font-size:12px">${esc(v.dettaglio)}</div>` : ""}</td><td class="num">${eur(v.importo)}</td></tr>`).join("");
      const pers = (N.personale || []).map((x) => `<tr><td>${esc(x.nome)}${x.ruolo ? `<div style="color:var(--muted);font-size:12px">${esc(x.ruolo)}</div>` : ""}</td><td class="num">${x.ore ?? x.ore_totali ?? "—"}</td><td class="num">${x.costo_orario ? eur(x.costo_orario) : "—"}</td><td class="num">${eur(x.costo)}</td></tr>`).join("");
      const opw = (N.ore_per_wp || []).map((x) => `${esc(x.wp)} ${x.ore ?? "—"} h`).join(" · ");
      return `<div class="nbud card"><h3>${pill(p)} <span style="font-weight:400;color:var(--muted);font-size:13px">costo ${eur(N.costo)} · contributo ${eur(N.contributo)}</span></h3>
        <div class="grid2"><div><table><thead><tr><th>Voce di costo</th><th class="num">Importo</th></tr></thead><tbody>${voci || `<tr><td colspan="2" class="empty">Voci non disponibili</td></tr>`}</tbody></table></div>
        <div><table><thead><tr><th>Personale</th><th class="num">Ore</th><th class="num">€/h</th><th class="num">Costo</th></tr></thead><tbody>${pers || `<tr><td colspan="4" class="empty">Dettaglio non disponibile</td></tr>`}</tbody></table>
        ${opw ? `<div class="note">Ore per WP: ${opw}</div>` : ""}</div></div>
        ${N.note ? `<div class="note">${esc(N.note)}</div>` : ""}</div>`;
    }).join("");

    // ---------- Cassa
    let sel = store.get("n_prog") || "tutti";
    $("#n-f-prog").innerHTML = `<button data-v="tutti">Tutti i progetti</button>` + P.map((p) => `<button data-v="${esc(p.slug)}">${esc(p.acronimo)}</button>`).join("");
    $("#n-li").value = I.ritardo_li; $("#n-cf").value = I.ritardo_capofila;
    const draw = () => {
      document.querySelectorAll("#n-f-prog button").forEach((b) => b.classList.toggle("on", b.dataset.v === sel));
      const Ps = P.filter((p) => sel === "tutti" || p.slug === sel);
      const runs = Ps.map((p) => ({ p, ...erogazioni(p, I) }));
      // mesi di calendario
      const months = new Map();
      const add = (dt, k, v) => { const key = mKey(dt); if (!months.has(key)) months.set(key, { key, out: 0, inn: 0, ev: [] }); months.get(key)[k] += v; return months.get(key); };
      runs.forEach(({ p, prof, ev, t0 }) => {
        prof.forEach((v, i) => add(addM(t0, i), "out", v));
        ev.forEach((e) => add(e.inc, "inn", e.importo).ev.push(`${p.acronimo}: ${e.tipo}`));
      });
      const keys = [...months.keys()]; const k0 = Math.min(...keys), k1 = Math.max(...keys);
      const rows = []; let cum = 0;
      for (let k = k0; k <= k1; k++) { const m = months.get(k) || { out: 0, inn: 0, ev: [] }; cum += m.inn - m.out; rows.push({ k, dt: new Date(Math.floor(k / 12), k % 12, 1), out: m.out, inn: m.inn, cum, ev: m.ev }); }
      const minRow = rows.reduce((a, b) => (b.cum < a.cum ? b : a), rows[0]);
      const totK = Ps.reduce((a, p) => a + p.norema.costo, 0), totC = Ps.reduce((a, p) => a + p.norema.contributo, 0);
      $("#n-cassa-lead").innerHTML = `Uscite: costo ammesso NOREMA distribuito sui mesi dei work package. Entrate: anticipo, SAL e saldo per la quota NOREMA, incassati dopo ${I.ritardo_li} + ${I.ritardo_capofila} giorni dalla richiesta. <b>Massima esposizione di cassa: ${eur0(-Math.min(0, minRow.cum))}</b> (${ym(minRow.dt)}); a fine periodo resta a carico di NOREMA il cofinanziamento di ${eur0(totK - totC)}.`;

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
      $("#n-legend").innerHTML = `<span><i style="background:var(--c-in)"></i>Entrate (contributo incassato)</span><span><i style="background:var(--c-out)"></i>Uscite (costi NOREMA)</span><span><i class="line" style="background:var(--c-cum)"></i>Saldo di cassa cumulato</span>`;
      const tip = $("#n-tip");
      document.querySelectorAll("#n-chart .hit").forEach((h) => {
        h.addEventListener("mousemove", (e) => { const r = rows[+h.dataset.i]; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - 230) + "px"; tip.style.top = e.clientY + 14 + "px";
          tip.innerHTML = `<b>${ym(r.dt)}</b><div><span>Entrate</span><span>${eur0(r.inn)}</span></div><div><span>Uscite</span><span>${eur0(r.out)}</span></div><div><span>Cumulato</span><span>${eur0(r.cum)}</span></div>${r.ev.length ? `<div style="display:block;color:var(--muted);margin-top:4px">${r.ev.map(esc).join("<br>")}</div>` : ""}`; });
        h.addEventListener("mouseleave", () => (tip.hidden = true));
      });

      $("#n-erog").innerHTML = `<thead><tr><th>Progetto</th><th>Erogazione</th><th>Richiesta entro</th><th>Incasso stimato NOREMA</th><th class="num">Importo NOREMA</th><th>Note</th></tr></thead><tbody>` +
        runs.flatMap(({ p, ev }) => ev.map((e) => `<tr><td>${pill(p)}</td><td>${esc(e.tipo)}</td><td>${d(e.rich)}</td><td>${d(e.inc)}</td><td class="num">${eur(e.importo)}</td><td style="font-size:12.5px;color:var(--muted)">${esc(e.nota)}</td></tr>`)).join("") + `</tbody>`;
      $("#n-cassa").innerHTML = `<thead><tr><th>Mese</th><th class="num">Uscite</th><th class="num">Entrate</th><th class="num">Saldo del mese</th><th class="num">Cumulato</th><th>Eventi</th></tr></thead><tbody>` +
        rows.map((r) => `<tr class="${r.ev.length ? "ev" : ""}"><td>${ym(r.dt)}</td><td class="num">${eur0(r.out)}</td><td class="num">${r.inn ? eur0(r.inn) : "—"}</td><td class="num ${r.inn - r.out < 0 ? "neg" : ""}">${eur0(r.inn - r.out)}</td><td class="num ${r.cum < 0 ? "neg" : ""}">${eur0(r.cum)}</td><td style="font-size:12.5px">${r.ev.map(esc).join("; ")}</td></tr>`).join("") + `</tbody>`;

      // KPI
      const all3 = P.map((p) => ({ p, ...erogazioni(p, I) }));
      let mm = new Map(); all3.forEach(({ prof, ev, t0 }) => { prof.forEach((v, i) => { const k = mKey(addM(t0, i)); mm.set(k, (mm.get(k) || 0) - v); }); ev.forEach((e) => { const k = mKey(e.inc); mm.set(k, (mm.get(k) || 0) + e.importo); }); });
      let c2 = 0, worst = 0; [...mm.keys()].sort((a, b) => a - b).forEach((k) => { c2 += mm.get(k); worst = Math.min(worst, c2); });
      $("#kpis").innerHTML = [
        ["Progetti", P.length, "NOREMA partner"],
        ["Costo ammesso NOREMA", eur0(K), "totale tre progetti"],
        ["Contributo NOREMA", eur0(C), Math.round(C / K * 100) + "% del costo"],
        ["Cofinanziamento", eur0(K - C), "a carico di NOREMA"],
        ["Anticipi attesi", eur0(P.reduce((a, p) => a + I.anticipo_pct * p.norema.contributo, 0)), "40% del contributo, con fideiussione"],
        ["Max esposizione", eur0(-worst), "tre progetti insieme"],
      ].map(([l, v, n], i) => `<div class="kpi ${i === 5 ? "alert" : ""}"><div class="l">${l}</div><div class="v">${v}</div><div class="n">${esc(n)}</div></div>`).join("");
    };
    document.querySelectorAll("#n-f-prog button").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.v; store.set("n_prog", sel); draw(); }));
    [["#n-li", "ritardo_li", "n_li"], ["#n-cf", "ritardo_capofila", "n_cf"]].forEach(([id, k, sk]) => $(id).addEventListener("change", (e) => { I[k] = Math.max(0, +e.target.value || 0); store.set(sk, I[k]); draw(); }));
    draw();

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
      <li>Uscite: costo ammesso NOREMA (personale a costi standard + forfait 20%) distribuito sui mesi dei work package in base alle ore di NOREMA per WP; dove le ore per WP non sono disponibili, sui WP di cui NOREMA è responsabile con una quota costante di gestione. È una stima di pianificazione: i costi reali (stipendi, nuove assunzioni) possono differire dai costi standard.</li>
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
