import { randomBytes } from "node:crypto";
import { QUESTIONNAIRE_VERSION, calculateDerivedKpis, questionnaireFields, questionnaireWarnings } from "../config/kpi-questionnaire.js";

export const DEMO_CAMPAIGN_ID = "campaign-2026-1";
export const DEMO_HISTORY_CAMPAIGN_ID = "campaign-2025-2";

const names = [
  "AgriNord Demo","TerraMotori Demo","CampoTech Demo","Meccanica Verde Demo",
  "Pianura Trattori Demo","Borgo Agricolo Demo","TerraNova Macchine Demo","Officina dei Campi Demo",
  "AgriLinea Demo","Motori di Pianura Demo","VerdeMeccanica Demo","CampoFuturo Demo",
  "Rete Rurale Demo","AgriProgresso Demo","TerraService Demo","Macchine del Borgo Demo",
  "AgriOrizzonte Demo","CampoMotori Demo","TerraTecnica Demo","Officina Verde Demo",
  "AgriSistema Demo","Motori Agricoli Demo","Pianura Service Demo","CampoMeccanica Demo",
  "TerraDinamo Demo","AgriCentro Demo","RuralTech Demo","Macchine Verdi Demo",
  "AgriPunto Demo","CampoLinea Demo","TerraImpresa Demo","Officina Rurale Demo",
  "AgriSoluzioni Demo","Motori del Campo Demo","PianuraTech Demo","TerraOfficina Demo",
  "AgriValore Demo","CampoService Demo","Rete Macchine Demo","Verde Trattori Demo",
  "AgriSviluppo Demo","TerraPartner Demo","Motori Rurali Demo","CampoSistema Demo",
  "AgriForma Demo","Pianura Motori Demo","TerraPerformance Demo","Officina Agricola Demo",
  "AgriPercorso Demo","CampoPro Demo","Rural Service Demo","Macchine di Terra Demo",
  "AgriQuota Demo","TerraLinea Demo","Motori Verdi Demo","CampoRete Demo",
  "AgriDirezione Demo","Pianura Meccanica Demo","TerraValore Demo","Officina Futuro Demo",
  "AgriDimensione Demo","CampoImpresa Demo","Rural Motori Demo","Macchine Orizzonte Demo"
];

const territories = [
  ["Lombardia","Nord Ovest"],["Piemonte","Nord Ovest"],
  ["Veneto","Nord Est"],["Emilia-Romagna","Nord Est"],
  ["Toscana","Centro"],["Lazio","Centro"],
  ["Puglia","Sud e Isole"],["Sicilia","Sud e Isole"]
];

const managers = ["Giulia Ferri Demo","Matteo Riva Demo","Elena Costa Demo","Paolo Serra Demo","Chiara Conti Demo"];
const historicalDealerIds = new Set(["DEMO-001","DEMO-002",...Array.from({ length:13 },(_,index)=>`DEMO-${String(index+5).padStart(3,"0")}`)]);

