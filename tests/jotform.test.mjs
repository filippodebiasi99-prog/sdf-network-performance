import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

process.env.JOTFORM_MODE = "live";
process.env.COLLECTION_MODE = "jotform";
process.env.JOTFORM_FORM_ID = "FORM-123";
process.env.JOTFORM_API_KEY = "test-api-key";
process.env.JOTFORM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.DEALER_LINK_SECRET = "test-link-secret";
process.env.APP_PUBLIC_URL = "https://portal.example.test";
process.env.SDF_DB_PATH = `/tmp/sdf-jotform-test-${process.pid}.sqlite`;

const { createAppServer,initializeDatabase } = await import(`../server.mjs?jotform-tests=${Date.now()}`);
const { buildEmbedUrl,mapSubmissionToKpis } = await import("../integrations/jotform/index.js");
const { getJotformConfig } = await import("../integrations/jotform/config.js");
const { createDealerLinkToken,hashDealerToken,restoreDealerLinkToken } = await import("../integrations/jotform/link-tokens.js");

const database = new DatabaseSync(":memory:");
initializeDatabase(database);
const server = createAppServer(database);
let baseUrl;
const nativeFetch = globalThis.fetch;
const mockedSubmissions = new Map();
let listResponse = [];

function tokenFor(dealerId,campaignId="campaign-2026-1") {
  const row = database.prepare("SELECT * FROM dealer_campaign_links WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaignId);
  return { row,token:restoreDealerLinkToken("test-link-secret",row.id,row.token_nonce) };
}

function submissionFixture(id,dealerId,token,campaignId="campaign-2026-1",changes={}) {
  const answers = {
    a1:{ name:"dealerId",answer:dealerId },a2:{ name:"dealerName",answer:"Dealer Test" },a3:{ name:"campaignId",answer:campaignId },a4:{ name:"campaignName",answer:"Rilevazione 1 — 2026" },a5:{ name:"dealerToken",answer:token },a6:{ name:"periodStart",answer:"2026-06-01" },a7:{ name:"periodEnd",answer:"2026-07-31" },
    k1:{ name:"revenueTotal",answer:"5,25" },k2:{ name:"operatingMargin",answer:"18.4" },k3:{ name:"unitsSold",answer:"91" },k4:{ name:"partsRevenueShare",answer:"21" },k5:{ name:"activeCustomers",answer:"440" },k6:{ name:"quotesConversion",answer:"31" },k7:{ name:"responseHours",answer:"6.2" },k8:{ name:"customerSatisfaction",answer:"8.7" },k9:{ name:"serviceRevenueShare",answer:"14" },k10:{ name:"annualGrowth",answer:"7.5" }
  };
  return { id,form_id:"FORM-123",created_at:"2026-07-15 10:00:00",updated_at:"2026-07-15 10:00:00",answers,...changes };
}

before(async () => {
  globalThis.fetch = async (url,options) => {
    const target = String(url);
    if (target.startsWith("https://api.jotform.com/submission/")) {
      const id = target.match(/submission\/([^?]+)/)[1];
      const content = mockedSubmissions.get(decodeURIComponent(id));
      return new Response(JSON.stringify({ responseCode:content?200:404,content,message:content?"success":"not found" }),{ status:content?200:404,headers:{"content-type":"application/json"} });
    }
    if (target.startsWith("https://api.jotform.com/form/FORM-123/submissions")) return new Response(JSON.stringify({ responseCode:200,content:listResponse }),{ status:200,headers:{"content-type":"application/json"} });
    return nativeFetch(url,options);
  };
  await new Promise((resolve,reject) => { server.once("error",reject); server.listen(0,"127.0.0.1",resolve); });
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async () => { globalThis.fetch=nativeFetch; await new Promise((resolve)=>server.close(resolve)); database.close(); });

test("dealer token is long, random and stored as a hash",() => {
  const first=createDealerLinkToken("secret"); const second=createDealerLinkToken("secret");
  assert.ok(first.token.length > 60); assert.notEqual(first.token,second.token); assert.equal(hashDealerToken(first.token),first.tokenHash); assert.notEqual(first.tokenHash,first.token);
});

test("valid, unknown, revoked and expired dealer links are handled",async () => {
  const valid=tokenFor("IT-0042");
  const ok=await nativeFetch(`${baseUrl}/api/compila/${encodeURIComponent(valid.token)}`); assert.equal(ok.status,200); assert.equal((await ok.json()).dealer.id,"IT-0042");
  assert.equal((await nativeFetch(`${baseUrl}/api/compila/not-a-token`)).status,404);
  const revoked=tokenFor("IT-0104"); database.prepare("UPDATE dealer_campaign_links SET status='REVOKED' WHERE id=?").run(revoked.row.id);
  assert.equal((await nativeFetch(`${baseUrl}/api/compila/${encodeURIComponent(revoked.token)}`)).status,404);
  const expired=tokenFor("IT-0174"); database.prepare("UPDATE dealer_campaign_links SET expires_at='2020-01-01T00:00:00Z' WHERE id=?").run(expired.row.id);
  assert.equal((await nativeFetch(`${baseUrl}/api/compila/${encodeURIComponent(expired.token)}`)).status,410);
});

test("Jotform embed URL uses the central hidden-field mapping",() => {
  const config=getJotformConfig(); const url=new URL(buildEmbedUrl({ dealerId:"IT-0042",dealerName:"Fratelli Bassi",campaignId:"campaign-2026-1",campaignName:"Rilevazione",dealerToken:"opaque",periodStart:"2026-06-01",periodEnd:"2026-07-31" },config));
  assert.equal(url.hostname,"form.jotform.com"); assert.equal(url.pathname,"/FORM-123"); assert.equal(url.searchParams.get("dealerId"),"IT-0042"); assert.equal(url.searchParams.get("dealerToken"),"opaque");
});

test("KPI mapping accepts Italian decimal text",() => {
  const definitions=database.prepare("SELECT * FROM kpi_definitions").all(); const {token}=tokenFor("IT-0042");
  const mapped=mapSubmissionToKpis(submissionFixture("MAP-1","IT-0042",token),definitions,getJotformConfig());
  assert.equal(mapped.values.find((item)=>item.code==="revenue").value,5.25); assert.equal(mapped.issues.length,0);
});

test("webhook rejects a wrong secret",async () => {
  const response=await nativeFetch(`${baseUrl}/api/integrations/jotform/webhook/wrong`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({formID:"FORM-123",submissionID:"S-1"})});
  assert.equal(response.status,401);
});

test("valid webhook is idempotent and updates Overview",async () => {
  const {token}=tokenFor("IT-0042"); mockedSubmissions.set("S-1",submissionFixture("S-1","IT-0042",token));
  const send=()=>nativeFetch(`${baseUrl}/api/integrations/jotform/webhook/test-webhook-secret`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({formID:"FORM-123",submissionID:"S-1",rawRequest:JSON.stringify({})})});
  const first=await send(); assert.equal(first.status,200); assert.equal((await first.json()).duplicate,false);
  const second=await send(); assert.equal(second.status,200); assert.equal((await second.json()).duplicate,true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM jotform_submissions WHERE jotform_submission_id='S-1'").get().count,1);
  const stored=database.prepare("SELECT source_type,collection_status FROM submissions WHERE dealer_id='IT-0042' AND campaign_id='campaign-2026-1'").get(); assert.equal(stored.source_type,"JOTFORM"); assert.equal(stored.collection_status,"SUBMITTED");
  const overview=await nativeFetch(`${baseUrl}/api/overview`).then((response)=>response.json()); assert.equal(overview.totals.received,15);
});

test("webhook rejects dealer and campaign mismatches",async () => {
  const {token}=tokenFor("IT-0042");
  mockedSubmissions.set("BAD-DEALER",submissionFixture("BAD-DEALER","IT-0057",token));
  mockedSubmissions.set("BAD-CAMPAIGN",submissionFixture("BAD-CAMPAIGN","IT-0042",token,"campaign-2025-2"));
  for (const id of ["BAD-DEALER","BAD-CAMPAIGN"]) {
    const response=await nativeFetch(`${baseUrl}/api/integrations/jotform/webhook/test-webhook-secret`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({formID:"FORM-123",submissionID:id})}); assert.equal(response.status,422);
  }
});

