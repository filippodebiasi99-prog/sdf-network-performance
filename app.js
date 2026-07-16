const dealers = [
  { id: "IT-0018", name: "AgriVerde S.r.l.", initials: "AV", region: "Lombardia", area: "Nord Ovest", manager: "Marco Riva", status: "complete", completion: 100, sent: "14 lug 2026", quality: 98, revenue: 4.82, margin: 18.6, machines: 74, growth: 12.4 },
  { id: "IT-0021", name: "Meccanica Rurale S.p.A.", initials: "MR", region: "Veneto", area: "Nord Est", manager: "Elena Costa", status: "complete", completion: 100, sent: "14 lug 2026", quality: 96, revenue: 5.34, margin: 17.2, machines: 81, growth: 8.1 },
  { id: "IT-0034", name: "Terra e Motori S.r.l.", initials: "TM", region: "Emilia-Romagna", area: "Centro Nord", manager: "Paolo Serra", status: "verify", completion: 100, sent: "13 lug 2026", quality: 72, revenue: 3.91, margin: 14.8, machines: 66, growth: -2.3 },
  { id: "IT-0042", name: "Fratelli Bassi Macchine", initials: "FB", region: "Piemonte", area: "Nord Ovest", manager: "Marco Riva", status: "missing", completion: 0, sent: "—", quality: 0, revenue: 4.12, margin: 16.3, machines: 69, growth: 3.2 },
  { id: "IT-0057", name: "Agroservice Veneto", initials: "AV", region: "Veneto", area: "Nord Est", manager: "Elena Costa", status: "complete", completion: 100, sent: "12 lug 2026", quality: 93, revenue: 4.67, margin: 19.1, machines: 77, growth: 10.6 },
  { id: "IT-0063", name: "Emilia Trattori S.r.l.", initials: "ET", region: "Emilia-Romagna", area: "Centro Nord", manager: "Paolo Serra", status: "complete", completion: 100, sent: "11 lug 2026", quality: 91, revenue: 5.08, margin: 16.9, machines: 79, growth: 6.7 },
  { id: "IT-0075", name: "NordAgri Commerciale", initials: "NA", region: "Lombardia", area: "Nord Ovest", manager: "Marco Riva", status: "verify", completion: 100, sent: "10 lug 2026", quality: 68, revenue: 3.56, margin: 13.4, machines: 54, growth: -4.1 },
  { id: "IT-0082", name: "Pianura Macchine Agricole", initials: "PM", region: "Piemonte", area: "Nord Ovest", manager: "Marco Riva", status: "complete", completion: 100, sent: "09 lug 2026", quality: 95, revenue: 4.39, margin: 17.7, machines: 71, growth: 9.3 },
  { id: "IT-0091", name: "Adriatica Agrimec", initials: "AA", region: "Emilia-Romagna", area: "Centro Nord", manager: "Paolo Serra", status: "complete", completion: 100, sent: "08 lug 2026", quality: 89, revenue: 4.18, margin: 15.9, machines: 65, growth: 4.8 },
  { id: "IT-0104", name: "Verona Campo S.r.l.", initials: "VC", region: "Veneto", area: "Nord Est", manager: "Elena Costa", status: "missing", completion: 0, sent: "—", quality: 0, revenue: 3.88, margin: 15.2, machines: 62, growth: 1.9 },
  { id: "IT-0112", name: "Lario Agri Systems", initials: "LA", region: "Lombardia", area: "Nord Ovest", manager: "Marco Riva", status: "complete", completion: 100, sent: "07 lug 2026", quality: 97, revenue: 5.61, margin: 20.2, machines: 86, growth: 14.1 },
  { id: "IT-0129", name: "Monferrato Tractors", initials: "MT", region: "Piemonte", area: "Nord Ovest", manager: "Marco Riva", status: "complete", completion: 100, sent: "06 lug 2026", quality: 92, revenue: 4.45, margin: 18.1, machines: 73, growth: 7.9 },
  { id: "IT-0137", name: "Rovigo Macchine", initials: "RM", region: "Veneto", area: "Nord Est", manager: "Elena Costa", status: "verify", completion: 100, sent: "05 lug 2026", quality: 75, revenue: 3.71, margin: 14.1, machines: 59, growth: -1.2 },
  { id: "IT-0148", name: "Bologna Agri Pro", initials: "BA", region: "Emilia-Romagna", area: "Centro Nord", manager: "Paolo Serra", status: "complete", completion: 100, sent: "05 lug 2026", quality: 94, revenue: 4.92, margin: 17.4, machines: 76, growth: 8.8 },
  { id: "IT-0153", name: "Bergamo Rural Tech", initials: "BR", region: "Lombardia", area: "Nord Ovest", manager: "Marco Riva", status: "missing", completion: 0, sent: "—", quality: 0, revenue: 3.62, margin: 15.7, machines: 57, growth: 2.6 },
  { id: "IT-0166", name: "Cuneo Terra Service", initials: "CT", region: "Piemonte", area: "Nord Ovest", manager: "Marco Riva", status: "complete", completion: 100, sent: "03 lug 2026", quality: 90, revenue: 4.26, margin: 16.8, machines: 68, growth: 5.3 },
  { id: "IT-0174", name: "Padova Agri Network", initials: "PA", region: "Veneto", area: "Nord Est", manager: "Elena Costa", status: "missing", completion: 0, sent: "—", quality: 0, revenue: 3.94, margin: 15.5, machines: 64, growth: 1.4 },
  { id: "IT-0188", name: "Romagna Campo", initials: "RC", region: "Emilia-Romagna", area: "Centro Nord", manager: "Paolo Serra", status: "complete", completion: 100, sent: "01 lug 2026", quality: 88, revenue: 4.01, margin: 16.1, machines: 63, growth: 4.2 }
];