function randomFor(seed) {
  let value=2166136261;
  for(const character of seed) value=Math.imul(value ^ character.charCodeAt(0),16777619) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next=value;
    next=Math.imul(next ^ next >>> 15,next | 1);
    next^=next + Math.imul(next ^ next >>> 7,next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

const round=(value,decimals=0)=>decimals >= 0 ? Number(value.toFixed(decimals)) : Math.round(value/(10 ** -decimals))*(10 ** -decimals);

function collectionStatus(index) {
  if (index === 1 || (index >= 5 && index <= 35)) return "VALIDATED";
  if (index === 2 || (index >= 36 && index <= 46)) return "SUBMITTED";
  if (index >= 47 && index <= 50) return "NEEDS_REVIEW";
  if (index === 3 || (index >= 51 && index <= 55)) return "DRAFT";
  return "NOT_STARTED";
}

function makeInputs(index,area) {
  const random=randomFor(`sdf-client-v1:${index}`);
  const size=.82 + (index % 5) * .17;
  const areaFactor={"Nord Ovest":1.06,"Nord Est":1.03,"Centro":.98,"Sud e Isole":.91}[area];
  const performance=index === 1 ? 1.18 : index === 2 ? 1 : .9 + random() * .2;
  const revenue=round(3_650_000 * size * areaFactor * performance,-3);
  const partsRevenue=round(revenue * (.15 + random() * .045),-2);
  const sdfPartsRevenue=round(partsRevenue * (.52 + random() * .22),-2);
  const externalPartsRevenue=round(partsRevenue * (.48 + random() * .18),-2);
  const presenceHours=round(9_800 * size,1);
  const workedHours=round(presenceHours * (.74 + random() * .12),1);
  const anomalous=index === 47;
  const values={
    company_revenue_total:revenue,
    parts_revenue_total:partsRevenue,
    sdf_parts_revenue_total:sdfPartsRevenue,
    parts_average_cost:round(78 + random() * 35,2),
    sdf_parts_average_cost:round(72 + random() * 31,2),
    external_parts_revenue_total:externalPartsRevenue,
    external_sdf_parts_revenue_total:round(externalPartsRevenue * (anomalous ? 1.08 : .5 + random() * .22),-2),
    inventory_end_value:round(partsRevenue * (.28 + random() * .14),-2),
    urgent_parts_orders_pct:round(7 + random() * 15,1),
    inventory_turnover:round(2.2 + random() * 3.1,2),
    workshop_labor_rate:round(58 + random() * 18,2),
    field_labor_rate:round(72 + random() * 24,2),
    technician_presence_hours:presenceHours,
    workshop_worked_hours_total:workedHours,
    customer_sold_hours_total:round(workedHours * (anomalous ? 1.26 : .82 + random() * .15),1)
  };
  return values;
}

function previousInputs(current,index) {
  const random=randomFor(`sdf-demo-history:${index}`);
  const factor=index === 1 ? .91 : .93 + random() * .11;
  const presence=round(current.technician_presence_hours * (.97 + random() * .03),1);
  const worked=round(Math.min(presence,current.workshop_worked_hours_total * factor),1);
  return {
    ...current,
    company_revenue_total:round(current.company_revenue_total*factor,-2),
    parts_revenue_total:round(current.parts_revenue_total*factor,-2),
    sdf_parts_revenue_total:round(current.sdf_parts_revenue_total*factor,-2),
    external_parts_revenue_total:round(current.external_parts_revenue_total*factor,-2),
    external_sdf_parts_revenue_total:round(current.external_sdf_parts_revenue_total*factor,-2),
    inventory_end_value:round(current.inventory_end_value*(.94+random()*.1),-2),
    urgent_parts_orders_pct:round(Math.max(0,current.urgent_parts_orders_pct+random()*2-1),1),
    inventory_turnover:round(Math.max(0,current.inventory_turnover*(.94+random()*.08)),2),
    workshop_labor_rate:round(current.workshop_labor_rate*(.97+random()*.02),2),
    field_labor_rate:round(current.field_labor_rate*(.97+random()*.02),2),
    technician_presence_hours:presence,
    workshop_worked_hours_total:worked,
    customer_sold_hours_total:round(worked*.88,1)
  };
}

function valuesForStatus(inputs,status,index) {
  if (status !== "DRAFT") return inputs;
  const counts={3:12,51:11,52:12,53:13,54:12,55:11};
  return Object.fromEntries(questionnaireFields.slice(0,counts[index] || 12).map((field)=>[field.code,inputs[field.code]]));
}

function legacyStatus(status) {
  if (["SUBMITTED","VALIDATED"].includes(status)) return "submitted";
  if (status === "NEEDS_REVIEW") return "verify";
  return "draft";
}

function timestamp(index,status) {
  if (status === "NOT_STARTED") return null;
  const day=14-Math.floor((index-1)/5);
  const hour=9+(index%8);
  return `2026-07-${String(Math.max(1,day)).padStart(2,"0")}T${String(hour).padStart(2,"0")}:20:00.000Z`;
}

function insertValues(database,submissionId,inputs) {
  const insert=database.prepare("INSERT INTO kpi_values(submission_id,kpi_id,value,note,source_type) VALUES(?,?,?,?,?)");
  const values={...inputs,...calculateDerivedKpis(inputs)};
  for (const [code,value] of Object.entries(values)) {
    if (!Number.isFinite(value)) continue;
    const definition=database.prepare("SELECT id FROM kpi_definitions WHERE code=? AND active=1").get(code);
    if (definition) insert.run(submissionId,definition.id,value,"","DEMO_SEED");
  }
}

function assertDemoOnly(database) {
  const nonDemo=database.prepare("SELECT COUNT(*) AS count FROM dealers WHERE email NOT LIKE '%@dealer.example' AND email NOT LIKE '%@demo.sdf.invalid'").get().count;
  const nonDemoCampaigns=database.prepare("SELECT COUNT(*) AS count FROM campaigns WHERE id NOT IN (?,?)").get(DEMO_CAMPAIGN_ID,DEMO_HISTORY_CAMPAIGN_ID).count;
  if (nonDemo || nonDemoCampaigns) throw new Error("Reset interrotto: il database contiene dati non marcati come demo");
}

export function resetDemoDataset(database) {
  assertDemoOnly(database);
  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM jotform_submissions; DELETE FROM kpi_values; DELETE FROM submissions; DELETE FROM dealer_campaign_links; DELETE FROM campaign_dealers; DELETE FROM notes; DELETE FROM audit_events; DELETE FROM dealers; DELETE FROM campaigns;");
    database.prepare("INSERT INTO campaigns(id,name,year,survey_no,open_date,close_date,status) VALUES(?,?,?,?,?,?,?)").run(DEMO_CAMPAIGN_ID,"Rilevazione 1 — 2026",2026,1,"2026-01-01","2026-12-31","open");
    database.prepare("INSERT INTO campaigns(id,name,year,survey_no,open_date,close_date,status) VALUES(?,?,?,?,?,?,?)").run(DEMO_HISTORY_CAMPAIGN_ID,"Rilevazione 2 — 2025",2025,2,"2025-01-01","2025-12-31","closed");
    const insertDealer=database.prepare("INSERT INTO dealers(id,name,initials,region,area,manager,email,access_token) VALUES(?,?,?,?,?,?,?,?)");
    const insertSubmission=database.prepare(`INSERT INTO submissions(dealer_id,campaign_id,status,quality_score,updated_at,submitted_at,source_type,collection_status,questionnaire_version,validation_issues_json,reviewed_at,reviewed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (let index=1;index<=64;index+=1) {
      const id=`DEMO-${String(index).padStart(3,"0")}`;
      const name=names[index-1];
      const [region,area]=territories[(index-1)%territories.length];
      const initials=name.split(" ").filter((word)=>word!=="Demo").map((word)=>word[0]).join("").slice(0,2).toUpperCase();
      const accessToken=randomBytes(32).toString("hex");
      insertDealer.run(id,name,initials,region,area,managers[(index-1)%managers.length],`${id.toLowerCase()}@demo.sdf.invalid`,accessToken);
      const status=collectionStatus(index);
      const inputs=makeInputs(index,area);
      if (status !== "NOT_STARTED") {
        const savedAt=timestamp(index,status);
        const warnings=status === "NEEDS_REVIEW" ? questionnaireWarnings(inputs) : [];
        const submittedAt=status === "DRAFT" ? null : savedAt;
        const quality=status === "VALIDATED" ? 100 : status === "SUBMITTED" ? 96 : status === "NEEDS_REVIEW" ? 72 : Math.round(Object.keys(valuesForStatus(inputs,status,index)).length/questionnaireFields.length*100);
        const result=insertSubmission.run(id,DEMO_CAMPAIGN_ID,legacyStatus(status),quality,savedAt,submittedAt,"DEMO_SEED",status,QUESTIONNAIRE_VERSION,JSON.stringify(warnings),status === "VALIDATED" ? savedAt : null,status === "VALIDATED" ? "Team JET Demo" : null);
        insertValues(database,result.lastInsertRowid,valuesForStatus(inputs,status,index));
      }
      if (historicalDealerIds.has(id)) {
        const previous=previousInputs(inputs,index);
        const result=insertSubmission.run(id,DEMO_HISTORY_CAMPAIGN_ID,"submitted",98,"2025-12-12T10:00:00.000Z","2025-12-12T10:00:00.000Z","DEMO_SEED","VALIDATED",QUESTIONNAIRE_VERSION,"[]","2025-12-15T09:00:00.000Z","Team JET Demo");
        insertValues(database,result.lastInsertRowid,previous);
      }
    }
    database.prepare("INSERT INTO notes(dealer_id,author,body,created_at) VALUES(?,?,?,?)").run("DEMO-001","Team JET Demo","Dati verificati: andamento commerciale sopra la media e valori coerenti con la rilevazione precedente.","2026-07-14T15:20:00.000Z");
    database.prepare("INSERT INTO notes(dealer_id,author,body,created_at) VALUES(?,?,?,?)").run("DEMO-001","Team JET Demo","Confermata la coerenza tra unità totali, nuove e usate.","2026-07-13T10:10:00.000Z");
    database.prepare("INSERT INTO notes(dealer_id,author,body,created_at) VALUES(?,?,?,?)").run("DEMO-047","Team JET Demo","Verificare il rapporto tra preventivi, ordini e ore fatturate prima della validazione.","2026-07-12T11:30:00.000Z");
    database.prepare("INSERT INTO audit_events(campaign_id,event_type,actor,payload,created_at) VALUES(?,?,?,?,?)").run(DEMO_CAMPAIGN_ID,"demo_dataset_reset","system",JSON.stringify({version:"demo-dataset-v1",dealers:64}),"2026-07-15T08:00:00.000Z");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return demoDatasetSummary(database);
}

export function seedDemoDataset(database) {
  if (database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count) return null;
  return resetDemoDataset(database);
}

export function demoDatasetSummary(database) {
  const states=Object.fromEntries(database.prepare("SELECT collection_status,COUNT(*) AS count FROM submissions WHERE campaign_id=? GROUP BY collection_status").all(DEMO_CAMPAIGN_ID).map((row)=>[row.collection_status,row.count]));
  const dealers=database.prepare("SELECT COUNT(*) AS count FROM dealers WHERE active=1").get().count;
  const received=(states.VALIDATED||0)+(states.SUBMITTED||0)+(states.NEEDS_REVIEW||0);
  states.NOT_STARTED=dealers-Object.values(states).reduce((sum,count)=>sum+count,0);
  return {dealers,states,received,missing:dealers-received,completion:dealers?Math.round(received/dealers*100):0,historical:database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE campaign_id=?").get(DEMO_HISTORY_CAMPAIGN_ID).count};
}