test("manual synchronization imports missing submissions without duplicates",async () => {
  const {token}=tokenFor("IT-0153"); listResponse=[submissionFixture("SYNC-1","IT-0153",token)];
  const first=await nativeFetch(`${baseUrl}/api/integrations/jotform/sync`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then((response)=>response.json());
  assert.equal(first.imported,1); assert.equal(first.errors,0);
  const second=await nativeFetch(`${baseUrl}/api/integrations/jotform/sync`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then((response)=>response.json()); assert.equal(second.existing,1); assert.equal(database.prepare("SELECT COUNT(*) AS count FROM jotform_submissions WHERE jotform_submission_id='SYNC-1'").get().count,1);
});

test("QR code encodes the portal URL, never the Jotform URL",async () => {
  const link=await nativeFetch(`${baseUrl}/api/dealers/IT-0042/collection-link?campaignId=campaign-2026-1`).then((response)=>response.json());
  const qr=await nativeFetch(`${baseUrl}${link.qrUrl}`); assert.equal(qr.status,200); assert.match(qr.headers.get("content-type"),/svg/); assert.equal(qr.headers.get("x-qr-target"),link.url); assert.match(link.url,/portal\.example\.test\/compila\//); assert.doesNotMatch(link.url,/jotform/);
});

test("demo configuration works without Jotform credentials",() => {
  const config=getJotformConfig({ JOTFORM_MODE:"demo",APP_PUBLIC_URL:"http://127.0.0.1:4173" }); assert.equal(config.mode,"demo"); assert.equal(config.liveReady,false); assert.equal(buildEmbedUrl({dealerId:"IT-1"},config),null);
});
