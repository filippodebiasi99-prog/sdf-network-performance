# Configurazione Jotform

## Architettura

Il portale usa un solo form Jotform per tutti i concessionari. Dealer e campagna vengono associati tramite il link opaco `/compila/:token`; i campi nascosti passati al form servono come metadati, ma il backend li confronta sempre con il token salvato. Jotform visualizza, valida, invia e conserva la submission originale. SQLite conserva la copia normalizzata usata da dashboard, KPI, report e audit.

## 1. Creare il form

Creare un form classico in Jotform con i KPI richiesti. Usare campi numerici per i valori. Non chiedere al dealer di scegliere Dealer ID, ragione sociale o campagna.

Un solo form evita duplicazione di mapping, webhook e versioni. Il portale precompila i metadati per ogni dealer/campagna.

## 2. Hidden field richiesti

Creare questi campi nascosti e assegnare i rispettivi **Unique Name**:

| Dato | Unique Name demo |
|---|---|
| Dealer ID | `dealerId` |
| Dealer name | `dealerName` |
| Campaign ID | `campaignId` |
| Campaign name | `campaignName` |
| Dealer token | `dealerToken` |
| Period start | `periodStart` |
| Period end | `periodEnd` |

Il token è il dato di correlazione principale. I valori hidden non vengono considerati affidabili senza la verifica server-side.

## 3. Individuare e mappare i field ID

Nel Form Builder aprire le proprietà del campo e annotare **Unique Name**. In alternativa usare `GET /form/{formId}/questions` dalla console API Jotform. Aggiornare esclusivamente `config/jotform-field-map.js`: nessun ID Jotform deve essere inserito in componenti frontend o route.

Il mapping demo collega 20 KPI rappresentativi del portale. I primi 10 restano obbligatori nel fallback proprietario; i successivi sono opzionali finché il questionario definitivo non sarà approvato.

## 4. Configurare l'ambiente

1. Copiare `.env.example` nei segreti dell'ambiente di hosting.
2. Impostare `JOTFORM_MODE=live`.
3. Inserire `JOTFORM_FORM_ID`, `JOTFORM_API_KEY` e un `JOTFORM_WEBHOOK_SECRET` lungo e casuale.
4. Impostare `APP_PUBLIC_URL` sul dominio HTTPS pubblico.
5. Impostare `DEALER_LINK_SECRET` con almeno 32 byte casuali e conservarlo: cambiarlo invalida la ricostruzione dei link.

La chiave API resta esclusivamente sul server.

## 5. Configurare il webhook

Nel form: **Settings → Integrations → Webhooks**. Inserire:

```text
https://DOMINIO/api/integrations/jotform/webhook/WEBHOOK_SECRET
```

Il backend verifica secret, form ID, submission recuperata via API, token, dealer e campagna. `jotform_submission_id` è univoco: i retry aggiornano il record e generano un evento audit senza duplicare dati.

## 6. Redirect e conferma

La modalità demo reindirizza dopo l'invio a `/compila/:token/conferma`.

In live, la configurazione più robusta iniziale è mostrare la Thank You Page dentro l'iframe. Se si configura un redirect esterno Jotform, usare la pagina personalizzata `/compila/:token/conferma` e verificare nel form definitivo che Jotform consenta di interpolare il token hidden nell'URL. Non viene usato CSS del portale per modificare il contenuto dell'iframe.

## 7. Testare una submission

1. Aprire un dealer in **Concessionari**.
2. Aprire il link del portale, non l'URL Jotform diretto.
3. Verificare i hidden field nella submission Jotform.
4. Inviare il form.
5. Controllare `jotform_submissions`, l'audit e lo stato del dealer.
6. Aggiornare Overview e Analisi KPI.

## 8. Modalità demo

Con `JOTFORM_MODE=demo` non servono credenziali. `/compila/:token` mostra il questionario proprietario, salva bozze e invii con sorgente `MANUAL_DEMO` e aggiorna dashboard/analisi.

## 9. Modalità live

Con tutte le variabili configurate, `/compila/:token` incorpora `https://form.jotform.com/{FORM_ID}` con i parametri precompilati. La submission viene acquisita dal webhook e verificata via API prima di essere normalizzata.

## 10. Sincronizzazione manuale

Usare **Sincronizza da Jotform** in Concessionari o Rilevazioni. L'endpoint amministrativo è:

```text
POST /api/integrations/jotform/sync
```

La funzione confronta gli ID esterni, importa i mancanti, aggiorna quelli esistenti e registra il riepilogo nell'audit. Non è configurato alcun cron in questa fase.

## Limiti

- Le bozze Jotform non sono mostrate se non sono rilevabili in modo affidabile.
- I 20 KPI mappati sono dimostrativi e seguono il modello già esistente.
- Il portale non è pronto per dati aziendali reali senza login, ruoli, SSO, database gestito, backup, privacy, email e audit completo.
