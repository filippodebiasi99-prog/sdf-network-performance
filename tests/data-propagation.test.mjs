import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

process.env.COLLECTION_MODE="proprietary";
process.env.DEALER_LINK_SECRET="propagation-test-secret";
process.env.APP_PUBLIC_URL="http://127.0.0.1";
process.env.SDF_DB_PATH=`/tmp/sdf-propagation-test-${process.pid}.sqlite`;

const {createAppServer,initializeDatabase}=await import(`../server.mjs?propagation=${Date.now()}`);
const {questionnaireFields}=await import("../config/kpi-questionnaire.js");
const database=new DatabaseSync(":memory:");
initializeDatabase(database);
const server=createAppServer(database);
let baseUrl;

const call=(path,options={})=>fetch(`${baseUrl}${path}`,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});
const json=(path,options)=>call(path,options).then(async response=>({response,payload:await response.json()}));
const tokenFor=async(dealerId)=>new URL((await json(`/api/dealers/${dealerId}/collection-link?campaignId=campaign-2026-1`)).payload.url).pathname.split("/").pop();
const inputValues=(submissionId)=>Object.fromEntries(database.prepare(`SELECT k.code,v.value FROM kpi_values v JOIN kpi_definitions k ON k.id=v.kpi_id WHERE v.submission_id=? AND k.active=1 AND k.derived=0`).all(submissionId).map(row=>[row.code,row.value]));
const submissionFor=(dealerId)=>database.prepare("SELECT * FROM submissions WHERE dealer_id=? AND campaign_id='campaign-2026-1'").get(dealerId);
const completeValues=()=>({
  company_revenue_total:5_000_000,
  parts_revenue_total:1_200_000,
  sdf_parts_revenue_total:780_000,
  parts_average_cost:95,
  sdf_parts_average_cost:88,
  external_parts_revenue_total:650_000,
  external_sdf_parts_revenue_total:420_000,
  inventory_end_value:400_000,
  urgent_parts_orders_pct:"12,5",
  inventory_turnover:"3,4",
  workshop_labor_rate:65,
  field_labor_rate:82,
  technician_presence_hours:12_000,
  workshop_worked_hours_total:9_000,
  customer_sold_hours_total:8_500
});

before(async()=>{await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});baseUrl=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));database.close();});

test("scenario A: autosave draft persists explicit KPI changes and stays outside benchmarks",async()=>{
  const token=await tokenFor("DEMO-003");
  const beforeSubmission=submissionFor("DEMO-003");
  const values=inputValues(beforeSubmission.id);
  const beforeAnalysis=(await json("/api/analysis?kpiId=company_revenue_total")).payload;
  assert.ok(Object.keys(values).length<questionnaireFields.length);
  assert.equal(beforeAnalysis.stats.count,48);
  const beforeRevenue=values.company_revenue_total;
  values.company_revenue_total=beforeRevenue+123_456.78;
  values.inventory_turnover=4.25;
  const saved=await json(`/api/compila/${token}/draft`,{method:"PUT",body:JSON.stringify({values})});
  assert.equal(saved.response.status,200);
  assert.equal(saved.payload.submission.collection_status,"DRAFT");
  const reloaded=(await json(`/api/compila/${token}`)).payload;
  assert.equal(reloaded.values.company_revenue_total.value,beforeRevenue+123_456.78);
  assert.equal(reloaded.values.inventory_turnover.value,4.25);
  assert.equal(reloaded.submission.collection_status,"DRAFT");
  assert.equal(database.prepare("SELECT quality_score FROM submissions WHERE id=?").get(beforeSubmission.id).quality_score,Math.round(Object.keys(values).length/questionnaireFields.length*100));
  const afterAnalysis=(await json("/api/analysis?kpiId=company_revenue_total")).payload;
  assert.equal(afterAnalysis.stats.count,48);
  assert.equal(afterAnalysis.stats.average,beforeAnalysis.stats.average);
});

