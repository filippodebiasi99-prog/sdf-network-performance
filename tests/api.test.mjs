import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createAppServer, initializeDatabase } from "../server.mjs";

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
  assert.deepEqual(overview.totals, { dealers:18, received:14, completed:11, missing:4, verify:3, completion:78 });
  assert.ok(overview.timeline.length > 0);
});

test("frontend assets are served with the correct content types", async () => {
  const assets = [
    ["/styles.css?v=6","text/css"],
    ["/app.js?v=2","text/javascript"],
    ["/portal.js?v=2","text/javascript"]
  ];
  for (const [asset,contentType] of assets) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status,200);
    assert.match(response.headers.get("content-type"),new RegExp(contentType));
    assert.ok((await response.text()).length > 1000);
  }
});

test("dealer filters and details return stored values", async () => {
  const result = await fetch(`${baseUrl}/api/dealers?region=Veneto&status=missing`).then((response) => response.json());
  assert.equal(result.dealers.length, 2);
  assert.ok(result.dealers.every((dealer) => dealer.region === "Veneto" && dealer.status === "missing"));
  const detail = await fetch(`${baseUrl}/api/dealers/IT-0018`).then((response) => response.json());
  assert.equal(detail.dealer.name, "AgriVerde S.r.l.");
  assert.equal(detail.dealer.access_token, undefined);
  assert.equal(detail.values.length, 10);
  assert.ok(detail.surveyUrl.includes("page=survey"));
});

test("dealer can save a draft and submit all KPI values", async () => {
  const token = database.prepare("SELECT access_token FROM dealers WHERE id='IT-0042'").get().access_token;
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
  assert.equal(overview.totals.received, 15);
  assert.equal(overview.totals.missing, 3);
});

test("final submission rejects missing required KPI values", async () => {
  const token = database.prepare("SELECT access_token FROM dealers WHERE id='IT-0104'").get().access_token;
  const response = await fetch(`${baseUrl}/api/survey/${token}/submit`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({values:{}}) });
  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(Object.keys(payload.details).length, 10);
});

test("CSV export contains dealer and KPI columns", async () => {
  const response = await fetch(`${baseUrl}/api/reports/csv`);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  const csv = await response.text();
  assert.match(csv, /Dealer ID,Concessionario/);
  assert.match(csv, /AgriVerde S\.r\.l\./);
  assert.match(csv, /Fatturato/);
});

test("JET can import or update the dealer registry", async () => {
  const response = await fetch(`${baseUrl}/api/dealers/import`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({ dealers:[{ dealer_id:"IT-0999",name:"Dealer Importato S.r.l.",region:"Lombardia",area:"Nord Ovest",manager:"Marco Riva",email:"import@example.com" }] })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  const result = await fetch(`${baseUrl}/api/dealers?search=IT-0999`).then((item) => item.json());
  assert.equal(result.dealers[0].name, "Dealer Importato S.r.l.");
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
  assert.equal(payload.count, 4);
  const dealers = await fetch(`${baseUrl}/api/dealers`).then((item) => item.json());
  const statusById = new Map(dealers.dealers.map((dealer) => [dealer.id,dealer.status]));
  assert.ok(payload.recipients.every((dealer) => ["missing","draft"].includes(statusById.get(dealer.id))));
  const event = database.prepare("SELECT event_type FROM audit_events WHERE event_type='reminders_prepared' ORDER BY id DESC").get();
  assert.equal(event.event_type, "reminders_prepared");
});
