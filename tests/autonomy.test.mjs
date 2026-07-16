import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { questionnaireFields } from "../config/kpi-questionnaire.js";

process.env.COLLECTION_MODE="proprietary";
process.env.DEALER_LINK_SECRET="autonomy-test-secret-long-and-random";
process.env.APP_PUBLIC_URL="http://127.0.0.1";
process.env.SDF_DB_PATH=`/tmp/sdf-autonomy-test-${process.pid}.sqlite`;
const {createAppServer,initializeDatabase}=await import(`../server.mjs?autonomy=${Date.now()}`);
const database=new DatabaseSync(":memory:");initializeDatabase(database);
const server=createAppServer(database);let baseUrl;
const call=(path,options={})=>fetch(`${baseUrl}${path}`,{...options,headers:{"content-type":"application/json","x-demo-role":"JET",...(options.headers||{})}});
const values=(offset=0)=>Object.fromEntries(questionnaireFields.map((field,index)=>[field.code,field.code==="customer_satisfaction"?8.2:field.type==="integer"?30+index+offset:2000+index*10+offset]));

before(async()=>{await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});baseUrl=`http://127.0.0.1:${server.address().port}`});
after(async()=>{await new Promise(resolve=>server.close(resolve));database.close()});

test("JET completes the normal operational workflow without scripts, seed or deploy",async()=>{
  let response=await call("/api/dealers",{method:"POST",body:JSON.stringify({id:"AUTO-001",name:"Autonomia Agricola Demo",region:"Lombardia",area:"Nord Ovest",manager:"Giulia Ferri Demo",contact_name:"Referente Demo",email:"prima@demo.sdf.invalid"})});
  assert.equal(response.status,201);assert.equal((await response.json()).id,"AUTO-001");

  response=await call("/api/dealers/AUTO-001",{method:"PUT",body:JSON.stringify({id:"AUTO-001",name:"Autonomia Agricola Demo",region:"Lombardia",area:"Nord Ovest",manager:"Giulia Ferri Demo",contact_name:"Referente Demo",email:"aggiornata@demo.sdf.invalid"})});
  assert.equal(response.status,200);assert.equal(database.prepare("SELECT email FROM dealers WHERE id='AUTO-001'").get().email,"aggiornata@demo.sdf.invalid");

  response=await call("/api/campaigns",{method:"POST",body:JSON.stringify({id:"autonomy-2027-1",name:"Rilevazione autonomia — 2027",year:2027,survey_no:1,open_date:"2027-01-01",close_date:"2027-12-31",dealerIds:["AUTO-001"],parent_campaign_id:"campaign-2026-1"})});
  assert.equal(response.status,201);
  const originalLinkId=database.prepare("SELECT id FROM dealer_campaign_links WHERE dealer_id='AUTO-001' AND campaign_id='autonomy-2027-1'").get().id;
  response=await call("/api/campaigns/autonomy-2027-1/dealers",{method:"PUT",body:JSON.stringify({dealerIds:["AUTO-001"]})});assert.equal(response.status,200);
  assert.equal(database.prepare("SELECT id FROM dealer_campaign_links WHERE dealer_id='AUTO-001' AND campaign_id='autonomy-2027-1'").get().id,originalLinkId);
  response=await call("/api/campaigns/autonomy-2027-1/status",{method:"POST",body:JSON.stringify({status:"open"})});assert.equal(response.status,200);

  const link=await call("/api/dealers/AUTO-001/collection-link?campaignId=autonomy-2027-1").then(result=>result.json());assert.match(link.url,/\/compila\//);assert.ok(link.qrUrl);
  const token=new URL(link.url).pathname.split("/").pop();
  response=await call(`/api/compila/${token}`);assert.equal(response.status,200);
  response=await call(`/api/compila/${token}/draft`,{method:"PUT",body:JSON.stringify({values:{revenue_total:"1.234,50",units_sold:40}})});assert.equal(response.status,200);assert.equal((await response.json()).submission.collection_status,"DRAFT");
  response=await call(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values:values()})});assert.equal(response.status,200);
  const submissionId=database.prepare("SELECT id FROM submissions WHERE dealer_id='AUTO-001' AND campaign_id='autonomy-2027-1'").get().id;

  response=await call("/api/dealers/AUTO-001/submission/status",{method:"POST",body:JSON.stringify({campaignId:"autonomy-2027-1",status:"REOPENED"})});assert.equal(response.status,200);
  response=await call(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values:values(5)})});assert.equal(response.status,200);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM submissions WHERE dealer_id='AUTO-001' AND campaign_id='autonomy-2027-1'").get().count,1);
  assert.equal(database.prepare("SELECT id FROM submissions WHERE dealer_id='AUTO-001' AND campaign_id='autonomy-2027-1'").get().id,submissionId);
  response=await call("/api/dealers/AUTO-001/submission/status",{method:"POST",body:JSON.stringify({campaignId:"autonomy-2027-1",status:"VALIDATED"})});assert.equal(response.status,200);

  const csv=await call("/api/reports/csv?campaignId=autonomy-2027-1").then(result=>result.text());assert.match(csv,/AUTO-001/);assert.match(csv,/Autonomia Agricola Demo/);
  response=await call("/api/campaigns/autonomy-2027-1/status",{method:"POST",body:JSON.stringify({status:"closed"})});assert.equal(response.status,200);
  response=await call("/api/campaigns/autonomy-2027-1/status",{method:"POST",body:JSON.stringify({status:"archived"})});assert.equal(response.status,200);assert.ok(database.prepare("SELECT archived_at FROM campaigns WHERE id='autonomy-2027-1'").get().archived_at);
});

test("CSV preview and communication preparation expose issues and never claim delivery",async()=>{
  const preview=await call("/api/dealers/import/preview",{method:"POST",body:JSON.stringify({dealers:[{dealer_id:"CSV-001",name:"CSV Demo",region:"Veneto",area:"Nord Est",manager:"Manager Demo",email:""},{dealer_id:"CSV-001",name:"Duplicato Demo",region:"Veneto",area:"Nord Est",manager:"Manager Demo",email:""}]})}).then(result=>result.json());
  assert.ok(preview.errors>=1);assert.ok(preview.warnings>=2);
  const distribution=await call("/api/campaigns/campaign-2026-1/distribution").then(result=>result.json());assert.equal(distribution.providerConfigured,false);assert.equal(distribution.recipients.length,65);
  const prepared=await call("/api/campaigns/campaign-2026-1/distribution",{method:"POST",body:JSON.stringify({dealerIds:["DEMO-003"],reminderText:"Promemoria demo",signature:"Team JET",type:"reminder"})}).then(result=>result.json());
  assert.equal(prepared.sent,false);assert.equal(prepared.prepared,1);assert.match(prepared.message,/nessuna email/i);
});

test("SDF cannot use any new write operation",async()=>{
  const sdf={"x-demo-role":"SDF"};
  for(const [path,method,body] of [["/api/dealers","POST",{}],["/api/dealers/DEMO-001","PUT",{name:"No"}],["/api/campaigns","POST",{}],["/api/campaigns/campaign-2026-1/distribution","POST",{}]]){
    const response=await call(path,{method,headers:sdf,body:JSON.stringify(body)});assert.equal(response.status,403,path);
  }
});
