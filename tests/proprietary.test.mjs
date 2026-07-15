import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

process.env.COLLECTION_MODE="proprietary";
process.env.DEALER_LINK_SECRET="proprietary-test-secret";
process.env.APP_PUBLIC_URL="http://127.0.0.1";
process.env.SDF_DB_PATH=`/tmp/sdf-proprietary-test-${process.pid}.sqlite`;
const {createAppServer,initializeDatabase}=await import(`../server.mjs?proprietary=${Date.now()}`);
const {questionnaireFields,calculateDerivedKpis,QUESTIONNAIRE_VERSION}=await import("../config/kpi-questionnaire.js");
const database=new DatabaseSync(":memory:"); initializeDatabase(database);
const server=createAppServer(database); let baseUrl; let token;

const call=(path,options={})=>fetch(`${baseUrl}${path}`,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});
const fullValues=()=>Object.fromEntries(questionnaireFields.map((field,index)=>[field.code,field.code==="customer_satisfaction"?8.4:field.type==="integer"?index+20:1000+index*10]));

before(async()=>{ await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)}); baseUrl=`http://127.0.0.1:${server.address().port}`; const link=await call("/api/dealers/DEMO-004/collection-link?campaignId=campaign-2026-1").then(r=>r.json()); token=new URL(link.url).pathname.split("/").pop(); });
after(async()=>{await new Promise(resolve=>server.close(resolve));database.close()});

test("proprietary is the default collection mode without Jotform credentials",async()=>{ const config=await call("/api/config").then(r=>r.json()); assert.equal(config.collection.mode,"proprietary"); assert.equal(config.collection.questionnaireVersion,QUESTIONNAIRE_VERSION); assert.equal(config.jotform.enabled,false); });
test("valid dealer link loads the centrally configured questionnaire",async()=>{ const response=await call(`/api/compila/${token}`); assert.equal(response.status,200); const payload=await response.json(); assert.equal(payload.mode,"proprietary"); assert.equal(payload.questionnaire.fields.length,20); assert.equal(payload.dealer.id,"DEMO-004"); });
test("draft accepts partial values and reloads them",async()=>{ const response=await call(`/api/compila/${token}/draft`,{method:"PUT",body:JSON.stringify({values:{revenue_total:"1.234,50",units_sold:12}})}); assert.equal(response.status,200); assert.equal((await response.json()).submission.collection_status,"DRAFT"); const loaded=await call(`/api/compila/${token}`).then(r=>r.json()); assert.equal(loaded.values.revenue_total.value,1234.5); });
test("negative and required values are validated server-side",async()=>{ let response=await call(`/api/compila/${token}/draft`,{method:"PUT",body:JSON.stringify({values:{revenue_total:-1}})}); assert.equal(response.status,422); response=await call(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values:{}})}); assert.equal(response.status,422); assert.equal(Object.keys((await response.json()).details).length,20); });
test("derived KPI formulas return null on zero denominators",()=>{ const result=calculateDerivedKpis({orders_acquired:4,quotes_issued:0,revenue_total:100,units_sold:0}); assert.equal(result.QUOTE_TO_ORDER_CONVERSION,undefined); assert.equal(result.REVENUE_PER_UNIT,undefined); });
test("final submission stores inputs and recalculated KPI values",async()=>{ const response=await call(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values:fullValues()})}); assert.equal(response.status,200); const payload=await response.json(); assert.ok(["SUBMITTED","NEEDS_REVIEW"].includes(payload.submission.collection_status)); const submission=database.prepare("SELECT * FROM submissions WHERE dealer_id='DEMO-004' AND campaign_id='campaign-2026-1'").get(); assert.equal(submission.questionnaire_version,QUESTIONNAIRE_VERSION); assert.equal(database.prepare("SELECT COUNT(*) n FROM kpi_values WHERE submission_id=?").get(submission.id).n,28); });
test("a dealer cannot submit twice",async()=>{ const response=await call(`/api/compila/${token}/submit`,{method:"POST",body:JSON.stringify({values:fullValues()})}); assert.equal(response.status,409); });
test("JET can reopen while SDF cannot mutate",async()=>{ let response=await call("/api/dealers/DEMO-004/submission/status",{method:"POST",body:JSON.stringify({campaignId:"campaign-2026-1",status:"REOPENED"}),headers:{"x-demo-role":"SDF"}}); assert.equal(response.status,403); response=await call("/api/dealers/DEMO-004/submission/status",{method:"POST",body:JSON.stringify({campaignId:"campaign-2026-1",status:"REOPENED"}),headers:{"x-demo-role":"JET"}}); assert.equal(response.status,200); assert.equal(database.prepare("SELECT collection_status FROM submissions WHERE dealer_id='DEMO-004' AND campaign_id='campaign-2026-1'").get().collection_status,"REOPENED"); });
test("SDF dealer detail is read-only and excludes internal data",async()=>{ const detail=await call("/api/dealers/DEMO-001",{headers:{"x-demo-role":"SDF"}}).then(r=>r.json()); assert.equal(detail.collectionLink,null); assert.deepEqual(detail.notes,[]); assert.equal(detail.jotform,null); });
test("Overview and Analysis read the proprietary submission from SQLite",async()=>{ const overview=await call("/api/overview").then(r=>r.json()); assert.ok(overview.totals.drafts+overview.totals.reopened>=1); const analysis=await call("/api/analysis?kpiId=revenue_total").then(r=>r.json()); assert.equal(analysis.kpi.code,"revenue_total"); assert.ok(analysis.stats.count>0); });
test("questionnaire frontend includes debounced autosave and 390 px rules",()=>{ const js=readFileSync(new URL("../portal.js",import.meta.url),"utf8"); const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8"); assert.match(js,/setTimeout\(\(\)=>submitSurvey\("draft",\{silent:true\}\),1800\)/); assert.match(css,/@media \(max-width:640px\)/); assert.match(css,/\.questionnaire-shell \{ grid-template-columns:1fr;/); });
