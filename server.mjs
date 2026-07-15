import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = join(ROOT, "data");
const DB_PATH = process.env.SDF_DB_PATH || join(DATA_DIR, "sdf-kpi.sqlite");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");

if (process.argv.includes("--reset") && existsSync(DB_PATH)) rmSync(DB_PATH);
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

export function initializeDatabase(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS dealers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      region TEXT NOT NULL,
      area TEXT NOT NULL,
      manager TEXT NOT NULL,
      email TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      access_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year INTEGER NOT NULL,
      survey_no INTEGER NOT NULL,
      open_date TEXT NOT NULL,
      close_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','open','closed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS kpi_definitions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('currency','percentage','integer','decimal','score','hours')),
      required INTEGER NOT NULL DEFAULT 1,
      min_value REAL,
      max_value REAL,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_id TEXT NOT NULL REFERENCES dealers(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      status TEXT NOT NULL CHECK(status IN ('draft','submitted','verify')),
      quality_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TEXT,
      UNIQUE(dealer_id, campaign_id)
    );
    CREATE TABLE IF NOT EXISTS kpi_values (
      submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      kpi_id TEXT NOT NULL REFERENCES kpi_definitions(id),
      value REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(submission_id, kpi_id)
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_id TEXT NOT NULL REFERENCES dealers(id),
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_id TEXT REFERENCES dealers(id),
      campaign_id TEXT REFERENCES campaigns(id),
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_campaign ON submissions(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_values_kpi ON kpi_values(kpi_id, value);
    CREATE INDEX IF NOT EXISTS idx_dealers_region ON dealers(region);
  `);
  seedDatabase(database);
}

const seedDealers = [
  ["IT-0018","AgriVerde S.r.l.","AV","Lombardia","Nord Ovest","Marco Riva",4.82,18.6,74,"submitted"],
  ["IT-0021","Meccanica Rurale S.p.A.","MR","Veneto","Nord Est","Elena Costa",5.34,17.2,81,"submitted"],
  ["IT-0034","Terra e Motori S.r.l.","TM","Emilia-Romagna","Centro Nord","Paolo Serra",3.91,14.8,66,"verify"],
  ["IT-0042","Fratelli Bassi Macchine","FB","Piemonte","Nord Ovest","Marco Riva",4.12,16.3,69,"missing"],
  ["IT-0057","Agroservice Veneto","AV","Veneto","Nord Est","Elena Costa",4.67,19.1,77,"submitted"],
  ["IT-0063","Emilia Trattori S.r.l.","ET","Emilia-Romagna","Centro Nord","Paolo Serra",5.08,16.9,79,"submitted"],
  ["IT-0075","NordAgri Commerciale","NA","Lombardia","Nord Ovest","Marco Riva",3.56,13.4,54,"verify"],
  ["IT-0082","Pianura Macchine Agricole","PM","Piemonte","Nord Ovest","Marco Riva",4.39,17.7,71,"submitted"],
  ["IT-0091","Adriatica Agrimec","AA","Emilia-Romagna","Centro Nord","Paolo Serra",4.18,15.9,65,"submitted"],
  ["IT-0104","Verona Campo S.r.l.","VC","Veneto","Nord Est","Elena Costa",3.88,15.2,62,"missing"],
  ["IT-0112","Lario Agri Systems","LA","Lombardia","Nord Ovest","Marco Riva",5.61,20.2,86,"submitted"],
  ["IT-0129","Monferrato Tractors","MT","Piemonte","Nord Ovest","Marco Riva",4.45,18.1,73,"submitted"],
  ["IT-0137","Rovigo Macchine","RM","Veneto","Nord Est","Elena Costa",3.71,14.1,59,"verify"],
  ["IT-0148","Bologna Agri Pro","BA","Emilia-Romagna","Centro Nord","Paolo Serra",4.92,17.4,76,"submitted"],
  ["IT-0153","Bergamo Rural Tech","BR","Lombardia","Nord Ovest","Marco Riva",3.62,15.7,57,"missing"],
  ["IT-0166","Cuneo Terra Service","CT","Piemonte","Nord Ovest","Marco Riva",4.26,16.8,68,"submitted"],
  ["IT-0174","Padova Agri Network","PA","Veneto","Nord Est","Elena Costa",3.94,15.5,64,"missing"],
  ["IT-0188","Romagna Campo","RC","Emilia-Romagna","Centro Nord","Paolo Serra",4.01,16.1,63,"submitted"]
];

const seedKpis = [
  ["kpi-revenue","revenue","Fatturato","Fatturato annuale del concessionario","M€","currency",1,0,100,1],
  ["kpi-margin","margin","Marginalità","Margine operativo sul fatturato","%","percentage",1,0,100,2],
  ["kpi-machines","machines","Macchine vendute","Numero di macchine nuove vendute","unità","integer",1,0,10000,3],
  ["kpi-parts","parts_share","Quota ricambi","Incidenza ricambi sul fatturato","%","percentage",1,0,100,4],
  ["kpi-customers","active_customers","Clienti attivi","Clienti con attività negli ultimi 12 mesi","clienti","integer",1,0,100000,5],
  ["kpi-conversion","quote_conversion","Conversione preventivi","Preventivi convertiti in vendita","%","percentage",1,0,100,6],
  ["kpi-response","response_hours","Tempo medio risposta","Tempo medio di prima risposta","ore","hours",1,0,720,7],
  ["kpi-satisfaction","customer_satisfaction","Soddisfazione cliente","Valutazione media clienti","/10","score",1,0,10,8],
  ["kpi-service","service_incidence","Incidenza assistenza","Incidenza ricavi assistenza","%","percentage",1,0,100,9],
  ["kpi-growth","annual_growth","Crescita annuale","Variazione fatturato anno su anno","%","percentage",1,-100,500,10]
];

function seedDatabase(database) {
  const campaignCount = database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count;
  if (campaignCount) return;
  database.exec("BEGIN");
  try {
    const insertCampaign = database.prepare("INSERT INTO campaigns(id,name,year,survey_no,open_date,close_date,status) VALUES(?,?,?,?,?,?,?)");
    insertCampaign.run("campaign-2026-1","Rilevazione 1 — 2026",2026,1,"2026-06-01","2026-07-31","open");
    insertCampaign.run("campaign-2025-2","Rilevazione 2 — 2025",2025,2,"2025-09-01","2025-10-15","closed");

    const insertKpi = database.prepare("INSERT INTO kpi_definitions(id,code,name,description,unit,kind,required,min_value,max_value,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)");
    seedKpis.forEach((kpi) => insertKpi.run(...kpi));

    const insertDealer = database.prepare("INSERT INTO dealers(id,name,initials,region,area,manager,email,access_token) VALUES(?,?,?,?,?,?,?,?)");
    const insertSubmission = database.prepare("INSERT INTO submissions(dealer_id,campaign_id,status,quality_score,updated_at,submitted_at) VALUES(?,?,?,?,?,?)");
    const insertValue = database.prepare("INSERT INTO kpi_values(submission_id,kpi_id,value) VALUES(?,?,?)");
    const currentDate = new Date("2026-07-14T12:00:00Z");

    seedDealers.forEach((dealer, index) => {
      const [id,name,initials,region,area,manager,revenue,margin,machines,status] = dealer;
      insertDealer.run(id,name,initials,region,area,manager,`${id.toLowerCase()}@dealer.example`,randomBytes(18).toString("hex"));
      const values = [revenue,margin,machines,18 + (index % 7),300 + index * 9,27 + (index % 8),6.4 + (index % 5) * .7,7.8 + (index % 8) * .15,12 + (index % 6),-2 + index * 1.1];
      if (status !== "missing") {
        const updated = new Date(currentDate.getTime() - index * 86400000).toISOString();
        const submission = insertSubmission.run(id,"campaign-2026-1",status,status === "verify" ? 72 : 94,updated,updated);
        seedKpis.forEach((kpi,kpiIndex) => insertValue.run(submission.lastInsertRowid,kpi[0],values[kpiIndex]));
      }
      const previous = insertSubmission.run(id,"campaign-2025-2","submitted",91,"2025-10-10T12:00:00Z","2025-10-10T12:00:00Z");
      seedKpis.forEach((kpi,kpiIndex) => insertValue.run(previous.lastInsertRowid,kpi[0],Number((values[kpiIndex] * (kpiIndex === 6 ? 1.08 : .93)).toFixed(2))));
    });
    database.prepare("INSERT INTO notes(dealer_id,author,body,created_at) VALUES(?,?,?,?)").run("IT-0018","Luca Bianchi","Verificata coerenza dei dati di vendita.","2026-07-14T15:20:00Z");
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run("IT-0018","campaign-2026-1","seeded","system","{}");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(Object.assign(new Error("Payload troppo grande"), { status: 413 }));
    });
    request.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(Object.assign(new Error("JSON non valido"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function selectedCampaign(database, requestedId) {
  return requestedId
    ? database.prepare("SELECT * FROM campaigns WHERE id = ?").get(requestedId)
    : database.prepare("SELECT * FROM campaigns WHERE status = 'open' ORDER BY year DESC, survey_no DESC LIMIT 1").get();
}

function dealerRows(database, campaignId, filters = {}) {
  const params = [campaignId];
  const clauses = ["d.active = 1"];
  if (filters.search) { clauses.push("(LOWER(d.name) LIKE ? OR LOWER(d.id) LIKE ?)"); params.push(`%${filters.search.toLowerCase()}%`,`%${filters.search.toLowerCase()}%`); }
  if (filters.region) { clauses.push("d.region = ?"); params.push(filters.region); }
  if (filters.status === "missing") clauses.push("s.id IS NULL");
  if (filters.status === "submitted") clauses.push("s.status = 'submitted'");
  if (filters.status === "verify") clauses.push("s.status = 'verify'");
  return database.prepare(`
    SELECT d.id,d.name,d.initials,d.region,d.area,d.manager,d.email,
      COALESCE(s.status,'missing') AS status, COALESCE(s.quality_score,0) AS quality,
      s.updated_at,s.submitted_at,
      CASE WHEN s.id IS NULL THEN 0 ELSE ROUND(100.0 * (SELECT COUNT(*) FROM kpi_values kv WHERE kv.submission_id=s.id) / (SELECT COUNT(*) FROM kpi_definitions WHERE required=1)) END AS completion
    FROM dealers d LEFT JOIN submissions s ON s.dealer_id=d.id AND s.campaign_id=?
    WHERE ${clauses.join(" AND ")} ORDER BY d.name
  `).all(...params);
}

function overviewPayload(database, campaignId) {
  const campaign = selectedCampaign(database, campaignId);
  if (!campaign) throw Object.assign(new Error("Campagna non trovata"), { status: 404 });
  const rows = dealerRows(database, campaign.id);
  const completed = rows.filter((row) => row.status === "submitted").length;
  const verify = rows.filter((row) => row.status === "verify").length;
  const received = completed + verify;
  const areas = [...new Set(rows.map((row) => row.area))].map((area) => {
    const scoped = rows.filter((row) => row.area === area);
    return { area, total: scoped.length, completed: scoped.filter((row) => row.status === "submitted").length, verify: scoped.filter((row) => row.status === "verify").length, missing: scoped.filter((row) => row.status === "missing").length };
  });
  const daily = database.prepare("SELECT substr(updated_at,1,10) AS day, COUNT(*) AS count FROM submissions WHERE campaign_id=? AND status IN ('submitted','verify') GROUP BY substr(updated_at,1,10) ORDER BY day").all(campaign.id);
  let cumulative = 0;
  const timeline = daily.map((item) => ({ day:item.day, value:(cumulative += item.count) }));
  return {
    campaign,
    totals: { dealers: rows.length, received, completed, missing: rows.length - received, verify, completion: rows.length ? Math.round(received / rows.length * 100) : 0 },
    areas, timeline,
    recent: rows.filter((row) => row.updated_at).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,4),
    alerts: rows.filter((row) => row.status !== "submitted").slice(0,5)
  };
}

function dealerDetail(database, dealerId, campaignId) {
  const campaign = selectedCampaign(database, campaignId);
  const dealerRecord = database.prepare("SELECT id,name,initials,region,area,manager,email,access_token FROM dealers WHERE id=?").get(dealerId);
  if (!dealerRecord || !campaign) throw Object.assign(new Error("Concessionario o campagna non trovati"), { status: 404 });
  const { access_token:accessToken, ...dealer } = dealerRecord;
  const submission = database.prepare("SELECT * FROM submissions WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaign.id);
  const values = database.prepare(`
    SELECT k.id,k.code,k.name,k.description,k.unit,k.kind,k.required,k.min_value,k.max_value,k.sort_order,
      v.value,
      (SELECT AVG(v2.value) FROM kpi_values v2 JOIN submissions s2 ON s2.id=v2.submission_id WHERE v2.kpi_id=k.id AND s2.campaign_id=? AND s2.status IN ('submitted','verify')) AS network_avg,
      (SELECT vp.value FROM kpi_values vp JOIN submissions sp ON sp.id=vp.submission_id WHERE vp.kpi_id=k.id AND sp.dealer_id=? AND sp.campaign_id='campaign-2025-2') AS previous_value
    FROM kpi_definitions k LEFT JOIN kpi_values v ON v.kpi_id=k.id AND v.submission_id=? ORDER BY k.sort_order
  `).all(campaign.id,dealerId,submission?.id ?? -1);
  const notes = database.prepare("SELECT id,author,body,created_at FROM notes WHERE dealer_id=? ORDER BY created_at DESC").all(dealerId);
  return { campaign, dealer, submission: submission || { status:"missing", quality_score:0, updated_at:null, submitted_at:null }, values, notes, surveyUrl:`/?page=survey&token=${accessToken}` };
}

function analysisPayload(database, campaignId, kpiId) {
  const campaign = selectedCampaign(database, campaignId);
  const kpi = kpiId
    ? database.prepare("SELECT * FROM kpi_definitions WHERE id=? OR code=?").get(kpiId,kpiId)
    : database.prepare("SELECT * FROM kpi_definitions ORDER BY sort_order LIMIT 1").get();
  if (!campaign || !kpi) throw Object.assign(new Error("Campagna o KPI non trovati"), { status: 404 });
  const rows = database.prepare(`SELECT d.id,d.name,d.region,d.area,d.manager,v.value FROM kpi_values v JOIN submissions s ON s.id=v.submission_id JOIN dealers d ON d.id=s.dealer_id WHERE s.campaign_id=? AND v.kpi_id=? AND s.status IN ('submitted','verify') ORDER BY v.value DESC`).all(campaign.id,kpi.id);
  const sorted = rows.map((row) => row.value).sort((a,b) => a-b);
  const average = sorted.length ? sorted.reduce((sum,value) => sum + value,0) / sorted.length : 0;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2) : 0;
  const regions = [...new Set(rows.map((row) => row.region))].map((region) => {
    const values = rows.filter((row) => row.region === region).map((row) => row.value);
    return { region, count: values.length, average: values.reduce((sum,value) => sum + value,0) / values.length };
  }).sort((a,b) => b.average-a.average);
  return { campaign, kpi, stats:{ average, median, min:sorted[0] ?? 0, max:sorted.at(-1) ?? 0, count:sorted.length }, regions, ranking:rows.slice(0,10) };
}

function surveyPayload(database, token) {
  const dealer = database.prepare("SELECT id,name,initials,region,area,manager FROM dealers WHERE access_token=? AND active=1").get(token);
  const campaign = selectedCampaign(database);
  if (!dealer || !campaign) throw Object.assign(new Error("Link di compilazione non valido"), { status: 404 });
  const submission = database.prepare("SELECT * FROM submissions WHERE dealer_id=? AND campaign_id=?").get(dealer.id,campaign.id);
  const stored = submission ? Object.fromEntries(database.prepare("SELECT kpi_id,value,note FROM kpi_values WHERE submission_id=?").all(submission.id).map((item) => [item.kpi_id,{ value:item.value,note:item.note }])) : {};
  const kpis = database.prepare("SELECT * FROM kpi_definitions ORDER BY sort_order").all();
  return { dealer, campaign, submission:submission || { status:"missing",updated_at:null,submitted_at:null }, kpis, values:stored };
}

function validateSurvey(kpis, inputValues, finalSubmit) {
  const normalized = [];
  const errors = {};
  for (const kpi of kpis) {
    const raw = inputValues?.[kpi.id];
    if ((raw === "" || raw === null || raw === undefined) && finalSubmit && kpi.required) { errors[kpi.id] = "Campo obbligatorio"; continue; }
    if (raw === "" || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) { errors[kpi.id] = "Inserire un numero valido"; continue; }
    if (kpi.min_value !== null && value < kpi.min_value) errors[kpi.id] = `Valore minimo: ${kpi.min_value}`;
    else if (kpi.max_value !== null && value > kpi.max_value) errors[kpi.id] = `Valore massimo: ${kpi.max_value}`;
    else normalized.push({ kpiId:kpi.id,value,note:"" });
  }
  return { normalized, errors };
}

function saveSurvey(database, token, inputValues, finalSubmit) {
  const payload = surveyPayload(database, token);
  if (payload.campaign.status !== "open") throw Object.assign(new Error("La campagna non è aperta"), { status: 409 });
  const { normalized, errors } = validateSurvey(payload.kpis,inputValues,finalSubmit);
  if (Object.keys(errors).length) throw Object.assign(new Error("Alcuni dati non sono validi"), { status: 422, details:errors });
  database.exec("BEGIN");
  try {
    database.prepare(`INSERT INTO submissions(dealer_id,campaign_id,status,quality_score,updated_at,submitted_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(dealer_id,campaign_id) DO UPDATE SET status=excluded.status,quality_score=excluded.quality_score,updated_at=CURRENT_TIMESTAMP,submitted_at=excluded.submitted_at`).run(payload.dealer.id,payload.campaign.id,finalSubmit?"submitted":"draft",finalSubmit?100:Math.round(normalized.length/payload.kpis.length*100),finalSubmit?new Date().toISOString():null);
    const submission = database.prepare("SELECT id FROM submissions WHERE dealer_id=? AND campaign_id=?").get(payload.dealer.id,payload.campaign.id);
    database.prepare("DELETE FROM kpi_values WHERE submission_id=?").run(submission.id);
    const insert = database.prepare("INSERT INTO kpi_values(submission_id,kpi_id,value,note) VALUES(?,?,?,?)");
    normalized.forEach((item) => insert.run(submission.id,item.kpiId,item.value,item.note));
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(payload.dealer.id,payload.campaign.id,finalSubmit?"submitted":"draft_saved",payload.dealer.id,JSON.stringify({ fields:normalized.length }));
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return surveyPayload(database, token);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

function exportCsv(database, campaignId) {
  const campaign = selectedCampaign(database,campaignId);
  const kpis = database.prepare("SELECT id,name FROM kpi_definitions ORDER BY sort_order").all();
  const rows = dealerRows(database,campaign.id);
  const header = ["Dealer ID","Concessionario","Regione","Area","Area manager","Stato","Qualità dati",...kpis.map((kpi) => kpi.name)];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    const submission = database.prepare("SELECT id FROM submissions WHERE dealer_id=? AND campaign_id=?").get(row.id,campaign.id);
    const valueMap = submission ? new Map(database.prepare("SELECT kpi_id,value FROM kpi_values WHERE submission_id=?").all(submission.id).map((item) => [item.kpi_id,item.value])) : new Map();
    lines.push([row.id,row.name,row.region,row.area,row.manager,row.status,row.quality,...kpis.map((kpi) => valueMap.get(kpi.id) ?? "")].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export async function handleApi(request, response, url, database = db) {
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/health") return json(response,200,{ status:"ok",database:"sqlite",time:new Date().toISOString() });
  if (request.method === "GET" && path === "/api/config") return json(response,200,{ campaigns:database.prepare("SELECT * FROM campaigns ORDER BY year DESC,survey_no DESC").all(),kpis:database.prepare("SELECT * FROM kpi_definitions ORDER BY sort_order").all() });
  if (request.method === "GET" && path === "/api/overview") return json(response,200,overviewPayload(database,url.searchParams.get("campaignId")));
  if (request.method === "GET" && path === "/api/dealers") return json(response,200,{ campaign:selectedCampaign(database,url.searchParams.get("campaignId")),dealers:dealerRows(database,url.searchParams.get("campaignId") || selectedCampaign(database).id,{ search:url.searchParams.get("search"),region:url.searchParams.get("region"),status:url.searchParams.get("status") }) });
  if (request.method === "GET" && path === "/api/analysis") return json(response,200,analysisPayload(database,url.searchParams.get("campaignId"),url.searchParams.get("kpiId")));
  if (request.method === "GET" && path === "/api/campaigns") {
    const campaigns = database.prepare("SELECT * FROM campaigns ORDER BY year DESC,survey_no DESC").all().map((campaign) => ({ ...campaign, progress:overviewPayload(database,campaign.id).totals }));
    return json(response,200,{ campaigns });
  }
  if (request.method === "POST" && path === "/api/reminders/prepare") {
    const body = await parseBody(request);
    const campaign = selectedCampaign(database,body.campaignId);
    if (!campaign) throw Object.assign(new Error("Campagna non trovata"),{ status:404 });
    const recipients = dealerRows(database,campaign.id).filter((dealer) => ["missing","draft"].includes(dealer.status)).map((dealer) => ({ id:dealer.id,name:dealer.name,email:dealer.email }));
    database.prepare("INSERT INTO audit_events(campaign_id,event_type,actor,payload) VALUES(?,?,?,?)").run(campaign.id,"reminders_prepared","JET Admin",JSON.stringify({ recipients:recipients.map((item) => item.id) }));
    return json(response,200,{ count:recipients.length,recipients });
  }
  if (request.method === "GET" && path === "/api/reports/csv") {
    const csv = exportCsv(database,url.searchParams.get("campaignId"));
    response.writeHead(200,{ "content-type":"text/csv; charset=utf-8", "content-disposition":"attachment; filename=sdf-kpi-export.csv" });
    return response.end(`\ufeff${csv}`);
  }
  if (request.method === "GET" && path === "/api/dealers/template.csv") {
    const template = "dealer_id,name,region,area,manager,email\nIT-0001,Concessionario Demo,Lombardia,Nord Ovest,Marco Riva,referente@example.com\n";
    response.writeHead(200,{ "content-type":"text/csv; charset=utf-8", "content-disposition":"attachment; filename=template-concessionari.csv" });
    return response.end(`\ufeff${template}`);
  }
  if (request.method === "POST" && path === "/api/dealers/import") {
    const body = await parseBody(request);
    if (!Array.isArray(body.dealers) || !body.dealers.length || body.dealers.length > 500) throw Object.assign(new Error("Il file deve contenere da 1 a 500 concessionari"),{ status:422 });
    const upsert = database.prepare(`INSERT INTO dealers(id,name,initials,region,area,manager,email,access_token) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,initials=excluded.initials,region=excluded.region,area=excluded.area,manager=excluded.manager,email=excluded.email,active=1`);
    database.exec("BEGIN");
    try {
      body.dealers.forEach((item,index) => {
        const id = String(item.dealer_id || item.id || "").trim();
        const name = String(item.name || "").trim();
        const region = String(item.region || "").trim();
        const area = String(item.area || "").trim();
        const manager = String(item.manager || "").trim();
        if (!id || !name || !region || !area || !manager) throw Object.assign(new Error(`Riga ${index+2}: campi obbligatori mancanti`),{ status:422 });
        const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]).join("").toUpperCase();
        upsert.run(id,name,initials,region,area,manager,String(item.email || "").trim(),randomBytes(18).toString("hex"));
      });
      database.prepare("INSERT INTO audit_events(event_type,actor,payload) VALUES(?,?,?)").run("dealers_imported","JET Admin",JSON.stringify({ count:body.dealers.length }));
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    return json(response,200,{ ok:true,count:body.dealers.length });
  }
  const dealerMatch = path.match(/^\/api\/dealers\/([^/]+)$/);
  if (request.method === "GET" && dealerMatch) return json(response,200,dealerDetail(database,decodeURIComponent(dealerMatch[1]),url.searchParams.get("campaignId")));
  const noteMatch = path.match(/^\/api\/dealers\/([^/]+)\/notes$/);
  if (request.method === "POST" && noteMatch) {
    const body = await parseBody(request);
    if (!String(body.body || "").trim()) throw Object.assign(new Error("La nota non può essere vuota"),{ status:422 });
    database.prepare("INSERT INTO notes(dealer_id,author,body) VALUES(?,?,?)").run(decodeURIComponent(noteMatch[1]),String(body.author || "JET Admin"),String(body.body).trim());
    return json(response,201,{ ok:true });
  }
  const surveyMatch = path.match(/^\/api\/survey\/([^/]+)(?:\/(draft|submit))?$/);
  if (surveyMatch && request.method === "GET" && !surveyMatch[2]) return json(response,200,surveyPayload(database,surveyMatch[1]));
  if (surveyMatch && ["PUT","POST"].includes(request.method) && surveyMatch[2]) {
    const body = await parseBody(request);
    return json(response,200,saveSurvey(database,surveyMatch[1],body.values,surveyMatch[2] === "submit"));
  }
  return json(response,404,{ error:"Endpoint non trovato" });
}

const contentTypes = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".md":"text/markdown; charset=utf-8" };

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(ROOT,safePath);
  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) return json(response,404,{ error:"File non trovato" });
  response.writeHead(200,{ "content-type":contentTypes[extname(filePath)] || "application/octet-stream", "cache-control":"no-cache" });
  createReadStream(filePath).pipe(response);
}

initializeDatabase();

export function createAppServer(database = db) {
  return createServer(async (request,response) => {
    const url = new URL(request.url,`http://${request.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(request,response,url,database);
      else serveStatic(response,url.pathname);
    } catch (error) {
      json(response,error.status || 500,{ error:error.message || "Errore interno",details:error.details || undefined });
    }
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createAppServer();
  server.listen(PORT,HOST,() => console.log(`SDF KPI Portal: http://${HOST}:${PORT}`));
}
