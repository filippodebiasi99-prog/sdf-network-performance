(() => {
  const state = { config: null, overview: null, detail: null, analysis: null, campaigns: null, online: false };
  const originalOverviewPage = overviewPage;

  statusLabel.draft = "Bozza";

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(payload.error || `Errore HTTP ${response.status}`);
      error.details = payload.details;
      throw error;
    }
    return payload;
  }

  function campaignId() {
    return state.overview?.campaign?.id || state.config?.campaigns?.find((item) => item.status === "open")?.id || "campaign-2026-1";
  }

  function normalizeDealer(row) {
    return {
      ...row,
      status: row.status === "submitted" ? "complete" : row.status,
      completion: Number(row.completion || 0),
      quality: Number(row.quality || 0),
      sent: row.submitted_at ? new Intl.DateTimeFormat("it-IT", { day:"2-digit",month:"short",year:"numeric" }).format(new Date(row.submitted_at)) : "—"
    };
  }

  function formatValue(value, kpi) {
    if (value === null || value === undefined) return "—";
    const number = Number(value);
    if (kpi.kind === "currency") return `€ ${number.toLocaleString("it-IT", { maximumFractionDigits:2 })} M`;
    if (kpi.kind === "percentage") return `${number.toLocaleString("it-IT", { maximumFractionDigits:1 })}%`;
    if (kpi.kind === "score") return `${number.toLocaleString("it-IT", { maximumFractionDigits:1 })} / 10`;
    if (kpi.kind === "hours") return `${number.toLocaleString("it-IT", { maximumFractionDigits:1 })} h`;
    return `${number.toLocaleString("it-IT", { maximumFractionDigits:1 })} ${kpi.unit || ""}`.trim();
  }

  function portalAreaStatus() {
    const areas = state.overview?.areas || [];
    return `<div class="stack-list">${areas.map((area) => {
      const complete = area.total ? Math.round(area.completed / area.total * 100) : 0;
      const verify = area.total ? Math.round(area.verify / area.total * 100) : 0;
      const missing = 100 - complete - verify;
      return `<div><div class="stack-row-head"><strong>${area.area}</strong><span>${area.completed + area.verify}/${area.total} · ${complete + verify}%</span></div><div class="stack-bar"><span class="complete" style="width:${complete}%"></span><span class="verify" style="width:${verify}%"></span><span class="missing" style="width:${missing}%"></span></div></div>`;
    }).join("")}</div><div class="status-legend"><span><i style="background:var(--accent)"></i>Completato</span><span><i style="background:#f3a25d"></i>Da verificare</span><span><i style="background:var(--gray-75)"></i>Non compilato</span></div>`;
  }

  function portalSubmissionChart() {
    const timeline = state.overview?.timeline || [];
    const maximum = Math.max(state.overview?.totals?.dealers || 1, ...timeline.map((item) => item.value));
    const points = timeline.length ? timeline : [{ day:state.overview.campaign.open_date,value:0 }];
    const coordinates = points.map((item,index) => {
      const x = points.length === 1 ? 40 : 40 + index / (points.length - 1) * 640;
      const y = 200 - item.value / maximum * 176;
      return [x,y];
    });
    const line = coordinates.map((point,index) => `${index ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ");
    const area = `${line} L${coordinates.at(-1)[0].toFixed(1)} 200 L40 200Z`;
    const start = new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short"}).format(new Date(state.overview.campaign.open_date));
    const end = new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short"}).format(new Date(state.overview.campaign.close_date));
    return `<svg class="line-chart" viewBox="0 0 700 222" role="img" aria-label="Andamento cumulativo delle compilazioni fino a ${state.overview.totals.received} invii."><defs><linearGradient id="liveChartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d7cff" stop-opacity=".2"/><stop offset="1" stop-color="#5d7cff" stop-opacity="0"/></linearGradient></defs><path class="chart-grid-line" d="M40 24H680M40 68H680M40 112H680M40 156H680M40 200H680"/><text class="chart-label" x="10" y="203">0</text><text class="chart-label" x="5" y="159">${Math.round(maximum*.25)}</text><text class="chart-label" x="5" y="115">${Math.round(maximum*.5)}</text><text class="chart-label" x="5" y="71">${Math.round(maximum*.75)}</text><text class="chart-label" x="5" y="27">${maximum}</text><path d="${area}" fill="url(#liveChartGradient)"/><path class="chart-line" d="${line}"/>${coordinates.map((point) => `<circle class="chart-dot" cx="${point[0]}" cy="${point[1]}" r="3"/>`).join("")}<text class="chart-label" x="40" y="218">${start}</text><text class="chart-label" x="640" y="218">${end}</text></svg>`;
  }

  function syncShell() {
    if (!state.overview) return;
    const card = document.querySelector(".campaign-card");
    if (!card) return;
    card.querySelector("strong").textContent = state.overview.campaign.name;
    card.querySelector(".campaign-progress span").style.width = `${state.overview.totals.completion}%`;
    card.querySelector("small").textContent = `${state.overview.totals.received} di ${state.overview.totals.dealers} concessionari`;
  }

  function portalOverviewPage() {
    if (!state.online || !state.overview) return originalOverviewPage();
    const { campaign, totals, recent, alerts } = state.overview;
    return `<section class="page" aria-labelledby="page-title">
      ${pageHeader({ eyebrow:"Monitoraggio rete", title:'<span id="page-title">Overview</span>', subtitle:"Stato della raccolta dati e principali indicatori della rete.", actions:`<select class="select-compact" aria-label="Seleziona rilevazione">${state.config.campaigns.map((item) => `<option value="${item.id}" ${item.id === campaign.id ? "selected" : ""}>${item.name}</option>`).join("")}</select><button class="button primary" data-export-csv>${icon("download")}Esporta report</button>` })}
      <div class="metrics" aria-label="Indicatori principali">
        <article class="metric"><div class="metric-head"><span>Concessionari totali</span><span class="metric-icon">${icon("users")}</span></div><div class="metric-value">${totals.dealers}</div><div class="metric-foot">${state.overview.areas.length} aree geografiche</div></article>
        <article class="metric"><div class="metric-head"><span>Compilazioni ricevute</span><span class="metric-icon">${icon("check")}</span></div><div class="metric-value">${totals.received}</div><div class="metric-foot"><span class="trend-up">${totals.completed}</span> validate</div></article>
        <article class="metric"><div class="metric-head"><span>Completamento</span><span class="metric-icon">${icon("analysis")}</span></div><div class="metric-value">${totals.completion}%</div><div class="metric-foot">Campagna in corso</div></article>
        <article class="metric"><div class="metric-head"><span>Compilazioni mancanti</span><span class="metric-icon warn">${icon("clock")}</span></div><div class="metric-value">${totals.missing}</div><div class="metric-foot">Chiusura ${new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short"}).format(new Date(campaign.close_date))}</div></article>
        <article class="metric"><div class="metric-head"><span>Dati da verificare</span><span class="metric-icon warn">${icon("alert")}</span></div><div class="metric-value">${totals.verify}</div><div class="metric-foot">Controllo operativo JET</div></article>
      </div>
      <div class="content-grid"><article class="panel"><div class="panel-header"><div><h2>Andamento delle compilazioni</h2><p>Invii cumulativi della campagna corrente</p></div><div class="chart-legend"><span class="legend-item"><i class="legend-line"></i>${campaign.year}</span></div></div><div class="panel-body">${portalSubmissionChart()}</div></article><article class="panel"><div class="panel-header"><div><h2>Stato per area</h2><p>Distribuzione delle rilevazioni</p></div><button class="text-button" data-page-link="dealers">Vedi rete →</button></div><div class="panel-body">${portalAreaStatus()}</div></article></div>
      <div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Ultime compilazioni ricevute</h2><p>Aggiornamenti più recenti della rete</p></div><button class="text-button" data-page-link="dealers">Tutte →</button></div><div class="panel-body"><ul class="activity-list">${recent.map((item,index) => `<li class="activity-item"><span class="initials">${item.initials}</span><span><strong>${item.name}</strong><small>${item.region} · ${item.id}</small></span><time class="activity-time">${index === 0 ? "Più recente" : "Inviata"}</time></li>`).join("")}</ul></div></article><article class="panel"><div class="panel-header"><div><h2>Richiedono attenzione</h2><p>Bozze, anomalie e rilevazioni mancanti</p></div><button class="text-button" data-page-link="dealers">Gestisci →</button></div><div class="panel-body"><ul class="alert-list">${alerts.slice(0,4).map((item) => `<li class="alert-item"><span class="alert-symbol">${icon(item.status === "missing" ? "clock" : "alert")}</span><span><strong>${item.name}</strong><small>${item.status === "missing" ? "Rilevazione non ricevuta" : "Dati da verificare"}</small></span>${statusBadge(item.status === "submitted" ? "complete" : item.status)}</li>`).join("")}</ul></div></article></div>
    </section>`;
  }

  function portalDealersPage() {
    const totals = state.overview.totals;
    return `<section class="page" aria-labelledby="page-title">${pageHeader({ eyebrow:"Anagrafica e avanzamento",title:'<span id="page-title">Concessionari</span>',subtitle:"Monitora lo stato delle rilevazioni e apri il link di compilazione.",actions:`<input id="dealer-import-file" type="file" accept=".csv,text/csv" hidden><button class="button" id="import-dealers">Importa CSV</button><button class="button" id="prepare-reminders">${icon("bell")}Prepara reminder</button><button class="button primary" data-export-csv>${icon("download")}Esporta dati</button>` })}<div class="summary-strip"><div class="summary-cell"><span>Rete totale</span><strong>${totals.dealers} dealer</strong></div><div class="summary-cell"><span>Completati</span><strong>${totals.completed}</strong></div><div class="summary-cell"><span>Da verificare</span><strong>${totals.verify}</strong></div><div class="summary-cell"><span>Non compilati</span><strong>${totals.missing}</strong></div></div><div class="panel" style="margin-top:18px"><div class="filters"><div class="search-field">${icon("search")}<input id="dealer-search" type="search" placeholder="Cerca concessionario o Dealer ID" aria-label="Cerca concessionario" /></div><select id="region-filter" class="filter-select" aria-label="Filtra per regione"><option value="">Tutte le regioni</option>${[...new Set(dealers.map((item)=>item.region))].map((value)=>`<option>${value}</option>`).join("")}</select><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="">Tutti gli stati</option><option value="complete">Completato</option><option value="draft">Bozza</option><option value="verify">Da verificare</option><option value="missing">Non compilato</option></select><button class="button" id="reset-filters">${icon("filter")}Azzera</button></div><div id="dealer-results">${dealerResults(dealers)}</div></div></section>`;
  }

  function portalDealerDetailPage() {
    const data = state.detail;
    const dealer = normalizeDealer({ ...data.dealer, status:data.submission.status,quality:data.submission.quality_score,submitted_at:data.submission.submitted_at });
    const filled = data.values.filter((item) => item.value !== null).length;
    return `<section class="page" aria-labelledby="page-title"><div class="breadcrumbs"><button data-page-link="dealers">Concessionari</button><span>/</span><span>${dealer.name}</span></div><header class="page-header"><div class="dealer-hero"><div class="dealer-logo">${dealer.initials}</div><div><p class="eyebrow">Scheda concessionario</p><h1 id="page-title">${dealer.name}</h1><div class="dealer-meta"><span>${icon("location")}${dealer.region}</span><span>${icon("users")}${dealer.manager}</span><span>${dealer.id}</span></div></div></div><div class="header-actions"><a class="button" href="${data.surveyUrl}">Apri compilazione</a><button class="button" id="add-note">Aggiungi nota</button><button class="button primary" data-export-csv>${icon("download")}Esporta rete</button></div></header><div class="summary-strip"><div class="summary-cell"><span>Stato rilevazione</span><strong>${statusBadge(dealer.status)}</strong></div><div class="summary-cell"><span>Ultimo invio</span><strong>${dealer.sent}</strong></div><div class="summary-cell"><span>Qualità dati</span><strong>${dealer.quality || 0}%</strong></div><div class="summary-cell"><span>KPI compilati</span><strong>${filled} / ${data.values.length}</strong></div></div><div class="comparison-metrics">${data.values.slice(0,4).map((item) => `<article class="comparison-card"><span>${item.name}</span><strong>${formatValue(item.value,item)}</strong><small>Media rete: ${formatValue(item.network_avg,item)}</small></article>`).join("")}</div><div class="panel"><div class="panel-header"><div><h2>Performance KPI</h2><p>Valori reali salvati per ${data.campaign.name}</p></div><button class="text-button" data-page-link="analysis">Apri analisi completa →</button></div><div class="table-wrap"><table><thead><tr><th>KPI</th><th>Valore dealer</th><th>Media rete</th><th>Rilevazione precedente</th><th>Scostamento</th></tr></thead><tbody>${data.values.map((item) => { const delta=item.value!==null&&item.previous_value?((item.value-item.previous_value)/Math.abs(item.previous_value)*100):null; return `<tr><td class="kpi-name">${item.name}</td><td><strong>${formatValue(item.value,item)}</strong></td><td>${formatValue(item.network_avg,item)}</td><td>${formatValue(item.previous_value,item)}</td><td class="delta ${delta>=0?"positive":"negative"}">${delta===null?"—":`${delta>=0?"+":""}${delta.toFixed(1).replace(".",",")}%`}</td></tr>`; }).join("")}</tbody></table></div></div><div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Storico operativo</h2><p>Attività collegate alla rilevazione</p></div></div><div class="panel-body"><ul class="activity-list"><li class="activity-item"><span class="initials">${dealer.initials}</span><span><strong>${dealer.status === "missing" ? "In attesa di compilazione" : "Rilevazione aggiornata"}</strong><small>${dealer.sent}</small></span></li></ul></div></article><article class="panel"><div class="panel-header"><div><h2>Note JET</h2><p>Annotazioni interne</p></div></div><div class="panel-body"><ul class="activity-list">${data.notes.length ? data.notes.map((note) => `<li class="activity-item"><span class="initials">${note.author.split(" ").map((p)=>p[0]).join("").slice(0,2)}</span><span><strong>${note.body}</strong><small>${note.author}</small></span></li>`).join("") : "<li class='activity-item'><span>Nessuna nota presente.</span></li>"}</ul></div></article></div></section>`;
  }

  function portalAnalysisPage() {
    const data = state.analysis;
    const max = Math.max(...data.regions.map((item) => item.average),1);
    return `<section class="page" aria-labelledby="page-title">${pageHeader({ eyebrow:"Benchmark e distribuzioni",title:'<span id="page-title">Analisi KPI</span>',subtitle:"Esplora performance e differenze territoriali sui dati inviati.",actions:`<button class="button primary" data-export-csv>${icon("download")}Esporta vista</button>` })}<div class="analysis-layout"><aside class="panel analysis-sidebar" aria-label="Filtri analisi"><div class="field"><label for="kpi-select">KPI analizzato</label><select id="kpi-select">${state.config.kpis.map((item) => `<option value="${item.id}" ${item.id===data.kpi.id?"selected":""}>${item.name}</option>`).join("")}</select></div><div class="field"><label>Campagna</label><select id="analysis-campaign">${state.config.campaigns.map((item)=>`<option value="${item.id}" ${item.id===data.campaign.id?"selected":""}>${item.name}</option>`).join("")}</select></div><button class="button primary" id="apply-analysis">Applica filtri</button></aside><div><article class="panel"><div class="panel-header"><div><h2>${data.kpi.name}: sintesi rete</h2><p>${data.stats.count} rilevazioni valide · ${data.kpi.unit}</p></div><span class="badge complete">Dati aggiornati</span></div><div class="analysis-summary"><div class="analysis-stat"><span>Media nazionale</span><strong>${formatValue(data.stats.average,data.kpi)}</strong></div><div class="analysis-stat"><span>Mediana</span><strong>${formatValue(data.stats.median,data.kpi)}</strong></div><div class="analysis-stat"><span>Minimo</span><strong>${formatValue(data.stats.min,data.kpi)}</strong></div><div class="analysis-stat"><span>Massimo</span><strong>${formatValue(data.stats.max,data.kpi)}</strong></div></div><div class="panel-body"><h3>Confronto per regione</h3><div class="bar-chart">${data.regions.map((item,index) => `<div class="bar-row"><span>${item.region}</span><div class="bar-track"><span class="${index===0?"accent":""}" style="width:${item.average/max*100}%"></span></div><strong>${Number(item.average).toLocaleString("it-IT",{maximumFractionDigits:1})}</strong></div>`).join("")}</div></div></article><div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Andamento nel tempo</h2><p>Confronto con la rilevazione precedente</p></div></div><div class="panel-body">${submissionChart()}</div></article><article class="panel"><div class="panel-header"><div><h2>Top concessionari</h2><p>Ordinati per ${data.kpi.name.toLowerCase()}</p></div></div><div class="panel-body"><ol class="ranking-list">${data.ranking.slice(0,5).map((item,index) => `<li class="ranking-item"><span class="ranking-number">${String(index+1).padStart(2,"0")}</span><span><strong>${item.name}</strong><small>${item.region}</small></span><span class="ranking-value">${formatValue(item.value,data.kpi)}</span></li>`).join("")}</ol></div></article></div></div></div></section>`;
  }

  function surveyPage(data) {
    const locked = data.submission.status === "submitted";
    return `<section class="survey-page page" aria-labelledby="survey-title"><header class="survey-hero"><div><p class="eyebrow">Area concessionario</p><h1 id="survey-title">${data.campaign.name}</h1><p>${data.dealer.name} · ${data.dealer.id}</p></div>${statusBadge(data.submission.status === "submitted" ? "complete" : data.submission.status)}</header><form id="survey-form" class="survey-layout" novalidate><div class="survey-fields panel"><div class="panel-header"><div><h2>Dati della rilevazione</h2><p>Compila tutti i valori richiesti. Puoi salvare una bozza e continuare in seguito.</p></div></div><div class="survey-grid">${data.kpis.map((kpi) => `<div class="survey-field"><label for="field-${kpi.id}">${kpi.name}${kpi.required?" *":""}</label><p>${kpi.description}</p><div class="input-with-unit"><input id="field-${kpi.id}" name="${kpi.id}" type="number" step="any" min="${kpi.min_value ?? ""}" max="${kpi.max_value ?? ""}" value="${data.values[kpi.id]?.value ?? ""}" ${locked?"disabled":""} /><span>${kpi.unit}</span></div><small class="field-error" data-error-for="${kpi.id}"></small></div>`).join("")}</div></div><aside class="survey-summary panel"><h2>Riepilogo</h2><dl><div><dt>Concessionario</dt><dd>${data.dealer.name}</dd></div><div><dt>Scadenza</dt><dd>${new Intl.DateTimeFormat("it-IT").format(new Date(data.campaign.close_date))}</dd></div><div><dt>Stato</dt><dd>${statusLabel[data.submission.status] || data.submission.status}</dd></div></dl>${locked?"<p class='survey-confirmation'>Rilevazione inviata. Per modifiche contatta JET.</p>":`<button class="button" type="button" id="save-draft">Salva bozza</button><button class="button primary" type="submit">Conferma e invia</button><p class="survey-help">L’invio aggiornerà immediatamente la dashboard.</p>`}</aside></form></section>`;
  }

  function campaignsPage() {
    return `<section class="page" aria-labelledby="page-title">${pageHeader({eyebrow:"Gestione raccolta",title:'<span id="page-title">Rilevazioni</span>',subtitle:"Campagne annuali, finestre di compilazione e stato della rete."})}<div class="campaign-list">${state.campaigns.campaigns.map((item) => `<article class="campaign-row panel"><div><span class="badge ${item.status === "open" ? "complete" : "missing"}">${item.status === "open" ? "Aperta" : "Chiusa"}</span><h2>${item.name}</h2><p>${new Intl.DateTimeFormat("it-IT").format(new Date(item.open_date))} — ${new Intl.DateTimeFormat("it-IT").format(new Date(item.close_date))}</p></div><div class="campaign-kpis"><span><strong>${item.progress.received}/${item.progress.dealers}</strong> ricevute</span><span><strong>${item.progress.completion}%</strong> completamento</span></div><button class="button" data-campaign-id="${item.id}">Apri dashboard</button></article>`).join("")}</div></section>`;
  }

  function reportsPage() {
    return `<section class="page" aria-labelledby="page-title">${pageHeader({eyebrow:"Export e condivisione",title:'<span id="page-title">Report</span>',subtitle:"Scarica dati aggregati e valori KPI della campagna corrente."})}<div class="report-grid"><article class="panel report-card"><span class="empty-icon">${icon("reports")}</span><h2>Dataset completo rete</h2><p>CSV con anagrafica dealer, stato della rilevazione, qualità e tutti i KPI.</p><button class="button primary" data-export-csv>${icon("download")}Scarica CSV</button></article><article class="panel report-card"><span class="empty-icon">${icon("dealers")}</span><h2>Importazione concessionari</h2><p>Scarica il tracciato richiesto, compilalo in Excel e importalo dalla pagina Concessionari.</p><a class="button" href="/api/dealers/template.csv">${icon("download")}Scarica template CSV</a></article></div></section>`;
  }

  function loadingPage() {
    return `<section class="page"><div class="loading-state" aria-busy="true"><span></span><strong>Caricamento dati…</strong></div></section>`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], value = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value.trim()); value = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else value += char;
    }
    if (value || row.length) { row.push(value.trim()); rows.push(row); }
    if (rows.length < 2) throw new Error("Il CSV non contiene righe dati");
    const headers = rows.shift().map((header) => header.replace(/^\ufeff/, "").trim().toLowerCase());
    const required = ["dealer_id","name","region","area","manager"];
    if (required.some((header) => !headers.includes(header))) throw new Error(`Intestazioni richieste: ${required.join(", ")}`);
    return rows.map((cells) => Object.fromEntries(headers.map((header,index) => [header,cells[index] || ""])));
  }

  async function portalRenderPage(page, options = {}) {
    currentPage = page;
    document.body.classList.toggle("survey-mode", page === "survey");
    main.innerHTML = loadingPage();
    try {
      if (!state.config) state.config = await api("/api/config");
      state.online = true;
      if (!state.overview) state.overview = await api(`/api/overview?campaignId=${campaignId()}`);
      if (page === "overview") main.innerHTML = portalOverviewPage();
      if (page === "dealers") {
        const payload = await api(`/api/dealers?campaignId=${campaignId()}`);
        dealers.splice(0,dealers.length,...payload.dealers.map(normalizeDealer));
        main.innerHTML = portalDealersPage();
      }
      if (page === "dealer") {
        const id = options.dealer?.id || selectedDealer?.id || dealers[0]?.id;
        state.detail = await api(`/api/dealers/${encodeURIComponent(id)}?campaignId=${campaignId()}`);
        main.innerHTML = portalDealerDetailPage();
      }
      if (page === "analysis") {
        const params = new URLSearchParams({ campaignId:options.campaignId || campaignId(), kpiId:options.kpiId || state.analysis?.kpi?.id || state.config.kpis[0].id });
        state.analysis = await api(`/api/analysis?${params}`);
        main.innerHTML = portalAnalysisPage();
      }
      if (page === "surveys") { state.campaigns = await api("/api/campaigns"); main.innerHTML = campaignsPage(); }
      if (page === "reports") main.innerHTML = reportsPage();
      if (page === "survey") {
        const token = options.token || new URLSearchParams(location.search).get("token");
        const data = await api(`/api/survey/${encodeURIComponent(token)}`);
        main.innerHTML = surveyPage(data);
      }
    } catch (error) {
      state.online = false;
      main.innerHTML = `<section class="page"><div class="panel empty-preview"><div><span class="empty-icon">${icon("alert")}</span><h2>Servizio dati non disponibile</h2><p>${error.message}. Avvia il portale con <code>npm start</code> invece di aprire direttamente index.html.</p></div></div></section>`;
    }
    hydrateIcons(main);
    syncShell();
    bindPageEvents();
    bindFunctionalEvents();
    updateNavigation(page === "dealer" ? "dealers" : page === "survey" ? "" : page);
    document.querySelector("#mobile-page-title").textContent = ({overview:"Overview",dealers:"Concessionari",dealer:"Dettaglio concessionario",analysis:"Analisi KPI",surveys:"Rilevazioni",reports:"Report",survey:"Compilazione KPI"})[page] || "Portale KPI";
    window.scrollTo({top:0,behavior:"instant"});
  }

  function bindFunctionalEvents() {
    main.querySelectorAll("[data-export-csv]").forEach((button) => button.addEventListener("click", () => { location.href = `/api/reports/csv?campaignId=${campaignId()}`; }));
    const campaignSelect = main.querySelector(".page:has(.metrics) .select-compact");
    if (campaignSelect) campaignSelect.addEventListener("change", async () => { state.overview = await api(`/api/overview?campaignId=${campaignSelect.value}`); await portalRenderPage("overview"); });
    const applyAnalysis = main.querySelector("#apply-analysis");
    if (applyAnalysis) applyAnalysis.addEventListener("click", () => portalRenderPage("analysis",{kpiId:main.querySelector("#kpi-select").value,campaignId:main.querySelector("#analysis-campaign").value}));
    const addNote = main.querySelector("#add-note");
    if (addNote) addNote.addEventListener("click", async () => {
      const body = prompt("Scrivi una nota interna JET:");
      if (!body) return;
      await api(`/api/dealers/${state.detail.dealer.id}/notes`,{method:"POST",body:JSON.stringify({body,author:"Luca Bianchi"})});
      showToast("Nota salvata.");
      await portalRenderPage("dealer",{dealer:state.detail.dealer});
    });
    main.querySelectorAll("[data-campaign-id]").forEach((button) => button.addEventListener("click", async () => { state.overview=await api(`/api/overview?campaignId=${button.dataset.campaignId}`); portalRenderPage("overview"); }));
    const remindersButton = main.querySelector("#prepare-reminders");
    if (remindersButton) remindersButton.addEventListener("click", async () => {
      try {
        const result = await api("/api/reminders/prepare",{method:"POST",body:JSON.stringify({campaignId:campaignId()})});
        showToast(result.count ? `${result.count} reminder preparati per dealer non compilati o in bozza.` : "Nessun reminder da preparare.");
      } catch (error) { showToast(error.message); }
    });
    const importButton = main.querySelector("#import-dealers");
    const importInput = main.querySelector("#dealer-import-file");
    if (importButton && importInput) {
      importButton.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        try {
          const imported = parseCsv(await file.text());
          const result = await api("/api/dealers/import",{method:"POST",body:JSON.stringify({dealers:imported})});
          state.overview = await api(`/api/overview?campaignId=${campaignId()}`);
          showToast(`${result.count} concessionari importati.`);
          await portalRenderPage("dealers");
        } catch (error) { showToast(error.message); }
      });
    }
    const form = main.querySelector("#survey-form");
    if (form) {
      const submitSurvey = async (mode) => {
        const token = new URLSearchParams(location.search).get("token");
        const values = Object.fromEntries(new FormData(form).entries());
        main.querySelectorAll(".field-error").forEach((item) => item.textContent="");
        try {
          await api(`/api/survey/${encodeURIComponent(token)}/${mode}`,{method:mode === "draft" ? "PUT" : "POST",body:JSON.stringify({values})});
          state.overview = null;
          showToast(mode === "draft" ? "Bozza salvata." : "Rilevazione inviata correttamente.");
          await portalRenderPage("survey",{token});
        } catch (error) {
          if (error.details) Object.entries(error.details).forEach(([id,message]) => { const target=main.querySelector(`[data-error-for="${id}"]`); if(target) target.textContent=message; });
          showToast(error.message);
        }
      };
      form.addEventListener("submit", (event) => { event.preventDefault(); submitSurvey("submit"); });
      main.querySelector("#save-draft")?.addEventListener("click", () => submitSurvey("draft"));
    }
  }

  overviewPage = portalOverviewPage;
  dealersPage = portalDealersPage;
  dealerDetailPage = portalDealerDetailPage;
  analysisPage = portalAnalysisPage;
  renderPage = portalRenderPage;

  const params = new URLSearchParams(location.search);
  const requested = params.get("page");
  if (requested === "survey") portalRenderPage("survey",{token:params.get("token")});
  else if (requested === "dealer") portalRenderPage("dealer",{dealer:{id:params.get("dealer") || "IT-0018"}});
  else portalRenderPage(["overview","dealers","analysis","surveys","reports"].includes(requested) ? requested : "overview");
})();
