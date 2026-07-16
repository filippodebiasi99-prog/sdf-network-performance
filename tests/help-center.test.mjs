import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const portal=readFileSync(new URL("../portal.js",import.meta.url),"utf8");
const styles=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const helpSource=portal.match(/const helpGuides=\[(.*?)\n  \];\n\n  function normalizeSearch/s)?.[1] || "";

test("Centro assistenza is reachable from navigation, mobile routing and the top bar",()=>{
  assert.match(html,/data-page="help"[^>]*>.*Centro assistenza/s);
  assert.match(html,/id="help-center-button"/);
  assert.match(portal,/page === "help"\) main\.innerHTML = helpCenterPage/);
  assert.match(portal,/help:"Centro assistenza"/);
  assert.match(portal,/\["overview","dealers","analysis","surveys","reports","help"\]/);
});

test("help content documents current UI operations and excludes technical or legacy flows",()=>{
  for(const expected of ["Creare un concessionario","Importare l’anagrafica CSV","Creare e aprire una rilevazione","Gestire link e QR Code","Preparare comunicazioni e reminder","Modificare, riaprire e validare una compilazione","Analizzare KPI ed esportare i dati","Consultare il portale in sola lettura"]) assert.match(helpSource,new RegExp(expected));
  assert.doesNotMatch(helpSource,/Jotform|npm\s|Render|seed|deploy|\/api\//i);
  assert.match(helpSource,/nessuna email viene inviata/i);
  assert.equal((helpSource.match(/\{id:"/g)||[]).length,13);
});

test("help search, categories and responsive layout are implemented",()=>{
  assert.match(portal,/data-help-search-text/);
  assert.match(portal,/applyHelpFilters/);
  assert.match(portal,/data-help-category-filter/);
  assert.match(portal,/type:"help"/);
  assert.match(styles,/\.help-layout \{ display:grid;/);
  assert.match(styles,/@media \(max-width:640px\)[\s\S]*\.help-sidebar nav \{ width:max-content; display:flex;/);
});