test("scenario B: final submit updates Overview, Analysis, detail, CSV and audit",async()=>{
  const token=await tokenFor("DEMO-003");
  const beforeOverview=(await json("/api/overview")).payload;
  const beforeAnalysis=(await json("/api/analysis?kpiId=company_revenue_total")).payload;
  assert.deepEqual({received:beforeOverview.totals.received,completion:beforeOverview.totals.completion,count:beforeAnalysis.stats.count},{received:48,completion:75,count:48});
  const values=completeValues();
  const submitted=await json(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values})});
  assert.equal(submitted.response.status,200);
  assert.equal(submitted.payload.submission.collection_status,"SUBMITTED");
  const afterOverview=(await json("/api/overview")).payload;
  const afterAnalysis=(await json("/api/analysis?kpiId=company_revenue_total")).payload;
  assert.deepEqual({received:afterOverview.totals.received,completion:afterOverview.totals.completion,count:afterAnalysis.stats.count},{received:49,completion:77,count:49});
  assert.equal(afterAnalysis.stats.average,(beforeAnalysis.stats.average*beforeAnalysis.stats.count+values.company_revenue_total)/49);
  const detail=(await json("/api/dealers/DEMO-003")).payload;
  assert.equal(detail.submission.collection_status,"SUBMITTED");
  assert.equal(detail.values.find(item=>item.code==="company_revenue_total").value,values.company_revenue_total);
  assert.equal(detail.values.find(item=>item.code==="inventory_turnover").value,3.4);
  const report=await call("/api/reports/csv?campaignId=campaign-2026-1");
  const csv=await report.text();
  assert.equal(report.status,200);
  assert.match(csv,/DEMO-003,CampoTech Demo/);
  assert.match(csv,/,5000000,/);
  const audit=database.prepare("SELECT payload FROM audit_events WHERE dealer_id='DEMO-003' AND event_type='proprietary_submission_received' ORDER BY id DESC LIMIT 1").get();
  assert.equal(JSON.parse(audit.payload).changes.find(item=>item.code==="company_revenue_total").next,values.company_revenue_total);
});

test("scenario C: JET edit updates every database-backed aggregate without invented derived KPIs",async()=>{
  const submission=submissionFor("DEMO-001");
  const values=inputValues(submission.id);
  const beforeRevenue=values.company_revenue_total;
  const beforeAnalysis=(await json("/api/analysis?kpiId=company_revenue_total")).payload;
  const beforeDetail=(await json("/api/dealers/DEMO-001")).payload;
  values.company_revenue_total=beforeRevenue+250_000;
  values.inventory_turnover+=.25;
  const updated=await json("/api/dealers/DEMO-001/submission/values",{method:"PUT",headers:{"x-demo-role":"JET"},body:JSON.stringify({campaignId:"campaign-2026-1",values})});
  assert.equal(updated.response.status,200);
  assert.equal(updated.payload.status,"NEEDS_REVIEW");
  assert.deepEqual(updated.payload.changes.find(item=>item.code==="company_revenue_total"),{code:"company_revenue_total",previous:beforeRevenue,next:beforeRevenue+250_000});
  const afterDetail=(await json("/api/dealers/DEMO-001")).payload;
  const currentRevenue=afterDetail.values.find(item=>item.code==="company_revenue_total");
  assert.equal(currentRevenue.value,beforeRevenue+250_000);
  assert.equal(currentRevenue.previous_value,beforeDetail.values.find(item=>item.code==="company_revenue_total").previous_value);
  assert.equal(afterDetail.values.length,questionnaireFields.length);
  assert.ok(afterDetail.values.every(item=>item.derived===0));
  const afterAnalysis=(await json("/api/analysis?kpiId=company_revenue_total")).payload;
  assert.ok(Math.abs(afterAnalysis.stats.average-(beforeAnalysis.stats.average+250_000/beforeAnalysis.stats.count))<1e-9);
  const persisted=database.prepare(`SELECT MIN(v.value) min,MAX(v.value) max,AVG(v.value) average,COUNT(*) count FROM kpi_values v JOIN submissions s ON s.id=v.submission_id JOIN kpi_definitions k ON k.id=v.kpi_id WHERE s.campaign_id='campaign-2026-1' AND s.status IN ('submitted','verify') AND k.code='company_revenue_total'`).get();
  assert.deepEqual({min:afterAnalysis.stats.min,max:afterAnalysis.stats.max,average:afterAnalysis.stats.average,count:afterAnalysis.stats.count},{...persisted});
  const audit=database.prepare("SELECT payload FROM audit_events WHERE event_type='submission_values_updated' AND dealer_id='DEMO-001' ORDER BY id DESC LIMIT 1").get();
  assert.deepEqual(JSON.parse(audit.payload).changes.find(item=>item.code==="company_revenue_total"),{code:"company_revenue_total",previous:beforeRevenue,next:beforeRevenue+250_000});
});

