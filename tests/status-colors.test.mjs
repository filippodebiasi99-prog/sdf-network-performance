import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const portal=readFileSync(new URL("../portal.js",import.meta.url),"utf8");
const styles=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const overrides=readFileSync(new URL("../design-overrides.css",import.meta.url),"utf8");

test("collection states use one semantic class mapping everywhere",()=>{
  assert.match(portal,/status === "VALIDATED"\) return "complete"/);
  assert.match(portal,/\["SUBMITTED","NEEDS_REVIEW"\]\.includes\(status\)\) return "verify"/);
  assert.match(portal,/\["DRAFT","REOPENED"\]\.includes\(status\)\) return "draft"/);
  assert.match(portal,/status-\$\{collectionStatusClass\(data\.submission\.collection_status\)\}/);
});

test("status colors stay consistent across badges, details and summaries",()=>{
  assert.match(styles,/\.badge\.complete \{ color:var\(--success\)/);
  assert.match(styles,/\.badge\.verify \{ color:var\(--warning\)/);
  assert.match(styles,/\.badge\.draft \{ color:var\(--danger\)/);
  assert.match(styles,/\.badge\.missing \{ color:#707985/);
  assert.match(overrides,/\.summary-cell\.status-complete \{ background: var\(--success\)/);
  assert.match(overrides,/\.summary-cell\.status-verify \{ background: var\(--accent\)/);
  assert.match(overrides,/\.summary-cell\.status-draft \{ background: var\(--danger\)/);
  assert.match(overrides,/\.summary-cell\.status-missing \{ background: #747572/);
});

test("closed questionnaires clearly explain read-only state and keep completed values countable",()=>{
  assert.match(portal,/locked\?"Visualizza compilazione":"Apri compilazione"/);
  assert.match(portal,/Compilazione validata · sola lettura/);
  assert.match(portal,/JET deve riaprire la compilazione dalla scheda concessionario/);
  assert.match(portal,/readonly aria-readonly="true"/);
  assert.match(portal,/Riapri per modificare/);
  assert.match(portal,/Link in sola lettura/);
  assert.match(overrides,/\.survey-readonly-notice\.status-complete/);
  assert.match(overrides,/\.input-with-unit input\[readonly\]/);
});

test("KPI extrema preserve their descriptions and identify dealers semantically",()=>{
  assert.match(portal,/Valore più basso osservato<\/small><em class="analysis-stat-dealer is-min"/);
  assert.match(portal,/Valore più alto osservato<\/small><em class="analysis-stat-dealer is-max"/);
  assert.match(overrides,/\.analysis-stat-dealer\.is-min \{ color: var\(--danger\)/);
  assert.match(overrides,/\.analysis-stat-dealer\.is-max \{ color: var\(--success\)/);
});

test("the top-five chart opens a complete accessible dealer comparison list",()=>{
  assert.match(portal,/id="open-analysis-dealers">Vedi tutti/);
  assert.match(portal,/id="analysis-dealer-dialog" class="review-dialog analysis-dealer-dialog"/);
  assert.match(portal,/dealerComparison\.map/);
  assert.match(portal,/Dato non disponibile/);
  assert.match(portal,/open-analysis-dealers"\)\?\.addEventListener\("click"/);
  assert.match(overrides,/\.analysis-dealer-full-list li/);
});

test("every truncated overview list exposes its complete dataset",()=>{
  assert.match(portal,/id="open-overview-leaders">Vedi tutti/);
  assert.match(portal,/id="open-overview-priority">Vedi tutti/);
  assert.match(portal,/id="open-overview-recent">Vedi tutti/);
  assert.match(portal,/id="overview-leaders-dialog"/);
  assert.match(portal,/id="overview-priority-dialog"/);
  assert.match(portal,/id="overview-recent-dialog"/);
  assert.match(portal,/performance\.dealerComparison\.map/);
  assert.match(portal,/alertsAll\.map/);
  assert.match(portal,/recentAll\.map/);
  assert.match(overrides,/\.overview-complete-list li/);
});

test("regional analysis stays capped at eight rows and exposes overflow",()=>{
  assert.match(portal,/const visibleRegions = data\.regions\.slice\(0,8\)/);
  assert.match(portal,/const hasMoreRegions = data\.regions\.length > visibleRegions\.length/);
  assert.match(portal,/id="open-analysis-regions">Vedi tutti/);
  assert.match(portal,/id="analysis-region-dialog"/);
  assert.match(portal,/open-analysis-regions"\)\?\.addEventListener\("click"/);
  assert.match(overrides,/\.analysis-region-full-list li/);
});

test("dealer table gives the primary action a clear label and balanced columns",()=>{
  assert.match(portal,/<span>Apri scheda<\/span>\$\{icon\("chevron"\)\}/);
  assert.match(portal,/aria-label="Apri la scheda di/);
  assert.match(overrides,/\.dealers-table th:nth-child\(1\) \{ width: 30%; \}/);
  assert.match(overrides,/\.dealers-table th:nth-child\(5\) \{ width: 18%; \}/);
  assert.match(overrides,/\.dealer-open \{ width: auto;/);
});