const icons = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  dealers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21v-9h16v9M7 12V5h10v7M9 8h2m2 0h2M8 16h2m4 0h2M12 21v-5"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6m-6 4h6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-4-4 4 4 4-4M4 20h16"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 11a4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 2.5 20h19zM12 9v5m0 3v.1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 14 0m-5-5 5 5-5 5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M7 12h10m-7 7h4"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.8 2.1c-1 .6-1.5 1.1-1.5 2.4M12 17h.01"/></svg>'
};

const statusLabel = { complete: "Completato", verify: "Da verificare", missing: "Non compilato" };
const main = document.querySelector("#main-content");
let currentPage = "overview";
let selectedDealer = dealers[0];
let toastTimer;

function icon(name) { return icons[name] || ""; }
function hydrateIcons(scope = document) {
  scope.querySelectorAll("[data-icon]").forEach((node) => { node.innerHTML = icon(node.dataset.icon); });
}
function formatNumber(value, suffix = "") { return `${String(value).replace(".", ",")}${suffix}`; }
function statusBadge(status) { return `<span class="badge ${status}">${statusLabel[status]}</span>`; }
function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}
function placeholderAction(message = "Azione disponibile nella versione completa del portale.") { showToast(message); }

function pageHeader({ eyebrow, title, subtitle, actions = "" }) {
  return `<header class="page-header"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p><div class="last-update">${icon("clock")} Ultimo aggiornamento: oggi, 15:42</div></div><div class="header-actions">${actions}</div></header>`;
}

