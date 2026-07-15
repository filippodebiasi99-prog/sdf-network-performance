# SDF KPI Portal
## Struttura della preview e piano completo di progetto

## 1. Obiettivo del progetto

Realizzare una piattaforma professionale per raccogliere, monitorare e analizzare i KPI di una rete di circa 50–70 concessionari di macchine agricole SDF.

La piattaforma dovrà permettere di:

- raccogliere circa 20–25 KPI per concessionario;
- gestire una o due rilevazioni annuali;
- monitorare lo stato delle compilazioni;
- analizzare i risultati aggregati;
- confrontare aree, concessionari e rilevazioni;
- esportare dati e report;
- gestire utenti e permessi differenti;
- mantenere una struttura scalabile e utilizzabile nel tempo.

La direzione più corretta è pensare il progetto come un **portale continuativo per la rete concessionari**, non come un semplice questionario con qualche grafico.

---

## 2. Situazione attuale

È già stata creata una prima soluzione tramite Jotform AI.

Questa soluzione può essere utile per:

- capire il flusso generale;
- raccogliere rapidamente dati;
- testare un questionario;
- verificare quali informazioni servono davvero.

Tuttavia, allo stato attuale presenta diversi limiti:

- interfaccia poco professionale;
- struttura simile a una demo generata automaticamente;
- dashboard confusa;
- landing page non necessaria;
- uso eccessivo di immagini stock;
- tabelle poco leggibili;
- contenuti dimostrativi e duplicati;
- italiano e inglese mescolati;
- scarsa separazione tra area concessionario, area JET e area SDF;
- impossibilità, dagli screenshot, di capire se dati, permessi e automazioni siano realmente configurati.

La soluzione Jotform non va quindi scartata a priori, ma va considerata come possibile **strumento di raccolta dati**, non necessariamente come interfaccia definitiva.

---

## 3. Strategia generale

Il progetto può essere sviluppato in due fasi.

### Fase iniziale

Creare una preview visuale e cliccabile della piattaforma, senza sviluppare ancora:

- login reali;
- database definitivo;
- permessi;
- privacy;
- sincronizzazione Jotform;
- infrastruttura tecnica completa.

L’obiettivo della preview è mostrare:

- come potrebbe funzionare la piattaforma;
- quali schermate avrebbe;
- come verrebbero organizzati i dati;
- quale livello estetico e professionale si potrebbe raggiungere;
- come la soluzione potrebbe collegarsi a Jotform oppure diventare indipendente.

### Fase successiva

Solo dopo l’approvazione del progetto:

- definire i requisiti completi;
- scegliere la tecnologia;
- sviluppare database, login e permessi;
- collegare Jotform oppure creare il questionario proprietario;
- implementare dashboard, analisi, export e automazioni;
- testare sicurezza e privacy;
- pubblicare la piattaforma.

---

## 4. Obiettivo della preview attuale

La preview deve far capire che si può realizzare una piattaforma molto più professionale rispetto alla demo Jotform esistente.

Non deve essere una web app realmente funzionante.

Deve essere una rappresentazione credibile del prodotto finale.

### Risultato atteso

Una demo cliccabile con almeno queste pagine:

1. Overview;
2. Concessionari;
3. Dettaglio concessionario;
4. Analisi KPI;
5. eventuale pagina Rilevazioni;
6. eventuale pagina Report.

Per la presentazione iniziale sono sufficienti le prime quattro.

---

# 5. Struttura della piattaforma

## 5.1 Navigazione principale

Sidebar consigliata:

- Overview
- Concessionari
- Analisi KPI
- Rilevazioni
- Report

Elementi secondari:

- selezione campagna;
- profilo utente;
- notifiche;
- impostazioni;
- logout.

Per la preview, profilo, notifiche e impostazioni possono essere soltanto elementi visivi.

---

## 5.2 Pagina Overview

È la pagina più importante.

Deve permettere a JET e SDF di capire immediatamente la situazione generale.

### Header

Contenuti:

- titolo della piattaforma;
- campagna selezionata;
- periodo della rilevazione;
- ultimo aggiornamento;
- filtri principali;
- pulsante export report.

Esempio:

`Rilevazione 1 — 2026`

### KPI principali

Card iniziali:

- concessionari totali;
- compilazioni ricevute;
- compilazioni mancanti;
- percentuale di completamento;
- dati da verificare;
- variazione rispetto alla rilevazione precedente.

Esempio dati demo:

- 64 concessionari;
- 48 compilazioni;
- 16 mancanti;
- 75% completamento;
- 4 record da verificare.

### Grafici principali

Inserire pochi grafici, ma chiari:

1. andamento delle compilazioni nel tempo;
2. stato compilazioni per area;
3. distribuzione geografica;
4. confronto tra rilevazione corrente e precedente;
5. sintesi dei principali KPI aggregati.

