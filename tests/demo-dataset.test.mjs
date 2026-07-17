import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { demoDatasetSummary,resetDemoDataset } from "../demo/demo-dataset.js";

process.env.SDF_DB_PATH=`/tmp/sdf-demo-dataset-test-${process.pid}.sqlite`;
const {initializeDatabase}=await import(`../server.mjs?demo-dataset=${Date.now()}`);

const database=new DatabaseSync(":memory:");
before(()=>initializeDatabase(database));
after(()=>database.close());

test("dataset demo contains the exact network and status distribution",()=>{
  const summary=demoDatasetSummary(database);
  assert.deepEqual(summary,{dealers:64,states:{DRAFT:6,NEEDS_REVIEW:4,SUBMITTED:12,VALIDATED:32,NOT_STARTED:10},received:48,missing:16,completion:75,historical:15});
  const dimensions=database.prepare("SELECT COUNT(DISTINCT name) names,COUNT(DISTINCT region) regions,COUNT(DISTINCT area) areas,COUNT(DISTINCT manager) managers FROM dealers").get();
  assert.deepEqual({...dimensions},{names:64,regions:8,areas:4,managers:5});
  assert.equal(database.prepare("SELECT COUNT(*) count FROM (SELECT dealer_id,campaign_id,COUNT(*) n FROM submissions GROUP BY dealer_id,campaign_id HAVING n>1)").get().count,0);
});

test("curated dealers have complete, draft and missing database records",()=>{
  const rows=database.prepare(`SELECT d.id,d.name,COALESCE(s.collection_status,'NOT_STARTED') status,s.updated_at,s.submitted_at,(SELECT COUNT(*) FROM kpi_values v WHERE v.submission_id=s.id) values_count FROM dealers d LEFT JOIN submissions s ON s.dealer_id=d.id AND s.campaign_id='campaign-2026-1' WHERE d.id IN ('DEMO-001','DEMO-002','DEMO-003','DEMO-004') ORDER BY d.id`).all();
  assert.deepEqual(rows.map(({id,name,status})=>({id,name,status})),[
    {id:"DEMO-001",name:"AgriNord Demo",status:"VALIDATED"},{id:"DEMO-002",name:"TerraMotori Demo",status:"SUBMITTED"},
    {id:"DEMO-003",name:"CampoTech Demo",status:"DRAFT"},{id:"DEMO-004",name:"Meccanica Verde Demo",status:"NOT_STARTED"}
  ]);
  assert.equal(rows[0].values_count,15); assert.equal(rows[1].values_count,15);
  assert.ok(rows[2].values_count>=11 && rows[2].values_count<15); assert.ok(rows[2].updated_at); assert.equal(rows[2].submitted_at,null);
  assert.equal(rows[3].values_count,0);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM notes WHERE dealer_id='DEMO-001'").get().count>=2);
});

test("KPI values are finite and operational relationships are credible",()=>{
  const submissions=database.prepare("SELECT id,dealer_id FROM submissions WHERE campaign_id='campaign-2026-1' AND collection_status IN ('VALIDATED','SUBMITTED','NEEDS_REVIEW')").all();
  for(const submission of submissions){
    const values=Object.fromEntries(database.prepare("SELECT k.code,v.value FROM kpi_values v JOIN kpi_definitions k ON k.id=v.kpi_id WHERE v.submission_id=?").all(submission.id).map(row=>[row.code,row.value]));
    assert.ok(Object.values(values).every(Number.isFinite));
    assert.ok(values.sdf_parts_revenue_total<=values.parts_revenue_total);
    assert.ok(values.external_parts_revenue_total<=values.parts_revenue_total);
    assert.ok(values.technician_presence_hours>0 && values.workshop_worked_hours_total>0);
    if(submission.dealer_id!=="DEMO-047"){
      assert.ok(values.external_sdf_parts_revenue_total<=values.external_parts_revenue_total);
      assert.ok(values.customer_sold_hours_total<=values.workshop_worked_hours_total*1.2);
    }
  }
  const anomalous=database.prepare("SELECT validation_issues_json FROM submissions WHERE dealer_id='DEMO-047' AND campaign_id='campaign-2026-1'").get();
  assert.ok(JSON.parse(anomalous.validation_issues_json).length>=2);
});

test("AgriNord has compatible historical KPI values and positive movement",()=>{
  const values=database.prepare(`SELECT c.year,k.code,v.value FROM kpi_values v JOIN submissions s ON s.id=v.submission_id JOIN campaigns c ON c.id=s.campaign_id JOIN kpi_definitions k ON k.id=v.kpi_id WHERE s.dealer_id='DEMO-001' AND k.code='company_revenue_total' ORDER BY c.year`).all();
  assert.equal(values.length,2); assert.equal(values[0].year,2025); assert.equal(values[1].year,2026); assert.ok(values[1].value>values[0].value);
  const versions=database.prepare("SELECT COUNT(DISTINCT questionnaire_version) count FROM submissions WHERE dealer_id='DEMO-001'").get(); assert.equal(versions.count,1);
});

test("demo reset is idempotent for business data",()=>{
  const snapshot=()=>JSON.stringify(database.prepare(`SELECT d.id,d.name,s.campaign_id,s.collection_status,k.code,v.value FROM dealers d LEFT JOIN submissions s ON s.dealer_id=d.id LEFT JOIN kpi_values v ON v.submission_id=s.id LEFT JOIN kpi_definitions k ON k.id=v.kpi_id WHERE k.active=1 OR k.id IS NULL ORDER BY d.id,s.campaign_id,k.code`).all());
  resetDemoDataset(database); initializeDatabase(database); const first=snapshot();
  resetDemoDataset(database); initializeDatabase(database); const second=snapshot();
  assert.equal(first,second); assert.equal(database.prepare("SELECT COUNT(*) count FROM dealer_campaign_links").get().count,128);
});

test("demo notice is present in dashboard and dealer collection",async()=>{
  const html=(await import("node:fs")).readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const js=(await import("node:fs")).readFileSync(new URL("../portal.js",import.meta.url),"utf8");
  const notice="Ambiente dimostrativo — tutti i dati visualizzati sono fittizi";
  assert.match(html,new RegExp(notice)); assert.match(js,new RegExp(notice));
});
