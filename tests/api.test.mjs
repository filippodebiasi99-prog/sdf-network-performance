import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

process.env.SDF_DB_PATH=`/tmp/sdf-api-test-${process.pid}.sqlite`;
const { createAppServer,initializeDatabase }=await import(`../server.mjs?api=${Date.now()}`);

const database = new DatabaseSync(":memory:");
initializeDatabase(database);
const server = createAppServer(database);
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  database.close();
});

test("health and overview are calculated from SQLite", async () => {
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.status, "ok");
  const overview = await fetch(`${baseUrl}/api/overview`).then((response) => response.json());
  assert.deepEqual(overview.totals, { dealers:64,received:48,completed:44,submitted:12,validated:32,drafts:6,reopened:0,notStarted:10,missing:16,verify:4,completion:75 });
  assert.ok(overview.timeline.length > 0);
  assert.equal(overview.performance.sample,48);
  assert.equal(overview.performance.metrics.length,5);
  assert.equal(overview.performance.leaders.length,5);
  assert.equal(overview.performance.dealerComparison.length,64);
  assert.equal(overview.performance.dealerComparison.filter((dealer)=>dealer.value !== null).length,48);
  assert.equal(overview.recent.length,4);
  assert.equal(overview.recentAll.length,48);
  assert.equal(overview.alerts.length,5);
  assert.equal(overview.alertsAll.length,20);
  assert.ok(overview.performance.leaders[0].value>=overview.performance.leaders[1].value);
  assert.deepEqual(overview.performance.metrics.map((metric) => metric.code),["company_revenue_total","sdf_parts_revenue_total","parts_revenue_total","inventory_turnover","inventory_end_value"]);
  assert.ok(overview.performance.metrics.every((metric) => Number.isFinite(metric.value)));
  const revenueAnalysis = await fetch(`${baseUrl}/api/analysis?kpiId=company_revenue_total`).then((response) => response.json());
  assert.equal(revenueAnalysis.stats.primaryAggregation,"total");
  assert.equal(revenueAnalysis.stats.primaryValue,revenueAnalysis.stats.total);
  assert.equal(revenueAnalysis.extremes.max.value,revenueAnalysis.stats.max);
  assert.equal(revenueAnalysis.extremes.min.value,revenueAnalysis.stats.min);
  assert.ok(revenueAnalysis.extremes.max.name);
  assert.ok(revenueAnalysis.extremes.min.name);
  assert.equal(revenueAnalysis.dealerComparison.length,64);
  assert.equal(revenueAnalysis.dealerComparison.filter((dealer)=>dealer.value !== null).length,48);
  assert.equal(revenueAnalysis.dealerComparison.filter((dealer)=>dealer.value === null).length,16);
  const turnoverAnalysis = await fetch(`${baseUrl}/api/analysis?kpiId=inventory_turnover`).then((response) => response.json());
  assert.equal(turnoverAnalysis.stats.primaryAggregation,"average");
  assert.equal(turnoverAnalysis.stats.primaryValue,turnoverAnalysis.stats.average);
  assert.equal(overview.performance.areas.length,4);
  const expectedLeader = database.prepare(`
    SELECT d.id
    FROM kpi_values v
    JOIN kpi_definitions k ON k.id=v.kpi_id
    JOIN submissions s ON s.id=v.submission_id
    JOIN dealers d ON d.id=s.dealer_id
    WHERE s.campaign_id='campaign-2026-1' AND s.status IN ('submitted','verify') AND k.code='parts_revenue_total'
    ORDER BY v.value DESC LIMIT 1
  `).get();
  assert.equal(overview.performance.leaders[0].id,expectedLeader.id);
});

test("frontend assets are served with the correct content types", async () => {
  const assets = [
    ["/styles.css?v=20","text/css"],
    ["/app.js?v=5","text/javascript"],
    ["/portal.js?v=5","text/javascript"],
    ["/assets/sdf-logo-primary.png","image/png"],
    ["/assets/sdf-logo-secondary.png","image/png"]
  ];
  for (const [asset,contentType] of assets) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status,200);
    assert.match(response.headers.get("content-type"),new RegExp(contentType));
    assert.ok((await response.text()).length > 1000);
  }
});