function overviewPage() {
  return `<section class="page" aria-labelledby="page-title">
    ${pageHeader({
      eyebrow: "Monitoraggio rete",
      title: '<span id="page-title">Overview</span>',
      subtitle: "Stato della raccolta dati e principali indicatori della rete.",
      actions: `<select class="select-compact" aria-label="Seleziona rilevazione"><option>Rilevazione 1 — 2026</option><option>Rilevazione 2 — 2025</option></select><button class="button primary" data-action="export">${icon("download")}Esporta report</button>`
    })}
    <div class="metrics" aria-label="Indicatori principali">
      <article class="metric"><div class="metric-head"><span>Concessionari totali</span><span class="metric-icon">${icon("users")}</span></div><div class="metric-value">64</div><div class="metric-foot">4 aree geografiche</div></article>
      <article class="metric"><div class="metric-head"><span>Compilazioni ricevute</span><span class="metric-icon">${icon("check")}</span></div><div class="metric-value">48</div><div class="metric-foot"><span class="trend-up">+8</span> negli ultimi 7 giorni</div></article>
      <article class="metric"><div class="metric-head"><span>Completamento</span><span class="metric-icon">${icon("analysis")}</span></div><div class="metric-value">75%</div><div class="metric-foot"><span class="trend-up">+6,4%</span> vs rilevazione precedente</div></article>
      <article class="metric"><div class="metric-head"><span>Compilazioni mancanti</span><span class="metric-icon warn">${icon("clock")}</span></div><div class="metric-value">16</div><div class="metric-foot">Scadenza tra 12 giorni</div></article>
      <article class="metric"><div class="metric-head"><span>Dati da verificare</span><span class="metric-icon warn">${icon("alert")}</span></div><div class="metric-value">4</div><div class="metric-foot">2 ad alta priorità</div></article>
    </div>

    <div class="content-grid">
      <article class="panel"><div class="panel-header"><div><h2>Andamento delle compilazioni</h2><p>Invii cumulativi · 01 giugno — 15 luglio</p></div><div class="chart-legend"><span class="legend-item"><i class="legend-line"></i>2026</span><span class="legend-item"><i class="legend-line muted"></i>2025</span></div></div><div class="panel-body">${submissionChart()}</div></article>
      <article class="panel"><div class="panel-header"><div><h2>Stato per area</h2><p>Distribuzione delle 64 rilevazioni</p></div><button class="text-button" data-page-link="dealers">Vedi rete →</button></div><div class="panel-body">${areaStatus()}</div></article>
    </div>

    <div class="content-grid equal">
      <article class="panel"><div class="panel-header"><div><h2>Ultime compilazioni ricevute</h2><p>Aggiornamenti più recenti della rete</p></div><button class="text-button" data-page-link="dealers">Tutte le compilazioni →</button></div><div class="panel-body"><ul class="activity-list">
        ${dealers.slice(0,4).map((d, i) => `<li class="activity-item"><span class="initials">${d.initials}</span><span><strong>${d.name}</strong><small>${d.region} · ${d.id}</small></span><time class="activity-time">${i === 0 ? "18 min fa" : i === 1 ? "1 ora fa" : `${i + 1} ore fa`}</time></li>`).join("")}
      </ul></div></article>
      <article class="panel"><div class="panel-header"><div><h2>Richiedono attenzione</h2><p>Anomalie e scadenze operative</p></div><button class="text-button" data-action="review">Gestisci →</button></div><div class="panel-body"><ul class="alert-list">
        <li class="alert-item"><span class="alert-symbol">${icon("alert")}</span><span><strong>Marginalità fuori intervallo</strong><small>Terra e Motori S.r.l. · KPI 04</small></span><span class="badge verify">Alta</span></li>
        <li class="alert-item"><span class="alert-symbol">${icon("clock")}</span><span><strong>16 rilevazioni mancanti</strong><small>Reminder programmato per il 18 luglio</small></span><span class="badge missing">12 gg</span></li>
        <li class="alert-item"><span class="alert-symbol">${icon("alert")}</span><span><strong>Valori duplicati da verificare</strong><small>NordAgri Commerciale · 2 campi</small></span><span class="badge verify">Media</span></li>
      </ul></div></article>
    </div>
  </section>`;
}