test("scenario D: reopen and resubmit updates the same record and preserves audit",async()=>{
  const before=submissionFor("DEMO-002");
  const submissionCount=database.prepare("SELECT COUNT(*) count FROM submissions WHERE dealer_id='DEMO-002' AND campaign_id='campaign-2026-1'").get().count;
  const reopened=await json("/api/dealers/DEMO-002/submission/status",{method:"POST",headers:{"x-demo-role":"JET"},body:JSON.stringify({campaignId:"campaign-2026-1",status:"REOPENED"})});
  assert.equal(reopened.response.status,200);
  const token=await tokenFor("DEMO-002");
  const values=inputValues(before.id);
  const previousParts=values.parts_revenue_total;
  values.parts_revenue_total+=10_000;
  const autosaved=await json(`/api/compila/${token}/draft`,{method:"PUT",body:JSON.stringify({values})});
  assert.equal(autosaved.payload.submission.collection_status,"REOPENED");
  const resubmitted=await json(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values})});
  assert.equal(resubmitted.response.status,200);
  assert.equal(resubmitted.payload.submission.collection_status,"SUBMITTED");
  const after=submissionFor("DEMO-002");
  assert.equal(after.id,before.id);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM submissions WHERE dealer_id='DEMO-002' AND campaign_id='campaign-2026-1'").get().count,submissionCount);
  assert.equal(inputValues(after.id).parts_revenue_total,previousParts+10_000);
  assert.ok(database.prepare("SELECT 1 FROM audit_events WHERE dealer_id='DEMO-002' AND event_type='submission_reopened'").get());
  const audit=database.prepare("SELECT payload FROM audit_events WHERE dealer_id='DEMO-002' AND event_type='proprietary_submission_resubmitted' ORDER BY id DESC LIMIT 1").get();
  assert.equal(JSON.parse(audit.payload).changes.find(item=>item.code==="parts_revenue_total").previous,previousParts);
});

test("JET edit validates Italian decimals and rejects SDF writes",async()=>{
  const submission=submissionFor("DEMO-003");
  const values=inputValues(submission.id);
  values.inventory_turnover="4,7";
  const denied=await json("/api/dealers/DEMO-003/submission/values",{method:"PUT",headers:{"x-demo-role":"SDF"},body:JSON.stringify({campaignId:"campaign-2026-1",values})});
  assert.equal(denied.response.status,403);
  const allowed=await json("/api/dealers/DEMO-003/submission/values",{method:"PUT",headers:{"x-demo-role":"JET"},body:JSON.stringify({campaignId:"campaign-2026-1",values})});
  assert.equal(allowed.response.status,200);
  assert.equal(inputValues(submission.id).inventory_turnover,4.7);
});

test("the client questionnaire has exactly fifteen inputs and no derived rows",()=>{
  assert.equal(questionnaireFields.length,15);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM kpi_definitions WHERE active=1 AND derived=1").get().count,0);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM kpi_values WHERE value!=value OR value>1e308 OR value< -1e308").get().count,0);
});