test("private project files are never served as static assets", async () => {
  for (const privatePath of ["/data/sdf-kpi.sqlite","/data/sdf-kpi.sqlite-wal","/server.mjs","/README.md"]) {
    const response = await fetch(`${baseUrl}${privatePath}`);
    assert.equal(response.status,404,privatePath);
  }
});

test("dealer filters and details return stored values", async () => {
  const result = await fetch(`${baseUrl}/api/dealers?region=Veneto&status=NOT_STARTED`).then((response) => response.json());
  assert.equal(result.dealers.length, 1);
  assert.ok(result.dealers.every((dealer) => dealer.region === "Veneto" && dealer.collection_status === "NOT_STARTED"));
  const detail = await fetch(`${baseUrl}/api/dealers/DEMO-001`).then((response) => response.json());
  assert.equal(detail.dealer.name, "AgriNord Demo");
  assert.equal(detail.dealer.access_token, undefined);
  assert.equal(detail.values.length, 15);
  assert.match(detail.surveyUrl,/\/compila\//);
  assert.equal(detail.collectionLink.status,"ACTIVE");
});

test("dealer can save a draft and submit all KPI values", async () => {
  const token = database.prepare("SELECT access_token FROM dealers WHERE id='DEMO-004'").get().access_token;
  const survey = await fetch(`${baseUrl}/api/survey/${token}`).then((response) => response.json());
  const draftValues = { [survey.kpis[0].id]: 4.4, [survey.kpis[1].id]: 17.2 };
  const draftResponse = await fetch(`${baseUrl}/api/survey/${token}/draft`, { method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({values:draftValues}) });
  assert.equal(draftResponse.status, 200);
  assert.equal((await draftResponse.json()).submission.status, "draft");

  const fullValues = Object.fromEntries(survey.kpis.map((kpi, index) => [kpi.id, kpi.kind === "score" ? 8.5 : Math.max(kpi.min_value ?? 0, Math.min(kpi.max_value ?? 100, index + 10))]));
  const submitResponse = await fetch(`${baseUrl}/api/survey/${token}/submit`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({values:fullValues}) });
  assert.equal(submitResponse.status, 200);
  assert.equal((await submitResponse.json()).submission.status, "submitted");
  const overview = await fetch(`${baseUrl}/api/overview`).then((response) => response.json());
  assert.equal(overview.totals.received, 49);
  assert.equal(overview.totals.missing, 15);
});

test("final submission rejects missing required KPI values", async () => {
  const token = database.prepare("SELECT access_token FROM dealers WHERE id='DEMO-056'").get().access_token;
  const response = await fetch(`${baseUrl}/api/survey/${token}/submit`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({values:{}}) });
  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(Object.keys(payload.details).length, 15);
});

test("CSV export contains dealer and KPI columns", async () => {
  const response = await fetch(`${baseUrl}/api/reports/csv`);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  const csv = await response.text();
  assert.match(csv, /Dealer ID,Concessionario/);
  assert.match(csv, /AgriNord Demo/);
  assert.match(csv, /Stato raccolta/);
  assert.match(csv, /Fatturato/);
});

test("JET can import or update the dealer registry", async () => {
  const response = await fetch(`${baseUrl}/api/dealers/import`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({ dealers:[{ dealer_id:"DEMO-999",name:"Dealer Importato Demo",region:"Lombardia",area:"Nord Ovest",manager:"Giulia Ferri Demo",email:"demo-999@demo.sdf.invalid" }] })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  const result = await fetch(`${baseUrl}/api/dealers?search=DEMO-999`).then((item) => item.json());
  assert.equal(result.dealers[0].name, "Dealer Importato Demo");
  assert.equal(result.dealers[0].status, "missing");
});

test("JET can prepare reminders for missing or draft submissions", async () => {
  const response = await fetch(`${baseUrl}/api/reminders/prepare`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({})
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.count, 16);
  const dealers = await fetch(`${baseUrl}/api/dealers`).then((item) => item.json());
  const statusById = new Map(dealers.dealers.map((dealer) => [dealer.id,dealer.status]));
  assert.ok(payload.recipients.every((dealer) => ["missing","draft"].includes(statusById.get(dealer.id))));
  const event = database.prepare("SELECT event_type FROM audit_events WHERE event_type='reminders_prepared' ORDER BY id DESC").get();
  assert.equal(event.event_type, "reminders_prepared");
});