function submissionChart() {
  return `<svg class="line-chart" viewBox="0 0 700 222" role="img" aria-label="Le compilazioni 2026 crescono da 3 a 48 tra il primo giugno e il 15 luglio, superando il 2025.">
    <defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eb212e" stop-opacity=".2"/><stop offset="1" stop-color="#eb212e" stop-opacity="0"/></linearGradient></defs>
    <path class="chart-grid-line" d="M40 24H680M40 68H680M40 112H680M40 156H680M40 200H680"/><text class="chart-label" x="10" y="203">0</text><text class="chart-label" x="5" y="159">12</text><text class="chart-label" x="5" y="115">24</text><text class="chart-label" x="5" y="71">36</text><text class="chart-label" x="5" y="27">48</text>
    <path class="chart-area" d="M40 190 C95 185 105 175 150 169 S218 147 258 137 S327 112 365 102 S430 81 472 69 S535 51 580 42 S645 28 680 24 L680 200 L40 200Z"/>
    <path class="chart-line previous" d="M40 190 C110 180 140 164 195 151 S290 126 355 108 S465 91 530 69 S620 50 680 42"/>
    <path class="chart-line" d="M40 190 C95 185 105 175 150 169 S218 147 258 137 S327 112 365 102 S430 81 472 69 S535 51 580 42 S645 28 680 24"/>
    <circle class="chart-dot" cx="680" cy="24" r="4"/><text class="chart-label" x="40" y="218">01 giu</text><text class="chart-label" x="190" y="218">12 giu</text><text class="chart-label" x="345" y="218">23 giu</text><text class="chart-label" x="505" y="218">04 lug</text><text class="chart-label" x="645" y="218">15 lug</text>
  </svg>`;
}

function areaStatus() {
  const areas = [
    ["Nord Ovest", 81, 6, 13, "13/16"], ["Nord Est", 75, 6, 19, "12/16"], ["Centro", 69, 12, 19, "11/16"], ["Sud e Isole", 75, 0, 25, "12/16"]
  ];
  return `<div class="stack-list">${areas.map(a => `<div><div class="stack-row-head"><strong>${a[0]}</strong><span>${a[4]} · ${a[1]}%</span></div><div class="stack-bar"><span class="complete" style="width:${a[1]}%"></span><span class="verify" style="width:${a[2]}%"></span><span class="missing" style="width:${a[3]}%"></span></div></div>`).join("")}</div><div class="status-legend"><span><i style="background:var(--accent)"></i>Completato</span><span><i style="background:#f3a25d"></i>Da verificare</span><span><i style="background:var(--gray-75)"></i>Non compilato</span></div>`;
}

function dealersPage() {
  return `<section class="page" aria-labelledby="page-title">
    ${pageHeader({ eyebrow: "Anagrafica e avanzamento", title: '<span id="page-title">Concessionari</span>', subtitle: "Monitora lo stato delle rilevazioni per l’intera rete.", actions: `<button class="button" data-action="reminder">${icon("bell")}Invia reminder</button><button class="button primary" data-action="export">${icon("download")}Esporta dati</button>` })}
    <div class="summary-strip"><div class="summary-cell"><span>Rete totale</span><strong>64 dealer</strong></div><div class="summary-cell"><span>Completati</span><strong>48 <small class="trend-up">75%</small></strong></div><div class="summary-cell"><span>Da verificare</span><strong>4 <small style="color:var(--amber)">6%</small></strong></div><div class="summary-cell"><span>Non compilati</span><strong>16 <small style="color:var(--muted)">25%</small></strong></div></div>
    <div class="panel" style="margin-top:16px">
      <div class="filters"><div class="search-field">${icon("search")}<input id="dealer-search" type="search" placeholder="Cerca concessionario o Dealer ID" aria-label="Cerca concessionario" /></div><select id="region-filter" class="filter-select" aria-label="Filtra per regione"><option value="">Tutte le regioni</option>${[...new Set(dealers.map(d=>d.region))].map(v=>`<option>${v}</option>`).join("")}</select><select id="status-filter" class="filter-select" aria-label="Filtra per stato"><option value="">Tutti gli stati</option><option value="complete">Completato</option><option value="verify">Da verificare</option><option value="missing">Non compilato</option></select><button class="button" id="reset-filters">${icon("filter")}Azzera</button></div>
      <div id="dealer-results">${dealerResults(dealers)}</div>
    </div>
  </section>`;
}