### Contenuti operativi

- ultimi concessionari che hanno inviato;
- concessionari mancanti;
- record da verificare;
- scadenze;
- eventuali anomalie nei dati.

---

## 5.3 Pagina Concessionari

Questa pagina mostra l’intera rete.

### Filtri

- ricerca per nome;
- regione;
- area manager;
- stato compilazione;
- campagna;
- rilevazione;
- qualità dei dati.

### Tabella

Colonne consigliate:

- concessionario;
- Dealer ID;
- regione;
- area manager;
- stato;
- percentuale di completamento;
- data ultimo invio;
- rilevazione;
- qualità dati;
- azioni.

### Stati possibili

Per la preview:

- completato;
- non compilato;
- da verificare.

Lo stato `incompleto` non va ancora promesso come funzionalità reale finché non viene definito tecnicamente.

### Azioni

- apri dettaglio;
- esporta;
- aggiungi nota;
- modifica dati;
- invia reminder.

Nella preview queste azioni possono non essere realmente operative.

---

## 5.4 Pagina Dettaglio concessionario

Questa pagina deve far percepire il prodotto come un vero portale gestionale.

### Testata

Mostrare:

- nome concessionario;
- Dealer ID;
- regione;
- area manager;
- stato compilazione;
- data ultimo aggiornamento;
- campagna selezionata.

### Sintesi

Card con:

- stato generale;
- numero KPI compilati;
- qualità dati;
- confronto con media rete;
- confronto con rilevazione precedente.

### KPI

Per ogni KPI mostrare:

- valore concessionario;
- media rete;
- media area geografica;
- variazione rispetto alla rilevazione precedente;
- eventuale livello di attenzione.

### Grafici

- andamento storico;
- confronto dealer / media rete;
- confronto rilevazione 1 / rilevazione 2;
- radar o barre comparative, solo se realmente leggibili.

### Sezioni secondarie

- note JET;
- storico modifiche;
- segnalazioni;
- documenti o allegati, solo in una fase futura.

---

## 5.5 Pagina Analisi KPI

Questa pagina serve per analizzare un singolo KPI o un gruppo di KPI.

### Filtri

- KPI;
- campagna;
- rilevazione;
- area;
- regione;
- area manager;
- concessionario;
- periodo.

### Contenuti

- valore medio nazionale;
- mediana;
- minimo e massimo;
- distribuzione dei risultati;
- confronto per regione;
- confronto per area manager;
- classifica concessionari;
- variazione tra prima e seconda rilevazione;
- esportazione del dato filtrato.

### Grafici consigliati

- barre per regione;
- linea di confronto temporale;
- distribuzione;
- top e bottom dealer;
- scatter plot solo se serve a mostrare una relazione tra due KPI.

Non inserire grafici decorativi o difficili da interpretare.

---

## 5.6 Pagina Rilevazioni

Questa pagina gestirà le campagne annuali.

### Contenuti

- elenco campagne;
- anno;
- rilevazione 1 o 2;
- data apertura;
- data chiusura;
- stato;
- numero compilazioni;
- percentuale completamento;
- azioni.

### Funzioni future

- nuova rilevazione;
- duplicazione questionario;
- apertura e chiusura campagna;
- invio comunicazioni;
- reminder automatici;
- confronto tra campagne.

---

## 5.7 Pagina Report

Funzioni previste:

- export Excel;
- export CSV;
- report PDF;
- report completo rete;
- report per regione;
- report per area manager;
- report singolo concessionario;
- salvataggio filtri;
- storico esportazioni.

Per la preview può essere sufficiente mostrare l’interfaccia senza generare file reali.

---

# 6. Tipologie di utenti previste

## 6.1 Concessionario

Il concessionario dovrà:

- accedere tramite link univoco o account;
- compilare il questionario;
- salvare una bozza;
- inviare i dati;
- visualizzare il proprio stato;
- eventualmente consultare il proprio storico;
- non vedere dati di altri concessionari.

Da definire con il cliente:

- se il concessionario deve avere un account;
- se deve soltanto compilare tramite link;
- se deve vedere i propri risultati;
- se deve vedere il confronto con la media;
- se può correggere una rilevazione già inviata.

---

## 6.2 JET

JET avrà il controllo operativo completo.

Funzioni:

- visualizzare tutti i concessionari;
- monitorare compilati e mancanti;
- modificare dati;
- inserire note;
- gestire campagne;
- inviare reminder;
- esportare dati;
- gestire utenti;
- verificare anomalie;
- consultare lo storico delle modifiche.

---

## 6.3 SDF

SDF avrà un accesso principalmente in sola lettura.

Funzioni:

- dashboard generale;
- avanzamento compilazioni;
- KPI aggregati;
- filtri;
- confronto tra aree;
- confronto tra rilevazioni;
- report;
- export.

