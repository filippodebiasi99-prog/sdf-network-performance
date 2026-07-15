(() => {
  const state = { config: null, overview: null, detail: null, analysis: null, campaigns: null, collection: null, collectionToken: null, online: false, poller: null, role:localStorage.getItem("sdf-demo-role") === "SDF" ? "SDF" : "JET", autosaveTimer:null };
  const originalOverviewPage = overviewPage;

  statusLabel.draft = "Bozza";
  Object.assign(statusLabel,{ NOT_STARTED:"Non iniziato",DRAFT:"Bozza",SUBMITTED:"Inviato",NEEDS_REVIEW:"Da verificare",VALIDATED:"Validato",REOPENED:"Riaperto" });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g,(character) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[character]);
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("it-IT",withTime ? { dateStyle:"medium",timeStyle:"short" } : { dateStyle:"medium" }).format(new Date(value));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", "x-demo-role":state.role, ...(options.headers || {}) }
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
    if (!Number.isFinite(number)) return "Non calcolabile";
    if (kpi.kind === "currency") return `€ ${number.toLocaleString("it-IT", { maximumFractionDigits:kpi.decimals ?? 2 })}`;
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

  function syncRoleUi(publicPage=false) {
    const control=document.querySelector("#demo-role-control");
    if (control) control.hidden=publicPage || state.config?.demo?.viewSwitcher === false;
    document.body.classList.toggle("role-sdf",state.role === "SDF");
    const select=document.querySelector("#demo-role-select"); if(select) select.value=state.role;
    const roleLabel=document.querySelector(".topbar-user small"); if(roleLabel) roleLabel.textContent=state.role === "SDF" ? "SDF · Sola lettura" : "JET Admin";
    const sidebarRole=document.querySelector(".user-card small"); if(sidebarRole) sidebarRole.textContent=state.role === "SDF" ? "SDF · Sola lettura" : "JET · Amministratore";
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
    const jetActions=state.role === "JET" ? `<input id="dealer-import-file" type="file" accept=".csv,text/csv" hidden><button class="button" id="import-dealers">Importa anagrafica concessionari</button>${state.config.jotform.enabled?'<button class="button" id="sync-jotform">Sincronizza da Jotform</button>':''}<button class="button" id="prepare-reminders">${icon("bell")}Prepara reminder</button>` : "";
    return `<section class="page" aria-labelledby="page-title">${pageHeader({ eyebrow:"Anagrafica e avanzamento",title:'<span id="page-title">Concessionari</span>',subtitle:"Monitora stato e avanzamento della campagna selezionata.",actions:`${jetActions}<button class="button primary" data-export-csv>${icon("download")}Esporta dati</button>` })}<div class="summary-strip"><div class="summary-cell"><span>Rete totale</span><strong>${totals.dealers} dealer</strong></div><div class="summary-cell"><span>Inviati</span><strong>${totals.submitted}</strong></div><div class="summary-cell"><span>Bozze</span><strong>${totals.drafts}</strong></div><div class="summary-cell"><span>Da verificare</span><strong>${totals.verify}</strong></div><div class="summary-cell"><span>Validati</span><strong>${totals.validated}</strong></div></div><div class="panel" style="margin-top:18px"><div class="filters"><div class="search-field">${icon("search")}<input id="dealer-search" type="search" placeholder="Cerca concessionario o Dealer ID" aria-label="Cerca concessionario" /></div><select id="region-filter" class="filter-select" aria-label="Filtra per regione"><option value="">Tutte le regioni</option>${[...new Set(dealers.map((item)=>item.region))].map((value)=>`<option>${value}</option>`).join("")}</select><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="">Tutti gli stati</option><option value="complete">Completato</option><option value="draft">Bozza</option><option value="verify">Da verificare</option><option value="missing">Non compilato</option></select><button class="button" id="reset-filters">${icon("filter")}Azzera</button></div><div id="dealer-results">${portalDealerResults(dealers)}</div></div><dialog id="qr-dialog" class="qr-dialog"><button class="qr-close" aria-label="Chiudi">×</button><div id="qr-dialog-content"></div></dialog></section>`;
  }

  function portalDealerResults(list) {
    return `<div class="table-wrap"><table><thead><tr><th>Concessionario</th><th>Campagna</th><th>Stato</th><th>Ultimo invio</th><th>Azioni</th></tr></thead><tbody>${list.map((dealer) => `<tr><td><button class="dealer-link" data-dealer-id="${escapeHtml(dealer.id)}">${escapeHtml(dealer.name)}<span class="dealer-id">${escapeHtml(dealer.id)} · ${escapeHtml(dealer.region)}</span></button></td><td>${escapeHtml(state.overview.campaign.name)}</td><td>${statusBadge(dealer.status)}</td><td>${formatDate(dealer.submitted_at,true)}</td><td><div class="row-actions">${state.role === "JET"?`<button class="button compact" data-copy-link="${escapeHtml(dealer.id)}">Copia link</button><button class="button compact" data-show-qr="${escapeHtml(dealer.id)}">QR</button>`:""}<button class="row-action" data-dealer-id="${escapeHtml(dealer.id)}" aria-label="Apri ${escapeHtml(dealer.name)}">${icon("chevron")}</button></div></td></tr>`).join("")}</tbody></table></div><div class="pagination"><span>${list.length} concessionari</span><span>Campagna: ${escapeHtml(state.overview.campaign.name)}</span></div>`;
  }

  function portalDealerDetailPage() {
    const data = state.detail;
    const dealer = normalizeDealer({ ...data.dealer, status:data.submission.status,quality:data.submission.quality_score,submitted_at:data.submission.submitted_at });
    const filled = data.values.filter((item) => item.value !== null).length;
    const link = data.collectionLink;
    const jet=state.role === "JET";
    const collectionAdmin=jet&&link?`<article class="panel collection-admin-panel"><div class="panel-header"><div><h2>Raccolta dati</h2><p>Link univoco per ${escapeHtml(data.campaign.name)}</p></div><span class="badge ${link.status === "ACTIVE" ? "complete" : "missing"}">${link.status === "ACTIVE" ? "Link attivo" : "Revocato"}</span></div><div class="collection-admin-grid"><div><span>Link compilazione</span><div class="copy-field"><code>${escapeHtml(link.url)}</code><button class="button compact" id="copy-collection-link">Copia</button></div><dl class="technical-list"><div><dt>Ultima apertura</dt><dd>${formatDate(link.last_opened_at,true)}</dd></div><div><dt>Aperture</dt><dd>${link.opened_count}</dd></div><div><dt>Ultimo invio</dt><dd>${formatDate(data.submission.submitted_at,true)}</dd></div><div><dt>Versione</dt><dd>${escapeHtml(data.submission.questionnaire_version || "—")}</dd></div></dl><div class="inline-actions">${state.config.jotform.enabled?'<button class="button" id="sync-dealer">Sincronizza Jotform</button>':''}<button class="button" id="regenerate-link">Rigenera link</button><button class="button danger" id="revoke-link">Revoca link</button>${["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status)?'<button class="button" data-submission-status="REOPENED">Riapri compilazione</button>':''}${data.submission.collection_status==="NEEDS_REVIEW"?'<button class="button primary" data-submission-status="VALIDATED">Valida dati</button>':''}</div></div><div class="collection-qr"><img src="${escapeHtml(link.qrUrl)}" alt="QR Code del link di compilazione"><a class="button" href="${escapeHtml(link.qrUrl)}" download="qr-${escapeHtml(dealer.id)}.svg">Scarica SVG</a></div></div></article>`:"";
    return `<section class="page" aria-labelledby="page-title">
      <div class="breadcrumbs"><button data-page-link="dealers">Concessionari</button><span>/</span><span>${escapeHtml(dealer.name)}</span></div>
      <header class="page-header"><div class="dealer-hero"><div class="dealer-logo">${escapeHtml(dealer.initials)}</div><div><p class="eyebrow">Scheda concessionario</p><h1 id="page-title">${escapeHtml(dealer.name)}</h1><div class="dealer-meta"><span>${icon("location")}${escapeHtml(dealer.region)}</span><span>${icon("users")}${escapeHtml(dealer.manager)}</span><span>${escapeHtml(dealer.id)}</span></div></div></div><div class="header-actions">${jet&&link?`<a class="button" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">Apri compilazione</a><button class="button" id="add-note">Aggiungi nota</button>`:""}<button class="button primary" data-export-csv>${icon("download")}Esporta rete</button></div></header>
      <div class="summary-strip"><div class="summary-cell"><span>Stato rilevazione</span><strong>${escapeHtml(statusLabel[data.submission.collection_status]||data.submission.collection_status)}</strong></div><div class="summary-cell"><span>Ultimo invio</span><strong>${dealer.sent}</strong></div><div class="summary-cell"><span>Questionario</span><strong>${escapeHtml(data.submission.questionnaire_version || "—")}</strong></div><div class="summary-cell"><span>KPI compilati</span><strong>${filled} / ${data.values.length}</strong></div></div>
      ${collectionAdmin}
      <div class="comparison-metrics">${data.values.slice(0,4).map((item) => `<article class="comparison-card"><span>${escapeHtml(item.name)}</span><strong>${formatValue(item.value,item)}</strong><small>Media rete: ${formatValue(item.network_avg,item)}</small></article>`).join("")}</div>
      <div class="panel"><div class="panel-header"><div><h2>Performance KPI</h2><p>Valori salvati per ${escapeHtml(data.campaign.name)}</p></div><button class="text-button" data-page-link="analysis">Apri analisi completa →</button></div><div class="table-wrap"><table><thead><tr><th>KPI</th><th>Valore dealer</th><th>Media rete</th><th>Rilevazione precedente</th><th>Scostamento</th></tr></thead><tbody>${data.values.map((item) => { const delta=item.value!==null&&item.previous_value?((item.value-item.previous_value)/Math.abs(item.previous_value)*100):null; return `<tr><td class="kpi-name">${escapeHtml(item.name)}</td><td><strong>${formatValue(item.value,item)}</strong></td><td>${formatValue(item.network_avg,item)}</td><td>${formatValue(item.previous_value,item)}</td><td class="delta ${delta>=0?"positive":"negative"}">${delta===null?"—":`${delta>=0?"+":""}${delta.toFixed(1).replace(".",",")}%`}</td></tr>`; }).join("")}</tbody></table></div></div>
      ${!data.comparison.compatible?'<div class="demo-banner"><strong>Confronto non disponibile</strong><span>Le due rilevazioni usano versioni del questionario incompatibili.</span></div>':''}<div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Storico rilevazioni</h2><p>Campagne e KPI ricevuti</p></div></div><div class="panel-body"><ul class="activity-list">${data.history.map((item) => `<li class="activity-item"><span class="initials">RI</span><span><strong>${escapeHtml(item.campaign_name)}</strong><small>${formatDate(item.submitted_at,true)} · ${item.kpi_count} KPI · ${escapeHtml(item.questionnaire_version||"versione legacy")}</small></span><span class="source-pill">${escapeHtml(item.collection_status || item.status)}</span></li>`).join("") || "<li>Nessuna rilevazione.</li>"}</ul></div></article>${jet?`<article class="panel"><div class="panel-header"><div><h2>Note JET</h2><p>Annotazioni interne</p></div></div><div class="panel-body"><ul class="activity-list">${data.notes.length ? data.notes.map((note) => `<li class="activity-item"><span class="initials">${note.author.split(" ").map((part)=>part[0]).join("").slice(0,2)}</span><span><strong>${escapeHtml(note.body)}</strong><small>${escapeHtml(note.author)}</small></span></li>`).join("") : "<li class='activity-item'><span>Nessuna nota presente.</span></li>"}</ul></div></article>`:""}</div>
    </section>`;
  }

  function portalAnalysisPage() {
    const data = state.analysis;
    const max = Math.max(...data.regions.map((item) => item.average),1);
    return `<section class="page" aria-labelledby="page-title">${pageHeader({ eyebrow:"Benchmark e distribuzioni",title:'<span id="page-title">Analisi KPI</span>',subtitle:"Esplora performance e differenze territoriali sui dati inviati.",actions:`<button class="button primary" data-export-csv>${icon("download")}Esporta vista</button>` })}<div class="analysis-layout"><aside class="panel analysis-sidebar" aria-label="Filtri analisi"><div class="field"><label for="kpi-select">KPI analizzato</label><select id="kpi-select">${state.config.kpis.map((item) => `<option value="${item.id}" ${item.id===data.kpi.id?"selected":""}>${item.name}</option>`).join("")}</select></div><div class="field"><label>Campagna</label><select id="analysis-campaign">${state.config.campaigns.map((item)=>`<option value="${item.id}" ${item.id===data.campaign.id?"selected":""}>${item.name}</option>`).join("")}</select></div><button class="button primary" id="apply-analysis">Applica filtri</button></aside><div><article class="panel"><div class="panel-header"><div><h2>${data.kpi.name}: sintesi rete</h2><p>${data.stats.count} rilevazioni valide · ${data.kpi.unit}</p></div><span class="badge complete">Dati aggiornati</span></div><div class="analysis-summary"><div class="analysis-stat"><span>Media nazionale</span><strong>${formatValue(data.stats.average,data.kpi)}</strong></div><div class="analysis-stat"><span>Mediana</span><strong>${formatValue(data.stats.median,data.kpi)}</strong></div><div class="analysis-stat"><span>Minimo</span><strong>${formatValue(data.stats.min,data.kpi)}</strong></div><div class="analysis-stat"><span>Massimo</span><strong>${formatValue(data.stats.max,data.kpi)}</strong></div></div><div class="panel-body"><h3>Confronto per regione</h3><div class="bar-chart">${data.regions.map((item,index) => `<div class="bar-row"><span>${item.region}</span><div class="bar-track"><span class="${index===0?"accent":""}" style="width:${item.average/max*100}%"></span></div><strong>${Number(item.average).toLocaleString("it-IT",{maximumFractionDigits:1})}</strong></div>`).join("")}</div></div></article><div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Andamento nel tempo</h2><p>Confronto con la rilevazione precedente</p></div></div><div class="panel-body">${submissionChart()}</div></article><article class="panel"><div class="panel-header"><div><h2>Top concessionari</h2><p>Ordinati per ${data.kpi.name.toLowerCase()}</p></div></div><div class="panel-body"><ol class="ranking-list">${data.ranking.slice(0,5).map((item,index) => `<li class="ranking-item"><span class="ranking-number">${String(index+1).padStart(2,"0")}</span><span><strong>${item.name}</strong><small>${item.region}</small></span><span class="ranking-value">${formatValue(item.value,data.kpi)}</span></li>`).join("")}</ol></div></article></div></div></div></section>`;
  }

  function collectionPage(data) {
    const locked = ["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status);
    const statusClass = data.submission.collection_status === "NEEDS_REVIEW" ? "verify" : locked ? "complete" : data.submission.collection_status === "DRAFT" ? "draft" : "missing";
    const formContent = data.mode === "jotform" && data.liveReady
      ? `<div class="jotform-frame panel"><iframe title="Questionario ${escapeHtml(data.campaign.name)}" src="${escapeHtml(data.embedUrl)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="geolocation 'none'; camera 'none'; microphone 'none'"></iframe></div>`
      : `<form id="survey-form" class="questionnaire-shell" novalidate><div class="questionnaire-progress"><div><strong id="section-progress-label">Sezione 1 di ${data.questionnaire.sections.length}</strong><span id="save-status">${data.submission.updated_at?`Ultimo salvataggio ${formatDate(data.submission.updated_at,true)}`:"Bozza non ancora salvata"}</span></div><div class="progress-track"><span id="questionnaire-progress-bar" style="width:0%"></span></div></div><nav class="section-nav" aria-label="Sezioni questionario">${data.questionnaire.sections.map((section,index)=>`<button type="button" data-section-target="${index}" class="${index===0?"is-active":""}"><span>${index+1}</span>${escapeHtml(section)}</button>`).join("")}</nav><div class="survey-fields panel">${data.questionnaire.sections.map((section,index)=>`<section class="questionnaire-section ${index===0?"is-active":""}" data-section="${index}" aria-labelledby="section-${index}"><div class="panel-header"><div><p class="eyebrow">Sezione ${index+1}</p><h2 id="section-${index}">${escapeHtml(section)}</h2><p>KPI dimostrativi: inserisci i dati relativi all'intero periodo di rilevazione.</p></div></div><div class="survey-grid">${data.questionnaire.fields.filter((field)=>field.section===section).map((field)=>`<div class="survey-field"><label for="field-${escapeHtml(field.code)}">${escapeHtml(field.label)}${field.required?" *":""}</label><p>${escapeHtml(field.description)}</p><div class="input-with-unit"><input id="field-${escapeHtml(field.code)}" name="${escapeHtml(field.code)}" type="text" inputmode="decimal" placeholder="${escapeHtml(field.placeholder)}" value="${data.values[field.code]?.value ?? ""}" ${locked?"disabled":""} aria-describedby="help-${escapeHtml(field.code)} error-${escapeHtml(field.code)}" /><span>${escapeHtml(field.unit)}</span></div><small id="help-${escapeHtml(field.code)}">Valore minimo: ${field.min ?? 0}${field.max!==null?` · massimo: ${field.max}`:""}</small><small class="field-error" id="error-${escapeHtml(field.code)}" data-error-for="${escapeHtml(field.code)}"></small></div>`).join("")}</div><div class="section-actions"><button class="button" type="button" data-prev-section ${index===0?"disabled":""}>Indietro</button><button class="button primary" type="button" data-next-section>${index===data.questionnaire.sections.length-1?"Vai al riepilogo":"Continua"}</button></div></section>`).join("")}</div><aside class="survey-summary panel"><p class="eyebrow">Rilevazione</p><h2>${escapeHtml(data.campaign.name)}</h2><dl><div><dt>Concessionario</dt><dd>${escapeHtml(data.dealer.name)}</dd></div><div><dt>Periodo</dt><dd>${formatDate(data.campaign.open_date)} — ${formatDate(data.campaign.close_date)}</dd></div><div><dt>Stato</dt><dd>${escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status)}</dd></div><div><dt>Versione</dt><dd>${escapeHtml(data.questionnaire.version)}</dd></div></dl>${locked?"<p class='survey-confirmation'>Rilevazione già inviata. Per modifiche contatta JET.</p>":`<button class="button" type="button" id="save-draft">Salva bozza</button><button class="button primary" type="submit">Rivedi e invia</button><p class="survey-help">Le modifiche vengono salvate automaticamente dopo una breve pausa.</p>`}</aside><dialog id="submit-review" class="review-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Controllo finale</p><h2>Riepilogo prima dell'invio</h2></div><button type="button" id="close-review" aria-label="Chiudi">×</button></div><div id="review-values" class="review-values"></div><p>L'invio è definitivo. JET potrà riaprire la rilevazione in caso di necessità.</p><div class="inline-actions"><button class="button" type="button" id="cancel-review">Torna ai dati</button><button class="button primary" type="button" id="confirm-submit">Conferma invio</button></div></dialog></form>`;
    return `<section class="collection-page" aria-labelledby="collection-title"><header class="collection-header"><div class="collection-brand"><span class="brand-mark">SDF</span><span><strong>Network Performance</strong><small>Raccolta dati concessionari</small></span></div><span class="badge ${statusClass}">${escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status)}</span></header><div class="collection-intro"><div><p class="eyebrow">${escapeHtml(data.campaign.name)}</p><h1 id="collection-title">${escapeHtml(data.dealer.name)}</h1><p>Questa pagina è personale e già associata al concessionario. I dati richiesti riguardano l'intero periodo, non rilevazioni giornaliere o mensili.</p></div><dl><div><dt>Periodo</dt><dd>${formatDate(data.campaign.open_date)} — ${formatDate(data.campaign.close_date)}</dd></div><div><dt>Scadenza</dt><dd>${formatDate(data.campaign.close_date)}</dd></div></dl></div><div class="demo-banner"><strong>KPI dimostrativi · ${escapeHtml(data.questionnaire.version)}</strong><span>Le definizioni saranno sostituite con quelle definitive concordate con il cliente.</span></div>${formContent}<footer class="collection-footer"><span>Serve assistenza? ${escapeHtml(data.support.label)} · <a href="mailto:${escapeHtml(data.support.email)}">${escapeHtml(data.support.email)}</a></span><span>SDF Network Performance · ambiente dimostrativo</span></footer></section>`;
  }

  function collectionConfirmationPage(data) {
    return `<section class="collection-page confirmation-page"><header class="collection-header"><div class="collection-brand"><span class="brand-mark">SDF</span><span><strong>Network Performance</strong><small>Raccolta dati concessionari</small></span></div></header><article class="confirmation-card panel"><span class="confirmation-check">${icon("check")}</span><p class="eyebrow">Invio completato</p><h1>Compilazione ricevuta</h1><p>I dati di <strong>${escapeHtml(data.dealer.name)}</strong> per <strong>${escapeHtml(data.campaign.name)}</strong> sono stati acquisiti.</p><dl><div><dt>Data e ora</dt><dd>${formatDate(data.submission.submitted_at,true)}</dd></div><div><dt>Stato</dt><dd>${escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status)}</dd></div><div><dt>Riferimento</dt><dd>${escapeHtml(data.submission.external_submission_id || `DEMO-${data.dealer.id}-${data.campaign.id}`)}</dd></div></dl><p class="confirmation-note">JET potrà contattare il concessionario se saranno necessarie verifiche. Non sono visibili dati di altri dealer.</p></article></section>`;
  }

  function surveyPage(data) {
    return collectionPage({ ...data,mode:"demo",liveReady:false,support:{ label:"Assistenza JET",email:"supporto.jet@example.com" },submission:{ ...data.submission,collection_status:data.submission.status === "submitted" ? "SUBMITTED" : data.submission.status === "draft" ? "DRAFT" : "NOT_STARTED" } });
  }

  function campaignsPage() {
    const actions=state.role === "JET" ? `${state.config.jotform.enabled?'<button class="button" id="sync-jotform">Sincronizza da Jotform</button>':''}<button class="button primary" id="create-campaign">Nuova campagna</button>` : "";
    return `<section class="page" aria-labelledby="page-title">${pageHeader({eyebrow:"Gestione raccolta",title:'<span id="page-title">Rilevazioni</span>',subtitle:"Campagne annuali, finestre di compilazione e stato della rete.",actions})}<div class="campaign-list">${state.campaigns.campaigns.map((item) => `<article class="campaign-row panel"><div><span class="badge ${item.status === "open" ? "complete" : "missing"}">${item.status === "open" ? "Aperta" : item.status === "draft" ? "Bozza" : "Chiusa"}</span><h2>${escapeHtml(item.name)}</h2><p>${formatDate(item.open_date)} — ${formatDate(item.close_date)}</p></div><div class="campaign-kpis"><span><strong>${item.progress.received}/${item.progress.dealers}</strong> ricevute</span><span><strong>${item.progress.completion}%</strong> completamento</span></div><button class="button" data-campaign-id="${escapeHtml(item.id)}">Apri dashboard</button></article>`).join("")}</div></section>`;
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
    const publicPage = page === "collection" || page === "confirmation" || page === "survey";
    document.body.classList.toggle("survey-mode", publicPage);
    document.body.classList.toggle("collection-mode", page === "collection" || page === "confirmation");
    main.innerHTML = loadingPage();
    try {
      if (page === "collection" || page === "confirmation") {
        state.collectionToken = options.token || state.collectionToken;
        state.collection = await api(`/api/compila/${encodeURIComponent(state.collectionToken)}`);
        state.online = true;
        main.innerHTML = page === "confirmation" ? collectionConfirmationPage(state.collection) : collectionPage(state.collection);
      } else {
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
      }
    } catch (error) {
      state.online = false;
      main.innerHTML = `<section class="page"><div class="panel empty-preview"><div><span class="empty-icon">${icon("alert")}</span><h2>Servizio dati non disponibile</h2><p>${error.message}. Avvia il portale con <code>npm start</code> invece di aprire direttamente index.html.</p></div></div></section>`;
    }
    hydrateIcons(main);
    syncRoleUi(publicPage);
    syncShell();
    bindPageEvents();
    bindFunctionalEvents();
    updateNavigation(page === "dealer" ? "dealers" : publicPage ? "" : page);
    document.querySelector("#mobile-page-title").textContent = ({overview:"Overview",dealers:"Concessionari",dealer:"Dettaglio concessionario",analysis:"Analisi KPI",surveys:"Rilevazioni",reports:"Report",survey:"Compilazione KPI",collection:"Compilazione",confirmation:"Conferma"})[page] || "Portale KPI";
    clearInterval(state.poller);
    if (page === "overview") state.poller = setInterval(async () => {
      try { state.overview = await api(`/api/overview?campaignId=${campaignId()}`); if (currentPage === "overview") { main.innerHTML=portalOverviewPage(); hydrateIcons(main); bindPageEvents(); bindFunctionalEvents(); syncShell(); } } catch {}
    },20_000);
    window.scrollTo({top:0,behavior:"instant"});
  }

  function bindFunctionalEvents() {
    main.querySelectorAll("[data-export-csv]").forEach((button) => button.addEventListener("click", () => { location.href = `/api/reports/csv?campaignId=${campaignId()}`; }));
    main.querySelectorAll("[data-dealer-id]").forEach((button) => button.addEventListener("click", () => {
      selectedDealer = dealers.find((dealer) => dealer.id === button.dataset.dealerId) || { id:button.dataset.dealerId };
      portalRenderPage("dealer",{ dealer:selectedDealer });
    }));
    const portalFilter = () => {
      const search = main.querySelector("#dealer-search");
      if (!search || !main.querySelector("#dealer-results")) return;
      const term = search.value.trim().toLowerCase();
      const region = main.querySelector("#region-filter")?.value || "";
      const status = main.querySelector("#status-filter")?.value || "";
      const filtered = dealers.filter((dealer) => (!term || `${dealer.name} ${dealer.id}`.toLowerCase().includes(term)) && (!region || dealer.region === region) && (!status || dealer.status === status));
      main.querySelector("#dealer-results").innerHTML = portalDealerResults(filtered);
      hydrateIcons(main.querySelector("#dealer-results"));
      bindFunctionalEvents();
    };
    main.querySelector("#dealer-search")?.addEventListener("input",portalFilter);
    main.querySelector("#region-filter")?.addEventListener("change",portalFilter);
    main.querySelector("#status-filter")?.addEventListener("change",portalFilter);
    main.querySelector("#reset-filters")?.addEventListener("click",() => setTimeout(portalFilter));
    const getLink = (dealerId) => api(`/api/dealers/${encodeURIComponent(dealerId)}/collection-link?campaignId=${encodeURIComponent(campaignId())}`);
    main.querySelectorAll("[data-copy-link]").forEach((button) => button.addEventListener("click",async () => {
      try { const link=await getLink(button.dataset.copyLink); await navigator.clipboard.writeText(link.url); showToast("Link di compilazione copiato."); }
      catch (error) { showToast(error.message); }
    }));
    main.querySelectorAll("[data-show-qr]").forEach((button) => button.addEventListener("click",async () => {
      try {
        const link=await getLink(button.dataset.showQr); const dealer=dealers.find((item)=>item.id===button.dataset.showQr);
        const dialog=main.querySelector("#qr-dialog");
        dialog.querySelector("#qr-dialog-content").innerHTML=`<p class="eyebrow">Link concessionario</p><h2>${escapeHtml(dealer?.name || button.dataset.showQr)}</h2><img src="${escapeHtml(link.qrUrl)}" alt="QR Code"><code>${escapeHtml(link.url)}</code><div class="inline-actions"><a class="button primary" href="${escapeHtml(link.qrUrl)}" download="qr-${escapeHtml(button.dataset.showQr)}.svg">Scarica SVG</a><button class="button" id="qr-copy">Copia link</button><button class="button" id="qr-print">Stampa</button></div>`;
        dialog.querySelector("#qr-copy").addEventListener("click",async()=>{ await navigator.clipboard.writeText(link.url); showToast("Link copiato."); });
        dialog.querySelector("#qr-print").addEventListener("click",()=>window.print()); dialog.showModal();
      } catch (error) { showToast(error.message); }
    }));
    main.querySelector(".qr-close")?.addEventListener("click",()=>main.querySelector("#qr-dialog")?.close());
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
    const syncButton = main.querySelector("#sync-jotform") || main.querySelector("#sync-dealer");
    if (syncButton) syncButton.addEventListener("click",async () => {
      try { syncButton.disabled=true; const result=await api("/api/integrations/jotform/sync",{method:"POST",body:"{}"}); showToast(`${result.found} submission trovate · ${result.imported} nuove · ${result.errors} errori.`); state.overview=null; if (currentPage === "dealer") await portalRenderPage("dealer",{dealer:state.detail.dealer}); }
      catch (error) { showToast(error.message); } finally { syncButton.disabled=false; }
    });
    main.querySelector("#copy-collection-link")?.addEventListener("click",async()=>{ await navigator.clipboard.writeText(state.detail.collectionLink.url); showToast("Link copiato."); });
    main.querySelector("#regenerate-link")?.addEventListener("click",async()=>{
      if (!confirm("Rigenerare il link? Il precedente smetterà di funzionare.")) return;
      await api(`/api/dealers/${encodeURIComponent(state.detail.dealer.id)}/collection-link/regenerate?campaignId=${encodeURIComponent(campaignId())}`,{method:"POST",body:"{}"}); showToast("Link rigenerato."); await portalRenderPage("dealer",{dealer:state.detail.dealer});
    });
    main.querySelector("#revoke-link")?.addEventListener("click",async()=>{
      if (!confirm("Revocare il link di compilazione?")) return;
      await api(`/api/dealers/${encodeURIComponent(state.detail.dealer.id)}/collection-link/revoke?campaignId=${encodeURIComponent(campaignId())}`,{method:"POST",body:"{}"}); showToast("Link revocato."); await portalRenderPage("dealer",{dealer:state.detail.dealer});
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
    const createCampaign = main.querySelector("#create-campaign");
    if (createCampaign) createCampaign.addEventListener("click",async()=>{
      const name=prompt("Nome della campagna:",`Rilevazione 1 — ${new Date().getFullYear()+1}`); if(!name)return;
      const year=Number(prompt("Anno:",String(new Date().getFullYear()+1))); const surveyNo=Number(prompt("Numero rilevazione:","1"));
      const openDate=prompt("Data apertura (AAAA-MM-GG):",`${year}-01-15`); const closeDate=prompt("Data chiusura (AAAA-MM-GG):",`${year}-03-31`);
      try { await api("/api/campaigns",{method:"POST",body:JSON.stringify({name,year,survey_no:surveyNo,open_date:openDate,close_date:closeDate,status:"draft"})}); state.config=null; showToast("Campagna creata in bozza."); await portalRenderPage("surveys"); } catch(error){ showToast(error.message); }
    });
    const form = main.querySelector("#survey-form");
    if (form) {
      let activeSection=0;
      const sections=[...form.querySelectorAll(".questionnaire-section")];
      const showSection=(index)=>{ activeSection=Math.max(0,Math.min(index,sections.length-1)); sections.forEach((section,i)=>section.classList.toggle("is-active",i===activeSection)); form.querySelectorAll("[data-section-target]").forEach((button,i)=>button.classList.toggle("is-active",i===activeSection)); const label=form.querySelector("#section-progress-label"); if(label)label.textContent=`Sezione ${activeSection+1} di ${sections.length}`; sections[activeSection]?.scrollIntoView({behavior:"smooth",block:"start"}); };
      const valuesFromForm=()=>Object.fromEntries(new FormData(form).entries());
      const validateClient=(values)=>{const errors={};for(const field of state.collection.questionnaire.fields){const raw=String(values[field.code]??"").trim();if(!raw&&field.required){errors[field.code]="Campo obbligatorio";continue}if(!raw)continue;const normalized=raw.includes(",")?raw.replaceAll(".","").replace(",","."):raw;const value=Number(normalized);if(!Number.isFinite(value))errors[field.code]="Inserire un numero valido";else if(field.min!==null&&value<field.min)errors[field.code]=`Il valore minimo è ${field.min}`;else if(field.max!==null&&value>field.max)errors[field.code]=`Il valore massimo è ${field.max}`;else if(field.type==="integer"&&!Number.isInteger(value))errors[field.code]="Inserire un numero intero"}return errors};
      const updateProgress=()=>{ const values=valuesFromForm(); const fields=state.collection?.questionnaire?.fields||[]; const completed=fields.filter((field)=>String(values[field.code]||"").trim()!=="").length; const bar=form.querySelector("#questionnaire-progress-bar"); if(bar)bar.style.width=`${fields.length?Math.round(completed/fields.length*100):0}%`; };
      const submitSurvey = async (mode,{silent=false}={}) => {
        const token = state.collectionToken || new URLSearchParams(location.search).get("token");
        const values = valuesFromForm();
        main.querySelectorAll(".field-error").forEach((item) => item.textContent="");
        const status=form.querySelector("#save-status"); if(status&&mode==="draft")status.textContent="Salvataggio in corso…";
        try {
          const endpoint = currentPage === "collection" ? `/api/compila/${encodeURIComponent(token)}/${mode}` : `/api/survey/${encodeURIComponent(token)}/${mode}`;
          await api(endpoint,{method:mode === "draft" ? "PUT" : "POST",body:JSON.stringify({values})});
          state.overview = null;
          if(status&&mode==="draft")status.textContent=`Bozza salvata · ${new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`;
          if(!silent) showToast(mode === "draft" ? "Bozza salvata." : "Rilevazione inviata correttamente.");
          if (currentPage === "collection" && mode === "submit") { history.replaceState(null,"",`/compila/${encodeURIComponent(token)}/conferma`); await portalRenderPage("confirmation",{token}); }
          else if(!silent) await portalRenderPage(currentPage === "collection" ? "collection" : "survey",{token});
        } catch (error) {
          if(status&&mode==="draft")status.textContent="Salvataggio non riuscito";
          if (error.details) {
            form.querySelector("#submit-review")?.close();
            Object.entries(error.details).forEach(([id,message]) => { const target=main.querySelector(`[data-error-for="${id}"]`); if(target) target.textContent=message; });
            const firstCode=Object.keys(error.details)[0]; const firstInput=form.querySelector(`[name="${firstCode}"]`); const sectionIndex=sections.findIndex((section)=>section.contains(firstInput)); if(sectionIndex>=0)showSection(sectionIndex); firstInput?.focus();
          }
          if(!silent||mode!=="draft") showToast(error.message);
        }
      };
      form.querySelectorAll("[data-section-target]").forEach((button)=>button.addEventListener("click",()=>showSection(Number(button.dataset.sectionTarget))));
      form.querySelectorAll("[data-next-section]").forEach((button)=>button.addEventListener("click",()=>activeSection===sections.length-1?form.requestSubmit():showSection(activeSection+1)));
      form.querySelectorAll("[data-prev-section]").forEach((button)=>button.addEventListener("click",()=>showSection(activeSection-1)));
      form.addEventListener("input",()=>{ updateProgress(); const status=form.querySelector("#save-status"); if(status)status.textContent="Modifiche non salvate"; clearTimeout(state.autosaveTimer); state.autosaveTimer=setTimeout(()=>submitSurvey("draft",{silent:true}),1800); });
      form.addEventListener("submit", (event) => { event.preventDefault(); const dialog=form.querySelector("#submit-review"); const values=valuesFromForm(); const fields=state.collection.questionnaire.fields; const errors=validateClient(values); main.querySelectorAll(".field-error").forEach((item)=>item.textContent=""); if(Object.keys(errors).length){Object.entries(errors).forEach(([code,message])=>{const target=form.querySelector(`[data-error-for="${code}"]`);if(target)target.textContent=message});const input=form.querySelector(`[name="${Object.keys(errors)[0]}"]`);const index=sections.findIndex(section=>section.contains(input));if(index>=0)showSection(index);input?.focus();showToast("Controlla i campi evidenziati.");return} form.querySelector("#review-values").innerHTML=fields.map((field)=>`<div><span>${escapeHtml(field.label)}</span><strong>${values[field.code]!==""?`${escapeHtml(values[field.code])} ${escapeHtml(field.unit)}`:"Non compilato"}</strong></div>`).join(""); dialog.showModal(); });
      form.querySelector("#confirm-submit")?.addEventListener("click",()=>submitSurvey("submit"));
      ["#close-review","#cancel-review"].forEach((selector)=>form.querySelector(selector)?.addEventListener("click",()=>form.querySelector("#submit-review")?.close()));
      main.querySelector("#save-draft")?.addEventListener("click", () => submitSurvey("draft"));
      updateProgress();
    }
    main.querySelectorAll("[data-submission-status]").forEach((button)=>button.addEventListener("click",async()=>{ await api(`/api/dealers/${encodeURIComponent(state.detail.dealer.id)}/submission/status`,{method:"POST",body:JSON.stringify({campaignId:campaignId(),status:button.dataset.submissionStatus})}); showToast(button.dataset.submissionStatus==="REOPENED"?"Compilazione riaperta.":"Compilazione validata."); await portalRenderPage("dealer",{dealer:state.detail.dealer}); }));
  }

  overviewPage = portalOverviewPage;
  dealersPage = portalDealersPage;
  dealerDetailPage = portalDealerDetailPage;
  analysisPage = portalAnalysisPage;
  renderPage = portalRenderPage;

  document.querySelector("#demo-role-select")?.addEventListener("change",async(event)=>{
    state.role=event.target.value === "SDF" ? "SDF" : "JET";
    localStorage.setItem("sdf-demo-role",state.role);
    state.config=null; state.overview=null; state.detail=null; state.analysis=null; state.campaigns=null;
    showToast(state.role === "SDF" ? "Vista SDF attiva: modifiche disabilitate." : "Vista JET attiva.");
    await portalRenderPage(["collection","confirmation","survey"].includes(currentPage)?"overview":currentPage);
  });

  const params = new URLSearchParams(location.search);
  const requested = params.get("page");
  const collectionPath = location.pathname.match(/^\/compila\/([^/]+)(?:\/(conferma))?\/?$/);
  if (collectionPath) portalRenderPage(collectionPath[2] ? "confirmation" : "collection",{token:decodeURIComponent(collectionPath[1])});
  else if (requested === "survey") portalRenderPage("survey",{token:params.get("token")});
  else if (requested === "dealer") portalRenderPage("dealer",{dealer:{id:params.get("dealer") || "IT-0018"}});
  else portalRenderPage(["overview","dealers","analysis","surveys","reports"].includes(requested) ? requested : "overview");
})();