function dealerResults(list) {
  if (!list.length) return `<div class="empty-preview"><div><span class="empty-icon">${icon("search")}</span><h2>Nessun concessionario trovato</h2><p>Modifica i filtri o azzera la ricerca per visualizzare nuovamente la rete.</p></div></div>`;
  const rows = list.map(d => `<tr><td><button class="dealer-link" data-dealer="${d.id}">${d.name}<span class="dealer-id">${d.id}</span></button></td><td>${d.region}</td><td>${d.manager}</td><td>${statusBadge(d.status)}</td><td><strong>${d.completion}%</strong></td><td>${d.sent}</td><td><span class="quality ${d.quality && d.quality < 80 ? "medium" : ""}"><span class="quality-bar"><i style="width:${d.quality}%"></i></span>${d.quality ? `${d.quality}%` : "—"}</span></td><td><button class="row-action" aria-label="Azioni per ${d.name}" data-action="row">${icon("dots")}</button></td></tr>`).join("");
  const cards = list.map(d => `<article class="mobile-dealer-card"><div class="mobile-dealer-top"><button class="dealer-link" data-dealer="${d.id}">${d.name}<span class="dealer-id">${d.id}</span></button>${statusBadge(d.status)}</div><div class="mobile-dealer-meta"><span>Regione<strong>${d.region}</strong></span><span>Area manager<strong>${d.manager}</strong></span><span>Completamento<strong>${d.completion}%</strong></span><span>Qualità dati<strong>${d.quality ? `${d.quality}%` : "—"}</strong></span></div></article>`).join("");
  return `<div class="table-wrap desktop-table"><table><thead><tr><th>Concessionario</th><th>Regione</th><th>Area manager</th><th>Stato</th><th>Completamento</th><th>Ultimo invio</th><th>Qualità dati</th><th aria-label="Azioni"></th></tr></thead><tbody>${rows}</tbody></table></div><div class="mobile-dealer-list">${cards}</div><div class="pagination"><span>Visualizzati ${list.length} di 64 concessionari</span><div class="pagination-controls"><button class="page-button active">1</button><button class="page-button">2</button><button class="page-button">3</button><button class="page-button">4</button><button class="page-button" aria-label="Pagina successiva">›</button></div></div>`;
}

