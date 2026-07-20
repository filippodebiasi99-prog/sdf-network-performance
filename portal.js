(() => {
  const state = { config: null, overview: null, detail: null, analysis: null, campaigns: null, collection: null, collectionToken: null, online: false, poller: null, role:localStorage.getItem("sdf-demo-role") === "SDF" ? "SDF" : "JET", autosaveTimer:null,searchDealers:null,searchItems:[],searchActiveIndex:0,searchTrigger:null };
  const originalOverviewPage = overviewPage;

  statusLabel.draft = "Bozza";
  Object.assign(statusLabel,{ NOT_STARTED:"Non iniziato",DRAFT:"Bozza",SUBMITTED:"Inviato",NEEDS_REVIEW:"Da verificare",VALIDATED:"Validato",REOPENED:"Riaperto" });

  function collectionStatusClass(status) {
    if (status === "VALIDATED") return "complete";
    if (["SUBMITTED","NEEDS_REVIEW"].includes(status)) return "verify";
    if (["DRAFT","REOPENED"].includes(status)) return "draft";
    return "missing";
  }

  function collectionStatusBadge(status) {
    return `<span class="badge ${collectionStatusClass(status)}">${escapeHtml(statusLabel[status] || status)}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g,(character) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[character]);
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("it-IT",withTime ? { dateStyle:"medium",timeStyle:"short" } : { dateStyle:"medium" }).format(new Date(value));
  }

  function questionnaireFieldLabel(field,campaign) {
    if (!Number.isInteger(field?.referenceYearOffset) || !Number.isFinite(Number(campaign?.year))) return field?.label || "";
    return `${field.label} ${Number(campaign.year)+field.referenceYearOffset}`;
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
    if (value === null || value === undefined || value === "") return "—";
    const number=Number(value);
    if (!Number.isFinite(number)) return "—";
    if (metric?.kind === "currency") {
      if (Math.abs(number) >= 1_000_000) return `€ ${(number/1_000_000).toLocaleString("it-IT",{maximumFractionDigits:1})} mln`;
      return `€ ${number.toLocaleString("it-IT",{maximumFractionDigits:0})}`;
    }
    if (metric?.kind === "score") return `${number.toLocaleString("it-IT",{maximumFractionDigits:1})} / 10`;
    if (metric?.kind === "percentage") return `${number.toLocaleString("it-IT",{maximumFractionDigits:1})}%`;
    if (metric?.code === "inventory_turnover") return `${number.toLocaleString("it-IT",{maximumFractionDigits:1})} giri`;
    return `${number.toLocaleString("it-IT",{maximumFractionDigits:1})}${metric?.unit ? ` ${metric.unit}` : ""}`;
  }

  let customSelectPopover=null;
  let activeCustomSelect=null;
  let customSelectEventsBound=false;

  function refreshCustomSelect(select) {
    const trigger=select?.closest(".custom-select-control")?.querySelector(".custom-select-trigger");
    if (!trigger) return;
    const selected=select.options[select.selectedIndex];
    trigger.querySelector(".custom-select-value").textContent=selected?.textContent?.trim() || "Seleziona";
    trigger.disabled=select.disabled;
    trigger.classList.toggle("is-placeholder",!select.value);
  }

  function closeCustomSelect({restoreFocus=false}={}) {
    if (!activeCustomSelect) return;
    const {trigger,wrapper}=activeCustomSelect;
    trigger.setAttribute("aria-expanded","false");
    wrapper.classList.remove("is-open");
    if (customSelectPopover) {
      if (typeof customSelectPopover.hidePopover==="function") {
        try { customSelectPopover.hidePopover(); } catch {}
      }
      customSelectPopover.hidden=true;
    }
    activeCustomSelect=null;
    if (restoreFocus) trigger.focus();
  }

  function positionCustomSelect() {
    if (!activeCustomSelect || !customSelectPopover) return;
    const rect=activeCustomSelect.trigger.getBoundingClientRect();
    const viewportPadding=12;
    const width=Math.min(Math.max(rect.width,220),window.innerWidth-viewportPadding*2);
    const estimatedHeight=Math.min(300,customSelectPopover.querySelectorAll("button").length*43+12);
    const below=window.innerHeight-rect.bottom-viewportPadding;
    const above=rect.top-viewportPadding;
    const openAbove=below<Math.min(170,estimatedHeight)&&above>below;
    const available=Math.max(110,openAbove?above:below);
    customSelectPopover.style.width=`${width}px`;
    customSelectPopover.style.maxHeight=`${Math.min(300,available)}px`;
    customSelectPopover.style.left=`${Math.min(Math.max(viewportPadding,rect.left),window.innerWidth-width-viewportPadding)}px`;
    customSelectPopover.style.top=openAbove?`${Math.max(viewportPadding,rect.top-Math.min(estimatedHeight,available)-6)}px`:`${rect.bottom+6}px`;
  }

  function focusCustomSelectOption(index) {
    const options=[...customSelectPopover?.querySelectorAll(".custom-select-option:not(:disabled)") || []];
    if (!options.length) return;
    options[(index+options.length)%options.length].focus();
  }

  function openCustomSelect(select,trigger,{focusSelected=false}={}) {
    if (activeCustomSelect?.select===select) { closeCustomSelect(); return; }
    closeCustomSelect();
    if (!customSelectPopover) {
      customSelectPopover=document.createElement("div");
      customSelectPopover.id="custom-select-popover";
      customSelectPopover.className="custom-select-popover";
      customSelectPopover.setAttribute("popover","manual");
      customSelectPopover.setAttribute("role","listbox");
      document.body.append(customSelectPopover);
    }
    const wrapper=select.closest(".custom-select-control");
    customSelectPopover.replaceChildren();
    [...select.options].filter(option=>!option.hidden).forEach((option,index)=>{
      const item=document.createElement("button");
      item.type="button";
      item.className="custom-select-option";
      item.setAttribute("role","option");
      item.setAttribute("aria-selected",String(option.selected));
      item.disabled=option.disabled;
      item.innerHTML=`<span class="custom-select-check" aria-hidden="true">${option.selected?"✓":""}</span><span></span>`;
      item.lastElementChild.textContent=option.textContent.trim();
      item.addEventListener("click",()=>{
        if (select.value!==option.value) {
          select.value=option.value;
          select.dispatchEvent(new Event("input",{bubbles:true}));
          select.dispatchEvent(new Event("change",{bubbles:true}));
        }
        refreshCustomSelect(select);
        closeCustomSelect({restoreFocus:true});
      });
      item.addEventListener("keydown",event=>{
        const items=[...customSelectPopover.querySelectorAll(".custom-select-option:not(:disabled)")];
        const current=items.indexOf(event.currentTarget);
        if (event.key==="ArrowDown") { event.preventDefault();focusCustomSelectOption(current+1); }
        if (event.key==="ArrowUp") { event.preventDefault();focusCustomSelectOption(current-1); }
        if (event.key==="Home") { event.preventDefault();focusCustomSelectOption(0); }
        if (event.key==="End") { event.preventDefault();focusCustomSelectOption(items.length-1); }
        if (event.key==="Escape") { event.preventDefault();closeCustomSelect({restoreFocus:true}); }
        if (event.key==="Tab") closeCustomSelect();
      });
      item.dataset.optionIndex=String(index);
      customSelectPopover.append(item);
    });
    activeCustomSelect={select,trigger,wrapper};
    trigger.setAttribute("aria-expanded","true");
    wrapper.classList.add("is-open");
    customSelectPopover.hidden=false;
    if (typeof customSelectPopover.showPopover==="function") {
      try { customSelectPopover.showPopover(); } catch {}
    }
    positionCustomSelect();
    if (focusSelected) requestAnimationFrame(()=>{
      const selected=[...customSelectPopover.querySelectorAll(".custom-select-option")].findIndex(item=>item.getAttribute("aria-selected")==="true");
      focusCustomSelectOption(Math.max(0,selected));
    });
  }

  function enhanceSelects(root=document) {
    root.querySelectorAll("select:not([multiple])").forEach(select=>{
      if (select.dataset.customSelect==="true") { refreshCustomSelect(select); return; }
      select.dataset.customSelect="true";
      const wrapper=document.createElement("span");
      wrapper.className=`custom-select-control ${[...select.classList].map(name=>`custom-select--${name}`).join(" ")}`.trim();
      select.before(wrapper);
      wrapper.append(select);
      select.classList.add("custom-select-native");
      select.tabIndex=-1;
      select.setAttribute("aria-hidden","true");
      const trigger=document.createElement("button");
      trigger.type="button";
      trigger.className="custom-select-trigger";
      trigger.setAttribute("aria-haspopup","listbox");
      trigger.setAttribute("aria-expanded","false");
      trigger.setAttribute("aria-controls","custom-select-popover");
      const label=select.getAttribute("aria-label") || (select.id?document.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent.trim():"") || select.closest("label")?.querySelector(":scope > span")?.textContent.trim() || "Seleziona opzione";
      trigger.setAttribute("aria-label",label);
      trigger.innerHTML='<span class="custom-select-value"></span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 4.25 3.5 3.5 3.5-3.5"/></svg>';
      wrapper.append(trigger);
      refreshCustomSelect(select);
      select.addEventListener("change",()=>refreshCustomSelect(select));
      trigger.addEventListener("click",()=>openCustomSelect(select,trigger));
      trigger.addEventListener("keydown",event=>{
        if (["ArrowDown","ArrowUp","Enter"," "].includes(event.key)) {
          event.preventDefault();
          if (!activeCustomSelect || activeCustomSelect.select!==select) openCustomSelect(select,trigger,{focusSelected:true});
        }
        if (event.key==="Escape") closeCustomSelect({restoreFocus:true});
      });
    });
    if (!customSelectEventsBound) {
      customSelectEventsBound=true;
      document.addEventListener("pointerdown",event=>{
        if (activeCustomSelect&&!activeCustomSelect.wrapper.contains(event.target)&&!customSelectPopover?.contains(event.target)) closeCustomSelect();
      });
      document.addEventListener("scroll",event=>{
        if (activeCustomSelect&&!customSelectPopover?.contains(event.target)) closeCustomSelect();
      },true);
      window.addEventListener("resize",positionCustomSelect);
    }
  }

  const searchPages = [
    { type:"page",id:"overview",label:"Overview",description:"Performance e stato della rete",page:"overview",icon:"overview",keywords:"dashboard rete performance" },
    { type:"page",id:"dealers",label:"Concessionari",description:"Anagrafica, link e stato delle compilazioni",page:"dealers",icon:"dealers",keywords:"dealer anagrafica link qr" },
    { type:"page",id:"analysis",label:"Analisi KPI",description:"Benchmark e confronti della rete",page:"analysis",icon:"analysis",keywords:"media mediana benchmark kpi" },
    { type:"page",id:"surveys",label:"Rilevazioni",description:"Campagne e periodi di raccolta",page:"surveys",icon:"calendar",keywords:"campagne questionari" },
    { type:"page",id:"reports",label:"Report",description:"Report ed esportazione CSV",page:"reports",icon:"reports",keywords:"export csv dati" },
    { type:"page",id:"help",label:"Centro assistenza",description:"Guide operative per JET, SDF e concessionari",page:"help",icon:"help",keywords:"aiuto guide procedure supporto" }
  ];

  const helpCategories=[
    {id:"all",label:"Tutte le guide"},{id:"dealers",label:"Concessionari"},{id:"campaigns",label:"Rilevazioni"},
    {id:"collection",label:"Raccolta dati"},{id:"analysis",label:"Analisi e report"},{id:"roles",label:"Viste e accessi"}
  ];

  const helpGuides=[
    {id:"overview",category:"analysis",audience:"JET · SDF",title:"Leggere l’Overview",summary:"Controlla performance della rete e avanzamento della rilevazione selezionata.",steps:["Seleziona la rilevazione dal menu nella testata.","Consulta fatturato aziendale, ricambi, quota SDF, stock e rotazione calcolati sui dati ricevuti.","Usa le sezioni operative per individuare bozze, mancanti e dati da verificare.","Apri un concessionario o Analisi KPI per approfondire."],destination:"overview",action:"Apri Overview"},
    {id:"create-dealer",category:"dealers",audience:"JET",title:"Creare un concessionario",summary:"Aggiungi una nuova anagrafica direttamente dal portale.",steps:["Apri Concessionari e seleziona Nuovo concessionario.","Inserisci Dealer ID, ragione sociale, regione, area geografica e area manager.","Aggiungi referente ed email quando disponibili.","Conferma: se esiste una rilevazione aperta, il dealer viene associato automaticamente e riceve il proprio link."],destination:"dealers",action:"Vai a Concessionari"},
    {id:"edit-dealer",category:"dealers",audience:"JET",title:"Modificare o disattivare un concessionario",summary:"Aggiorna l’anagrafica senza perdere rilevazioni, note o audit.",steps:["Apri il concessionario dalla tabella.","Seleziona Modifica anagrafica.","Aggiorna Dealer ID, ragione sociale, territorio, manager, referente o email e salva.","Per escluderlo dalle attività future usa Disattiva: lo storico resta consultabile."],destination:"dealers",action:"Cerca un concessionario"},
    {id:"import-dealers",category:"dealers",audience:"JET",title:"Importare l’anagrafica CSV",summary:"Controlla il file prima di aggiornare l’anagrafica; il CSV non importa KPI.",steps:["Scarica il template CSV dalla pagina Report.","Compila le colonne dealer_id, name, region, area, manager, contact_name ed email.","In Concessionari seleziona Importa anagrafica concessionari e scegli il file.","Controlla l’anteprima: gli errori bloccano la conferma; duplicati ed email mancanti sono evidenziati.","Conferma l’importazione quando il controllo non contiene errori."],destination:"reports",action:"Scarica il template"},
    {id:"create-campaign",category:"campaigns",audience:"JET",title:"Creare e aprire una rilevazione",summary:"Definisci una campagna annuale e i concessionari coinvolti senza attività tecniche.",steps:["Apri Rilevazioni e seleziona Nuova campagna.","Inserisci nome, anno, numero rilevazione, apertura e scadenza.","Se necessario collega la rilevazione a una precedente.","Seleziona i concessionari coinvolti e salva la bozza.","Controlla l’elenco e seleziona Apri quando la raccolta può iniziare."],destination:"surveys",action:"Vai a Rilevazioni"},
    {id:"manage-campaign",category:"campaigns",audience:"JET",title:"Gestire il ciclo della rilevazione",summary:"Modifica, duplica, chiudi o archivia una rilevazione dall’interfaccia.",steps:["Usa Modifica per aggiornare nome, periodo e scadenza.","Aggiungi o rimuovi concessionari mentre la rilevazione è ancora in bozza.","Usa Duplica per preparare una nuova rilevazione con gli stessi dealer.","Chiudi la raccolta quando non deve più accettare compilazioni.","Archivia una rilevazione chiusa per conservarla nello storico."],destination:"surveys",action:"Gestisci rilevazioni"},
    {id:"links-qr",category:"collection",audience:"JET",title:"Gestire link e QR Code",summary:"Ogni dealer associato a una rilevazione dispone di un link personale verso il portale.",steps:["Apri Concessionari per copiare rapidamente il link o visualizzare il QR.","Dalla scheda dealer puoi aprire la compilazione e scaricare il QR in SVG.","Controlla ultima apertura e numero di accessi nella sezione Raccolta dati.","Usa Revoca per disabilitare il link oppure Rigenera per sostituirlo; il link precedente non sarà più valido."],destination:"dealers",action:"Apri la rete"},
    {id:"communications",category:"collection",audience:"JET",title:"Preparare comunicazioni e reminder",summary:"Prepara e registra le comunicazioni senza dichiarare invii che non sono avvenuti.",steps:["In Concessionari seleziona Prepara comunicazioni.","Scegli invio iniziale oppure reminder per mancanti e bozze.","Controlla destinatario, email, duplicati, stato e link personale.","Seleziona i dealer, modifica testo base e firma, quindi conferma.","Il portale registra la preparazione nell’audit; nessuna email viene inviata."],destination:"dealers",action:"Prepara comunicazioni"},
    {id:"dealer-questionnaire",category:"collection",audience:"Concessionario",title:"Compilare e inviare il questionario",summary:"Il concessionario usa esclusivamente il proprio link e non accede alla dashboard.",steps:["Apri il link personale ricevuto da JET.","Compila i KPI sezione per sezione; unità, limiti ed errori sono mostrati vicino ai campi.","Usa Salva bozza oppure attendi l’autosalvataggio prima di chiudere.","Apri il riepilogo, correggi eventuali campi e conferma l’invio.","Dopo l’invio i dati sono bloccati finché JET non riapre la compilazione."],destination:"help",action:"Resta nel Centro assistenza"},
    {id:"review-submission",category:"collection",audience:"JET",title:"Modificare, riaprire e validare una compilazione",summary:"Gestisci i dati ricevuti dalla scheda concessionario mantenendo controlli e audit.",steps:["Apri il dealer e controlla stato, KPI, confronto rete e storico.","Usa Modifica valori per correggere i dati: i controlli di coerenza vengono rieseguiti e lo stato passa a Da verificare.","Usa Riapri compilazione per permettere al dealer di correggere e reinviare la stessa rilevazione.","Quando i controlli sono conclusi seleziona Valida dati."],destination:"dealers",action:"Apri Concessionari"},
    {id:"notes",category:"dealers",audience:"JET",title:"Aggiungere una nota interna",summary:"Registra un’annotazione operativa collegata al concessionario.",steps:["Apri la scheda del concessionario.","Seleziona Aggiungi nota.","Inserisci il testo e conferma.","La nota compare nella sezione Note JET ed è nascosta nella vista SDF."],destination:"dealers",action:"Apri Concessionari"},
    {id:"analysis-export",category:"analysis",audience:"JET · SDF",title:"Analizzare KPI ed esportare i dati",summary:"Usa lo stesso dataset persistito per benchmark, dettaglio ed export CSV.",steps:["Apri Analisi KPI e seleziona KPI e rilevazione.","Applica i filtri per leggere media, mediana, minimo, massimo, distribuzione regionale e ranking.","Apri il dettaglio dealer per confrontare valore attuale, media rete e rilevazione precedente.","Usa Esporta dati oppure la pagina Report per scaricare il CSV della rilevazione corrente."],destination:"analysis",action:"Apri Analisi KPI"},
    {id:"sdf-readonly",category:"roles",audience:"SDF",title:"Consultare il portale in sola lettura",summary:"La vista SDF consente analisi e report senza mostrare strumenti amministrativi.",steps:["Nel selettore demo scegli Vista SDF.","Consulta Overview, Concessionari, Analisi KPI, confronti e Report.","Apri le schede dealer per leggere KPI e storico.","Le azioni di creazione, modifica, note, link, reminder e validazione non sono disponibili."],destination:"overview",action:"Apri Overview"}
  ];

  function normalizeSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  }

  function globalSearchCorpus() {
    const dealerItems=(state.searchDealers || []).map((dealer) => ({ type:"dealer",id:dealer.id,label:dealer.name,description:`${dealer.id} · ${dealer.region} · ${dealer.area}`,dealerId:dealer.id,icon:"dealers",keywords:`${dealer.id} ${dealer.name} ${dealer.region} ${dealer.area} ${dealer.manager}` }));
    const kpiItems=(state.config?.kpis || []).map((kpi) => ({ type:"kpi",id:kpi.id,label:kpi.name,description:`${kpi.code} · ${kpi.section || "KPI rete"}`,kpiId:kpi.id,icon:"analysis",keywords:`${kpi.code} ${kpi.name} ${kpi.description || ""} ${kpi.section || ""}` }));
    const helpItems=helpGuides.map((guide)=>({type:"help",id:guide.id,label:guide.title,description:`Centro assistenza · ${guide.audience}`,guideId:guide.id,icon:"help",keywords:`${guide.summary} ${guide.steps.join(" ")} ${guide.category} ${guide.audience}`}));
    return [...searchPages,...dealerItems,...kpiItems,...helpItems];
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
      results.innerHTML=`<div class="global-search-empty"><strong>Nessun risultato</strong><span>Prova con un concessionario, un KPI, una sezione o una guida.</span></div>`;
      return;
    }
    const typeLabels={page:"Sezioni",dealer:"Concessionari",kpi:"KPI",help:"Guide operative"};
    results.innerHTML=["page","dealer","kpi","help"].map((type) => {
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
    if (item.type === "help") return portalRenderPage("help",{guideId:item.guideId});
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
    const descriptions={ company_revenue_total:"Fatturato complessivo",sdf_parts_revenue_total:"Fatturato ricambi SDF",parts_revenue_total:"Ricavi ricambi",inventory_turnover:"Indice di rotazione medio",inventory_end_value:"Tot stock magazzini rete Italia" };
    const metricIcons={ company_revenue_total:"reports",sdf_parts_revenue_total:"analysis",parts_revenue_total:"overview",inventory_turnover:"calendar",inventory_end_value:"dealers" };
    const revenueMetrics=new Set(["company_revenue_total","sdf_parts_revenue_total","parts_revenue_total"]);
    return `<div class="business-metrics" aria-label="Performance della rete">${performance.metrics.map((metric,index) => `<a class="business-metric business-metric-${index+1}" href="${revenueMetrics.has(metric.code) ? "#fatturato-dealer" : "#analisi-aree"}" aria-label="Apri il dettaglio di ${escapeHtml(descriptions[metric.code] || metric.name)}"><div class="business-metric-head"><span class="business-metric-icon" aria-hidden="true"><span class="static-icon">${icon(metricIcons[metric.code] || "analysis")}</span></span><span class="business-metric-label">${descriptions[metric.code] || escapeHtml(metric.name)}</span></div><strong>${formatPerformanceValue(metric)}</strong><small>Media dealer ${formatPerformanceValue(metric,metric.average)}</small></a>`).join("")}</div>`;
  }

  function relativeBarWidth(value,values,floor=20) {
    const nums=values.map((item)=>Number(item)||0);
    const min=Math.min(...nums),max=Math.max(...nums),span=max-min;
    if (!(span>0)) return 100;
    return Math.round(floor+(Number(value)-min)/span*(100-floor));
  }

  function overviewRevenueLeaders(performance) {
    const values=performance.leaders.map((item)=>item.value);
    return `<ol class="ranking-list">${performance.leaders.map((item) => `<li><span class="ranking-position">${item.position}</span><button class="ranking-dealer" data-dealer-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.region)} · ${escapeHtml(item.id)}</small></button><div class="ranking-value"><strong>${formatPerformanceValue({kind:"currency"},item.value)}</strong><small><b>${item.deltaFromAverage >= 0 ? "+" : ""}${item.deltaFromAverage.toLocaleString("it-IT",{maximumFractionDigits:1})}%</b> <span>vs media</span></small></div><span class="ranking-progress"><i style="width:${relativeBarWidth(item.value,values,22)}%"></i></span><span class="ranking-bar"><i style="width:${relativeBarWidth(item.value,values,22)}%"></i></span></li>`).join("")}</ol>`;
  }

  function overviewAreaPerformance(performance) {
    const values=performance.areas.map((item)=>item.average);
    const areaKeys={"Nord Ovest":"northwest","Nord Est":"northeast","Centro":"center","Sud e Isole":"south"};
    return `<div class="area-map-layout"><div class="area-map-visual"><div class="area-map-svg" role="img" aria-label="Mappa interattiva dell’Italia suddivisa in quattro macroaree"></div></div><div class="area-map-summary" aria-label="Fatturato medio delle quattro macroaree">${performance.areas.map((item) => `<button class="area-map-item" data-area="${areaKeys[item.area] || "south"}" type="button"><span><strong>${escapeHtml(item.area)}</strong><small>${item.count} dealer</small><b>${formatPerformanceValue({kind:"currency"},item.average)}</b></span></button>`).join("")}<div class="area-map-scale" aria-hidden="true"><i></i><span><em>Valore minore</em><em>Valore maggiore</em></span></div></div></div>`;
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
    return `<svg class="line-chart" viewBox="0 0 700 222" role="img" aria-label="Andamento cumulativo delle compilazioni fino a ${state.overview.totals.received} invii."><defs><linearGradient id="liveChartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f36a15" stop-opacity=".2"/><stop offset="1" stop-color="#f36a15" stop-opacity="0"/></linearGradient></defs><path class="chart-grid-line" d="M40 24H680M40 68H680M40 112H680M40 156H680M40 200H680"/><text class="chart-label" x="10" y="203">0</text><text class="chart-label" x="5" y="159">${Math.round(maximum*.25)}</text><text class="chart-label" x="5" y="115">${Math.round(maximum*.5)}</text><text class="chart-label" x="5" y="71">${Math.round(maximum*.75)}</text><text class="chart-label" x="5" y="27">${maximum}</text><path d="${area}" fill="url(#liveChartGradient)"/><path class="chart-line" d="${line}"/>${coordinates.map((point) => `<circle class="chart-dot" cx="${point[0]}" cy="${point[1]}" r="3"/>`).join("")}<text class="chart-label" x="40" y="218">${start}</text><text class="chart-label" x="640" y="218">${end}</text></svg>`;
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
    const deadline=new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short"}).format(new Date(campaign.close_date));
    const collectionItems=[
      {label:"Rete totale",value:totals.dealers,helper:`${state.overview.areas.length} aree`,progress:100,icon:"users"},
      {label:"Ricevute",value:totals.received,helper:`${totals.completion}% della rete`,progress:totals.completion,icon:"download"},
      {label:"Validate",value:totals.validated,helper:"Controllo completato",progress:totals.dealers?totals.validated/totals.dealers*100:0,icon:"check"},
      {label:"Bozze",value:totals.drafts,helper:"Compilazioni in corso",progress:totals.dealers?totals.drafts/totals.dealers*100:0,icon:"reports"},
      {label:"Mancanti",value:totals.missing,helper:`Entro ${deadline}`,progress:totals.dealers?totals.missing/totals.dealers*100:0,icon:"clock"},
      {label:"Da verificare",value:totals.verify,helper:"Richiedono controllo JET",progress:totals.dealers?totals.verify/totals.dealers*100:0,icon:"alert"}
    ];
    return `<section class="page overview-page" aria-labelledby="page-title">
      <header class="page-header"><div><p class="eyebrow"><svg class="eyebrow-icon" viewBox="0 0 28 28" aria-hidden="true"><path d="M3 23h22M5 19l5-6 4 3 8-10M18 6h4v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Overview&nbsp;&nbsp;·&nbsp;&nbsp;Rete concessionari</span></p><h1><span id="page-title">Performance della <span>rete</span></span></h1><p class="page-subtitle"><span>Indicatori economici e andamento dei ${performance.sample}</span> <span>concessionari inclusi nel campione.</span></p></div><div class="header-actions"><details class="campaign-select"><summary>${escapeHtml(campaign.name)}</summary><div class="campaign-menu" role="listbox" aria-label="Seleziona rilevazione">${state.config.campaigns.map((item) => `<button class="campaign-option" type="button" role="option" aria-selected="${item.id===campaign.id}" ${item.id===campaign.id?'aria-current="true"':""} data-campaign-id="${escapeHtml(item.id)}"><span class="campaign-check">${item.id===campaign.id?"✓":""}</span><span>${escapeHtml(item.name)}</span></button>`).join("")}</div></details><button class="button export-button" data-export-csv>${icon("download")}Esporta dati</button></div></header>
      ${overviewBusinessMetrics(performance)}
      <div class="overview-analysis-grid"><article class="panel" id="fatturato-dealer"><div class="panel-header"><div class="ranking-heading"><span class="ranking-heading-icon" aria-hidden="true">${icon("analysis")}</span><div><h2>Dealer per fatturato ricambi</h2><p>Primi cinque concessionari · confronto con la media rete ricambi</p></div></div><button class="analysis-pill" data-page-link="analysis">Analisi completa ${icon("chevron")}</button></div><div class="panel-body">${overviewRevenueLeaders(performance)}</div></article><article class="panel" id="analisi-aree"><div class="panel-header"><div class="ranking-heading"><span class="ranking-heading-icon" aria-hidden="true">${icon("analysis")}</span><div><h2>Fatturato medio per area</h2><p>Benchmark relativo sui dati ricevuti</p></div></div><button class="analysis-pill" data-page-link="analysis">Confronta ${icon("chevron")}</button></div><div class="panel-body">${overviewAreaPerformance(performance)}</div></article></div>
      <div class="overview-section-heading collection-heading"><div class="collection-heading-main"><span class="collection-heading-icon" aria-hidden="true">${icon("analysis")}</span><div><p class="eyebrow">Raccolta dati</p><h2>Avanzamento della rilevazione</h2><p>Stato operativo della campagna e concessionari da seguire.</p></div></div><button class="analysis-pill manage-dealers" data-page-link="dealers">Gestisci concessionari ${icon("chevron")}</button></div>
      <div class="collection-metrics" aria-label="Stato della raccolta">${collectionItems.map((item)=>`<div><span class="collection-metric-head"><span class="collection-metric-icon">${icon(item.icon)}</span><span class="collection-metric-label">${item.label}</span></span><strong>${item.value}</strong><small>${item.helper}</small><i class="collection-progress"><b style="width:${Math.max(0,Math.min(100,item.progress))}%"></b></i></div>`).join("")}</div>
      <div class="content-grid equal overview-operations"><article class="panel priority-panel"><div class="panel-header"><div class="priority-heading"><span class="priority-heading-icon" aria-hidden="true">${icon("alert")}</span><div><h2>Da completare o verificare</h2><p>Priorità operative della campagna</p></div></div><button class="analysis-pill" data-page-link="dealers">Vedi tutti ${icon("chevron")}</button></div><div class="panel-body"><ul class="alert-list">${alerts.slice(0,5).map((item) => `<li class="alert-item"><span class="alert-symbol">${icon(item.collection_status === "NOT_STARTED" ? "clock" : "alert")}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.collection_status === "NOT_STARTED" ? "Rilevazione non iniziata" : item.collection_status === "DRAFT" ? `Bozza al ${Math.round(item.completion || item.quality || 0)}%` : "Dati da verificare"}</small></span>${collectionStatusBadge(item.collection_status)}</li>`).join("")}</ul></div></article><article class="panel activity-panel"><div class="panel-header"><div class="activity-heading"><span class="activity-heading-icon" aria-hidden="true">${icon("download")}</span><div><h2>Ultimi dati ricevuti</h2><p>Aggiornamenti più recenti della rete</p></div></div><button class="analysis-pill" data-page-link="dealers">Apri rete ${icon("chevron")}</button></div><div class="panel-body"><ul class="activity-list">${recent.map((item,index) => `<li class="activity-item"><span class="initials">${escapeHtml(item.initials)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.region)} · ${escapeHtml(item.id)}</small></span><time class="activity-time ${index===0?"is-latest":""}">${index === 0 ? "Più recente" : formatDate(item.updated_at)}</time></li>`).join("")}</ul></div></article></div>
    </section>`;
  }

  function portalDealersPage() {
    const totals = state.overview.totals;
    const jetActions=state.role === "JET" ? `<input id="dealer-import-file" type="file" accept=".csv,text/csv" hidden><button class="button" id="import-dealers">Importa anagrafica</button><button class="button" id="prepare-reminders">${icon("bell")}Prepara comunicazioni</button><button class="button dealer-primary" id="create-dealer">Nuovo concessionario</button>` : "";
    const dealerStats=[
      {label:"Rete totale",value:`${totals.dealers} dealer`,helper:`${state.overview.areas.length} aree geografiche`,progress:100,icon:"users"},
      {label:"Validati",value:totals.validated,helper:`${totals.dealers?Math.round(totals.validated/totals.dealers*100):0}% della rete`,progress:totals.dealers?totals.validated/totals.dealers*100:0,icon:"check"},
      {label:"Inviati",value:totals.submitted,helper:`${totals.dealers?Math.round(totals.submitted/totals.dealers*100):0}% della rete`,progress:totals.dealers?totals.submitted/totals.dealers*100:0,icon:"download"},
      {label:"Da verificare",value:totals.verify,helper:`${totals.dealers?Math.round(totals.verify/totals.dealers*100):0}% della rete`,progress:totals.dealers?totals.verify/totals.dealers*100:0,icon:"alert"},
      {label:"Bozze",value:totals.drafts,helper:`${totals.dealers?Math.round(totals.drafts/totals.dealers*100):0}% della rete`,progress:totals.dealers?totals.drafts/totals.dealers*100:0,icon:"reports"},
      {label:"Non iniziati",value:totals.notStarted,helper:`${totals.dealers?Math.round(totals.notStarted/totals.dealers*100):0}% della rete`,progress:totals.dealers?totals.notStarted/totals.dealers*100:0,icon:"clock"}
    ];
    const dealerDialog=state.role === "JET"?`<dialog id="dealer-dialog" class="review-dialog operational-dialog"><form id="dealer-form"><div class="review-dialog-header"><div><p class="eyebrow">Anagrafica</p><h2>Nuovo concessionario</h2><p>I dati restano modificabili dalla scheda concessionario.</p></div><button type="button" data-close-dialog>×</button></div><div class="operational-form-grid">${dealerFormMarkup()}</div><footer class="review-footer"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" type="submit">Crea concessionario</button></footer></form></dialog><dialog id="import-preview-dialog" class="review-dialog operational-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Controllo CSV</p><h2>Anteprima importazione</h2><p>Verifica errori, duplicati ed email mancanti prima di confermare.</p></div><button type="button" data-close-dialog>×</button></div><div id="import-preview-content" class="operational-dialog-body"></div><footer class="review-footer"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" id="confirm-import" type="button">Conferma importazione</button></footer></dialog><dialog id="distribution-dialog" class="review-dialog operational-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Distribuzione questionari</p><h2>Prepara comunicazioni</h2><p>Le comunicazioni vengono registrate, ma non inviate finché non sarà configurato un provider email.</p></div><button type="button" data-close-dialog>×</button></div><form id="distribution-form"><div id="distribution-content" class="operational-dialog-body"></div><footer class="review-footer"><span class="provider-warning">Nessuna email sarà inviata</span><button class="button primary" type="submit">Prepara e registra</button></footer></form></dialog>`:"";
    return `<section class="page dealers-design-page" aria-labelledby="page-title"><header class="dealers-hero"><div class="dealers-hero-copy"><p class="eyebrow">${icon("dealers")}<span>Anagrafica e avanzamento</span></p><h1 id="page-title">Concessionari</h1><p class="page-subtitle">Monitora stato e avanzamento della campagna selezionata.</p></div><div class="dealers-actions" aria-label="Azioni concessionari">${jetActions}<button class="button" data-export-csv>${icon("download")}Esporta dati</button></div></header><div class="dealer-summary" aria-label="Stato della rete concessionari">${dealerStats.map((item)=>`<div class="dealer-stat"><div class="dealer-stat-head"><span class="dealer-stat-icon">${icon(item.icon)}</span>${item.label}</div><strong>${item.value}</strong><small>${item.helper}</small><span class="dealer-stat-progress"><i style="width:${Math.max(0,Math.min(100,item.progress))}%"></i></span></div>`).join("")}</div><article class="panel dealers-table-panel"><div class="dealer-toolbar"><label class="dealer-search"><span class="sr-only">Cerca concessionario</span>${icon("search")}<input id="dealer-search" type="search" placeholder="Cerca concessionario o Dealer ID" /></label><select id="region-filter" aria-label="Filtra per regione"><option value="">Tutte le regioni</option>${[...new Set(dealers.map((item)=>item.region))].map((value)=>`<option>${escapeHtml(value)}</option>`).join("")}</select><select id="status-filter" aria-label="Filtra per stato"><option value="">Tutti gli stati</option><option value="VALIDATED">Validato</option><option value="SUBMITTED">Inviato</option><option value="NEEDS_REVIEW">Da verificare</option><option value="DRAFT">Bozza</option><option value="NOT_STARTED">Non iniziato</option></select><button class="button" id="reset-filters">Azzera</button></div><div id="dealer-results">${portalDealerResults(dealers)}</div></article><dialog id="qr-dialog" class="qr-dialog"><button class="qr-close" aria-label="Chiudi">×</button><div id="qr-dialog-content"></div></dialog>${dealerDialog}</section>`;
  }

  function dealerFormMarkup(dealer={}) {
    return [["id","Dealer ID",dealer.id],["name","Ragione sociale",dealer.name],["region","Regione",dealer.region],["area","Area geografica",dealer.area],["manager","Area manager",dealer.manager],["contact_name","Referente",dealer.contact_name],["email","Email",dealer.email]].map(([name,label,value])=>`<label><span>${label}</span><input name="${name}" value="${escapeHtml(value||"")}" ${["id","name","region","area","manager"].includes(name)?"required":""} ${name==="email"?'type="email"':""}></label>`).join("");
  }

  function portalDealerResults(list) {
    return `<div class="table-wrap"><table class="dealers-table"><thead><tr><th>Concessionario</th><th>Campagna</th><th>Stato</th><th>Ultimo invio</th><th>Azioni</th></tr></thead><tbody>${list.map((dealer) => `<tr><td><button class="dealer-name dealer-link" data-dealer-id="${escapeHtml(dealer.id)}">${escapeHtml(dealer.name)}<small>${escapeHtml(dealer.id)} · ${escapeHtml(dealer.region)}</small></button></td><td>${escapeHtml(state.overview.campaign.name)}</td><td>${collectionStatusBadge(dealer.collection_status)}</td><td>${formatDate(dealer.submitted_at,true)}</td><td><div class="dealer-row-actions row-actions">${state.role === "JET"?`<button class="button compact" data-copy-link="${escapeHtml(dealer.id)}">Copia link</button><button class="button compact" data-show-qr="${escapeHtml(dealer.id)}">QR</button>`:""}<button class="dealer-open row-action" data-dealer-id="${escapeHtml(dealer.id)}" aria-label="Apri ${escapeHtml(dealer.name)}">${icon("chevron")}</button></div></td></tr>`).join("")}</tbody></table></div><footer class="dealer-pagination"><span>Visualizzati ${list.length} concessionari</span><nav class="dealer-page-controls" aria-label="Paginazione concessionari"><button class="dealer-page-button is-current" type="button" aria-current="page">1</button></nav></footer>`;
  }

  function portalDealerDetailPage() {
    const data = state.detail;
    const dealer = normalizeDealer({ ...data.dealer, status:data.submission.status,quality:data.submission.quality_score,submitted_at:data.submission.submitted_at });
    const filled = data.values.filter((item) => item.value !== null).length;
    const link = data.collectionLink;
    const jet=state.role === "JET";
    const locked=["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status);
    const collectionActionLabel=locked?"Visualizza compilazione":"Apri compilazione";
    const collectionAdminDescription=locked
      ? "Compilazione chiusa · visualizzazione in sola lettura. Riaprila per consentire nuove modifiche."
      : `Link univoco per ${escapeHtml(data.campaign.name)}`;
    const linkStatusLabel=link?.status !== "ACTIVE" ? "Revocato" : locked ? "Link in sola lettura" : "Link attivo";
    const editableValues=data.values.filter((item)=>!item.derived);
    const collectionAdmin=jet&&link?`<article class="panel collection-admin-panel"><div class="panel-header"><div><h2>Raccolta dati</h2><p>${collectionAdminDescription}</p></div><span class="badge ${link.status === "ACTIVE" ? "complete" : "missing"}">${linkStatusLabel}</span></div><div class="collection-admin-grid"><div><span>Link compilazione</span><div class="copy-field"><code>${escapeHtml(link.url)}</code><button class="button compact" id="copy-collection-link">Copia</button></div><dl class="technical-list"><div><dt>Ultima apertura</dt><dd>${formatDate(link.last_opened_at,true)}</dd></div><div><dt>Aperture</dt><dd>${link.opened_count}</dd></div><div><dt>Ultimo invio</dt><dd>${formatDate(data.submission.submitted_at,true)}</dd></div></dl><div class="inline-actions">${state.config.jotform.enabled?'<button class="button" id="sync-dealer">Sincronizza Jotform</button>':''}<button class="button" id="regenerate-link">Rigenera link</button><button class="button danger" id="revoke-link">Revoca link</button>${locked?'<button class="button" id="edit-submission-values">Modifica valori</button><button class="button primary" data-submission-status="REOPENED">Riapri per modificare</button>':''}${data.submission.collection_status==="NEEDS_REVIEW"?'<button class="button primary" data-submission-status="VALIDATED">Valida dati</button>':''}</div></div><div class="collection-qr"><img src="${escapeHtml(link.qrUrl)}" alt="QR Code del link di compilazione"><a class="button" href="${escapeHtml(link.qrUrl)}" download="qr-${escapeHtml(dealer.id)}.svg">Scarica SVG</a></div></div></article>`:"";
    const editDialog=jet&&editableValues.length&&["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status)?`<dialog id="edit-values-dialog" class="review-dialog edit-values-dialog"><form id="edit-values-form"><div class="review-dialog-header"><div><p class="eyebrow">Modifica controllata JET</p><h2>Aggiorna i valori ricevuti</h2><p>I KPI derivati saranno ricalcolati automaticamente e la compilazione passerà a “Da verificare”.</p></div><button type="button" id="close-edit-values" aria-label="Chiudi">×</button></div><div class="edit-values-grid">${editableValues.map((item)=>`<label><span>${escapeHtml(item.name)}</span><div class="input-with-unit"><input name="${escapeHtml(item.code)}" type="text" inputmode="decimal" value="${item.value ?? ""}" required><span>${escapeHtml(item.unit)}</span></div><small class="field-error" data-edit-error="${escapeHtml(item.code)}"></small></label>`).join("")}</div><footer class="review-footer"><p>La modifica viene registrata nell'audit con valore precedente e nuovo.</p><div class="inline-actions"><button class="button" type="button" id="cancel-edit-values">Annulla</button><button class="button primary" type="submit">Salva modifiche</button></div></footer></form></dialog>`:"";
    const dealerAdminDialog=jet?`<dialog id="dealer-edit-dialog" class="review-dialog operational-dialog"><form id="dealer-edit-form"><div class="review-dialog-header"><div><p class="eyebrow">Anagrafica</p><h2>Modifica concessionario</h2><p>La disattivazione conserva rilevazioni, note e audit.</p></div><button type="button" data-close-dialog>×</button></div><div class="operational-form-grid">${dealerFormMarkup(data.dealer)}</div><footer class="review-footer"><button class="button danger" id="deactivate-dealer" type="button">Disattiva</button><div class="inline-actions"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" type="submit">Salva anagrafica</button></div></footer></form></dialog>`:"";
    return `<section class="page dealer-detail-page" aria-labelledby="page-title">
      <div class="breadcrumbs"><button data-page-link="dealers">Concessionari</button><span>/</span><span>${escapeHtml(dealer.name)}</span></div>
      <header class="page-header"><div class="dealer-hero"><div class="dealer-logo">${escapeHtml(dealer.initials)}</div><div><p class="eyebrow">Scheda concessionario</p><h1 id="page-title">${escapeHtml(dealer.name)}</h1><div class="dealer-meta"><span>${icon("location")}${escapeHtml(dealer.region)}</span><span>${icon("users")}${escapeHtml(dealer.manager)}</span><span>${escapeHtml(dealer.id)}</span></div></div></div><div class="header-actions">${jet&&link?`<a class="button" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${collectionActionLabel}</a><button class="button" id="edit-dealer">Modifica anagrafica</button><button class="button" id="add-note">Aggiungi nota</button>`:""}<button class="button primary" data-export-csv>${icon("download")}Esporta rete</button></div></header>
      <div class="summary-strip"><div class="summary-cell status-${collectionStatusClass(data.submission.collection_status)}"><span>Stato rilevazione</span><strong>${escapeHtml(statusLabel[data.submission.collection_status]||data.submission.collection_status)}</strong><small>${locked?"Compilazione chiusa · sola lettura":"Compilazione aperta"}</small></div><div class="summary-cell"><span>Ultimo invio</span><strong>${dealer.sent}</strong></div><div class="summary-cell"><span>Campagna</span><strong>${escapeHtml(data.campaign.name)}</strong></div><div class="summary-cell"><span>KPI compilati</span><strong>${filled} / ${data.values.length}</strong></div></div>
      ${collectionAdmin}
      <div class="comparison-metrics">${data.values.slice(0,4).map((item) => `<article class="comparison-card"><span>${escapeHtml(item.name)}</span><strong>${formatValue(item.value,item)}</strong><small>Media rete: ${formatValue(item.network_avg,item)}</small></article>`).join("")}</div>
      <div class="panel"><div class="panel-header"><div><h2>Performance KPI</h2><p>Valori salvati per ${escapeHtml(data.campaign.name)}</p></div><button class="text-button" data-page-link="analysis">Apri analisi completa →</button></div><div class="table-wrap"><table><thead><tr><th>KPI</th><th>Valore attuale</th><th>Media rete</th><th>Valore precedente</th><th>Differenza</th><th>Variazione</th></tr></thead><tbody>${data.values.map((item) => { const absolute=item.value!==null&&item.previous_value!==null?item.value-item.previous_value:null; const delta=absolute!==null&&item.previous_value!==0?absolute/Math.abs(item.previous_value)*100:null; return `<tr><td class="kpi-name">${escapeHtml(item.name)}</td><td><strong>${formatValue(item.value,item)}</strong></td><td>${formatValue(item.network_avg,item)}</td><td>${formatValue(item.previous_value,item)}</td><td class="delta ${absolute>=0?"positive":"negative"}">${absolute===null?"—":`${absolute>=0?"+":""}${formatValue(absolute,item)}`}</td><td class="delta ${delta>=0?"positive":"negative"}">${delta===null?"—":`${delta>=0?"+":""}${delta.toFixed(1).replace(".",",")}%`}</td></tr>`; }).join("")}</tbody></table></div></div>
      ${!data.comparison.compatible?'<div class="demo-banner"><strong>Confronto non disponibile</strong><span>Le due rilevazioni usano versioni del questionario incompatibili.</span></div>':''}<div class="content-grid equal"><article class="panel"><div class="panel-header"><div><h2>Storico rilevazioni</h2><p>Campagne e KPI ricevuti</p></div></div><div class="panel-body"><ul class="activity-list">${data.history.map((item) => `<li class="activity-item"><span class="initials">RI</span><span><strong>${escapeHtml(item.campaign_name)}</strong><small>${formatDate(item.submitted_at,true)} · ${item.kpi_count} KPI</small></span>${collectionStatusBadge(item.collection_status || item.status)}</li>`).join("") || "<li>Nessuna rilevazione.</li>"}</ul></div></article>${jet?`<article class="panel"><div class="panel-header"><div><h2>Note JET</h2><p>Annotazioni interne</p></div></div><div class="panel-body"><ul class="activity-list">${data.notes.length ? data.notes.map((note) => `<li class="activity-item"><span class="initials">${note.author.split(" ").map((part)=>part[0]).join("").slice(0,2)}</span><span><strong>${escapeHtml(note.body)}</strong><small>${escapeHtml(note.author)}</small></span></li>`).join("") : "<li class='activity-item'><span>Nessuna nota presente.</span></li>"}</ul></div></article>`:""}</div>${editDialog}${dealerAdminDialog}
    </section>`;
  }

  function portalAnalysisPage() {
    const data = state.analysis;
    const networkAverage = Number(data.stats.average) || 0;
    const minimumDealer = data.extremes?.min;
    const maximumDealer = data.extremes?.max;
    const dealerIdentity = (dealer,fallback) => dealer ? `${escapeHtml(dealer.name)} · ${escapeHtml(dealer.region)}` : fallback;
    const analysisValue = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "—";
      return data.kpi.unit === "EUR" ? `€ ${numeric.toLocaleString("it-IT",{maximumFractionDigits:0})}` : formatValue(numeric,data.kpi);
    };
    const regionValues = data.regions.map((item) => Number(item.average) || 0);
    const regionalMax = Math.max(...regionValues,1);
    const regionalMin = regionValues.length ? Math.min(...regionValues) : 0;
    const regionalSpread = regionalMax-regionalMin;
    const topRegion = data.regions[0];
    const regionalDelta = topRegion && networkAverage ? (Number(topRegion.average)/networkAverage-1)*100 : null;
    const regionMapAreas = {
      "Lombardia": { id:"northwest",viewBox:"0 0 250 250" },
      "Piemonte": { id:"northwest",viewBox:"0 0 250 250" },
      "Veneto": { id:"northeast",viewBox:"125 0 255 250" },
      "Emilia-Romagna": { id:"northeast",viewBox:"125 0 255 250" },
      "Toscana": { id:"center",viewBox:"145 180 245 285" },
      "Lazio": { id:"center",viewBox:"145 180 245 285" },
      "Puglia": { id:"south",viewBox:"60 285 550 510" },
      "Sicilia": { id:"south",viewBox:"60 285 550 510" }
    };
    const topRegionMap = regionMapAreas[topRegion?.region] || { id:"northwest",viewBox:"0 0 250 250" };
    const regionBarWidth = (value) => Math.max(6,Math.min(100,(Number(value)||0)/regionalMax*100));
    const networkMarker = Math.max(0,Math.min(100,networkAverage/regionalMax*100));
    const topDealers = data.ranking.slice(0,5);
    const dealerValues = topDealers.map((item) => Number(item.value) || 0);
    const dealerDelta = (value) => networkAverage ? (Number(value)/networkAverage-1)*100 : null;
    const dealerChartCeiling = Math.max(...dealerValues,networkAverage,1)*1.05;
    const dealerChartFloor = Math.max(0,Math.min(...dealerValues,networkAverage)*.9);
    const dealerChartRange = Math.max(1,dealerChartCeiling-dealerChartFloor);
    const dealerColumnHeight = (value) => Math.max(8,Math.min(100,(Number(value)-dealerChartFloor)/dealerChartRange*100));
    const dealerAverageMarker = Math.max(0,Math.min(100,(networkAverage-dealerChartFloor)/dealerChartRange*100));
    const dealerPlotHeight = 194;
    const dealerAverageBottom = 72+dealerAverageMarker/100*dealerPlotHeight;
    const dealerChartTicks = [dealerChartCeiling,(dealerChartCeiling+dealerChartFloor)/2,dealerChartFloor];
    const dealerChartLabel = (value) => data.kpi.unit === "EUR" && Math.abs(value) >= 1_000_000 ? `€ ${(value/1_000_000).toLocaleString("it-IT",{maximumFractionDigits:1})} mln` : analysisValue(value);
    return `<section class="page analysis-page analysis-design-page" aria-labelledby="page-title">
      <header class="analysis-hero"><div class="analysis-hero-copy"><p class="eyebrow">${icon("analysis")}<span>Benchmark e distribuzioni</span></p><h1 id="page-title">Analisi KPI</h1><p class="page-subtitle">Confronta risultati, distribuzione territoriale e concessionari sullo stesso indicatore.</p></div><div class="analysis-hero-actions"><button class="button analysis-export" data-export-csv>${icon("download")}Esporta dati</button></div></header>
      <section class="analysis-toolbar panel" aria-label="Filtri analisi"><div class="analysis-filter analysis-filter-primary"><label for="kpi-select">KPI analizzato</label><select id="kpi-select">${state.config.kpis.map((item) => `<option value="${item.id}" ${item.id===data.kpi.id?"selected":""}>${item.name}</option>`).join("")}</select></div><div class="analysis-filter"><label for="analysis-campaign">Rilevazione</label><select id="analysis-campaign">${state.config.campaigns.map((item)=>`<option value="${item.id}" ${item.id===data.campaign.id?"selected":""}>${item.name}</option>`).join("")}</select></div><button class="button primary" id="apply-analysis">Aggiorna analisi</button></section>
      <section class="analysis-summary-strip" aria-label="Riepilogo del KPI selezionato"><article class="analysis-summary-primary"><div class="analysis-summary-heading"><span class="analysis-summary-icon">${icon("analysis")}</span><span><small>KPI selezionato</small><strong>${escapeHtml(data.kpi.name)}</strong></span></div><div class="analysis-summary-value"><span>${data.stats.primaryAggregation === "total" ? "Totale rete" : "Media della rete"}</span><strong>${analysisValue(data.stats.primaryValue)}</strong><small>${escapeHtml(data.campaign.name)} · ${data.stats.count} rilevazioni valide</small></div></article><article><div class="analysis-stat-heading"><span class="analysis-stat-icon">${icon("median")}</span><span>Mediana</span></div><strong>${analysisValue(data.stats.median)}</strong><small>Valore centrale del campione</small></article><article><div class="analysis-stat-heading"><span class="analysis-stat-icon">${icon("trendDown")}</span><span>Minimo</span></div><strong>${analysisValue(data.stats.min)}</strong><small>${dealerIdentity(minimumDealer,"Valore più basso osservato")}</small></article><article><div class="analysis-stat-heading"><span class="analysis-stat-icon">${icon("trendUp")}</span><span>Massimo</span></div><strong>${analysisValue(data.stats.max)}</strong><small>${dealerIdentity(maximumDealer,"Valore più alto osservato")}</small></article></section>
      <div class="analysis-results-grid"><article class="panel analysis-regions"><div class="panel-header"><div class="analysis-panel-heading"><span class="analysis-panel-icon" aria-hidden="true">${icon("analysis")}</span><div><p class="eyebrow">Distribuzione territoriale</p><h2>Media KPI per regione</h2><p>Medie regionali ordinate dal valore più alto.</p></div></div><span class="analysis-unit">${escapeHtml(data.kpi.unit)}</span></div><div class="panel-body analysis-region-list-body"><div class="analysis-region-table-scroll"><div class="analysis-region-table-head" aria-hidden="true"><span>Rank</span><span>Regione</span><span></span><span>Valore</span></div><ol class="analysis-region-compact-list" aria-label="Classifica delle medie regionali">${data.regions.map((item,index) => `<li><span class="ranking-position">${index+1}</span><strong class="analysis-region-name">${escapeHtml(item.region)}</strong><span class="ranking-progress" aria-label="${analysisValue(item.average)}"><i style="width:${regionBarWidth(item.average)}%"></i><b style="left:${networkMarker}%" aria-hidden="true"></b></span><strong class="analysis-region-value">${analysisValue(item.average)}</strong></li>`).join("")}</ol><div class="analysis-network-average-row"><span style="left:${networkMarker}%">Media rete · ${analysisValue(networkAverage)}</span></div></div><p class="analysis-chart-note">Le barre confrontano le medie dei dealer di ciascuna regione; la linea tratteggiata indica la media complessiva della rete.</p></div></article>
        <div class="analysis-secondary-grid">
          <article class="panel analysis-ranking"><div class="panel-header"><div class="analysis-panel-heading"><span class="analysis-panel-icon" aria-hidden="true">${icon("dealers")}</span><div><p class="eyebrow">Classifica singoli dealer</p><h2>Valori per concessionario</h2><p>Valori individuali confrontati con la media della rete.</p></div></div></div><div class="panel-body analysis-dealer-column-body"><figure class="analysis-dealer-column-chart"><figcaption class="sr-only">I cinque concessionari con il valore più alto sul KPI selezionato</figcaption><div class="analysis-dealer-column-scroll"><div class="analysis-dealer-column-canvas"><div class="analysis-dealer-y-axis" aria-hidden="true">${dealerChartTicks.map((tick)=>`<span>${dealerChartLabel(tick)}</span>`).join("")}</div><div class="analysis-dealer-column-plot"><div class="analysis-dealer-column-grid" aria-hidden="true"><i></i><i></i><i></i></div><div class="analysis-dealer-average-line" style="bottom:${dealerAverageBottom}px" aria-label="Media della rete: ${analysisValue(networkAverage)}"><span>Media rete · <strong>${analysisValue(networkAverage)}</strong></span></div><ol class="analysis-dealer-columns">${topDealers.map((item,index)=>{ const delta=dealerDelta(item.value); return `<li><div class="analysis-dealer-column-value"><strong>${analysisValue(item.value)}</strong>${delta===null?"":`<small class="${delta>=0?"is-positive":"is-negative"}">${delta>=0?"+":""}${delta.toLocaleString("it-IT",{maximumFractionDigits:1})}% <span>vs media</span></small>`}</div><span class="analysis-dealer-column"><i style="height:${dealerColumnHeight(item.value)}%"></i></span><div class="analysis-dealer-column-label"><span class="ranking-position">${String(index+1).padStart(2,"0")}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.region)}</small></div></li>`;}).join("")}</ol></div></div></div></figure></div></article>
          <article class="panel analysis-region-insights">
            <div class="panel-header"><div class="analysis-panel-heading"><span class="analysis-panel-icon" aria-hidden="true">${icon("trendUp")}</span><div><p class="eyebrow">Lettura del confronto</p><h2>Scenario regionale</h2><p>Indicatori sintetici della distribuzione territoriale.</p></div></div></div>
            <div class="panel-body analysis-region-insights-body">
              <section class="analysis-region-leader" aria-label="Regione con la media KPI più alta">
                <div class="analysis-region-leader-copy">
                  <span class="analysis-region-leader-kicker"><i aria-hidden="true">${icon("trendUp")}</i>Regione in testa</span>
                  <strong>${topRegion?escapeHtml(topRegion.region):"—"}</strong>
                  <b>${topRegion?analysisValue(topRegion.average):"Nessun dato"}</b>
                  ${regionalDelta===null?"":`<em><span aria-hidden="true">↑</span> ${regionalDelta>=0?"+":""}${regionalDelta.toLocaleString("it-IT",{maximumFractionDigits:1})}% vs rete</em>`}
                </div>
                <figure class="analysis-region-map" role="img" aria-label="Area geografica di riferimento per ${topRegion?escapeHtml(topRegion.region):"la regione in testa"}"><svg viewBox="${topRegionMap.viewBox}" aria-hidden="true" focusable="false"><defs><pattern id="analysis-region-stripes" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="9" fill="#f36a15"/></pattern><mask id="analysis-region-mask" x="-1000" y="-1000" width="3000" height="3000" maskUnits="userSpaceOnUse" mask-type="alpha"><use href="/assets/italy-macroareas.svg?v=2#macroarea-${topRegionMap.id}"></use></mask></defs><rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#analysis-region-stripes)" mask="url(#analysis-region-mask)"/></svg></figure>
              </section>
              <dl class="analysis-region-insight-metrics">
                <div><span class="analysis-region-metric-icon" aria-hidden="true">${icon("clock")}</span><div><dt>Ampiezza regionale</dt><dd>${analysisValue(regionalSpread)}</dd></div></div>
                <div><span class="analysis-region-metric-icon" aria-hidden="true">${icon("users")}</span><div><dt>Campione</dt><dd>${data.stats.count} dealer</dd></div></div>
              </dl>
              <div class="analysis-region-note"><span aria-hidden="true">${icon("reports")}</span><p>Le medie regionali aggregano i valori dei dealer della stessa regione. La classifica a fianco mostra invece i singoli concessionari.</p></div>
            </div>
          </article>
        </div></div>
    </section>`;
  }

  function collectionPage(data) {
    const locked = ["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(data.submission.collection_status);
    const statusClass = collectionStatusClass(data.submission.collection_status);
    const statusText=escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status);
    const lockedTitle=data.submission.collection_status === "VALIDATED" ? "Compilazione validata · sola lettura" : "Compilazione inviata · sola lettura";
    const lockedMessage="I dati sono bloccati. Per modificarli, JET deve riaprire la compilazione dalla scheda concessionario.";
    const saveLabel=locked
      ? `Invio completato${data.submission.submitted_at?` · ${formatDate(data.submission.submitted_at,true)}`:""}`
      : data.submission.updated_at?`Bozza salvata alle ${new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(data.submission.updated_at))}`:"Bozza non ancora salvata";
    const sectionDescription={"Fatturato e ricambi":"Inserisci i valori economici annuali dell'azienda e del reparto ricambi.","Magazzino e ordini":"Indica stock, urgenze e rotazione del magazzino ricambi.","Tariffe e attività tecnica":"Inserisci tariffe e ore complessive dell'attività tecnica."};
    const dealerIdentity=`<section class="collection-prefilled" aria-labelledby="dealer-prefilled-title"><div><p class="eyebrow">Dati precompilati</p><h3 id="dealer-prefilled-title">Anagrafica concessionaria</h3><p>Verifica i dati associati al link prima di proseguire.</p></div><dl><div><dt>Codice concessionaria</dt><dd>${escapeHtml(data.dealer.id)}</dd></div><div><dt>Nome concessionaria</dt><dd>${escapeHtml(data.dealer.name)}</dd></div><div><dt>Regione</dt><dd>${escapeHtml(data.dealer.region)}</dd></div><div><dt>Area</dt><dd>${escapeHtml(data.dealer.area)}</dd></div><div><dt>Area manager</dt><dd>${escapeHtml(data.dealer.manager)}</dd></div></dl></section>`;
    const formContent = data.mode === "jotform" && data.liveReady
      ? `<div class="jotform-frame panel"><iframe title="Questionario ${escapeHtml(data.campaign.name)}" src="${escapeHtml(data.embedUrl)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="geolocation 'none'; camera 'none'; microphone 'none'"></iframe></div>`
      : `<form id="survey-form" class="questionnaire-shell" novalidate><aside class="collection-rail"><div class="collection-context"><p class="eyebrow">Concessionario</p><h1 id="collection-title">${escapeHtml(data.dealer.name)}</h1><span class="dealer-reference">Dealer ID · ${escapeHtml(data.dealer.id)}</span></div><dl class="collection-meta"><div><dt>Rilevazione</dt><dd>${escapeHtml(data.campaign.name)}</dd></div><div><dt>Periodo</dt><dd>${formatDate(data.campaign.open_date)} — ${formatDate(data.campaign.close_date)}</dd></div><div><dt>Scadenza</dt><dd>${formatDate(data.campaign.close_date)}</dd></div></dl><div class="questionnaire-progress"><div><strong id="completion-label">0 di ${data.questionnaire.fields.length} dati completati · 0%</strong><span id="section-progress-label">Sezione 1 di ${data.questionnaire.sections.length}</span></div><div class="progress-track"><span id="questionnaire-progress-bar" style="width:0%"></span></div></div><nav class="section-nav" aria-label="Sezioni questionario">${data.questionnaire.sections.map((section,index)=>`<button type="button" data-section-target="${index}" class="${index===0?"is-active":""}"><span>${String(index+1).padStart(2,"0")}</span><em>${escapeHtml(section)}</em><small data-section-completion="${index}">0/${data.questionnaire.fields.filter(field=>field.section===section).length}</small></button>`).join("")}</nav><div class="save-indicator" aria-live="polite"><span></span><strong id="save-status">${saveLabel}</strong></div>${locked?`<div class="survey-readonly-notice status-${statusClass}" role="status"><strong>${lockedTitle}</strong><span>${lockedMessage}</span></div>`:`<div class="rail-actions"><button class="button" type="button" id="save-draft">Salva bozza</button><button class="button primary" type="submit" id="review-submit">Rivedi e invia</button></div>`}<p class="collection-support">Serve assistenza?<br><a href="mailto:${escapeHtml(data.support.email)}">${escapeHtml(data.support.label)}</a></p></aside><main class="collection-workspace">${data.questionnaire.sections.map((section,index)=>`<section class="questionnaire-section ${index===0?"is-active":""}" data-section="${index}" aria-labelledby="section-${index}"><header class="section-header"><p class="eyebrow">Sezione ${String(index+1).padStart(2,"0")}</p><h2 id="section-${index}">${escapeHtml(section)}</h2><p>${escapeHtml(sectionDescription[section]||"Inserisci i dati relativi all'intero periodo di rilevazione.")}</p></header>${index===0?dealerIdentity:""}<div class="survey-fields">${data.questionnaire.fields.filter((field)=>field.section===section).map((field)=>`<div class="survey-field"><div class="field-copy"><label for="field-${escapeHtml(field.code)}">${escapeHtml(questionnaireFieldLabel(field,data.campaign))}${field.required?'<span aria-hidden="true">*</span>':""}</label><p>${escapeHtml(field.description)}</p><small id="help-${escapeHtml(field.code)}">Minimo ${field.min ?? 0}${field.max!==null?` · massimo ${field.max}`:""}</small></div><div class="field-control"><div class="input-with-unit"><input id="field-${escapeHtml(field.code)}" name="${escapeHtml(field.code)}" type="text" inputmode="decimal" autocomplete="off" placeholder="${escapeHtml(field.placeholder)}" value="${data.values[field.code]?.value ?? ""}" ${locked?'readonly aria-readonly="true"':""} aria-describedby="help-${escapeHtml(field.code)} error-${escapeHtml(field.code)}" /><span>${escapeHtml(field.unit)}</span></div><small class="field-error" id="error-${escapeHtml(field.code)}" data-error-for="${escapeHtml(field.code)}"></small></div></div>`).join("")}</div><div class="section-actions"><button class="button" type="button" data-prev-section ${index===0?"disabled":""}>Indietro</button><span>${index+1} / ${data.questionnaire.sections.length}</span><button class="button primary" type="button" data-next-section ${locked&&index===data.questionnaire.sections.length-1?'disabled aria-disabled="true"':""}>${locked&&index===data.questionnaire.sections.length-1?"Sola lettura":index===data.questionnaire.sections.length-1?"Vai al riepilogo":"Continua"}</button></div></section>`).join("")}</main><dialog id="submit-review" class="review-dialog"><div class="review-dialog-header"><div><p class="eyebrow">Controllo finale</p><h2>Riepilogo della rilevazione</h2><p>Controlla i dati prima dell'invio definitivo.</p></div><button type="button" id="close-review" aria-label="Chiudi">×</button></div><div id="review-values" class="review-values"></div><footer class="review-footer"><p>Dopo l'invio i dati non saranno modificabili senza riapertura da parte di JET.</p><div class="inline-actions"><button class="button" type="button" id="cancel-review">Torna ai dati</button><button class="button primary" type="button" id="confirm-submit">Conferma invio</button></div></footer></dialog></form>`;
    return `<section class="collection-page" aria-labelledby="collection-title"><div class="collection-demo-strip">Ambiente dimostrativo — tutti i dati visualizzati sono fittizi</div><header class="collection-header"><div class="collection-brand"><img class="collection-brand-logo" src="/assets/sdf-logo-primary.png" alt="SDF — Farming Technology. Since 1927." /><span><strong>Network Performance</strong><small>Raccolta dati concessionari</small></span></div><span class="badge ${statusClass}">${statusText}</span></header>${formContent}<footer class="collection-footer"><span>Questionario SDF · versione cliente v1</span><span>SDF Network Performance</span></footer></section>`;
  }

  function collectionConfirmationPage(data) {
    return `<section class="collection-page confirmation-page"><div class="collection-demo-strip">Ambiente dimostrativo — tutti i dati visualizzati sono fittizi</div><header class="collection-header"><div class="collection-brand"><img class="collection-brand-logo" src="/assets/sdf-logo-primary.png" alt="SDF — Farming Technology. Since 1927." /><span><strong>Network Performance</strong><small>Raccolta dati concessionari</small></span></div></header><main class="confirmation-layout"><div class="confirmation-mark">${icon("check")}</div><article class="confirmation-card"><p class="eyebrow">Invio completato</p><h1>Compilazione ricevuta</h1><p>I dati di <strong>${escapeHtml(data.dealer.name)}</strong> per la rilevazione <strong>${escapeHtml(data.campaign.name)}</strong> sono stati acquisiti correttamente.</p><dl><div><dt>Data e ora</dt><dd>${formatDate(data.submission.submitted_at,true)}</dd></div><div><dt>Stato</dt><dd>${escapeHtml(statusLabel[data.submission.collection_status] || data.submission.collection_status)}</dd></div><div><dt>Riferimento</dt><dd>${escapeHtml(data.dealer.id)} · ${escapeHtml(data.campaign.name)}</dd></div></dl><p class="confirmation-note">I dati non sono più modificabili da questo link. JET potrà riaprire la compilazione e contattare il concessionario se saranno necessarie verifiche.</p></article></main><footer class="collection-footer"><span>SDF Network Performance</span><span>Raccolta dati completata</span></footer></section>`;
  }

  function surveyPage(data) {
    return collectionPage({ ...data,mode:"demo",liveReady:false,support:{ label:"Assistenza JET",email:"supporto.jet@example.com" },submission:{ ...data.submission,collection_status:data.submission.status === "submitted" ? "SUBMITTED" : data.submission.status === "draft" ? "DRAFT" : "NOT_STARTED" } });
  }

  function campaignsPage() {
    const campaigns=state.campaigns.campaigns;
    const activeCampaign=campaigns.find((item)=>item.status === "open" && !item.is_archived);
    const actions=state.role === "JET" ? `${state.config.jotform.enabled?'<button class="button" id="sync-jotform">Sincronizza da Jotform</button>':''}<button class="button surveys-primary-action" id="create-campaign">${icon("calendar")}Nuova campagna</button>` : "";
    const dialog=state.role === "JET"?`<dialog id="campaign-dialog" class="review-dialog operational-dialog"><form id="campaign-form"><div class="review-dialog-header"><div><p class="eyebrow">Rilevazione annuale</p><h2 id="campaign-dialog-title">Nuova rilevazione</h2><p>Definisci periodo e concessionari coinvolti senza script o configurazioni tecniche.</p></div><button type="button" data-close-dialog>×</button></div><div class="operational-form-grid"><input type="hidden" name="campaign_id"><label><span>Nome</span><input name="name" required></label><label><span>Anno</span><input name="year" type="number" required></label><label><span>Numero rilevazione</span><input name="survey_no" type="number" min="1" required></label><label><span>Data apertura</span><input name="open_date" type="date" required></label><label><span>Scadenza</span><input name="close_date" type="date" required></label><label><span>Collegata a</span><select name="parent_campaign_id"><option value="">Nessuna</option>${campaigns.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label></div><fieldset class="dealer-selector"><legend>Concessionari coinvolti</legend><div><label><input id="select-all-campaign-dealers" type="checkbox"> Seleziona tutti</label><span id="campaign-dealer-count">0 selezionati</span></div><div class="dealer-check-list">${dealers.map(item=>`<label><input type="checkbox" name="dealerIds" value="${escapeHtml(item.id)}"> <span>${escapeHtml(item.name)}<small>${escapeHtml(item.id)} · ${escapeHtml(item.email||"Email mancante")}</small></span></label>`).join("")}</div></fieldset><footer class="review-footer"><button class="button" type="button" data-close-dialog>Annulla</button><button class="button primary" type="submit">Salva rilevazione</button></footer></form></dialog>`:"";
    const cards=campaigns.map((item) => {
      const statusLabel=item.is_archived?"Archiviata":item.status === "open" ? "Aperta" : item.status === "draft" ? "Bozza" : "Chiusa";
      const statusClass=item.status === "open" ? "complete" : item.status === "draft" ? "draft" : "missing";
      const completion=Math.max(0,Math.min(100,Number(item.progress.completion)||0));
      const remaining=Math.max(0,item.progress.dealers-item.progress.received);
      const managementActions=state.role==="JET"?`${item.status==="draft"?`<button class="button" data-edit-campaign="${escapeHtml(item.id)}">Modifica</button><button class="button" data-campaign-status="open" data-campaign-action-id="${escapeHtml(item.id)}">Apri raccolta</button>`:item.status==="open"?`<button class="button" data-edit-campaign="${escapeHtml(item.id)}">Modifica</button><button class="button" data-campaign-status="closed" data-campaign-action-id="${escapeHtml(item.id)}">Chiudi</button>`:!item.is_archived?`<button class="button" data-campaign-status="archived" data-campaign-action-id="${escapeHtml(item.id)}">Archivia</button>`:""}<button class="button" data-duplicate-campaign="${escapeHtml(item.id)}">Duplica</button>`:"";
      return `<article class="campaign-row panel surveys-campaign-card ${item.status === "open" ? "is-active" : ""}"><div class="surveys-campaign-main"><div class="surveys-campaign-topline"><span class="badge ${statusClass}">${statusLabel}</span><span>${item.dealerIds.length} concessionari</span></div><h2>${escapeHtml(item.name)}</h2><p class="surveys-campaign-period"><span aria-hidden="true">${icon("calendar")}</span>${formatDate(item.open_date)} — ${formatDate(item.close_date)}</p></div><div class="surveys-campaign-progress"><div><span>Avanzamento</span><strong>${completion}%</strong></div><span class="surveys-progress-track" role="progressbar" aria-label="Avanzamento di ${escapeHtml(item.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion}"><i style="width:${completion}%"></i></span><footer><span><strong>${item.progress.received}</strong> ricevute</span><span>${remaining} da ricevere</span></footer></div><div class="campaign-actions"><button class="button campaign-dashboard" data-campaign-id="${escapeHtml(item.id)}">Apri dashboard ${icon("chevron")}</button>${managementActions?`<div class="campaign-secondary-actions">${managementActions}</div>`:""}</div></article>`;
    }).join("") || `<div class="panel surveys-empty"><span aria-hidden="true">${icon("calendar")}</span><h2>Nessuna rilevazione</h2><p>Crea una campagna per iniziare la raccolta dati della rete.</p></div>`;
    return `<section class="page surveys-design-page" aria-labelledby="page-title"><header class="surveys-hero"><div class="surveys-hero-copy"><p class="eyebrow"><span aria-hidden="true">${icon("calendar")}</span><span>Gestione raccolta</span></p><h1 id="page-title">Rilevazioni</h1><p class="page-subtitle">Campagne annuali, finestre di compilazione e stato della rete.</p></div><div class="surveys-hero-actions">${actions}</div></header><section class="surveys-summary" aria-label="Riepilogo della campagna attiva"><article><span class="surveys-summary-icon" aria-hidden="true">${icon("calendar")}</span><div><small>Campagna attiva</small><strong>${activeCampaign?escapeHtml(activeCampaign.name):"Nessuna"}</strong></div></article><article><span class="surveys-summary-icon" aria-hidden="true">${icon("download")}</span><div><small>Rilevazioni ricevute</small><strong>${activeCampaign?`${activeCampaign.progress.received} / ${activeCampaign.progress.dealers}`:"—"}</strong></div></article><article><span class="surveys-summary-icon" aria-hidden="true">${icon("analysis")}</span><div><small>Completamento rete</small><strong>${activeCampaign?`${Math.max(0,Math.min(100,Number(activeCampaign.progress.completion)||0))}%`:"—"}</strong></div></article></section><div class="surveys-section-heading"><div><p class="eyebrow">Archivio operativo</p><h2>Campagne e stato raccolta</h2><p>Controlla l’avanzamento e gestisci il ciclo di ogni rilevazione.</p></div><span>${campaigns.length} ${campaigns.length===1?"rilevazione":"rilevazioni"}</span></div><div class="campaign-list surveys-campaign-list">${cards}</div>${dialog}</section>`;
  }

  function reportsPage() {
    const campaign=state.overview?.campaign;
    const totals=state.overview?.totals || {};
    const kpiCount=state.config?.kpis?.length || 0;
    return `<section class="page reports-design-page" aria-labelledby="page-title"><header class="reports-hero"><div class="reports-hero-copy"><p class="eyebrow"><span aria-hidden="true">${icon("reports")}</span><span>Export e condivisione</span></p><h1 id="page-title">Report</h1><p class="page-subtitle">Scarica dati aggregati e valori KPI della campagna corrente.</p></div><span class="reports-format"><small>Formato disponibile</small><strong>CSV</strong></span></header><section class="reports-summary" aria-label="Contesto del report"><article><span class="reports-summary-icon" aria-hidden="true">${icon("calendar")}</span><div><small>Rilevazione</small><strong>${campaign?escapeHtml(campaign.name):"—"}</strong></div></article><article><span class="reports-summary-icon" aria-hidden="true">${icon("users")}</span><div><small>Dealer inclusi</small><strong>${totals.dealers ?? "—"}</strong></div></article><article><span class="reports-summary-icon" aria-hidden="true">${icon("download")}</span><div><small>Dati ricevuti</small><strong>${totals.received ?? "—"}</strong></div></article><article><span class="reports-summary-icon" aria-hidden="true">${icon("analysis")}</span><div><small>KPI nel tracciato</small><strong>${kpiCount || "—"}</strong></div></article></section><div class="reports-section-heading"><div><p class="eyebrow">File disponibili</p><h2>Esporta e prepara i dati</h2><p>Due tracciati distinti per analisi della rete e gestione anagrafica.</p></div></div><div class="report-grid reports-action-grid"><article class="panel report-card reports-dataset-card"><div class="reports-card-copy"><header><span class="reports-card-icon" aria-hidden="true">${icon("reports")}</span><div><p class="eyebrow">Export rete</p><h2>Dataset completo</h2></div></header><p>Un unico CSV con anagrafica, stato della rilevazione e valori KPI di tutti i concessionari inclusi.</p><ul class="reports-content-list"><li>${icon("check")}Anagrafica dealer</li><li>${icon("check")}Stato compilazione</li><li>${icon("check")}${kpiCount} KPI della rilevazione</li><li>${icon("check")}Valori ricevuti</li></ul><button class="button reports-primary-button" data-export-csv>${icon("download")}Scarica dataset CSV</button></div><div class="reports-file-preview" aria-hidden="true"><span>CSV</span><div><i></i><i></i><i></i><i></i><i></i></div><small>${campaign?escapeHtml(campaign.name):"Rilevazione corrente"}</small></div></article><article class="panel report-card reports-template-card"><header><span class="reports-card-icon" aria-hidden="true">${icon("dealers")}</span><div><p class="eyebrow">Anagrafica</p><h2>Template concessionari</h2></div></header><p>Scarica il tracciato richiesto, compilalo in Excel e importalo dalla pagina Concessionari.</p><div class="reports-template-fields" aria-label="Campi principali del template"><span>dealer_id</span><span>name</span><span>region</span><span>area</span><span>manager</span><span>email</span></div><div class="reports-template-actions"><a class="button" href="/api/dealers/template.csv">${icon("download")}Scarica template</a><button class="button reports-text-action" data-page-link="dealers">Vai a Concessionari ${icon("chevron")}</button></div></article></div><aside class="reports-note panel"><span aria-hidden="true">${icon("check")}</span><div><strong>Dati coerenti in ogni vista</strong><p>Il dataset usa la stessa rilevazione mostrata in Overview, Analisi KPI e schede concessionario.</p></div></aside></section>`;
  }

  function helpCenterPage(activeGuideId) {
    const guideMarkup=helpGuides.map((guide)=>`<details class="help-guide" id="help-${escapeHtml(guide.id)}" data-help-guide data-help-category="${escapeHtml(guide.category)}" data-help-search-text="${escapeHtml(`${guide.title} ${guide.summary} ${guide.steps.join(" ")} ${guide.audience}`)}" ${guide.id===activeGuideId?"open":""}><summary><span class="help-guide-index">${String(helpGuides.indexOf(guide)+1).padStart(2,"0")}</span><span><small>${escapeHtml(guide.audience)}</small><strong>${escapeHtml(guide.title)}</strong><em>${escapeHtml(guide.summary)}</em></span><span class="help-guide-toggle" aria-hidden="true">${icon("chevron")}</span></summary><div class="help-guide-body"><ol>${guide.steps.map(step=>`<li>${escapeHtml(step)}</li>`).join("")}</ol><button class="button" type="button" data-help-destination="${escapeHtml(guide.destination)}">${escapeHtml(guide.action)}${icon("arrow")}</button></div></details>`).join("");
    return `<section class="page help-page help-design-page" aria-labelledby="page-title"><header class="help-hero"><div class="help-hero-copy"><p class="eyebrow"><span aria-hidden="true">${icon("help")}</span><span>Supporto operativo</span></p><h1 id="page-title">Centro assistenza</h1><p class="page-subtitle">Procedure chiare per utilizzare tutte le funzioni del portale.</p></div><div class="help-hero-count" aria-label="Guide disponibili"><strong>${helpGuides.length}</strong><span>guide operative</span></div></header><section class="help-search-panel" aria-label="Ricerca nelle guide"><div class="help-search-field">${icon("search")}<label class="sr-only" for="help-search">Cerca una guida</label><input id="help-search" type="search" placeholder="Cerca concessionario, rilevazione, link o export" autocomplete="off"><kbd>Invio</kbd></div><p><strong>Trova subito una procedura</strong><span>Ricerca per operazione o sezione del portale.</span></p></section><div class="help-layout"><aside class="help-sidebar panel" aria-label="Categorie assistenza"><div class="help-sidebar-heading"><span aria-hidden="true">${icon("reports")}</span><div><p class="eyebrow">Navigazione</p><h2>Argomenti</h2></div></div><nav>${helpCategories.map((category,index)=>`<button type="button" data-help-category-filter="${category.id}" class="${index===0?"is-active":""}"><span>${escapeHtml(category.label)}</span><small>${category.id==="all"?helpGuides.length:helpGuides.filter(guide=>guide.category===category.id).length}</small></button>`).join("")}</nav><div class="help-role-note"><span aria-hidden="true">${icon("users")}</span><div><strong>Guide per ruolo</strong><p>Ogni procedura indica se è destinata a JET, SDF o al concessionario.</p></div></div></aside><section class="help-content panel" aria-labelledby="help-results-title"><div class="help-content-heading"><div><p class="eyebrow">Procedure disponibili</p><h2 id="help-results-title">Tutte le guide</h2></div><span id="help-results-count">${helpGuides.length} guide</span></div><div id="help-guide-list">${guideMarkup}</div><div class="help-empty" id="help-empty" hidden><span>${icon("search")}</span><h2>Nessuna guida trovata</h2><p>Prova con un’operazione o il nome di una sezione del portale.</p><button class="button" type="button" id="help-reset">Mostra tutte le guide</button></div></section></div></section>`;
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
      if (page === "help") main.innerHTML = helpCenterPage(options.guideId);
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
    enhanceSelects(document);
    bindPageEvents();
    bindFunctionalEvents();
    updateNavigation(page === "dealer" ? "dealers" : publicPage ? "" : page);
    document.querySelector("#mobile-page-title").textContent = ({overview:"Overview",dealers:"Concessionari",dealer:"Dettaglio concessionario",analysis:"Analisi KPI",surveys:"Rilevazioni",reports:"Report",help:"Centro assistenza",survey:"Compilazione KPI",collection:"Compilazione",confirmation:"Conferma"})[page] || "Portale KPI";
    clearInterval(state.poller);
    if (page === "overview") state.poller = setInterval(async () => {
      try { state.overview = await api(`/api/overview?campaignId=${campaignId()}`); if (currentPage === "overview") { main.innerHTML=portalOverviewPage(); hydrateIcons(main); enhanceSelects(main); bindPageEvents(); bindFunctionalEvents(); syncShell(); } } catch {}
    },20_000);
    window.scrollTo({top:0,behavior:"instant"});
    if (page === "help" && options.guideId) requestAnimationFrame(()=>document.querySelector(`#help-${CSS.escape(options.guideId)}`)?.scrollIntoView({block:"start"}));
  }

  function bindFunctionalEvents() {
    const helpSearch=main.querySelector("#help-search");
    if(helpSearch){
      let activeCategory="all";
      const applyHelpFilters=()=>{const term=normalizeSearch(helpSearch.value);let visible=0;main.querySelectorAll("[data-help-guide]").forEach((guide)=>{const matchesCategory=activeCategory==="all"||guide.dataset.helpCategory===activeCategory;const matchesTerm=!term||normalizeSearch(guide.dataset.helpSearchText).includes(term);guide.hidden=!(matchesCategory&&matchesTerm);if(!guide.hidden)visible+=1});const category=helpCategories.find(item=>item.id===activeCategory);main.querySelector("#help-results-title").textContent=term?"Risultati della ricerca":category?.label||"Tutte le guide";main.querySelector("#help-results-count").textContent=`${visible} ${visible===1?"guida":"guide"}`;main.querySelector("#help-empty").hidden=visible>0};
      helpSearch.addEventListener("input",applyHelpFilters);
      helpSearch.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();const first=main.querySelector("[data-help-guide]:not([hidden])");if(first){first.open=true;first.scrollIntoView({behavior:"smooth",block:"start"})}}});
      main.querySelectorAll("[data-help-category-filter]").forEach(button=>button.addEventListener("click",()=>{activeCategory=button.dataset.helpCategoryFilter;main.querySelectorAll("[data-help-category-filter]").forEach(item=>item.classList.toggle("is-active",item===button));applyHelpFilters()}));
      main.querySelector("#help-reset")?.addEventListener("click",()=>{helpSearch.value="";activeCategory="all";main.querySelectorAll("[data-help-category-filter]").forEach(item=>item.classList.toggle("is-active",item.dataset.helpCategoryFilter==="all"));applyHelpFilters();helpSearch.focus()});
      main.querySelectorAll("[data-help-destination]").forEach(button=>button.addEventListener("click",()=>portalRenderPage(button.dataset.helpDestination)));
    }
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
    main.querySelector("#reset-filters")?.addEventListener("click",() => setTimeout(()=>{main.querySelectorAll("#region-filter,#status-filter").forEach(refreshCustomSelect);portalFilter()}));
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
    const areaMapHost=main.querySelector(".area-map-svg");
    if (areaMapHost) fetch("/assets/italy-macroareas.svg").then((response)=>response.text()).then((source)=>{
      const parsed=new DOMParser().parseFromString(source,"image/svg+xml");
      parsed.querySelector("script")?.remove();
      const svg=document.importNode(parsed.documentElement,true);
      areaMapHost.replaceChildren(svg);
      const shapes=[...svg.querySelectorAll(".macroarea")];
      const tooltip=svg.querySelector("#map-tooltip");
      const show=(area)=>{
        const shape=shapes.find((item)=>item.dataset.area===area);
        const sourceItem=main.querySelector(`.area-map-item[data-area="${area}"]`);
        if (!shape || !sourceItem) return;
        const box=shape.getBBox();
        const x=Math.max(8,Math.min(342,box.x+box.width/2-130));
        const y=Math.max(8,Math.min(680,box.y+box.height/2-118));
        svg.querySelector("#tooltip-area").textContent=sourceItem.querySelector("strong")?.textContent||"";
        svg.querySelector("#tooltip-dealers").textContent=sourceItem.querySelector("small")?.textContent||"";
        svg.querySelector("#tooltip-value").textContent=sourceItem.querySelector("b")?.textContent||"";
        tooltip?.setAttribute("transform",`translate(${x} ${y})`);
        tooltip?.classList.add("visible");
        shapes.forEach((item)=>{item.classList.toggle("dimmed",item!==shape);item.classList.toggle("remote-active",item===shape)});
      };
      const hide=()=>{tooltip?.classList.remove("visible");shapes.forEach((item)=>item.classList.remove("dimmed","remote-active"))};
      shapes.forEach((shape)=>{shape.setAttribute("tabindex","0");shape.addEventListener("mouseenter",()=>show(shape.dataset.area));shape.addEventListener("mouseleave",hide);shape.addEventListener("focus",()=>show(shape.dataset.area));shape.addEventListener("blur",hide)});
      main.querySelectorAll(".area-map-item[data-area]").forEach((item)=>{item.addEventListener("mouseenter",()=>show(item.dataset.area));item.addEventListener("mouseleave",hide);item.addEventListener("focus",()=>show(item.dataset.area));item.addEventListener("blur",hide)});
    }).catch(()=>areaMapHost.setAttribute("aria-label","Mappa non disponibile"));
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
        enhanceSelects(main.querySelector("#distribution-content"));
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
    if (createCampaign) createCampaign.addEventListener("click",()=>{campaignForm.reset();campaignForm.campaign_id.value="";const year=new Date().getFullYear()+1;campaignForm.name.value=`Rilevazione 1 — ${year}`;campaignForm.year.value=year;campaignForm.survey_no.value=1;campaignForm.open_date.value=`${year}-01-15`;campaignForm.close_date.value=`${year}-03-31`;refreshCustomSelect(campaignForm.parent_campaign_id);main.querySelector("#campaign-dialog-title").textContent="Nuova rilevazione";updateDealerCount();campaignDialog.showModal()});
    campaignForm?.querySelector("#select-all-campaign-dealers")?.addEventListener("change",event=>{campaignForm.querySelectorAll('[name="dealerIds"]').forEach(input=>input.checked=event.target.checked);updateDealerCount()});campaignForm?.querySelectorAll('[name="dealerIds"]').forEach(input=>input.addEventListener("change",updateDealerCount));
    main.querySelectorAll("[data-edit-campaign]").forEach(button=>button.addEventListener("click",()=>{const item=state.campaigns.campaigns.find(row=>row.id===button.dataset.editCampaign);campaignForm.reset();for(const name of ["campaign_id","name","year","survey_no","open_date","close_date","parent_campaign_id"])if(campaignForm[name])campaignForm[name].value=name==="campaign_id"?item.id:item[name]||"";refreshCustomSelect(campaignForm.parent_campaign_id);campaignForm.querySelectorAll('[name="dealerIds"]').forEach(input=>input.checked=item.dealerIds.includes(input.value));main.querySelector("#campaign-dialog-title").textContent="Modifica rilevazione";updateDealerCount();campaignDialog.showModal()}));
    campaignForm?.addEventListener("submit",async(event)=>{event.preventDefault();const data=new FormData(campaignForm);const id=data.get("campaign_id");const payload={name:data.get("name"),year:Number(data.get("year")),survey_no:Number(data.get("survey_no")),open_date:data.get("open_date"),close_date:data.get("close_date"),parent_campaign_id:data.get("parent_campaign_id")||null,dealerIds:data.getAll("dealerIds")};try{if(id){await api(`/api/campaigns/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify(payload)});const existing=state.campaigns.campaigns.find(item=>item.id===id);if(existing.status==="draft")await api(`/api/campaigns/${encodeURIComponent(id)}/dealers`,{method:"PUT",body:JSON.stringify({dealerIds:payload.dealerIds})})}else await api("/api/campaigns",{method:"POST",body:JSON.stringify(payload)});invalidateDataViews();state.config=null;showToast("Rilevazione salvata.");campaignDialog.close();await portalRenderPage("surveys")}catch(error){showToast(error.message)}});
    main.querySelectorAll("[data-campaign-status]").forEach(button=>button.addEventListener("click",async()=>{if(!confirm(`Confermare l'operazione sulla rilevazione?`))return;try{await api(`/api/campaigns/${encodeURIComponent(button.dataset.campaignActionId)}/status`,{method:"POST",body:JSON.stringify({status:button.dataset.campaignStatus})});invalidateDataViews();state.config=null;showToast("Stato rilevazione aggiornato.");await portalRenderPage("surveys")}catch(error){showToast(error.message)}}));
    main.querySelectorAll("[data-duplicate-campaign]").forEach(button=>button.addEventListener("click",async()=>{const source=state.campaigns.campaigns.find(item=>item.id===button.dataset.duplicateCampaign);const year=source.year+1;try{await api(`/api/campaigns/${encodeURIComponent(source.id)}/duplicate`,{method:"POST",body:JSON.stringify({name:`${source.name} — copia ${year}`,year,open_date:`${year}-01-01`,close_date:`${year}-12-31`})});invalidateDataViews();state.config=null;showToast("Rilevazione duplicata in bozza.");await portalRenderPage("surveys")}catch(error){showToast(error.message)}}));
    const form = main.querySelector("#survey-form");
    if (form) {
      let activeSection=0;
      const sections=[...form.querySelectorAll(".questionnaire-section")];
      const showSection=(index)=>{ activeSection=Math.max(0,Math.min(index,sections.length-1)); sections.forEach((section,i)=>section.classList.toggle("is-active",i===activeSection)); form.querySelectorAll("[data-section-target]").forEach((button,i)=>button.classList.toggle("is-active",i===activeSection)); const label=form.querySelector("#section-progress-label"); if(label)label.textContent=`Sezione ${activeSection+1} di ${sections.length}`; sections[activeSection]?.scrollIntoView({behavior:"smooth",block:"start"}); };
      const valuesFromForm=()=>Object.fromEntries(new FormData(form).entries());
      const normalizedFieldNumber=(field,text)=>text.includes(",")?text.replaceAll(".","").replace(",","."):["currency","hours","integer"].includes(field.type)&&/^\d{1,3}(\.\d{3})+$/.test(text)?text.replaceAll(".",""):text;
      const fieldError=(field,raw,{required=true}={})=>{const text=String(raw??"").trim().replaceAll(" ","");if(!text)return required&&field.required?"Campo obbligatorio":"";const value=Number(normalizedFieldNumber(field,text));if(!Number.isFinite(value))return"Inserire un numero valido";if(field.min!==null&&value<field.min)return`Il valore minimo è ${field.min}`;if(field.max!==null&&value>field.max)return`Il valore massimo è ${field.max}`;if(field.type==="integer"&&!Number.isInteger(value))return"Inserire un numero intero";return""};
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
      form.addEventListener("submit", (event) => {event.preventDefault();clearTimeout(state.autosaveTimer);const dialog=form.querySelector("#submit-review");const values=valuesFromForm();const fields=state.collection.questionnaire.fields;const errors=validateClient(values);fields.forEach(field=>markError(field.code,errors[field.code]||""));if(Object.keys(errors).length){const input=form.querySelector(`[name="${Object.keys(errors)[0]}"]`);const index=sections.findIndex(section=>section.contains(input));if(index>=0)showSection(index);input?.focus();showToast("Controlla i campi evidenziati.");return}form.querySelector("#review-values").innerHTML=state.collection.questionnaire.sections.map((section,index)=>`<section class="review-group"><h3>${escapeHtml(section)}</h3>${fields.filter(field=>field.section===section).map(field=>`<div class="review-item"><span>${escapeHtml(questionnaireFieldLabel(field,state.collection.campaign))}</span><strong>${escapeHtml(values[field.code])} ${escapeHtml(field.unit)}</strong><button type="button" class="review-edit" data-review-edit="${escapeHtml(field.code)}" data-review-section="${index}">Modifica</button></div>`).join("")}</section>`).join("");form.querySelectorAll("[data-review-edit]").forEach(button=>button.addEventListener("click",()=>{dialog.close();showSection(Number(button.dataset.reviewSection));form.querySelector(`[name="${button.dataset.reviewEdit}"]`)?.focus()}));dialog.showModal();});
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

  document.querySelector("#help-center-button")?.addEventListener("click",()=>portalRenderPage("help"));

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
  else portalRenderPage(["overview","dealers","analysis","surveys","reports","help"].includes(requested) ? requested : "overview");
})();