Da definire:

- se SDF deve vedere i singoli concessionari;
- se deve vedere le note interne;
- se deve poter esportare dati grezzi;
- se alcuni utenti SDF avranno permessi superiori.

---

# 7. Dati demo da preparare

Per rendere la preview credibile:

- 15–20 concessionari fittizi;
- 4 regioni;
- 3 area manager;
- 8–10 KPI dimostrativi;
- due rilevazioni;
- alcuni dealer completati;
- alcuni mancanti;
- alcuni da verificare.

### Esempio stati

- Dealer 01: completato;
- Dealer 02: completato con valori sopra media;
- Dealer 03: non compilato;
- Dealer 04: dati da verificare;
- Dealer 05: confronto disponibile tra rilevazione 1 e 2.

### Esempio KPI demo

- fatturato;
- marginalità;
- numero macchine vendute;
- quota ricambi;
- clienti attivi;
- conversione preventivi;
- tempo medio risposta;
- soddisfazione cliente;
- incidenza assistenza;
- crescita annuale.

Questi KPI sono solo esempi e andranno sostituiti con quelli reali.

---

# 8. Direzione visiva

La piattaforma deve sembrare uno strumento aziendale serio, non una landing page promozionale.

## Principi

- interfaccia pulita;
- gerarchia chiara;
- tabelle leggibili;
- testi compatti;
- grafici semplici;
- uso controllato dei colori;
- stato dei dati evidente;
- layout desktop prioritario;
- mobile responsive come requisito secondario;
- design coerente tra dashboard, tabelle e dettaglio dealer.

## Da evitare

- immagini stock;
- trattori decorativi;
- chatbot;
- QR Code fisso nella dashboard;
- landing introduttiva non necessaria;
- card troppo grandi;
- grafici senza funzione;
- tabelle dentro spazi stretti;
- testi marketing;
- elementi generici da template;
- inglese e italiano mescolati;
- colori eccessivi.

---

# 9. Architettura futura

## Opzione A — Jotform per la raccolta

Flusso:

```text
Concessionario
→ link o QR Code
→ questionario Jotform
→ invio dati
→ database della piattaforma
→ dashboard JET e SDF
```

### Vantaggi

- questionario già gestito;
- validazioni rapide;
- minore manutenzione iniziale;
- implementazione più veloce;
- Jotform conserva le submission originali.

### Svantaggi

- due sistemi da sincronizzare;
- minore controllo sulla compilazione;
- gestione bozze da verificare;
- maggiore dipendenza da Jotform;
- costi ricorrenti;
- limiti di personalizzazione del form.

---

## Opzione B — Portale completamente proprietario

Flusso:

```text
Concessionario
→ portale proprietario
→ questionario proprietario
→ database
→ dashboard JET e SDF
```

### Vantaggi

- controllo completo;
- esperienza coerente;
- un solo sistema;
- gestione precisa di bozze e stati;
- maggiore scalabilità;
- nessuna dipendenza strutturale da Jotform.

### Svantaggi

- sviluppo più lungo;
- maggiori responsabilità;
- gestione autenticazione e sicurezza;
- necessità di manutenzione;
- test più approfonditi.

---

## Strategia consigliata

Progettare la dashboard e il database in modo indipendente da Jotform.

In questo modo:

### Prima fase

```text
Jotform
→ nostro database
→ nostra dashboard
```

### Fase futura

```text
Nostro questionario
→ stesso database
→ stessa dashboard
```

La dashboard non dovrà essere ricostruita se si decide di eliminare Jotform.

---

# 10. Funzioni previste nella versione completa

## Raccolta dati

- questionario KPI;
- campi obbligatori;
- validazioni;
- salvataggio in bozza;
- conferma invio;
- gestione duplicati;
- gestione prima e seconda rilevazione;
- identificazione automatica del dealer.

## Monitoraggio

- compilati;
- mancanti;
- da verificare;
- percentuale completamento;
- date invio;
- scadenze;
- stato per area;
- storico campagne.

## Analisi

- KPI medi;
- KPI aggregati;
- confronto geografico;
- confronto dealer;
- confronto rilevazioni;
- ranking;
- distribuzioni;
- trend.

## Gestione

- anagrafica dealer;
- utenti;
- ruoli;
- note;
- modifiche;
- storico;
- reminder;
- campagne;
- export.

## Sicurezza

- login;
- ruoli;
- permessi;
- accesso ai soli dati autorizzati;
- MFA per amministratori;
- cifratura;
- backup;
- audit log;
- separazione ambiente test e produzione;
- hosting europeo, se richiesto;
- informative e accordi privacy.

---

# 11. Piano di lavoro dopo l’approvazione

## Settimana 1 — Analisi