function dealerDetailPage(dealer) {
  const kpis = [
    ["Fatturato", `€ ${formatNumber(dealer.revenue)} M`, "€ 4,16 M", "+15,9%", 78, 66, "positive"],
    ["Marginalità", formatNumber(dealer.margin, "%"), "16,8%", "+1,8 pp", 74, 63, "positive"],
    ["Macchine vendute", dealer.machines, "68", "+8,8%", 72, 61, "positive"],
    ["Quota ricambi", "22,4%", "20,1%", "+2,3 pp", 68, 57, "positive"],
    ["Clienti attivi", "386", "344", "+12,2%", 76, 65, "positive"],
    ["Conversione preventivi", "31,8%", "29,6%", "+2,2 pp", 69, 59, "positive"],
    ["Tempo medio risposta", "7,2 h", "8,4 h", "−14,3%", 70, 58, "positive"],
    ["Soddisfazione cliente", "8,7 / 10", "8,2 / 10", "+0,5", 83, 72, "positive"]
  ];
  return `<section class="page" aria-labelledby="page-title">
    <div class="breadcrumbs"><button data-page-link="dealers">Concessionari</button><span>/</span><span>${dealer.name}</span></div>
    <header class="page-header"><div class="dealer-hero"><div class="dealer-logo">${dealer.initials}</div><div><p class="eyebrow">Scheda concessionario</p><h1 id="page-title">${dealer.name}</h1><div class="dealer-meta"><span>${icon("location")}${dealer.region}</span><span>${icon("users")}${dealer.manager}</span><span>${dealer.id}</span></div></div></div><div class="header-actions"><select class="select-compact"><option>Rilevazione 1 — 2026</option><option>Rilevazione 2 — 2025</option></select><button class="button" data-action="note">Aggiungi nota</button><button class="button primary" data-action="export">${icon("download")}Esporta scheda</button></div></header>
    <div class="summary-strip"><div class="summary-cell"><span>Stato rilevazione</span><strong>${statusBadge(dealer.status)}</strong></div><div class="summary-cell"><span>Ultimo invio</span><strong>${dealer.sent}</strong></div><div class="summary-cell"><span>Qualità dati</span><strong>${dealer.quality || "—"}%</strong></div><div class="summary-cell"><span>KPI compilati</span><strong>${dealer.status === "missing" ? "0 / 24" : "24 / 24"}</strong></div></div>
    <div class="comparison-metrics"><article class="comparison-card"><span>Fatturato</span><strong>€ ${formatNumber(dealer.revenue)} M</strong><small><b class="trend-up">+${Math.max(dealer.growth, 0).toFixed(1).replace(".", ",")}%</b> vs rilevazione precedente</small></article><article class="comparison-card"><span>Marginalità</span><strong>${formatNumber(dealer.margin, "%")}</strong><small><b class="trend-up">+1,8 pp</b> sopra media rete</small></article><article class="comparison-card"><span>Macchine vendute</span><strong>${dealer.machines}</strong><small><b class="trend-up">+8,8%</b> vs media rete</small></article><article class="comparison-card"><span>Posizionamento rete</span><strong>12° / 64</strong><small>Top 20% della rete</small></article></div>
    <div class="panel"><div class="panel-header"><div><h2>Performance KPI</h2><p>Confronto concessionario, media rete e rilevazione precedente</p></div><button class="text-button" data-page-link="analysis">Apri analisi completa →</button></div><div class="table-wrap"><table><thead><tr><th>KPI</th><th>Valore dealer</th><th>Media rete</th><th>Variazione</th><th>Posizionamento</th></tr></thead><tbody>${kpis.map(k=>`<tr><td class="kpi-name">${k[0]}</td><td><strong>${k[1]}</strong></td><td>${k[2]}</td><td class="delta ${k[6]}">${k[3]}</td><td class="benchmark-cell"><div class="benchmark-track"><span style="width:${k[4]}%"></span><i style="left:${k[5]}%" title="Media rete"></i></div></td></tr>`).join("")}</tbody></table></div></div>
    <div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Andamento fatturato</h2><p>Ultime quattro rilevazioni</p></div></div><div class="panel-body">${submissionChart()}</div></article><article class="panel"><div class="panel-header"><div><h2>Note operative JET</h2><p>Visibili soltanto agli amministratori</p></div><button class="text-button" data-action="note">+ Nuova nota</button></div><div class="panel-body"><ul class="activity-list"><li class="activity-item"><span class="initials">D</span><span><strong>Verificata coerenza dei dati di vendita</strong><small>Daniele · 14 luglio 2026</small></span></li><li class="activity-item"><span class="initials">EC</span><span><strong>Richiesto dettaglio sulla quota ricambi</strong><small>Elena Costa · 11 luglio 2026</small></span></li></ul></div></article></div>
  </section>`;
}

