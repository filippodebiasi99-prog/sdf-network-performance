(() => {
  const state = { config: null, overview: null, detail: null, analysis: null, campaigns: null, collection: null, collectionToken: null, online: false, poller: null, role:localStorage.getItem("sdf-demo-role") === "SDF" ? "SDF" : "JET", autosaveTimer:null,searchDealers:null,searchItems:[],searchActiveIndex:0,searchTrigger:null };
  const originalOverviewPage = overviewPage;

  statusLabel.draft = "Bozza";
  Object.assign(statusLabel,{ NOT_STARTED:"Non iniziato",DRAFT:"Bozza",SUBMITTED:"Inviato",NEEDS_REVIEW:"Da verificare",VALIDATED:"Validato",REOPENED:"Riaperto" });

  function collectionStatusBadge(status) {
    const css=status === "NEEDS_REVIEW" ? "verify" : ["SUBMITTED","VALIDATED"].includes(status) ? "complete" : status === "DRAFT" || status === "REOPENED" ? "draft" : "missing";
    return `<span class="badge ${css}">${escapeHtml(statusLabel[status] || status)}</span>`;
  }

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

  function invalidateDataViews() {
    state.overview=null;
    state.analysis=null;
    state.detail=null;
    state.campaigns=null;
    state.searchDealers=null;
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

  function formatPerformanceValue(metric, value = metric?.value) {
    const number=Number(value);
    if (!Number.isFinite(number)) return "—";
    if (metric?.kind === "currency") {
      if (Math.abs(number) >= 1_000_000) return `€ ${(number/1_000_000).toLocaleString("it-IT",{maximumFractionDigits:1})} mln`;
      return `€ ${number.toLocaleString("it-IT",{maximumFractionDigits:0})}`;
    }
    if (metric?.kind === "score") return `${number.toLocaleString("it-IT",{maximumFractionDigits:1})} / 10`;
    return number.toLocaleString("it-IT",{maximumFractionDigits:0});
  }

  const searchPages = [
    { type:"page",id:"overview",label:"Overview",description:"Performance e stato della rete",page:"overview",icon:"overview",keywords:"dashboard rete performance" },
    { type:"page",id:"dealers",label:"Concessionari",description:"Anagrafica, link e stato delle compilazioni",page:"dealers",icon:"dealers",keywords:"dealer anagrafica link qr" },
    { type:"page",id:"analysis",label:"Analisi KPI",description:"Benchmark e confronti della rete",page:"analysis",icon:"analysis",keywords:"media mediana benchmark kpi" },
    { type:"page",id:"surveys",label:"Rilevazioni",description:"Campagne e periodi di raccolta",page:"surveys",icon:"calendar",keywords:"campagne questionari" },
    { type:"page",id:"reports",label:"Report",description:"Report ed esportazione CSV",page:"reports",icon:"reports",keywords:"export csv dati" }
  ];

  function normalizeSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  }

  function globalSearchCorpus() {
    const dealerItems=(state.searchDealers || []).map((dealer) => ({ type:"dealer",id:dealer.id,label:dealer.name,description:`${dealer.id} · ${dealer.region} · ${dealer.area}`,dealerId:dealer.id,icon:"dealers",keywords:`${dealer.id} ${dealer.name} ${dealer.region} ${dealer.area} ${dealer.manager}` }));
    const kpiItems=(state.config?.kpis || []).map((kpi) => ({ type:"kpi",id:kpi.id,label:kpi.name,description:`${kpi.code} · ${kpi.section || "KPI rete"}`,kpiId:kpi.id,icon:"analysis",keywords:`${kpi.code} ${kpi.name} ${kpi.description || ""} ${kpi.section || ""}` }));
    return [...searchPages,...dealerItems,...kpiItems];
  }

  function renderGlobalSearch(query = "") {
    const results=document.querySelector("#global-search-results");
    const input=document.querySelector("#global-search-input");
    if (!results || !input) return;
    const term=normalizeSearch(query);
    const corpus=globalSearchCorpus();
    const matched=(term ? corpus.filter((item)=>normalizeSearch(`${item.label} ${item.description} ${item.keywords}`).includes(term)) : searchPages).slice(0,12);
    state.searchItems=matched;
    state.searchActiveIndex=Math.min(state.searchActiveIndex,Math.max(0,matched.length-1));
    input.setAttribute("aria-activedescendant",matched.length?`global-search-option-${state.searchActiveIndex}`:"");
    if (!matched.length) {
      results.innerHTML=`<div class="global-search-empty"><strong>Nessun risultato</strong><span>Prova con il nome del concessionario, il Dealer ID o un KPI.</span></div>`;
      return;
    }
    const typeLabels={page:"Sezioni",dealer:"Concessionari",kpi:"KPI"};
    results.innerHTML=["page","dealer","kpi"].map((type) => {
      const items=matched.filter((item)=>item.type===type);
      if (!items.length) return "";
      return `<section class="global-search-group"><h2>${typeLabels[type]}</h2>${items.map((item) => { const index=matched.indexOf(item); return `<button type="button" role="option" id="global-search-option-${index}" aria-selected="${index===state.searchActiveIndex}" data-search-index="${index}"><span class="global-search-icon">${icon(item.icon)}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span><span class="global-search-open">Apri</span></button>`; }).join("")}</section>`;
    }).join("");
    results.querySelectorAll("[data-search-index]").forEach((button)=>button.addEventListener("click",()=>activateGlobalSearchResult(Number(button.dataset.searchIndex))));
  }

  function updateGlobalSearchSelection(nextIndex) {
    if (!state.searchItems.length) return;
    state.searchActiveIndex=(nextIndex+state.searchItems.length)%state.searchItems.length;
    document.querySelector("#global-search-input")?.setAttribute("aria-activedescendant",`global-search-option-${state.searchActiveIndex}`);
    document.querySelectorAll("[data-search-index]").forEach((button)=>button.setAttribute("aria-selected",String(Number(button.dataset.searchIndex)===state.searchActiveIndex)));
    document.querySelector(`#global-search-option-${state.searchActiveIndex}`)?.scrollIntoView({block:"nearest"});
  }

  async function activateGlobalSearchResult(index) {
    const item=state.searchItems[index];
    if (!item) return;
    document.querySelector("#global-search-dialog")?.close();
    if (item.type === "dealer") return portalRenderPage("dealer",{dealer:{id:item.dealerId}});
    if (item.type === "kpi") return portalRenderPage("analysis",{kpiId:item.kpiId,campaignId:campaignId()});
    return portalRenderPage(item.page);
  }

  async function openGlobalSearch(trigger = document.activeElement) {
    if (["collection","confirmation","survey"].includes(currentPage)) return;
    const dialog=document.querySelector("#global-search-dialog");
    const input=document.querySelector("#global-search-input");
    const results=document.querySelector("#global-search-results");
    if (!dialog || !input || !results) return;
    state.searchTrigger=trigger;
    state.searchActiveIndex=0;
    input.value="";
    results.innerHTML='<div class="global-search-loading">Caricamento…</div>';
    if (!dialog.open) dialog.showModal();
    input.focus();
    try {
      if (!state.config) state.config=await api("/api/config");
      if (!state.searchDealers) state.searchDealers=(await api(`/api/dealers?campaignId=${campaignId()}`)).dealers;
      renderGlobalSearch();
    } catch (error) {
      results.innerHTML=`<div class="global-search-empty"><strong>Ricerca non disponibile</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function overviewBusinessMetrics(performance) {
    const descriptions={ revenue_total:"Fatturato complessivo",units_sold:"Macchine vendute",parts_revenue:"Ricavi ricambi",service_revenue:"Ricavi assistenza",customer_satisfaction:"Soddisfazione media" };
    return `<div class="business-metrics" aria-label="Performance della rete">${performance.metrics.map((metric) => `<article class="business-metric"><span>${descriptions[metric.code] || escapeHtml(metric.name)}</span><strong>${formatPerformanceValue(metric)}</strong><small>${metric.code === "customer_satisfaction" ? `${metric.count} concessionari nel campione` : `Media dealer ${formatPerformanceValue(metric,metric.average)}`}</small></article>`).join("")}</div>`;
  }

  function overviewRevenueLeaders(performance) {
    const maximum=Math.max(1,...performance.leaders.map((item)=>item.value));
    return `<ol class="ranking-list">${performance.leaders.map((item) => `<li><span class="ranking-position">${item.position}</span><button class="ranking-dealer" data-dealer-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.region)} · ${escapeHtml(item.id)}</small></button><div class="ranking-value"><strong>${formatPerformanceValue({kind:"currency"},item.value)}</strong><small>${item.deltaFromAverage >= 0 ? "+" : ""}${item.deltaFromAverage.toLocaleString("it-IT",{maximumFractionDigits:1})}% vs media</small></div><span class="ranking-bar"><i style="width:${Math.max(8,item.value/maximum*100)}%"></i></span></li>`).join("")}</ol>`;
  }

  function overviewAreaPerformance(performance) {
    const maximum=Math.max(1,...performance.areas.map((item)=>item.average));
    return `<div class="area-performance">${performance.areas.map((item,index) => `<div class="area-performance-row"><div><strong>${escapeHtml(item.area)}</strong><small>${item.count} dealer</small></div><span class="area-performance-track"><i style="width:${Math.max(8,item.average/maximum*100)}%"></i></span><strong>${formatPerformanceValue({kind:"currency"},item.average)}</strong><em>${index+1}</em></div>`).join("")}</div>`;
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
    return `<svg class="line-chart" viewBox="0 0 700 222" role="img" aria-label="Andamento cumulativo delle compilazioni fino a ${state.overview.totals.received} invii."><defs><linearGradient id="liveChartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eb212e" stop-opacity=".2"/><stop offset="1" stop-color="#eb212e" stop-opacity="0"/></linearGradient></defs><path class="chart-grid-line" d="M40 24H680M40 68H680M40 112H680M40 156H680M40 200H680"/><text class="chart-label" x="10" y="203">0</text><text class="chart-label" x="5" y="159">${Math.round(maximum*.25)}</text><text class="chart-label" x="5" y="115">${Math.round(maximum*.5)}</text><text class="chart-label" x="5" y="71">${Math.round(maximum*.75)}</text><text class="chart-label" x="5" y="27">${maximum}</text><path d="${area}" fill="url(#liveChartGradient)"/><path class="chart-line" d="${line}"/>${coordinates.map((point) => `<circle class="chart-dot" cx="${point[0]}" cy="${point[1]}" r="3"/>`).join("")}<text class="chart-label" x="40" y="218">${start}</text><text class="chart-label" x="640" y="218">${end}</text></svg>`;
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
    const { campaign, totals, recent, alerts,performance } = state.overview;
    return `<section class="page overview-page" aria-labelledby="page-title">
      ${pageHeader({ eyebrow:"Rete concessionari", title:'<span id="page-title">Overview</span>', subtitle:`Performance e stato della rete · ${performance.sample} concessionari nel campione`, actions:`<select class="select-compact" aria-label="Seleziona rilevazione">${state.config.campaigns.map((item) => `<option value="${item.id}" ${item.id === campaign.id ? "selected" : ""}>${item.name}</option>`).join("")}</select><button class="button" data-export-csv>${icon("download")}Esporta dati</button>` })}
      ${overviewBusinessMetrics(performance)}
      <div class="overview-analysis-grid"><article class="panel"><div class="panel-header"><div><h2>Dealer per fatturato</h2><p>Primi cinque concessionari · confronto con la media rete</p></div><button class="text-button" data-page-link="analysis">Analisi completa →</button></div><div class="panel-body">${overviewRevenueLeaders(performance)}</div></article><article class="panel"><div class="panel-header"><div><h2>Fatturato medio per area</h2><p>Benchmark relativo sui dati ricevuti</p></div><button class="text-button" data-page-link="analysis">Confronta →</button></div><div class="panel-body">${overviewAreaPerformance(performance)}</div></article></div>
      <div class="overview-section-heading"><div><p class="eyebrow">Raccolta dati</p><h2>Avanzamento della rilevazione</h2><p>Stato operativo della campagna e concessionari da seguire.</p></div><button class="text-button" data-page-link="dealers">Gestisci concessionari →</button></div>
      <div class="collection-metrics" aria-label="Stato della raccolta"><div><span>Rete totale</span><strong>${totals.dealers}</strong><small>${state.overview.areas.length} aree</small></div><div><span>Ricevute</span><strong>${totals.received}</strong><small>${totals.completion}% della rete</small></div><div><span>Validate</span><strong>${totals.validated}</strong><small>Controllo completato</small></div><div><span>Bozze</span><strong>${totals.drafts}</strong><small>Compilazioni in corso</small></div><div><span>Mancanti</span><strong>${totals.missing}</strong><small>Entro ${new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short"}).format(new Date(campaign.close_date))}</small></div><div><span>Da verificare</span><strong>${totals.verify}</strong><small>Richiedono controllo JET</small></div></div>
      <div class="content-grid equal overview-operations"><article class="panel"><div class="panel-header"><div><h2>Da completare o verificare</h2><p>Priorità operative della campagna</p></div><button class="text-button" data-page-link="dealers">Vedi tutti →</button></div><div class="panel-body"><ul class="alert-list">${alerts.slice(0,5).map((item) => `<li class="alert-item"><span class="alert-symbol">${icon(item.collection_status === "NOT_STARTED" ? "clock" : "alert")}</span><span><strong>${item.name}</strong><small>${item.collection_status === "NOT_STARTED" ? "Rilevazione non iniziata" : item.collection_status === "DRAFT" ? `Bozza al ${Math.round(item.completion || item.quality || 0)}%` : "Dati da verificare"}</small></span>${collectionStatusBadge(item.collection_status)}</li>`).join("")}</ul></div></article><article class="panel"><div class="panel-header"><div><h2>Ultimi dati ricevuti</h2><p>Aggiornamenti più recenti della rete</p></div><button class="text-button" data-page-link="dealers">Apri rete →</button></div><div class="panel-body"><ul class="activity-list">${recent.map((item,index) => `<li class="activity-item"><span class="initials">${item.initials}</span><span><strong>${item.name}</strong><small>${item.region} · ${item.id}</small></span><time class="activity-time">${index === 0 ? "Più recente" : formatDate(item.updated_at)}</time></li>`).join("")}</ul></div></article></div>
    </section>`;
  }

  function portalDealersPage() {
    const totals = state.overview.totals;
    const jetActions=state.role === "JET" ? `<input id="dealer-import-file" type="file" accept=".csv,text/csv" hidden><button class="button" id="import-dealers">Importa anagrafica concessionari</button><button class="button" id="prepare-reminders">${icon("bell")}Prepara comunicazioni</button><button class="button primary" id="create-dealer">Nuovo concessionario</button>` : "";
    const dealerDialog=state.role === "JET"?`<dialog id="dealer-dialog" class="review-dialog operational-dialog"><form id="dealer-form"><div class="review-dialog-header"><div><p class="eyebrow">Anagrafica</p><h2>Nuovo concessionario</h2><p>I dati restano modificabili dalla scheda concessionario.</p></div><button type="button" data-close-dialog>×</button></div><div class="operational-form-grid">${dealerFormMarkup()}</div><footer class="review-footer"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" type="submit">Crea concessionario</button></footer></form></dialog><dialog id="import-preview-dialog" class="review-dialog operational-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Controllo CSV</p><h2>Anteprima importazione</h2><p>Verifica errori, duplicati ed email mancanti prima di confermare.</p></div><button type="button" data-close-dialog>×</button></div><div id="import-preview-content" class="operational-dialog-body"></div><footer class="review-footer"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" id="confirm-import" type="button">Conferma importazione</button></footer></dialog><dialog id="distribution-dialog" class="review-dialog operational-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Distribuzione questionari</p><h2>Prepara comunicazioni</h2><p>Le comunicazioni vengono registrate, ma non inviate finché non sarà configurato un provider email.</p></div><button type="button" data-close-dialog>×</button></div><form id="distribution-form"><div id="distribution-content" class="operational-dialog-body"></div><footer class="review-footer"><span class="provider-warning">Nessuna email sarà inviata</span><button class="button primary" type="submit">Prepara e registra</button></footer></form></dialog>`:"";
    return `<section class="page" aria-labelledby="page-title">${pageHeader({ eyebrow:"Anagrafica e avanzamento",title:'<span id="page-title">Concessionari</span>',subtitle:"Monitora stato e avanzamento della campagna selezionata.",actions:`${jetActions}<button class="button" data-export-csv>${icon("download")}Esporta dati</button>` })}<div class="summary-strip"><div class="summary-cell"><span>Rete totale</span><strong>${totals.dealers} dealer</strong></div><div class="summary-cell"><span>Validati</span><strong>${totals.validated}</strong></div><div class="summary-cell"><span>Inviati</span><strong>${totals.submitted}</strong></div><div class="summary-cell"><span>Da verificare</span><strong>${totals.verify}</strong></div><div class="summary-cell"><span>Bozze</span><strong>${totals.drafts}</strong></div><div class="summary-cell"><span>Non iniziati</span><strong>${totals.notStarted}</strong></div></div><div class="panel" style="margin-top:18px"><div class="filters"><div class="search-field">${icon("search")}<input id="dealer-search" type="search" placeholder="Cerca concessionario o Dealer ID" aria-label="Cerca concessionario" /></div><select id="region-filter" class="filter-select" aria-label="Filtra per regione"><option value="">Tutte le regioni</option>${[...new Set(dealers.map((item)=>item.region))].map((value)=>`<option>${value}</option>`).join("")}</select><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="">Tutti gli stati</option><option value="VALIDATED">Validato</option><option value="SUBMITTED">Inviato</option><option value="NEEDS_REVIEW">Da verificare</option><option value="DRAFT">Bozza</option><option value="NOT_STARTED">Non iniziato</option></select><button class="button" id="reset-filters">${icon("filter")}Azzera</button></div><div id="dealer-results">${portalDealerResults(dealers)}</div></div><dialog id="qr-dialog" class="qr-dialog"><button class="qr-close" aria-label="Chiudi">×</button><div id="qr-dialog-content"></div></dialog>${dealerDialog}</section>`;
  }

  function dealerFormMarkup(dealer={}) {
    return [["id","Dealer ID",dealer.id],["name","Ragione sociale",dealer.name],["region","Regione",dealer.region],["area","Area geografica",dealer.area],["manager","Area manager",dealer.manager],["contact_name","Referente",dealer.contact_name],["email","Email",dealer.email]].map(([name,label,value])=>`<label><span>${label}</span><input name="${name}" value="${escapeHtml(value||"")}" ${["id","name","region","area","manager"].includes(name)?"required":""} ${name==="email"?'type="email"':""}></label>`).join("");
  }

  function portalDealerResults(list) {
    return `<div class="table-wrap"><table><thead><tr><th>Concessionario</th><th>Campagna</th><th>Stato</th><th>Ultimo invio</th><th>Azioni</th></tr></thead><tbody>${list.map((dealer) => `<tr><td><button class="dealer-link" data-dealer-id="${escapeHtml(dealer.id)}">${escapeHtml(dealer.name)}<span class="dealer-id">${escapeHtml(dealer.id)} · ${escapeHtml(dealer.region)}</span></button></td><td>${escapeHtml(state.overview.campaign.name)}</td><td>${collectionStatusBadge(dealer.collection_status)}</td><td>${formatDate(dealer.submitted_at,true)}</td><td><div class="row-actions">${state.role === "JET"?`<button class="button compact" data-copy-link="${escapeHtml(dealer.id)}">Copia link</button><button class="button compact" data-show-qr="${escapeHtml(dealer.id)}">QR</button>`:""}<button class="row-action" data-dealer-id="${escapeHtml(dealer.id)}" aria-label="Apri ${escapeHtml(dealer.name)}">${icon("chevron")}</button></div></td></tr>`).join("")}</tbody></table></div><div class="pagination"><span>${list.length} concessionari</span><span>Campagna: ${escapeHtml(state.overview.campaign.name)}</span></div>`;
  }

  function portalDealerDetailPage() {
    const data = state.detail;
    const dealer = normalizeDealer({ ...data.dealer, status:data.submission.status,quality:data.submission.quality_score,submitted_at:data.submission.submitted_at });
    const filled = data.values.filter((item) => item.value !== null).length;
    const link = data.collectionLink;
    const jet=state.role === "JET";
    const editableValues=data.values.filter((item)=>!item.derived);
    const collectionAdmin=jet&&link?`<article class="panel collection-admin-panel"><div class="panel-header"><div><h2>Raccolta dati</h2><p>Link univoco per ${escapeHtml(data.campaign.name)}</p></div><span class="badge ${link.status === "ACTIVE" ? "complete" : "missing"}">${link.status === "ACTIVE" ? "Link attivo" : "Revocato"}</span></div><div class="collection-admin-grid"><div><span>Link compilazione</span><div class="copy-field"><code>${escapeHtml(link.url)}</code><button class="button compact" id="copy-collection-link">Copia</button></div><dl class="technical-list"><div><dt>Ultima apertura</dt><dd>${formatDate(link.last_opened_at,true)}</dd></div><div><dt>Aperture</dt><dd>${link.opened_count}</dd></div><div><dt>Ultimo invio</dt><dd>${formatDate(data.submission.submitted_at,true)}</dd></div></dl><div class="inline-actions">${state.config.jotform.enabled?'<button class="button" id="sync-dealer">Sincronizza Jotform</button>':''}<button class="button" id="regenerate-link">Rigenera link</button><button class="button danger" id="revoke-link">Revoca link</button>${["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status)?'<button class="button" id="edit-submission-values">Modifica valori</button><button class="button" data-submission-status="REOPENED">Riapri compilazione</button>':''}${data.submission.collection_status==="NEEDS_REVIEW"?'<button class="button primary" data-submission-status="VALIDATED">Valida dati</button>':''}</div></div><div class="collection-qr"><img src="${escapeHtml(link.qrUrl)}" alt="QR Code del link di compilazione"><a class="button" href="${escapeHtml(link.qrUrl)}" download="qr-${escapeHtml(dealer.id)}.svg">Scarica SVG</a></div></div></article>`:"";
    const editDialog=jet&&editableValues.length&&["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status)?`<dialog id="edit-values-dialog" class="review-dialog edit-values-dialog"><form id="edit-values-form"><div class="review-dialog-header"><div><p class="eyebrow">Modifica controllata JET</p><h2>Aggiorna i valori ricevuti</h2><p>I KPI derivati saranno ricalcolati automaticamente e la compilazione passerà a “Da verificare”.</p></div><button type="button" id="close-edit-values" aria-label="Chiudi">×</button></div><div class="edit-values-grid">${editableValues.map((item)=>`<label><span>${escapeHtml(item.name)}</span><div class="input-with-unit"><input name="${escapeHtml(item.code)}" type="text" inputmode="decimal" value="${item.value ?? ""}" required><span>${escapeHtml(item.unit)}</span></div><small class="field-error" data-edit-error="${escapeHtml(item.code)}"></small></label>`).join("")}</div><footer class="review-footer"><p>La modifica viene registrata nell'audit con valore precedente e nuovo.</p><div class="inline-actions"><button class="button" type="button" id="cancel-edit-values">Annulla</button><button class="button primary" type="submit">Salva modifiche</button></div></footer></form></dialog>`:"";
    const dealerAdminDialog=jet?`<dialog id="dealer-edit-dialog" class="review-dialog operational-dialog"><form id="dealer-edit-form"><div class="review-dialog-header"><div><p class="eyebrow">Anagrafica</p><h2>Modifica concessionario</h2><p>La disattivazione conserva rilevazioni, note e audit.</p></div><button type="button" data-close-dialog>×</button></div><div class="operational-form-grid">${dealerFormMarkup(data.dealer)}</div><footer class="review-footer"><button class="button danger" id="deactivate-dealer" type="button">Disattiva</button><div class="inline-actions"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" type="submit">Salva anagrafica</button></div></footer></form></dialog>`:"";
    return `<section class="page" aria-labelledby="page-title">
      <div class="breadcrumbs"><button data-page-link="dealers">Concessionari</button><span>/</span><span>${escapeHtml(dealer.name)}</span></div>
      <header class="page-header"><div class="dealer-hero"><div class="dealer-logo">${escapeHtml(dealer.initials)}</div><div><p class="eyebrow">Scheda concessionario</p><h1 id="page-title">${escapeHtml(dealer.name)}</h1><div class="dealer-meta"><span>${icon("location")}${escapeHtml(dealer.region)}</span><span>${icon("users")}${escapeHtml(dealer.manager)}</span><span>${escapeHtml(dealer.id)}</span></div></div></div><div class="header-actions">${jet&&link?`<a class="button" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">Apri compilazione</a><button class="button" id="edit-dealer">Modifica anagrafica</button><button class="button" id="add-note">Aggiungi nota</button>`:""}<button class="button primary" data-export-csv>${icon("download")}Esporta rete</button></div></header>
      <div class="summary-strip"><div class="summary-cell"><span>Stato rilevazione</span><strong>${escapeHtml(statusLabel[data.submission.collection_status]||data.submission.collection_status)}</strong></div><div class="summary-cell"><span>Ultimo invio</span><strong>${dealer.sent}</strong></div><div class="summary-cell"><span>Campagna</span><strong>${escapeHtml(data.campaign.name)}</strong></div><div class="summary-cell"><span>KPI compilati</span><strong>${filled} / ${data.values.length}</strong></div></div>
      ${collectionAdmin}
      <div class="comparison-metrics">${data.values.slice(0,4).map((item) => `<article class="comparison-card"><span>${escapeHtml(item.name)}</span><strong>${formatValue(item.value,item)}</strong><small>Media rete: ${formatValue(item.network_avg,item)}</small></article>`).join("")}</div>
      <div class="panel"><div class="panel-header"><div><h2>Performance KPI</h2><p>Valori salvati per ${escapeHtml(data.campaign.name)}</p></div><button class="text-button" data-page-link="analysis">Apri analisi completa →</button></div><div class="table-wrap"><table><thead><tr><th>KPI</th><th>Valore attuale</th><th>Media rete</th><th>Valore precedente</th><th>Differenza</th><th>Variazione</th></tr></thead><tbody>${data.values.map((item) => { const absolute=item.value!==null&&item.previous_value!==null?item.value-item.previous_value:null; const delta=absolute!==null&&item.previous_value!==0?absolute/Math.abs(item.previous_value)*100:null; return `<tr><td class="kpi-name">${escapeHtml(item.name)}</td><td><strong>${formatValue(item.value,item)}</strong></td><td>${formatValue(item.network_avg,item)}</td><td>${formatValue(item.previous_value,item)}</td><td class="delta ${absolute>=0?"positive":"negative"}">${absolute===null?"—":`${absolute>=0?"+":""}${formatValue(absolute,item)}`}</td><td class="delta ${delta>=0?"positive":"negative"}">${delta===null?"—":`${delta>=0?"+":""}${delta.toFixed(1).replace(".",",")}%`}</td></tr>`; }).join("")}</tbody></table></div></div>
      ${!data.comparison.compatible?'<div class="demo-banner"><strong>Confronto non disponibile</strong><span>Le due rilevazioni usano versioni del questionario incompatibili.</span></div>':''}<div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Storico rilevazioni</h2><p>Campagne e KPI ricevuti</p></div></div><div class="panel-body"><ul class="activity-list">${data.history.map((item) => `<li class="activity-item"><span class="initials">RI</span><span><strong>${escapeHtml(item.campaign_name)}</strong><small>${formatDate(item.submitted_at,true)} · ${item.kpi_count} KPI</small></span>${collectionStatusBadge(item.collection_status || item.status)}</li>`).join("") || "<li>Nessuna rilevazione.</li>"}</ul></div></article>${jet?`<article class="panel"><div class="panel-header"><div><h2>Note JET</h2><p>Annotazioni interne</p></div></div><div class="panel-body"><ul class="activity-list">${data.notes.length ? data.notes.map((note) => `<li class="activity-item"><span class="initials">${note.author.split(" ").map((part)=>part[0]).join("").slice(0,2)}</span><span><strong>${escapeHtml(note.body)}</strong><small>${escapeHtml(note.author)}</small></span></li>`).join("") : "<li class='activity-item'><span>Nessuna nota presente.</span></li>"}</ul></div></article>`:""}</div>${editDialog}${dealerAdminDialog}
    </section>`;
  }

  function portalAnalysisPage() {
    const data = state.analysis;
    const max = Math.max(...data.regions.map((item) => item.average),1);
    return `<section class="page" aria-labelledby="page-title">${pageHeader({ eyebrow:"Benchmark e distribuzioni",title:'<span id="page-title">Analisi KPI</span>',subtitle:"Esplora performance e differenze territoriali sui dati inviati.",actions:`<button class="button primary" data-export-csv>${icon("download")}Esporta vista</button>` })}<div class="analysis-layout"><aside class="panel analysis-sidebar" aria-label="Filtri analisi"><div class="field"><label for="kpi-select">KPI analizzato</label><select id="kpi-select">${state.config.kpis.map((item) => `<option value="${item.id}" ${item.id===data.kpi.id?"selected":""}>${item.name}</option>`).join("")}</select></div><div class="field"><label>Campagna</label><select id="analysis-campaign">${state.config.campaigns.map((item)=>`<option value="${item.id}" ${item.id===data.campaign.id?"selected":""}>${item.name}</option>`).join("")}</select></div><button class="button primary" id="apply-analysis">Applica filtri</button></aside><div><article class="panel"><div class="panel-header"><div><h2>${data.kpi.name}: sintesi rete</h2><p>${data.stats.count} rilevazioni valide · ${data.kpi.unit}</p></div><span class="badge complete">Dati aggiornati</span></div><div class="analysis-summary"><div class="analysis-stat"><span>Media nazionale</span><strong>${formatValue(data.stats.average,data.kpi)}</strong></div><div class="analysis-stat"><span>Mediana</span><strong>${formatValue(data.stats.median,data.kpi)}</strong></div><div class="analysis-stat"><span>Minimo</span><strong>${formatValue(data.stats.min,data.kpi)}</strong></div><div class="analysis-stat"><span>Massimo</span><strong>${formatValue(data.stats.max,data.kpi)}</strong></div></div><div class="panel-body"><h3>Confronto per regione</h3><div class="bar-chart">${data.regions.map((item,index) => `<div class="bar-row"><span>${item.region}</span><div class="bar-track"><span class="${index===0?"accent":""}" style="width:${item.average/max*100}%"></span></div><strong>${Number(item.average).toLocaleString("it-IT",{maximumFractionDigits:1})}</strong></div>`).join("")}</div></div></article><div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Andamento nel tempo</h2><p>Confronto con la rilevazione precedente</p></div></div><div class="panel-body">${submissionChart()}</div></article><article class="panel"><div class="panel-header"><div><h2>Migliori concessionari</h2><p>Ordinati per ${data.kpi.name.toLowerCase()}</p></div></div><div class="panel-body"><ol class="ranking-list">${data.ranking.slice(0,5).map((item,index) => `<li class="ranking-item"><span class="ranking-number">${String(index+1).padStart(2,"0")}</span><span><strong>${item.name}</strong><small>${item.region}</small></span><span class="ranking-value">${formatValue(item.value,data.kpi)}</span></li>`).join("")}</ol></div></article></div></div></div></section>`;
  }

  function collectionPage(data) {
    const locked = ["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status);
    const statusClass = data.submission.collection_status === "NEEDS_REVIEW" ? "verify" : locked ? "complete" : ["DRAFT","REOPENED"].includes(data.submission.collection_status) ? "draft" : "missing";
    const saveLabel=data.submission.updated_at?`Bozza salvata alle ${new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(data.submission.updated_at))}`:"Bozza non ancora salvata";
    const sectionDescription={"Performance commerciale":"Volumi, obiettivi e attività commerciale del periodo.","Ricambi":"Ricavi, obiettivi e ordini del reparto ricambi.","Assistenza e officina":"Capacità, utilizzo e ricavi delle attività di assistenza.","Soddisfazione e rete":"Indicatori sintetici sulla relazione cliente e sulla struttura."};
    const formContent = data.mode === "jotform" && data.liveReady
      ? `<div class="jotform-frame panel"><iframe title="Questionario ${escapeHtml(data.campaign.name)}" src="${escapeHtml(data.embedUrl)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="geolocation 'none'; camera 'none'; microphone 'none'"></iframe></div>`
      : `<form id="survey-form" class="questionnaire-shell" novalidate><aside class="collection-rail"><div class="collection-context"><p class="eyebrow">Concessionario</p><h1 id="collection-title">${escapeHtml(data.dealer.name)}</h1><span class="dealer-reference">Dealer ID · ${escapeHtml(data.dealer.id)}</span></div><dl class="collection-meta"><div><dt>Rilevazione</dt><dd>${escapeHtml(data.campaign.name)}</dd></div><div><dt>Periodo</dt><dd>${formatDate(data.campaign.open_date)} — ${formatDate(data.campaign.close_date)}</dd></div><div><dt>Scadenza</dt><dd>${formatDate(data.campaign.close_date)}</dd></div></dl><div class="questionnaire-progress"><div><strong id="completion-label">0 di ${data.questionnaire.fields.length} dati completati · 0%</strong><span id="section-progress-label">Sezione 1 di ${data.questionnaire.sections.length}</span></div><div class="progress-track"><span id="questionnaire-progress-bar" style="width:0%"></span></div></div><nav class="section-nav" aria-label="Sezioni questionario">${data.questionnaire.sections.map((section,index)=>`<button type="button" data-section-target="${index}" class="${index===0?"is-active":""}"><span>${String(index+1).padStart(2,"0")}</span><em>${escapeHtml(section)}</em><small data-section-completion="${index}">0/${data.questionnaire.fields.filter(field=>field.section===section).length}</small></button>`).join("")}</nav><div class="save-indicator" aria-live="polite"><span></span><strong id="save-status">${saveLabel}</strong></div>${locked?"<p class='survey-confirmation'>La rilevazione è stata inviata. JET può riaprirla se occorre correggere i dati.</p>":`<div class="rail-actions"><button class="button" type="button" id="save-draft">Salva bozza</button><button class="button primary" type="submit" id="review-submit">Rivedi e invia</button></div>`}<p class="collection-support">Serve assistenza?<br><a href="mailto:${escapeHtml(data.support.email)}">${escapeHtml(data.support.label)}</a></p></aside><main class="collection-workspace">${data.questionnaire.sections.map((section,index)=>`<section class="questionnaire-section ${index===0?"is-active":""}" data-section="${index}" aria-labelledby="section-${index}"><header class="section-header"><p class="eyebrow">Sezione ${String(index+1).padStart(2,"0")}</p><h2 id="section-${index}">${escapeHtml(section)}</h2><p>${escapeHtml(sectionDescription[section]||"Inserisci i dati relativi all'intero periodo di rilevazione.")}</p></header><div class="survey-fields">${data.questionnaire.fields.filter((field)=>field.section===section).map((field)=>`<div class="survey-field"><div class="field-copy"><label for="field-${escapeHtml(field.code)}">${escapeHtml(field.label)}${field.required?'<span aria-hidden="true">*</span>':""}</label><p>${escapeHtml(field.description)}</p><small id="help-${escapeHtml(field.code)}">Minimo ${field.min ?? 0}${field.max!==null?` · massimo ${field.max}`:""}</small></div><div class="field-control"><div class="input-with-unit"><input id="field-${escapeHtml(field.code)}" name="${escapeHtml(field.code)}" type="text" inputmode="decimal" autocomplete="off" placeholder="${escapeHtml(field.placeholder)}" value="${data.values[field.code]?.value ?? ""}" ${locked?"disabled":""} aria-describedby="help-${escapeHtml(field.code)} error-${escapeHtml(field.code)}" /><span>${escapeHtml(field.unit)}</span></div><small class="field-error" id="error-${escapeHtml(field.code)}" data-error-for="${escapeHtml(field.code)}"></small></div></div>`).join("")}</div><div class="section-actions"><button class="button" type="button" data-prev-section ${index===0?"disabled":""}>Indietro</button><span>${index+1} / ${data.questionnaire.sections.length}</span><button class="button primary" type="button" data-next-section>${index===data.questionnaire.sections.length-1?"Vai al riepilogo":"Continua"}</button></div></section>`).join("")}</main><dialog id="submit-review" class="review-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Controllo finale</p><h2>Riepilogo della rilevazione</h2><p>Controlla i dati prima dell'invio definitivo.</p></div><button type="button" id="close-review" aria-label="Chiudi">×</button></div><div id="review-values" class="review-values"></div><footer class="review-footer"><p>Dopo l'invio i dati non saranno modificabili senza riapertura da parte di JET.</p><div class="inline-actions"><button class="button" type="button" id="cancel-review">Torna ai dati</button><button class="button primary" type="button" id="confirm-submit">Conferma invio</button></div></footer></dialog></form>`;
    return `<section class="collection-page" aria-labelledby="collection-title"><div class="collection-demo-strip">Ambiente dimostrativo — tutti i dati visualizzati sono fittizi</div><header class="collection-header"><div class="collection-brand"><span class="brand-mark">SDF</span><span><strong>Network Performance</strong><small>Raccolta dati concessionari</small></span></div><span class="badge ${statusClass}">${escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status)}</span></header>${formContent}<footer class="collection-footer"><span>KPI dimostrativi da definire con il cliente.</span><span>SDF Network Performance</span></footer></section>`;
  }

  function collectionConfirmationPage(data) {
    return `<section class="collection-page confirmation-page"><div class="collection-demo-strip">Ambiente dimostrativo — tutti i dati visualizzati sono fittizi</div><header class="collection-header"><div class="collection-brand"><span class="brand-mark">SDF</span><span><strong>Network Performance</strong><small>Raccolta dati concessionari</small></span></div></header><main class="confirmation-layout"><div class="confirmation-mark">${icon("check")}</div><article class="confirmation-card"><p class="eyebrow">Invio completato</p><h1>Compilazione ricevuta</h1><p>I dati di <strong>${escapeHtml(data.dealer.name)}</strong> per la rilevazione <strong>${escapeHtml(data.campaign.name)}</strong> sono stati acquisiti correttamente.</p><dl><div><dt>Data e ora</dt><dd>${formatDate(data.submission.submitted_at,true)}</dd></div><div><dt>Stato</dt><dd>${escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status)}</dd></div><div><dt>Riferimento</dt><dd>${escapeHtml(data.dealer.id)} · ${escapeHtml(data.campaign.name)}</dd></div></dl><p class="confirmation-note">I dati non sono più modificabili da questo link. JET potrà riaprire la compilazione e contattare il concessionario se saranno necessarie verifiche.</p></article></main><footer class="collection-footer"><span>SDF Network Performance</span><span>Raccolta dati completata</span></footer></section>`;
  }

  function surveyPage(data) {
    return collectionPage({ ...data,mode:"demo",liveReady:false,support:{ label:"Assistenza JET",email:"supporto.jet@example.com" },submission:{ ...data.submission,collection_status:data.submission.status === "submitted" ? "SUBMITTED" : data.submission.status === "draft" ? "DRAFT" : "NOT_STARTED" } });
  }

  function campaignsPage() {
    const actions=state.role === "JET" ? `${state.config.jotform.enabled?'<button class="button" id="sync-jotform">Sincronizza da Jotform</button>':''}<button class="button primary" id="create-campaign">Nuova campagna</button>` : "";
    const dialog=state.role === "JET"?`<dialog id="campaign-dialog" class="review-dialog operational-dialog"><form id="campaign-form"><div class="review-dialog-header"><div><p class="eyebrow">Rilevazione annuale</p><h2 id="campaign-dialog-title">Nuova rilevazione</h2><p>Definisci periodo e concessionari coinvolti senza script o configurazioni tecniche.</p></div><button type="button" data-close-dialog>×</button></div><div class="operational-form-grid"><input type="hidden" name="campaign_id"><label><span>Nome</span><input name="name" required></label><label><span>Anno</span><input name="year" type="number" required></label><label><span>Numero rilevazione</span><input name="survey_no" type="number" min="1" required></label><label><span>Data apertura</span><input name="open_date" type="date" required></label><label><span>Scadenza</span><input name="close_date" type="date" required></label><label><span>Collegata a</span><select name="parent_campaign_id"><option value="">Nessuna</option>${state.campaigns.campaigns.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label></div><fieldset class="dealer-selector"><legend>Concessionari coinvolti</legend><div><label><input id="select-all-campaign-dealers" type="checkbox"> Seleziona tutti</label><span id="campaign-dealer-count">0 selezionati</span></div><div class="dealer-check-list">${dealers.map(item=>`<label><input type="checkbox" name="dealerIds" value="${escapeHtml(item.id)}"> <span>${escapeHtml(item.name)}<small>${escapeHtml(item.id)} · ${escapeHtml(item.email||"Email mancante")}</small></span></label>`).join("")}</div></fieldset><footer class="review-footer"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" type="submit">Salva rilevazione</button></footer></form></dialog>`:"";
    return `<section class="page" aria-labelledby="page-title">${pageHeader({eyebrow:"Gestione raccolta",title:'<span id="page-title">Rilevazioni</span>',subtitle:"Campagne annuali, finestre di compilazione e stato della rete.",actions})}<div class="campaign-list">${state.campaigns.campaigns.map((item) => `<article class="campaign-row panel"><div><span class="badge ${item.status === "open" ? "complete" : "missing"}">${item.is_archived?"Archiviata":item.status === "open" ? "Aperta" : item.status === "draft" ? "Bozza" : "Chiusa"}</span><h2>${escapeHtml(item.name)}</h2><p>${formatDate(item.open_date)} — ${formatDate(item.close_date)} · ${item.dealerIds.length} dealer</p></div><div class="campaign-kpis"><span><strong>${item.progress.received}/${item.progress.dealers}</strong> ricevute</span><span><strong>${item.progress.completion}%</strong> completamento</span></div><div class="campaign-actions"><button class="button" data-campaign-id="${escapeHtml(item.id)}">Apri dashboard</button>${state.role==="JET"?`${item.status==="draft"?`<button class="button" data-edit-campaign="${escapeHtml(item.id)}">Modifica</button><button class="button primary" data-campaign-status="open" data-campaign-action-id="${escapeHtml(item.id)}">Apri</button>`:item.status==="open"?`<button class="button" data-edit-campaign="${escapeHtml(item.id)}">Modifica</button><button class="button" data-campaign-status="closed" data-campaign-action-id="${escapeHtml(item.id)}">Chiudi</button>`:!item.is_archived?`<button class="button" data-campaign-status="archived" data-campaign-action-id="${escapeHtml(item.id)}">Archivia</button>`:""}<button class="button" data-duplicate-campaign="${escapeHtml(item.id)}">Duplica</button>`:""}</div></article>`).join("")}</div>${dialog}</section>`;
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
      if (page === "surveys") { state.campaigns = await api("/api/campaigns"); const registry=await api(`/api/dealers?campaignId=${campaignId()}`); dealers.splice(0,dealers.length,...registry.dealers.map(normalizeDealer)); main.innerHTML = campaignsPage(); }
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
      const filtered = dealers.filter((dealer) => (!term || `${dealer.name} ${dealer.id}`.toLowerCase().includes(term)) && (!region || dealer.region === region) && (!status || dealer.collection_status === status));
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
      await api(`/api/dealers/${state.detail.dealer.id}/notes`,{method:"POST",body:JSON.stringify({body,author:"Daniele"})});
      showToast("Nota salvata.");
      await portalRenderPage("dealer",{dealer:state.detail.dealer});
    });
    const syncButton = main.querySelector("#sync-jotform") || main.querySelector("#sync-dealer");
    if (syncButton) syncButton.addEventListener("click",async () => {
      try { syncButton.disabled=true; const result=await api("/api/integrations/jotform/sync",{method:"POST",body:"{}"}); showToast(`${result.found} submission trovate · ${result.imported} nuove · ${result.errors} errori.`); state.overview=null; if (currentPage === "dealer") await portalRenderPage("dealer",{dealer:state.detail.dealer}); }
      catch (error) { showToast(error.message); } finally { syncButton.disabled=false; }
    });
    main.querySelector("#copy-collection-link")?.addEventListener("click",async()=>{ await navigator.clipboard.writeText(state.detail.collectionLink.url); showToast("Link copiato."); });
    main.querySelector("#edit-dealer")?.addEventListener("click",()=>main.querySelector("#dealer-edit-dialog")?.showModal());
    main.querySelector("#dealer-edit-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const previousId=state.detail.dealer.id;try{const values=Object.fromEntries(new FormData(event.currentTarget).entries());const result=await api(`/api/dealers/${encodeURIComponent(previousId)}`,{method:"PUT",body:JSON.stringify(values)});invalidateDataViews();showToast("Anagrafica aggiornata.");main.querySelector("#dealer-edit-dialog")?.close();await portalRenderPage("dealer",{dealer:{id:result.id}})}catch(error){showToast(error.message)}});
    main.querySelector("#deactivate-dealer")?.addEventListener("click",async()=>{if(!confirm("Disattivare il concessionario? Lo storico sarà conservato."))return;const dealerId=state.detail.dealer.id;try{await api(`/api/dealers/${encodeURIComponent(dealerId)}`,{method:"PUT",body:JSON.stringify({...state.detail.dealer,active:false})});invalidateDataViews();showToast("Concessionario disattivato; storico conservato.");await portalRenderPage("dealers")}catch(error){showToast(error.message)}});
    main.querySelector("#regenerate-link")?.addEventListener("click",async()=>{
      if (!confirm("Rigenerare il link? Il precedente smetterà di funzionare.")) return;
      await api(`/api/dealers/${encodeURIComponent(state.detail.dealer.id)}/collection-link/regenerate?campaignId=${encodeURIComponent(campaignId())}`,{method:"POST",body:"{}"}); showToast("Link rigenerato."); await portalRenderPage("dealer",{dealer:state.detail.dealer});
    });
    main.querySelector("#revoke-link")?.addEventListener("click",async()=>{
      if (!confirm("Revocare il link di compilazione?")) return;
      await api(`/api/dealers/${encodeURIComponent(state.detail.dealer.id)}/collection-link/revoke?campaignId=${encodeURIComponent(campaignId())}`,{method:"POST",body:"{}"}); showToast("Link revocato."); await portalRenderPage("dealer",{dealer:state.detail.dealer});
    });
    main.querySelectorAll("[data-campaign-id]").forEach((button) => button.addEventListener("click", async () => { state.overview=await api(`/api/overview?campaignId=${button.dataset.campaignId}`); portalRenderPage("overview"); }));
    main.querySelectorAll("[data-close-dialog]").forEach(button=>{if(button.textContent.trim()==="×")button.setAttribute("aria-label","Chiudi");button.addEventListener("click",()=>button.closest("dialog")?.close())});
    main.querySelector("#create-dealer")?.addEventListener("click",()=>main.querySelector("#dealer-dialog")?.showModal());
    main.querySelector("#dealer-form")?.addEventListener("submit",async(event)=>{event.preventDefault();try{const values=Object.fromEntries(new FormData(event.currentTarget).entries());const result=await api("/api/dealers",{method:"POST",body:JSON.stringify(values)});invalidateDataViews();showToast("Concessionario creato.");main.querySelector("#dealer-dialog")?.close();await portalRenderPage("dealer",{dealer:{id:result.id}})}catch(error){showToast(error.message)}});
    const remindersButton = main.querySelector("#prepare-reminders");
    if (remindersButton) remindersButton.addEventListener("click", async () => {
      try {
        const result=await api(`/api/campaigns/${encodeURIComponent(campaignId())}/distribution`);const eligible=result.recipients.filter(item=>["NOT_STARTED","DRAFT","REOPENED"].includes(item.collection_status));
        main.querySelector("#distribution-content").innerHTML=`<div class="communication-fields"><label><span>Tipo comunicazione</span><select name="type"><option value="reminder">Reminder per mancanti e bozze</option><option value="initial">Invio iniziale</option></select></label><label><span>Testo base</span><textarea name="reminderText" rows="4" required>${escapeHtml(result.settings.reminderText)}</textarea></label><label><span>Firma</span><input name="signature" value="${escapeHtml(result.settings.signature)}" required></label></div><div class="distribution-summary"><strong>${result.recipients.length} concessionari associati</strong><span>${result.recipients.filter(item=>item.issues.length).length} con anomalie anagrafiche · ${eligible.length} da sollecitare</span></div><div class="recipient-list">${result.recipients.map(item=>`<label class="${item.issues.length?"has-issues":""}"><input type="checkbox" name="dealerIds" value="${escapeHtml(item.id)}" ${!item.issues.length&&eligible.includes(item)?"checked":""}><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.email||"Email mancante")} · ${escapeHtml(item.collection_status)}</small><code>${escapeHtml(item.link)}</code>${item.issues.map(issue=>`<em>${escapeHtml(issue)}</em>`).join("")}</span></label>`).join("")}</div>`;
        main.querySelector("#distribution-dialog")?.showModal();
      } catch (error) { showToast(error.message); }
    });
    main.querySelector("#distribution-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);try{const result=await api(`/api/campaigns/${encodeURIComponent(campaignId())}/distribution`,{method:"POST",body:JSON.stringify({type:data.get("type"),dealerIds:data.getAll("dealerIds"),reminderText:data.get("reminderText"),signature:data.get("signature")})});showToast(result.message);main.querySelector("#distribution-dialog")?.close()}catch(error){showToast(error.message)}});
    const importButton = main.querySelector("#import-dealers");
    const importInput = main.querySelector("#dealer-import-file");
    if (importButton && importInput) {
      importButton.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        try {
          const imported = parseCsv(await file.text());
          const preview=await api("/api/dealers/import/preview",{method:"POST",body:JSON.stringify({dealers:imported})});
          const content=main.querySelector("#import-preview-content");content.dataset.import=JSON.stringify(imported);content.innerHTML=`<div class="distribution-summary"><strong>${preview.rows.length} righe</strong><span>${preview.errors} errori · ${preview.warnings} avvisi</span></div><div class="table-wrap"><table><thead><tr><th>Riga</th><th>Dealer</th><th>Email</th><th>Esito</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.row}</td><td>${escapeHtml(row.name||"—")}<small>${escapeHtml(row.id||"ID mancante")}</small></td><td>${escapeHtml(row.email||"—")}</td><td>${row.issues.length?row.issues.map(issue=>`<span class="badge ${issue.severity==="ERROR"?"verify":"draft"}">${escapeHtml(issue.message)}</span>`).join(" "):'<span class="badge complete">Valido</span>'}</td></tr>`).join("")}</tbody></table></div>`;main.querySelector("#confirm-import").disabled=preview.errors>0;main.querySelector("#import-preview-dialog")?.showModal();
        } catch (error) { showToast(error.message); }
      });
    }
    main.querySelector("#confirm-import")?.addEventListener("click",async()=>{const content=main.querySelector("#import-preview-content");try{const imported=JSON.parse(content.dataset.import||"[]");const result=await api("/api/dealers/import",{method:"POST",body:JSON.stringify({dealers:imported})});invalidateDataViews();showToast(`${result.count} concessionari importati.`);main.querySelector("#import-preview-dialog")?.close();await portalRenderPage("dealers")}catch(error){showToast(error.message)}});
    const createCampaign = main.querySelector("#create-campaign");
    const campaignDialog=main.querySelector("#campaign-dialog"),campaignForm=main.querySelector("#campaign-form");
    const updateDealerCount=()=>{const selected=campaignForm?.querySelectorAll('[name="dealerIds"]:checked').length||0;const target=main.querySelector("#campaign-dealer-count");if(target)target.textContent=`${selected} selezionati`};
    if (createCampaign) createCampaign.addEventListener("click",()=>{campaignForm.reset();campaignForm.campaign_id.value="";const year=new Date().getFullYear()+1;campaignForm.name.value=`Rilevazione 1 — ${year}`;campaignForm.year.value=year;campaignForm.survey_no.value=1;campaignForm.open_date.value=`${year}-01-15`;campaignForm.close_date.value=`${year}-03-31`;main.querySelector("#campaign-dialog-title").textContent="Nuova rilevazione";updateDealerCount();campaignDialog.showModal()});
    campaignForm?.querySelector("#select-all-campaign-dealers")?.addEventListener("change",event=>{campaignForm.querySelectorAll('[name="dealerIds"]').forEach(input=>input.checked=event.target.checked);updateDealerCount()});campaignForm?.querySelectorAll('[name="dealerIds"]').forEach(input=>input.addEventListener("change",updateDealerCount));
    main.querySelectorAll("[data-edit-campaign]").forEach(button=>button.addEventListener("click",()=>{const item=state.campaigns.campaigns.find(row=>row.id===button.dataset.editCampaign);campaignForm.reset();for(const name of ["campaign_id","name","year","survey_no","open_date","close_date","parent_campaign_id"])if(campaignForm[name])campaignForm[name].value=name==="campaign_id"?item.id:item[name]||"";campaignForm.querySelectorAll('[name="dealerIds"]').forEach(input=>input.checked=item.dealerIds.includes(input.value));main.querySelector("#campaign-dialog-title").textContent="Modifica rilevazione";updateDealerCount();campaignDialog.showModal()}));
    campaignForm?.addEventListener("submit",async(event)=>{event.preventDefault();const data=new FormData(campaignForm);const id=data.get("campaign_id");const payload={name:data.get("name"),year:Number(data.get("year")),survey_no:Number(data.get("survey_no")),open_date:data.get("open_date"),close_date:data.get("close_date"),parent_campaign_id:data.get("parent_campaign_id")||null,dealerIds:data.getAll("dealerIds")};try{if(id){await api(`/api/campaigns/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify(payload)});const existing=state.campaigns.campaigns.find(item=>item.id===id);if(existing.status==="draft")await api(`/api/campaigns/${encodeURIComponent(id)}/dealers`,{method:"PUT",body:JSON.stringify({dealerIds:payload.dealerIds})})}else await api("/api/campaigns",{method:"POST",body:JSON.stringify(payload)});invalidateDataViews();state.config=null;showToast("Rilevazione salvata.");campaignDialog.close();await portalRenderPage("surveys")}catch(error){showToast(error.message)}});
    main.querySelectorAll("[data-campaign-status]").forEach(button=>button.addEventListener("click",async()=>{if(!confirm(`Confermare l'operazione sulla rilevazione?`))return;try{await api(`/api/campaigns/${encodeURIComponent(button.dataset.campaignActionId)}/status`,{method:"POST",body:JSON.stringify({status:button.dataset.campaignStatus})});invalidateDataViews();state.config=null;showToast("Stato rilevazione aggiornato.");await portalRenderPage("surveys")}catch(error){showToast(error.message)}}));
    main.querySelectorAll("[data-duplicate-campaign]").forEach(button=>button.addEventListener("click",async()=>{const source=state.campaigns.campaigns.find(item=>item.id===button.dataset.duplicateCampaign);const year=source.year+1;try{await api(`/api/campaigns/${encodeURIComponent(source.id)}/duplicate`,{method:"POST",body:JSON.stringify({name:`${source.name} — copia ${year}`,year,open_date:`${year}-01-01`,close_date:`${year}-12-31`})});invalidateDataViews();state.config=null;showToast("Rilevazione duplicata in bozza.");await portalRenderPage("surveys")}catch(error){showToast(error.message)}}));
    const form = main.querySelector("#survey-form");
    if (form) {
      let activeSection=0;
      const sections=[...form.querySelectorAll(".questionnaire-section")];
      const showSection=(index)=>{ activeSection=Math.max(0,Math.min(index,sections.length-1)); sections.forEach((section,i)=>section.classList.toggle("is-active",i===activeSection)); form.querySelectorAll("[data-section-target]").forEach((button,i)=>button.classList.toggle("is-active",i===activeSection)); const label=form.querySelector("#section-progress-label"); if(label)label.textContent=`Sezione ${activeSection+1} di ${sections.length}`; sections[activeSection]?.scrollIntoView({behavior:"smooth",block:"start"}); };
      const valuesFromForm=()=>Object.fromEntries(new FormData(form).entries());
      const fieldError=(field,raw,{required=true}={})=>{const text=String(raw??"").trim();if(!text)return required&&field.required?"Campo obbligatorio":"";const normalized=text.includes(",")?text.replaceAll(".","").replace(",","."):text;const value=Number(normalized);if(!Number.isFinite(value))return"Inserire un numero valido";if(field.min!==null&&value<field.min)return`Il valore minimo è ${field.min}`;if(field.max!==null&&value>field.max)return`Il valore massimo è ${field.max}`;if(field.type==="integer"&&!Number.isInteger(value))return"Inserire un numero intero";return""};
      const validateClient=(values,options)=>Object.fromEntries(state.collection.questionnaire.fields.map((field)=>[field.code,fieldError(field,values[field.code],options)]).filter(([,message])=>message));
      const markError=(code,message="")=>{const target=form.querySelector(`[data-error-for="${code}"]`);if(target)target.textContent=message;form.querySelector(`[name="${code}"]`)?.closest(".survey-field")?.classList.toggle("has-error",Boolean(message));};
      const updateProgress=()=>{const values=valuesFromForm();const fields=state.collection?.questionnaire?.fields||[];const requiredFields=fields.filter(field=>field.required);const valid=(field)=>String(values[field.code]??"").trim()!==""&&!fieldError(field,values[field.code],{required:false});const completed=requiredFields.filter(valid).length;const percent=requiredFields.length?Math.round(completed/requiredFields.length*100):0;const bar=form.querySelector("#questionnaire-progress-bar");if(bar)bar.style.width=`${percent}%`;const label=form.querySelector("#completion-label");if(label)label.textContent=`${completed} di ${requiredFields.length} dati completati · ${percent}%`;state.collection.questionnaire.sections.forEach((section,index)=>{const scoped=requiredFields.filter(field=>field.section===section);const target=form.querySelector(`[data-section-completion="${index}"]`);if(target)target.textContent=`${scoped.filter(valid).length}/${scoped.length}`});};
      const setSaveState=(mode,text)=>{const indicator=form.querySelector(".save-indicator");if(indicator){indicator.classList.remove("is-saving","is-saved","is-error");if(mode)indicator.classList.add(mode)}const status=form.querySelector("#save-status");if(status)status.textContent=text;};
      const submitSurvey = async (mode,{silent=false}={}) => {
        const token = state.collectionToken || new URLSearchParams(location.search).get("token");
        const values = valuesFromForm();
        if(mode==="draft")setSaveState("is-saving","Salvataggio…");
        try {
          const endpoint = currentPage === "collection" ? `/api/compila/${encodeURIComponent(token)}/${mode}` : `/api/survey/${encodeURIComponent(token)}/${mode}`;
          const result=await api(endpoint,{method:mode === "draft" ? "PUT" : "POST",body:JSON.stringify({values})});
          state.collection=result;
          invalidateDataViews();
          if(mode==="draft")setSaveState("is-saved",`Bozza salvata alle ${new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`);
          if(!silent) showToast(mode === "draft" ? "Bozza salvata." : "Rilevazione inviata correttamente.");
          if (currentPage === "collection" && mode === "submit") { history.replaceState(null,"",`/compila/${encodeURIComponent(token)}/conferma`); await portalRenderPage("confirmation",{token}); }
          else if(!silent) await portalRenderPage(currentPage === "collection" ? "collection" : "survey",{token});
        } catch (error) {
          if(mode==="draft")setSaveState("is-error","Errore di salvataggio — riprova");
          if (error.details) {
            form.querySelector("#submit-review")?.close();
            Object.entries(error.details).forEach(([id,message]) => markError(id,message));
            const firstCode=Object.keys(error.details)[0]; const firstInput=form.querySelector(`[name="${firstCode}"]`); const sectionIndex=sections.findIndex((section)=>section.contains(firstInput)); if(sectionIndex>=0)showSection(sectionIndex); firstInput?.focus();
          }
          if(!silent||mode!=="draft") showToast(error.message);
        }
      };
      form.querySelectorAll("[data-section-target]").forEach((button)=>button.addEventListener("click",()=>showSection(Number(button.dataset.sectionTarget))));
      form.querySelectorAll("[data-next-section]").forEach((button)=>button.addEventListener("click",()=>activeSection===sections.length-1?form.requestSubmit():showSection(activeSection+1)));
      form.querySelectorAll("[data-prev-section]").forEach((button)=>button.addEventListener("click",()=>showSection(activeSection-1)));
      form.addEventListener("input",(event)=>{updateProgress();const field=state.collection.questionnaire.fields.find(item=>item.code===event.target.name);if(field)markError(field.code,fieldError(field,event.target.value,{required:false}));setSaveState("","Modifiche non salvate");clearTimeout(state.autosaveTimer);state.autosaveTimer=setTimeout(()=>submitSurvey("draft",{silent:true}),1800);});
      form.addEventListener("submit", (event) => {event.preventDefault();clearTimeout(state.autosaveTimer);const dialog=form.querySelector("#submit-review");const values=valuesFromForm();const fields=state.collection.questionnaire.fields;const errors=validateClient(values);fields.forEach(field=>markError(field.code,errors[field.code]||""));if(Object.keys(errors).length){const input=form.querySelector(`[name="${Object.keys(errors)[0]}"]`);const index=sections.findIndex(section=>section.contains(input));if(index>=0)showSection(index);input?.focus();showToast("Controlla i campi evidenziati.");return}form.querySelector("#review-values").innerHTML=state.collection.questionnaire.sections.map((section,index)=>`<section class="review-group"><h3>${escapeHtml(section)}</h3>${fields.filter(field=>field.section===section).map(field=>`<div class="review-item"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(values[field.code])} ${escapeHtml(field.unit)}</strong><button type="button" class="review-edit" data-review-edit="${escapeHtml(field.code)}" data-review-section="${index}">Modifica</button></div>`).join("")}</section>`).join("");form.querySelectorAll("[data-review-edit]").forEach(button=>button.addEventListener("click",()=>{dialog.close();showSection(Number(button.dataset.reviewSection));form.querySelector(`[name="${button.dataset.reviewEdit}"]`)?.focus()}));dialog.showModal();});
      form.querySelector("#confirm-submit")?.addEventListener("click",()=>submitSurvey("submit"));
      ["#close-review","#cancel-review"].forEach((selector)=>form.querySelector(selector)?.addEventListener("click",()=>form.querySelector("#submit-review")?.close()));
      main.querySelector("#save-draft")?.addEventListener("click", () => submitSurvey("draft"));
      updateProgress();
    }
    const editDialog=main.querySelector("#edit-values-dialog");
    main.querySelector("#edit-submission-values")?.addEventListener("click",()=>editDialog?.showModal());
    ["#close-edit-values","#cancel-edit-values"].forEach(selector=>main.querySelector(selector)?.addEventListener("click",()=>editDialog?.close()));
    main.querySelector("#edit-values-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const editForm=event.currentTarget;const dealerId=state.detail.dealer.id;editForm.querySelectorAll("[data-edit-error]").forEach(item=>item.textContent="");try{await api(`/api/dealers/${encodeURIComponent(dealerId)}/submission/values`,{method:"PUT",body:JSON.stringify({campaignId:campaignId(),values:Object.fromEntries(new FormData(editForm).entries())})});invalidateDataViews();showToast("Valori aggiornati e KPI ricalcolati.");await portalRenderPage("dealer",{dealer:{id:dealerId}})}catch(error){if(error.details)Object.entries(error.details).forEach(([code,message])=>{const target=editForm.querySelector(`[data-edit-error="${code}"]`);if(target)target.textContent=message});showToast(error.message)}});
    main.querySelectorAll("[data-submission-status]").forEach((button)=>button.addEventListener("click",async()=>{const dealerId=state.detail.dealer.id;await api(`/api/dealers/${encodeURIComponent(dealerId)}/submission/status`,{method:"POST",body:JSON.stringify({campaignId:campaignId(),status:button.dataset.submissionStatus})});invalidateDataViews();showToast(button.dataset.submissionStatus==="REOPENED"?"Compilazione riaperta.":"Compilazione validata.");await portalRenderPage("dealer",{dealer:{id:dealerId}});}));
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

  const searchDialog=document.querySelector("#global-search-dialog");
  const searchInput=document.querySelector("#global-search-input");
  document.addEventListener("sdf:global-search",(event)=>openGlobalSearch(event.detail?.trigger));
  document.addEventListener("keydown",(event)=>{
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==="k") { event.preventDefault(); openGlobalSearch(); }
  });
  searchInput?.addEventListener("input",()=>{state.searchActiveIndex=0;renderGlobalSearch(searchInput.value)});
  searchInput?.addEventListener("keydown",(event)=>{
    if (event.key==="ArrowDown") { event.preventDefault();updateGlobalSearchSelection(state.searchActiveIndex+1); }
    if (event.key==="ArrowUp") { event.preventDefault();updateGlobalSearchSelection(state.searchActiveIndex-1); }
    if (event.key==="Enter") { event.preventDefault();activateGlobalSearchResult(state.searchActiveIndex); }
    if (event.key==="Escape") { event.preventDefault();searchDialog?.close(); }
  });
  document.querySelector("#global-search-close")?.addEventListener("click",()=>searchDialog?.close());
  searchDialog?.addEventListener("close",()=>state.searchTrigger?.focus?.());

  const params = new URLSearchParams(location.search);
  const requested = params.get("page");
  const collectionPath = location.pathname.match(/^\/compila\/([^/]+)(?:\/(conferma))?\/?$/);
  if (collectionPath) portalRenderPage(collectionPath[2] ? "confirmation" : "collection",{token:decodeURIComponent(collectionPath[1])});
  else if (requested === "survey") portalRenderPage("survey",{token:params.get("token")});
  else if (requested === "dealer") portalRenderPage("dealer",{dealer:{id:params.get("dealer") || "DEMO-001"}});
  else portalRenderPage(["overview","dealers","analysis","surveys","reports"].includes(requested) ? requested : "overview");
})();