- call requisiti;
- definizione utenti;
- definizione KPI;
- definizione flussi;
- definizione stati;
- definizione permessi;
- verifica infrastruttura esistente;
- decisione Jotform o questionario proprietario.

## Settimana 2 — UX e struttura dati

- wireframe;
- design system;
- database;
- anagrafica dealer;
- campagne;
- compilazioni;
- ruoli.

## Settimana 3 — Area concessionario

- accesso;
- questionario;
- validazioni;
- bozza;
- invio;
- storico.

## Settimana 4 — Dashboard JET

- overview;
- monitoraggio;
- tabella dealer;
- filtri;
- dettaglio;
- note.

## Settimana 5 — Analisi KPI

- grafici;
- confronti;
- aggregazioni;
- rilevazione 1 / 2;
- filtri avanzati.

## Settimana 6 — Area SDF e report

- accesso sola lettura;
- dashboard dedicata;
- export;
- report;
- gestione permessi.

## Settimana 7 — Sicurezza e test

- controllo accessi;
- log;
- backup;
- test dati;
- test ruoli;
- gestione errori;
- privacy.

## Settimana 8 — Pilota

- caricamento dealer;
- utenti pilota;
- test reale;
- correzioni;
- pubblicazione;
- documentazione minima.

---

# 12. Questioni da chiarire con il cliente

Prima dello sviluppo definitivo bisogna ottenere risposte precise.

1. Il concessionario deve avere un account oppure solo un link?
2. Deve vedere i propri risultati?
3. Deve confrontarsi con la media rete?
4. Può modificare i dati dopo l’invio?
5. La raccolta avviene una o due volte all’anno?
6. Esistono campagne aggiuntive?
7. JET deve gestire soltanto KPI o anche attività, documenti e comunicazioni?
8. SDF deve vedere i singoli dealer?
9. Quali dati sono riservati?
10. Chi può esportare i dati completi?
11. Esiste già Microsoft 365, Azure, Power BI o un CRM?
12. L’app deve stare nell’infrastruttura del cliente?
13. Quali requisiti privacy e sicurezza impone SDF?
14. Sono richiesti backup, audit log e MFA?
15. Sono previste integrazioni future?
16. Chi gestirà utenti, dealer e campagne?
17. Chi pagherà hosting e licenze?
18. Qual è il budget disponibile?
19. Qual è la scadenza reale?
20. Quali funzioni sono indispensabili per la prima versione?

---

# 13. Cosa realizzare adesso

Per la preview attuale:

## Deliverable

- una dashboard visuale credibile;
- dati fittizi;
- quattro pagine principali;
- navigazione cliccabile;
- stile professionale;
- struttura coerente;
- nessuna infrastruttura definitiva;
- nessun login reale;
- nessun database reale;
- nessun collegamento reale con Jotform.

## Pagine prioritarie

1. Overview;
2. Concessionari;
3. Dettaglio concessionario;
4. Analisi KPI.

## Obiettivo commerciale

Mostrare che:

- la soluzione può essere più professionale di quella creata in Jotform;
- Jotform può eventualmente restare come strumento di raccolta;
- la dashboard può essere completamente personalizzata;
- il progetto può diventare una piattaforma continuativa;
- il sistema può essere sviluppato in modo sicuro e scalabile dopo l’approvazione.

---

# 14. Messaggio sintetico da presentare

> Ho analizzato la soluzione creata con Jotform. Come base per la raccolta dati può essere utile, ma secondo me la parte di dashboard e gestione può essere strutturata in modo molto più professionale e adatto a un progetto SDF.  
>   
> Ho quindi preparato una prima preview della possibile piattaforma: una dashboard centralizzata per monitorare compilazioni, concessionari, KPI, aree geografiche e confronti tra rilevazioni.  
>   
> La piattaforma potrebbe inizialmente collegarsi a Jotform, mantenendo semplice la raccolta dati, oppure diventare in seguito completamente indipendente senza dover riprogettare tutta la dashboard.  
>   
> Questa preview serve a mostrare il possibile funzionamento e il livello del prodotto finale. Le scelte tecniche definitive, gli accessi e la gestione dei dati verranno definiti solo dopo l’approvazione del progetto.

---

# 15. Conclusione

Per il momento non è necessario costruire una piattaforma realmente funzionante.

La priorità è creare una preview convincente che chiarisca:

- cosa sarà il prodotto;
- come sarà organizzato;
- cosa vedranno JET e SDF;
- come verranno monitorati i concessionari;
- come saranno analizzati i KPI;
- come il sistema potrà evolvere.

Dopo l’approvazione si potrà scegliere tra:

- Jotform collegato a una dashboard proprietaria;
- portale completamente proprietario;
- eventuale infrastruttura Microsoft o altra soluzione aziendale.

La dashboard va progettata fin da subito come prodotto indipendente, così da non vincolare il progetto a Jotform e non dover rifare il lavoro in futuro.