function analysisPage() {
  const regionValues = [["Lombardia", 4.72], ["Veneto", 4.51], ["Emilia-Romagna", 4.23], ["Piemonte", 4.08]];
  const ranked = [...dealers].filter(d=>d.status !== "missing").sort((a,b)=>b.revenue-a.revenue).slice(0,5);
  return `<section class="page" aria-labelledby="page-title">
    ${pageHeader({ eyebrow: "Benchmark e distribuzioni", title: '<span id="page-title">Analisi KPI</span>', subtitle: "Esplora performance, differenze territoriali e andamento nel tempo.", actions: `<button class="button primary" data-action="export">${icon("download")}Esporta vista</button>` })}
    <div class="analysis-layout"><aside class="panel analysis-sidebar" aria-label="Filtri analisi"><div class="field"><label for="kpi-select">KPI analizzato</label><select id="kpi-select"><option>Fatturato</option><option>Marginalità</option><option>Macchine vendute</option><option>Quota ricambi</option><option>Clienti attivi</option></select></div><div class="field"><label>Campagna</label><select><option>2026</option><option>2025</option></select></div><div class="field"><label>Rilevazione</label><select><option>Rilevazione 1</option><option>Rilevazione 2</option></select></div><div class="field"><label>Area geografica</label><select><option>Tutte le aree</option><option>Nord Ovest</option><option>Nord Est</option><option>Centro Nord</option></select></div><div class="field"><label>Area manager</label><select><option>Tutti i manager</option><option>Marco Riva</option><option>Elena Costa</option><option>Paolo Serra</option></select></div><button class="button primary" id="apply-analysis">Applica filtri</button></aside>
    <div><article class="panel"><div class="panel-header"><div><h2>Fatturato medio della rete</h2><p>Valori in milioni di euro · 48 rilevazioni valide</p></div><span class="badge complete">Dati aggiornati</span></div><div class="analysis-summary"><div class="analysis-stat"><span>Media nazionale</span><strong>€ 4,16 M</strong></div><div class="analysis-stat"><span>Mediana</span><strong>€ 4,08 M</strong></div><div class="analysis-stat"><span>Minimo</span><strong>€ 2,31 M</strong></div><div class="analysis-stat"><span>Massimo</span><strong>€ 6,74 M</strong></div></div><div class="panel-body"><h3>Confronto per regione</h3><div class="bar-chart">${regionValues.map((r,i)=>`<div class="bar-row"><span>${r[0]}</span><div class="bar-track"><span class="${i===0?"accent":""}" style="width:${r[1]/5*100}%"></span></div><strong>€ ${formatNumber(r[1])}</strong></div>`).join("")}</div></div></article>
    <div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Andamento nel tempo</h2><p>Media rete · rilevazioni 2024–2026</p></div></div><div class="panel-body">${submissionChart()}</div></article><article class="panel"><div class="panel-header"><div><h2>Top concessionari</h2><p>Ordinati per fatturato dichiarato</p></div><button class="text-button" data-page-link="dealers">Vedi tutti →</button></div><div class="panel-body"><ol class="ranking-list">${ranked.map((d,i)=>`<li class="ranking-item"><span class="ranking-number">${String(i+1).padStart(2,"0")}</span><span><strong>${d.name}</strong><small>${d.region}</small></span><span class="ranking-value">€ ${formatNumber(d.revenue)} M</span></li>`).join("")}</ol></div></article></div></div></div>
  </section>`;
}

function futurePage(type) {
  const isReports = type === "reports";
  return `<section class="page">${pageHeader({ eyebrow: "Modulo futuro", title: isReports ? "Report" : "Rilevazioni", subtitle: isReports ? "Generazione ed esportazione dei report della rete." : "Gestione delle campagne annuali e delle finestre di raccolta." })}<div class="panel empty-preview"><div><span class="empty-icon">${icon(isReports ? "reports" : "calendar")}</span><h2>Interfaccia prevista nella fase successiva</h2><p>${isReports ? "Qui sarà possibile generare report PDF, Excel e CSV per rete, regione, area manager o singolo concessionario." : "Qui saranno gestite apertura, chiusura, duplicazione e avanzamento delle campagne di rilevazione."}</p><button class="button" data-page-link="overview">Torna alla overview</button></div></div></section>`;
}

function renderPage(page, options = {}) {
  currentPage = page;
  if (page === "overview") main.innerHTML = overviewPage();
  if (page === "dealers") main.innerHTML = dealersPage();
  if (page === "dealer") main.innerHTML = dealerDetailPage(options.dealer || selectedDealer);
  if (page === "analysis") main.innerHTML = analysisPage();
  if (page === "surveys" || page === "reports" || page === "help") main.innerHTML = futurePage(page);
  hydrateIcons(main);
  bindPageEvents();
  updateNavigation(page === "dealer" ? "dealers" : page);
  document.querySelector("#mobile-page-title").textContent = page === "dealer" ? "Dettaglio concessionario" : ({overview:"Overview",dealers:"Concessionari",analysis:"Analisi KPI",surveys:"Rilevazioni",reports:"Report",help:"Centro assistenza"}[page]);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function updateNavigation(page) {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("is-active", item.dataset.page === page));
}

function closeMenu() {
  document.querySelector("#sidebar").classList.remove("is-open");
  document.querySelector("#overlay").classList.remove("is-visible");
  document.querySelector("#menu-button").setAttribute("aria-expanded", "false");
}

function bindPageEvents() {
  main.querySelectorAll("[data-page-link]").forEach(el => el.addEventListener("click", () => renderPage(el.dataset.pageLink)));
  main.querySelectorAll("[data-dealer]").forEach(el => el.addEventListener("click", () => {
    selectedDealer = dealers.find(d => d.id === el.dataset.dealer) || dealers[0];
    renderPage("dealer", { dealer: selectedDealer });
  }));
  main.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", () => {
    const messages = { export: "Export simulato: il file verrà generato nella versione completa.", reminder: "Reminder simulato: 16 concessionari selezionati.", note: "La gestione delle note sarà attiva nella versione completa.", review: "Aperta la coda di verifica dati (simulazione).", row: "Azioni disponibili: apri, esporta, aggiungi nota, invia reminder." };
    placeholderAction(messages[el.dataset.action]);
  }));
  const search = main.querySelector("#dealer-search");
  if (search) {
    const filter = () => {
      const term = search.value.trim().toLowerCase();
      const region = main.querySelector("#region-filter").value;
      const status = main.querySelector("#status-filter").value;
      const filtered = dealers.filter(d => (!term || `${d.name} ${d.id}`.toLowerCase().includes(term)) && (!region || d.region === region) && (!status || d.status === status));
      main.querySelector("#dealer-results").innerHTML = dealerResults(filtered);
      hydrateIcons(main.querySelector("#dealer-results"));
      bindDealerResultEvents();
    };
    search.addEventListener("input", filter);
    main.querySelector("#region-filter").addEventListener("change", filter);
    main.querySelector("#status-filter").addEventListener("change", filter);
    main.querySelector("#reset-filters").addEventListener("click", () => { search.value = ""; main.querySelector("#region-filter").value = ""; main.querySelector("#status-filter").value = ""; filter(); });
  }
  const apply = main.querySelector("#apply-analysis");
  if (apply) apply.addEventListener("click", () => showToast("Filtri applicati alla vista di analisi."));
  const kpi = main.querySelector("#kpi-select");
  if (kpi) kpi.addEventListener("change", () => showToast(`KPI selezionato: ${kpi.value}. La preview mantiene dati dimostrativi.`));
}

function bindDealerResultEvents() {
  main.querySelectorAll("[data-dealer]").forEach(el => el.addEventListener("click", () => { selectedDealer = dealers.find(d => d.id === el.dataset.dealer) || dealers[0]; renderPage("dealer", { dealer: selectedDealer }); }));
  main.querySelectorAll("[data-action='row']").forEach(el => el.addEventListener("click", () => placeholderAction("Azioni disponibili: apri, esporta, aggiungi nota, invia reminder.")));
}

document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => { renderPage(item.dataset.page); closeMenu(); }));
document.querySelector("#menu-button").addEventListener("click", () => {
  const sidebar = document.querySelector("#sidebar");
  const open = sidebar.classList.toggle("is-open");
  document.querySelector("#overlay").classList.toggle("is-visible", open);
  document.querySelector("#menu-button").setAttribute("aria-expanded", String(open));
});
document.querySelector("#overlay").addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
document.querySelectorAll("[data-global-action='search']").forEach((element) => element.addEventListener("click", () => document.dispatchEvent(new CustomEvent("sdf:global-search",{detail:{trigger:element}}))));
hydrateIcons();
const initialParams = new URLSearchParams(window.location.search);
const allowedPages = ["overview", "dealers", "dealer", "analysis", "surveys", "reports", "help"];
const initialPage = allowedPages.includes(initialParams.get("page")) ? initialParams.get("page") : "overview";
if (initialPage === "dealer") {
  selectedDealer = dealers.find((dealer) => dealer.id === initialParams.get("dealer")) || dealers[0];
  renderPage("dealer", { dealer: selectedDealer });
} else {
  renderPage(initialPage);
}
