import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { getJotformConfig } from "./integrations/jotform/config.js";
import { buildEmbedUrl, fetchSubmission, parseWebhook } from "./integrations/jotform/index.js";
import { createDealerLinkToken, hashDealerToken, restoreDealerLinkToken, safeSecretEqual } from "./integrations/jotform/link-tokens.js";
import { persistJotformSubmission, syncSubmissions } from "./integrations/jotform/service.js";
import { seedDemoDataset } from "./demo/demo-dataset.js";
import {
  QUESTIONNAIRE_VERSION,
  questionnaireFields,
  questionnaireSections,
  databaseDefinitions,
  validateQuestionnaire,
  calculateDerivedKpis,
  questionnaireWarnings
} from "./config/kpi-questionnaire.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = join(ROOT, "data");
const DB_PATH = process.env.SDF_DB_PATH || join(DATA_DIR, "sdf-kpi.sqlite");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const JOTFORM = getJotformConfig();
const COLLECTION_MODE = process.env.COLLECTION_MODE === "jotform" ? "jotform" : "proprietary";
const DEMO_VIEW_SWITCHER = process.env.DEMO_VIEW_SWITCHER !== "false";
const rateBuckets = new Map();

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
      sort_order INTEGER NOT NULL,
      section TEXT,
      decimals INTEGER,
      placeholder TEXT,
      validation TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      derived INTEGER NOT NULL DEFAULT 0,
      questionnaire_version TEXT,
      formula_version TEXT,
      required_metrics TEXT
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_id TEXT NOT NULL REFERENCES dealers(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      status TEXT NOT NULL CHECK(status IN ('draft','submitted','verify')),
      quality_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TEXT,
      source_type TEXT NOT NULL DEFAULT 'MANUAL_DEMO',
      collection_status TEXT,
      external_submission_id TEXT,
      questionnaire_version TEXT,
      validation_issues_json TEXT NOT NULL DEFAULT '[]',
      reviewed_at TEXT,
      reviewed_by TEXT,
      UNIQUE(dealer_id, campaign_id)
    );
    CREATE TABLE IF NOT EXISTS kpi_values (
      submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      kpi_id TEXT NOT NULL REFERENCES kpi_definitions(id),
      value REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'MANUAL_DEMO',
      external_submission_id TEXT,
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
    CREATE TABLE IF NOT EXISTS dealer_campaign_links (
      id TEXT PRIMARY KEY,
      dealer_id TEXT NOT NULL REFERENCES dealers(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      token_hash TEXT NOT NULL UNIQUE,
      token_nonce TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')) DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      revoked_at TEXT,
      last_opened_at TEXT,
      opened_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(dealer_id,campaign_id)
    );
    CREATE TABLE IF NOT EXISTS jotform_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jotform_submission_id TEXT NOT NULL UNIQUE,
      jotform_form_id TEXT NOT NULL,
      dealer_id TEXT NOT NULL REFERENCES dealers(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      dealer_link_id TEXT NOT NULL REFERENCES dealer_campaign_links(id),
      internal_submission_id INTEGER REFERENCES submissions(id),
      status TEXT NOT NULL,
      submitted_at TEXT,
      updated_at TEXT,
      raw_payload_json TEXT NOT NULL,
      normalized_payload_json TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      last_synced_at TEXT,
      validation_status TEXT NOT NULL,
      validation_issues_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_campaign ON submissions(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_values_kpi ON kpi_values(kpi_id, value);
    CREATE INDEX IF NOT EXISTS idx_dealers_region ON dealers(region);
    CREATE INDEX IF NOT EXISTS idx_links_lookup ON dealer_campaign_links(token_hash,status);
    CREATE INDEX IF NOT EXISTS idx_jotform_campaign ON jotform_submissions(campaign_id,dealer_id);
  `);
  ensureColumn(database,"submissions","source_type","TEXT NOT NULL DEFAULT 'MANUAL_DEMO'");
  ensureColumn(database,"submissions","collection_status","TEXT");
  ensureColumn(database,"submissions","external_submission_id","TEXT");
  ensureColumn(database,"submissions","questionnaire_version","TEXT");
  ensureColumn(database,"submissions","validation_issues_json","TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(database,"submissions","reviewed_at","TEXT");
  ensureColumn(database,"submissions","reviewed_by","TEXT");
  ensureColumn(database,"kpi_values","source_type","TEXT NOT NULL DEFAULT 'MANUAL_DEMO'");
  ensureColumn(database,"kpi_values","external_submission_id","TEXT");
  ensureColumn(database,"kpi_definitions","section","TEXT");
  ensureColumn(database,"kpi_definitions","decimals","INTEGER");
  ensureColumn(database,"kpi_definitions","placeholder","TEXT");
  ensureColumn(database,"kpi_definitions","validation","TEXT");
  ensureColumn(database,"kpi_definitions","active","INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database,"kpi_definitions","derived","INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database,"kpi_definitions","questionnaire_version","TEXT");
  ensureColumn(database,"kpi_definitions","formula_version","TEXT");
  ensureColumn(database,"kpi_definitions","required_metrics","TEXT");
  ensureLegacyKpiDefinitions(database);
  ensureKpiDefinitions(database);
  seedDemoDataset(database);
  migrateLegacyKpis(database);
  ensureDemoQuestionnaireValues(database);
  ensureCampaignLinks(database);
}

function ensureColumn(database, table, column, definition) {
  if (!database.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ensureCampaignLinks(database) {
  const insert = database.prepare("INSERT OR IGNORE INTO dealer_campaign_links(id,dealer_id,campaign_id,token_hash,token_nonce,expires_at) VALUES(?,?,?,?,?,?)");
  const dealers = database.prepare("SELECT id FROM dealers WHERE active=1").all();
  const campaigns = database.prepare("SELECT id,close_date FROM campaigns").all();
  for (const dealer of dealers) for (const campaign of campaigns) {
    const created = createDealerLinkToken(JOTFORM.linkSecret);
    insert.run(created.id,dealer.id,campaign.id,created.tokenHash,created.nonce,`${campaign.close_date}T23:59:59.999Z`);
  }
}

function ensureKpiDefinitions(database) {
  database.prepare("UPDATE kpi_definitions SET active=0 WHERE questionnaire_version IS NULL").run();
  const insert = database.prepare(`INSERT INTO kpi_definitions(id,code,name,description,unit,kind,required,min_value,max_value,sort_order,section,decimals,placeholder,validation,active,derived,questionnaire_version,formula_version,required_metrics)
    VALUES(@id,@code,@name,@description,@unit,@kind,@required,@min_value,@max_value,@sort_order,@section,@decimals,@placeholder,@validation,@active,@derived,@questionnaire_version,@formula_version,@required_metrics)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name,description=excluded.description,unit=excluded.unit,kind=excluded.kind,required=excluded.required,min_value=excluded.min_value,max_value=excluded.max_value,sort_order=excluded.sort_order,section=excluded.section,decimals=excluded.decimals,placeholder=excluded.placeholder,validation=excluded.validation,active=excluded.active,derived=excluded.derived,questionnaire_version=excluded.questionnaire_version,formula_version=excluded.formula_version,required_metrics=excluded.required_metrics`);
  databaseDefinitions().forEach((item) => {
    const existing=database.prepare("SELECT id FROM kpi_definitions WHERE code=?").get(item.code);
    const idOwner=database.prepare("SELECT code FROM kpi_definitions WHERE id=?").get(item.id);
    const id=existing?.id || (idOwner && idOwner.code !== item.code ? `${item.id}-${QUESTIONNAIRE_VERSION}` : item.id);
    insert.run({ ...item,id });
  });
}

function migrateLegacyKpis(database) {
  database.prepare("UPDATE submissions SET questionnaire_version=COALESCE(questionnaire_version,'legacy-v1')").run();
  const mappings = [["revenue","revenue_total",1_000_000],["machines","units_sold",1],["active_customers","active_customers",1],["customer_satisfaction","customer_satisfaction",1],["parts_revenue","parts_revenue",1_000_000],["service_revenue","service_revenue",1_000_000]];
  for (const [oldCode,newCode,multiplier] of mappings) database.prepare(`INSERT OR IGNORE INTO kpi_values(submission_id,kpi_id,value,note,source_type)
    SELECT v.submission_id,n.id,v.value * ?,v.note,'MIGRATED_LEGACY' FROM kpi_values v JOIN kpi_definitions o ON o.id=v.kpi_id JOIN kpi_definitions n ON n.code=? AND n.questionnaire_version=? WHERE o.code=?`).run(multiplier,newCode,QUESTIONNAIRE_VERSION,oldCode);
}

function demoQuestionnaireValues(database, submission, index) {
  const legacy = Object.fromEntries(database.prepare("SELECT k.code,v.value FROM kpi_values v JOIN kpi_definitions k ON k.id=v.kpi_id WHERE v.submission_id=?").all(submission.id).map((item) => [item.code,item.value]));
  const revenue = Number(legacy.revenue_total ?? (4_000_000 + index * 85_000));
  const units = Math.max(1,Math.round(Number(legacy.units_sold ?? 60 + index)));
  const newUnits = Math.round(units * .72);
  const partsRevenue = Number(legacy.parts_revenue ?? revenue * .18);
  const serviceRevenue = Number(legacy.service_revenue ?? revenue * .12);
  return {
    revenue_total:revenue,revenue_target:Math.round(revenue/0.96),units_sold:units,new_units_sold:newUnits,used_units_sold:units-newUnits,
    quotes_issued:units*3,orders_acquired:units,active_customers:Number(legacy.active_customers ?? 300+index*9),parts_revenue:partsRevenue,
    parts_target:Math.round(partsRevenue/0.94),parts_orders:760+index*17,lost_parts_sales:Math.round(partsRevenue*.025),service_revenue:serviceRevenue,
    workshop_available_hours:4800+index*20,workshop_worked_hours:3780+index*18,workshop_billed_hours:3420+index*16,work_orders:720+index*11,
    warranty_hours:320+index*3,customer_satisfaction:Number(legacy.customer_satisfaction ?? 7.8+(index%8)*.15),employees_total:18+(index%9)
  };
}

function ensureDemoQuestionnaireValues(database) {
  const submissions = database.prepare("SELECT id,questionnaire_version FROM submissions WHERE source_type='MANUAL_DEMO' ORDER BY id").all();
  const insert = database.prepare("INSERT OR IGNORE INTO kpi_values(submission_id,kpi_id,value,note,source_type) VALUES(?,?,?,?,?)");
  submissions.forEach((submission,index) => {
    const inputs = demoQuestionnaireValues(database,submission,index);
    for (const [code,value] of Object.entries({ ...inputs,...calculateDerivedKpis(inputs) })) {
      const kpi = database.prepare("SELECT id FROM kpi_definitions WHERE code=? AND active=1").get(code);
      if (kpi) insert.run(submission.id,kpi.id,value,"","DEMO_SEED");
    }
    database.prepare("UPDATE submissions SET questionnaire_version=?,source_type='DEMO_SEED',collection_status=COALESCE(collection_status,CASE status WHEN 'draft' THEN 'DRAFT' WHEN 'verify' THEN 'NEEDS_REVIEW' ELSE 'SUBMITTED' END) WHERE id=?").run(QUESTIONNAIRE_VERSION,submission.id);
  });
}

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
  ["kpi-growth","annual_growth","Crescita annuale","Variazione fatturato anno su anno","%","percentage",1,-100,500,10],
  ["kpi-workshop-utilization","workshop_utilization","Utilizzo officina","Ore lavorate sulle ore disponibili","%","percentage",0,0,200,11],
  ["kpi-service-revenue","service_revenue","Ricavi assistenza","Ricavi annui di officina e assistenza","M€","currency",0,0,100,12],
  ["kpi-parts-revenue","parts_revenue","Ricavi ricambi","Ricavi annui del reparto ricambi","M€","currency",0,0,100,13],
  ["kpi-inventory-turns","inventory_turns","Rotazione magazzino","Numero di rotazioni annue del magazzino","giri","decimal",0,0,100,14],
  ["kpi-lead-conversion","lead_conversion","Conversione lead","Lead convertiti in ordine","%","percentage",0,0,100,15],
  ["kpi-training-hours","training_hours","Formazione dipendenti","Ore medie annue di formazione per addetto","ore","hours",0,0,1000,16],
  ["kpi-used-share","used_machine_share","Quota macchine usate","Incidenza unità usate sul venduto","%","percentage",0,0,100,17],
  ["kpi-stock-age","average_stock_age","Età media stock","Giorni medi di permanenza delle macchine","giorni","decimal",0,0,5000,18],
  ["kpi-service-satisfaction","service_satisfaction","Soddisfazione assistenza","Valutazione media del servizio post-vendita","/10","score",0,0,10,19],
  ["kpi-warranty-ratio","warranty_hours_ratio","Incidenza garanzia","Ore in garanzia sulle ore lavorate","%","percentage",0,0,100,20]
];

function ensureLegacyKpiDefinitions(database) {
  const insertKpi = database.prepare("INSERT OR IGNORE INTO kpi_definitions(id,code,name,description,unit,kind,required,min_value,max_value,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)");
  seedKpis.forEach((kpi) => insertKpi.run(...kpi));
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function parseBody(request, maximum = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maximum) reject(Object.assign(new Error("Payload troppo grande"), { status: 413 }));
    });
    request.on("end", () => {
      try {
        if (!raw) return resolve({});
        if (String(request.headers["content-type"] || "").includes("application/x-www-form-urlencoded")) return resolve(Object.fromEntries(new URLSearchParams(raw)));
        resolve(JSON.parse(raw));
      } catch { reject(Object.assign(new Error("Payload non valido"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function rateLimit(request, scope, limit, windowMs) {
  const key = `${scope}:${request.socket.remoteAddress || "unknown"}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) { rateBuckets.set(key,{ count:1,resetAt:now+windowMs }); return; }
  bucket.count += 1;
  if (bucket.count > limit) throw Object.assign(new Error("Troppe richieste, riprova più tardi"),{ status:429 });
}

function publicCollectionStatus(row) {
  if (!row) return "NOT_STARTED";
  if (row.collection_status) return row.collection_status;
  return ({ draft:"DRAFT",submitted:"SUBMITTED",verify:"NEEDS_REVIEW" })[row.status] || "NOT_STARTED";
}

function legacyStatusExpression(alias = "s") {
  return `CASE COALESCE(${alias}.collection_status,'') WHEN 'SUBMITTED' THEN 'submitted' WHEN 'VALIDATED' THEN 'submitted' WHEN 'NEEDS_REVIEW' THEN 'verify' WHEN 'DRAFT' THEN 'draft' WHEN 'REOPENED' THEN 'draft' ELSE COALESCE(${alias}.status,'missing') END`;
}

function demoRole(request) { return String(request.headers["x-demo-role"] || "JET").toUpperCase() === "SDF" ? "SDF" : "JET"; }
function requireJet(request) { if (demoRole(request) !== "JET") throw Object.assign(new Error("La vista SDF è in sola lettura"),{ status:403 }); }

function collectionLinkUrl(token, request) {
  const forwardedHost = request?.headers?.["x-forwarded-host"];
  const host = forwardedHost || request?.headers?.host;
  const forwardedProtocol = String(request?.headers?.["x-forwarded-proto"] || "").split(",")[0];
  const inferred = host ? `${forwardedProtocol || (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https")}://${host}` : JOTFORM.publicUrl;
  const base = process.env.APP_PUBLIC_URL ? JOTFORM.publicUrl : inferred;
  return `${base}/compila/${encodeURIComponent(token)}`;
}

function adminLinkPayload(database, dealerId, campaignId, request) {
  ensureCampaignLinks(database);
  const row = database.prepare("SELECT * FROM dealer_campaign_links WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaignId);
  if (!row) throw Object.assign(new Error("Link di compilazione non trovato"),{ status:404 });
  const token = restoreDealerLinkToken(JOTFORM.linkSecret,row.id,row.token_nonce);
  return { ...row,token:undefined,url:collectionLinkUrl(token,request),qrUrl:`/api/collection-links/${encodeURIComponent(row.id)}/qr.svg` };
}

function resolveDealerLink(database, token, { allowInactive = false } = {}) {
  const link = database.prepare("SELECT * FROM dealer_campaign_links WHERE token_hash=?").get(hashDealerToken(token));
  if (!link || (!allowInactive && link.status !== "ACTIVE")) throw Object.assign(new Error("Link di compilazione non valido o revocato"),{ status:404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) throw Object.assign(new Error("Link di compilazione scaduto"),{ status:410 });
  return link;
}

function selectedCampaign(database, requestedId) {
  return requestedId
    ? database.prepare("SELECT * FROM campaigns WHERE id = ?").get(requestedId)
    : database.prepare("SELECT * FROM campaigns WHERE status = 'open' ORDER BY year DESC, survey_no DESC LIMIT 1").get();
}

function dealerRows(database, campaignId, filters = {}) {
  const params = [campaignId];
  const clauses = ["d.active = 1"];
  const statusSql = legacyStatusExpression("s");
  if (filters.search) { clauses.push("(LOWER(d.name) LIKE ? OR LOWER(d.id) LIKE ?)"); params.push(`%${filters.search.toLowerCase()}%`,`%${filters.search.toLowerCase()}%`); }
  if (filters.region) { clauses.push("d.region = ?"); params.push(filters.region); }
  if (filters.status === "missing") clauses.push("s.id IS NULL");
  if (filters.status === "submitted") clauses.push(`${statusSql} = 'submitted'`);
  if (filters.status === "verify") clauses.push(`${statusSql} = 'verify'`);
  if (["NOT_STARTED","DRAFT","SUBMITTED","NEEDS_REVIEW","VALIDATED","REOPENED"].includes(filters.status)) clauses.push(`COALESCE(s.collection_status,CASE WHEN s.id IS NULL THEN 'NOT_STARTED' WHEN s.status='draft' THEN 'DRAFT' WHEN s.status='verify' THEN 'NEEDS_REVIEW' ELSE 'SUBMITTED' END) = ?`),params.push(filters.status);
  return database.prepare(`
    SELECT d.id,d.name,d.initials,d.region,d.area,d.manager,d.email,
      ${statusSql} AS status, COALESCE(s.quality_score,0) AS quality,
      s.updated_at,s.submitted_at,COALESCE(s.source_type,'PROPRIETARY') AS source_type,
      COALESCE(s.collection_status,CASE WHEN s.id IS NULL THEN 'NOT_STARTED' WHEN s.status='draft' THEN 'DRAFT' WHEN s.status='verify' THEN 'NEEDS_REVIEW' ELSE 'SUBMITTED' END) AS collection_status,
      CASE WHEN s.id IS NULL THEN 0 ELSE ROUND(100.0 * (SELECT COUNT(*) FROM kpi_values kv JOIN kpi_definitions kd ON kd.id=kv.kpi_id WHERE kv.submission_id=s.id AND kd.required=1 AND kd.active=1) / NULLIF((SELECT COUNT(*) FROM kpi_definitions WHERE required=1 AND active=1),0)) END AS completion
    FROM dealers d LEFT JOIN submissions s ON s.dealer_id=d.id AND s.campaign_id=?
    WHERE ${clauses.join(" AND ")} ORDER BY d.name
  `).all(...params);
}

function overviewPayload(database, campaignId) {
  const campaign = selectedCampaign(database, campaignId);
  if (!campaign) throw Object.assign(new Error("Campagna non trovata"), { status: 404 });
  const rows = dealerRows(database, campaign.id);
  const count = (status) => rows.filter((row) => row.collection_status === status).length;
  const submitted = count("SUBMITTED"), validated = count("VALIDATED"), verify = count("NEEDS_REVIEW"), drafts = count("DRAFT"), reopened = count("REOPENED"), notStarted = count("NOT_STARTED");
  const received = submitted + validated + verify;
  const completed = received;
  const areas = [...new Set(rows.map((row) => row.area))].map((area) => {
    const scoped = rows.filter((row) => row.area === area);
    return { area, total: scoped.length, completed: scoped.filter((row) => ["SUBMITTED","VALIDATED"].includes(row.collection_status)).length, verify: scoped.filter((row) => row.collection_status === "NEEDS_REVIEW").length, missing: scoped.filter((row) => ["NOT_STARTED","DRAFT","REOPENED"].includes(row.collection_status)).length };
  });
  const daily = database.prepare("SELECT substr(updated_at,1,10) AS day, COUNT(*) AS count FROM submissions WHERE campaign_id=? AND status IN ('submitted','verify') GROUP BY substr(updated_at,1,10) ORDER BY day").all(campaign.id);
  let cumulative = 0;
  const timeline = daily.map((item) => ({ day:item.day, value:(cumulative += item.count) }));
  const alertOrder={NEEDS_REVIEW:0,DRAFT:1,REOPENED:1,NOT_STARTED:2};
  return {
    campaign,
    totals: { dealers: rows.length, received, completed, submitted,validated,drafts,reopened,notStarted,missing: rows.length - received, verify, completion: rows.length ? Math.round(received / rows.length * 100) : 0 },
    areas, timeline,
    recent: rows.filter((row) => ["SUBMITTED","VALIDATED","NEEDS_REVIEW"].includes(row.collection_status)).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,4),
    alerts: rows.filter((row) => ["NEEDS_REVIEW","DRAFT","REOPENED","NOT_STARTED"].includes(row.collection_status)).sort((a,b) => alertOrder[a.collection_status]-alertOrder[b.collection_status]).slice(0,5),
    syncErrors: COLLECTION_MODE === "jotform" ? database.prepare("SELECT COUNT(*) AS count FROM jotform_submissions WHERE campaign_id=? AND sync_status='ERROR'").get(campaign.id).count : 0
  };
}

function dealerDetail(database, dealerId, campaignId, request) {
  const campaign = selectedCampaign(database, campaignId);
  const dealerRecord = database.prepare("SELECT id,name,initials,region,area,manager,email,access_token FROM dealers WHERE id=?").get(dealerId);
  if (!dealerRecord || !campaign) throw Object.assign(new Error("Concessionario o campagna non trovati"), { status: 404 });
  const { access_token:accessToken, ...dealer } = dealerRecord;
  const submission = database.prepare("SELECT * FROM submissions WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaign.id);
  const previousSubmission = database.prepare("SELECT s.* FROM submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE s.dealer_id=? AND s.campaign_id<>? ORDER BY c.year DESC,c.survey_no DESC LIMIT 1").get(dealerId,campaign.id);
  const compatible = !previousSubmission || previousSubmission.questionnaire_version === submission?.questionnaire_version;
  const values = database.prepare(`
    SELECT k.id,k.code,k.name,k.description,k.unit,k.kind,k.required,k.min_value,k.max_value,k.sort_order,k.section,k.decimals,k.derived,
      v.value,
      (SELECT AVG(v2.value) FROM kpi_values v2 JOIN submissions s2 ON s2.id=v2.submission_id WHERE v2.kpi_id=k.id AND s2.campaign_id=? AND s2.status IN ('submitted','verify')) AS network_avg,
      (SELECT vp.value FROM kpi_values vp WHERE vp.kpi_id=k.id AND vp.submission_id=?) AS previous_value
    FROM kpi_definitions k LEFT JOIN kpi_values v ON v.kpi_id=k.id AND v.submission_id=? WHERE k.active=1 ORDER BY k.sort_order
  `).all(campaign.id,compatible ? previousSubmission?.id ?? -1 : -1,submission?.id ?? -1);
  const notes = database.prepare("SELECT id,author,body,created_at FROM notes WHERE dealer_id=? ORDER BY created_at DESC").all(dealerId);
  const collectionLink = demoRole(request) === "JET" ? adminLinkPayload(database,dealerId,campaign.id,request) : null;
  const history = database.prepare(`SELECT s.campaign_id,c.name AS campaign_name,s.submitted_at,s.updated_at,s.status,s.source_type,s.collection_status,s.external_submission_id,s.questionnaire_version,
    (SELECT COUNT(*) FROM kpi_values kv WHERE kv.submission_id=s.id) AS kpi_count
    FROM submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE s.dealer_id=? ORDER BY c.year DESC,c.survey_no DESC`).all(dealerId);
  const jotform = database.prepare("SELECT jotform_submission_id,sync_status,validation_status,validation_issues_json,last_synced_at FROM jotform_submissions WHERE dealer_id=? AND campaign_id=? ORDER BY id DESC LIMIT 1").get(dealerId,campaign.id);
  return {
    campaign,dealer,
    submission: submission ? { ...submission,collection_status:publicCollectionStatus(submission) } : { status:"missing",collection_status:"NOT_STARTED",quality_score:0,updated_at:null,submitted_at:null,source_type:"MANUAL_DEMO" },
    values,notes:demoRole(request) === "JET" ? notes : [],history,jotform:demoRole(request) === "JET" && COLLECTION_MODE === "jotform" ? jotform : null,comparison:{ compatible,currentVersion:submission?.questionnaire_version,previousVersion:previousSubmission?.questionnaire_version },
    collectionLink,
    surveyUrl:collectionLink?.url,
    legacySurveyUrl:demoRole(request) === "JET" ? `/?page=survey&token=${accessToken}` : null
  };
}

function analysisPayload(database, campaignId, kpiId) {
  const campaign = selectedCampaign(database, campaignId);
  const kpi = kpiId
    ? database.prepare("SELECT * FROM kpi_definitions WHERE (id=? OR code=?) AND active=1").get(kpiId,kpiId)
    : database.prepare("SELECT * FROM kpi_definitions WHERE active=1 ORDER BY sort_order LIMIT 1").get();
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
    database.prepare(`INSERT INTO submissions(dealer_id,campaign_id,status,quality_score,updated_at,submitted_at,source_type,collection_status) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,?,?) ON CONFLICT(dealer_id,campaign_id) DO UPDATE SET status=excluded.status,quality_score=excluded.quality_score,updated_at=CURRENT_TIMESTAMP,submitted_at=excluded.submitted_at,source_type=excluded.source_type,collection_status=excluded.collection_status`).run(payload.dealer.id,payload.campaign.id,finalSubmit?"submitted":"draft",finalSubmit?100:Math.round(normalized.length/payload.kpis.length*100),finalSubmit?new Date().toISOString():null,"MANUAL_DEMO",finalSubmit?"SUBMITTED":"DRAFT");
    const submission = database.prepare("SELECT id FROM submissions WHERE dealer_id=? AND campaign_id=?").get(payload.dealer.id,payload.campaign.id);
    database.prepare("DELETE FROM kpi_values WHERE submission_id=?").run(submission.id);
    const insert = database.prepare("INSERT INTO kpi_values(submission_id,kpi_id,value,note) VALUES(?,?,?,?)");
    normalized.forEach((item) => insert.run(submission.id,item.kpiId,item.value,item.note));
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(payload.dealer.id,payload.campaign.id,finalSubmit?"submitted":"draft_saved",payload.dealer.id,JSON.stringify({ fields:normalized.length }));
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return surveyPayload(database, token);
}

function collectionPayload(database, token, { recordOpen = false } = {}) {
  const link = resolveDealerLink(database,token);
  const dealer = database.prepare("SELECT id,name,initials,region,area,manager FROM dealers WHERE id=? AND active=1").get(link.dealer_id);
  const campaign = database.prepare("SELECT * FROM campaigns WHERE id=?").get(link.campaign_id);
  if (!dealer || !campaign) throw Object.assign(new Error("Link non associato a una raccolta attiva"),{ status:404 });
  if (recordOpen) database.prepare("UPDATE dealer_campaign_links SET last_opened_at=CURRENT_TIMESTAMP,opened_count=opened_count+1 WHERE id=?").run(link.id);
  const submission = database.prepare("SELECT * FROM submissions WHERE dealer_id=? AND campaign_id=?").get(dealer.id,campaign.id);
  const stored = submission ? Object.fromEntries(database.prepare("SELECT k.code,v.value,v.note FROM kpi_values v JOIN kpi_definitions k ON k.id=v.kpi_id WHERE v.submission_id=? AND k.active=1 AND k.derived=0").all(submission.id).map((item) => [item.code,{ value:item.value,note:item.note }])) : {};
  const embedUrl = COLLECTION_MODE === "jotform" && JOTFORM.mode === "live" && JOTFORM.liveReady ? buildEmbedUrl({
    dealerId:dealer.id,dealerName:dealer.name,campaignId:campaign.id,campaignName:campaign.name,dealerToken:token,periodStart:campaign.open_date,periodEnd:campaign.close_date
  },JOTFORM) : null;
  return {
    mode:COLLECTION_MODE,liveReady:COLLECTION_MODE === "jotform" && JOTFORM.liveReady,dealer,campaign,
    submission:submission ? { ...submission,collection_status:publicCollectionStatus(submission) } : { status:"missing",collection_status:"NOT_STARTED",source_type:"PROPRIETARY",questionnaire_version:QUESTIONNAIRE_VERSION,updated_at:null,submitted_at:null },
    questionnaire:{ version:QUESTIONNAIRE_VERSION,sections:questionnaireSections,fields:questionnaireFields },values:stored,embedUrl,
    support:{ label:"Assistenza JET",email:"supporto.jet@example.com" }
  };
}

function storedQuestionnaireValues(database, submissionId) {
  if (!submissionId) return {};
  return Object.fromEntries(database.prepare(`SELECT k.code,v.value FROM kpi_values v JOIN kpi_definitions k ON k.id=v.kpi_id
    WHERE v.submission_id=? AND k.active=1 AND k.derived=0`).all(submissionId).map((row) => [row.code,row.value]));
}

function questionnaireValueChanges(previousValues, nextValues) {
  return questionnaireFields.flatMap((field) => {
    const previous = previousValues[field.code] ?? null;
    const next = nextValues[field.code] ?? null;
    return Object.is(previous,next) ? [] : [{ code:field.code,previous,next }];
  });
}

function replaceQuestionnaireValues(database, submissionId, inputValues, sourceType) {
  const derived = calculateDerivedKpis(inputValues);
  database.prepare("DELETE FROM kpi_values WHERE submission_id=? AND kpi_id IN (SELECT id FROM kpi_definitions WHERE active=1)").run(submissionId);
  const definition = database.prepare("SELECT id FROM kpi_definitions WHERE code=? AND active=1");
  const insert = database.prepare("INSERT INTO kpi_values(submission_id,kpi_id,value,note,source_type) VALUES(?,?,?,?,?)");
  for (const [code,value] of Object.entries(inputValues)) insert.run(submissionId,definition.get(code).id,value,"",sourceType);
  for (const [code,value] of Object.entries(derived)) insert.run(submissionId,definition.get(code).id,value,"",`${sourceType}_DERIVED`);
  return derived;
}

function saveProprietaryCollection(database, token, inputValues, finalSubmit) {
  const payload = collectionPayload(database,token);
  if (payload.campaign.status !== "open") throw Object.assign(new Error("La campagna non è aperta"),{ status:409 });
  const existingStatus = payload.submission.collection_status;
  if (["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(existingStatus)) throw Object.assign(new Error("La compilazione è già stata inviata. JET deve riaprirla per consentire modifiche."),{ status:409 });
  const { values:validatedValues,errors } = validateQuestionnaire(inputValues,{ finalSubmit });
  if (Object.keys(errors).length) throw Object.assign(new Error("Alcuni dati non sono validi"),{ status:422,details:errors });
  const normalized = Object.entries(validatedValues).map(([code,value]) => ({ code,value }));
  const link = resolveDealerLink(database,token);
  const submittedAt = finalSubmit ? new Date().toISOString() : null;
  const existingSubmission = database.prepare("SELECT id,collection_status FROM submissions WHERE dealer_id=? AND campaign_id=?").get(link.dealer_id,link.campaign_id);
  const previousValues = storedQuestionnaireValues(database,existingSubmission?.id);
  let auditPreviousValues = previousValues;
  if (finalSubmit && existingStatus === "REOPENED") {
    const reopenedAudit = database.prepare("SELECT payload FROM audit_events WHERE dealer_id=? AND campaign_id=? AND event_type='submission_reopened' ORDER BY id DESC LIMIT 1").get(link.dealer_id,link.campaign_id);
    try { auditPreviousValues = JSON.parse(reopenedAudit?.payload || "{}").originalValues || previousValues; } catch { auditPreviousValues = previousValues; }
  }
  const changes = questionnaireValueChanges(auditPreviousValues,validatedValues);
  const inputMap = validatedValues;
  const warnings = finalSubmit ? questionnaireWarnings(inputMap) : [];
  const collectionStatus = finalSubmit ? (warnings.length ? "NEEDS_REVIEW" : "SUBMITTED") : existingStatus === "REOPENED" ? "REOPENED" : "DRAFT";
  database.exec("BEGIN");
  try {
    database.prepare(`INSERT INTO submissions(dealer_id,campaign_id,status,quality_score,updated_at,submitted_at,source_type,collection_status,questionnaire_version,validation_issues_json)
      VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?) ON CONFLICT(dealer_id,campaign_id) DO UPDATE SET status=excluded.status,quality_score=excluded.quality_score,updated_at=CURRENT_TIMESTAMP,submitted_at=excluded.submitted_at,source_type=excluded.source_type,collection_status=excluded.collection_status,questionnaire_version=excluded.questionnaire_version,validation_issues_json=excluded.validation_issues_json,external_submission_id=NULL`)
      .run(link.dealer_id,link.campaign_id,finalSubmit?(warnings.length?"verify":"submitted"):"draft",finalSubmit?100:Math.round(normalized.length/questionnaireFields.length*100),submittedAt,"PROPRIETARY",collectionStatus,QUESTIONNAIRE_VERSION,JSON.stringify(warnings));
    const submission = database.prepare("SELECT id FROM submissions WHERE dealer_id=? AND campaign_id=?").get(link.dealer_id,link.campaign_id);
    const derived = replaceQuestionnaireValues(database,submission.id,validatedValues,"PROPRIETARY");
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(link.dealer_id,link.campaign_id,finalSubmit?(existingStatus === "REOPENED"?"proprietary_submission_resubmitted":"proprietary_submission_received"):"proprietary_draft_saved",link.dealer_id,JSON.stringify({ fields:normalized.length,derived:Object.keys(derived).length,warnings,changes,previousStatus:existingStatus,newStatus:collectionStatus,linkId:link.id,questionnaireVersion:QUESTIONNAIRE_VERSION }));
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return collectionPayload(database,token);
}

function updateSubmittedQuestionnaire(database, dealerId, campaignId, inputValues) {
  const campaign = selectedCampaign(database,campaignId);
  if (!campaign) throw Object.assign(new Error("Campagna non trovata"),{ status:404 });
  const submission = database.prepare("SELECT * FROM submissions WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaign.id);
  if (!submission || !["SUBMITTED","NEEDS_REVIEW","VALIDATED"].includes(publicCollectionStatus(submission))) {
    throw Object.assign(new Error("La compilazione deve essere inviata prima di poter essere modificata da JET"),{ status:409 });
  }
  const { values:validatedValues,errors } = validateQuestionnaire(inputValues,{ finalSubmit:true });
  if (Object.keys(errors).length) throw Object.assign(new Error("Alcuni dati non sono validi"),{ status:422,details:errors });
  const previousValues = storedQuestionnaireValues(database,submission.id);
  const changes = questionnaireValueChanges(previousValues,validatedValues);
  if (!changes.length) return { ok:true,status:publicCollectionStatus(submission),changes:[] };
  const warnings = questionnaireWarnings(validatedValues);
  database.exec("BEGIN");
  try {
    const derived = replaceQuestionnaireValues(database,submission.id,validatedValues,"JET_EDIT");
    database.prepare(`UPDATE submissions SET status='verify',collection_status='NEEDS_REVIEW',quality_score=100,updated_at=CURRENT_TIMESTAMP,
      validation_issues_json=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by='JET Admin' WHERE id=?`).run(JSON.stringify(warnings),submission.id);
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(dealerId,campaign.id,"submission_values_updated","JET Admin",JSON.stringify({ changes,previousStatus:publicCollectionStatus(submission),newStatus:"NEEDS_REVIEW",derived:Object.keys(derived),warnings,questionnaireVersion:QUESTIONNAIRE_VERSION }));
    database.exec("COMMIT");
    return { ok:true,status:"NEEDS_REVIEW",changes };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

function exportCsv(database, campaignId) {
  const campaign = selectedCampaign(database,campaignId);
  const kpis = database.prepare("SELECT id,name FROM kpi_definitions WHERE active=1 ORDER BY sort_order").all();
  const rows = dealerRows(database,campaign.id);
  const header = ["Dealer ID","Concessionario","Regione","Area","Area manager","Stato raccolta","Qualità dati",...kpis.map((kpi) => kpi.name)];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    const submission = database.prepare("SELECT id FROM submissions WHERE dealer_id=? AND campaign_id=?").get(row.id,campaign.id);
    const valueMap = submission ? new Map(database.prepare("SELECT kpi_id,value FROM kpi_values WHERE submission_id=?").all(submission.id).map((item) => [item.kpi_id,item.value])) : new Map();
    lines.push([row.id,row.name,row.region,row.area,row.manager,row.collection_status,row.quality,...kpis.map((kpi) => valueMap.get(kpi.id) ?? "")].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export async function handleApi(request, response, url, database = db) {
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/health") return json(response,200,{ status:"ok",database:"sqlite",time:new Date().toISOString() });
  if (request.method === "GET" && path === "/api/config") return json(response,200,{ campaigns:database.prepare("SELECT * FROM campaigns ORDER BY year DESC,survey_no DESC").all(),kpis:database.prepare("SELECT * FROM kpi_definitions WHERE active=1 ORDER BY sort_order").all(),collection:{ mode:COLLECTION_MODE,questionnaireVersion:QUESTIONNAIRE_VERSION },jotform:{ enabled:COLLECTION_MODE === "jotform",mode:JOTFORM.mode,liveReady:COLLECTION_MODE === "jotform" && JOTFORM.liveReady },demo:{ viewSwitcher:DEMO_VIEW_SWITCHER,role:demoRole(request) } });
  if (request.method === "GET" && path === "/api/overview") return json(response,200,overviewPayload(database,url.searchParams.get("campaignId")));
  if (request.method === "GET" && path === "/api/dealers") return json(response,200,{ campaign:selectedCampaign(database,url.searchParams.get("campaignId")),dealers:dealerRows(database,url.searchParams.get("campaignId") || selectedCampaign(database).id,{ search:url.searchParams.get("search"),region:url.searchParams.get("region"),status:url.searchParams.get("status") }) });
  if (request.method === "GET" && path === "/api/analysis") return json(response,200,analysisPayload(database,url.searchParams.get("campaignId"),url.searchParams.get("kpiId")));
  if (request.method === "GET" && path === "/api/campaigns") {
    const campaigns = database.prepare("SELECT * FROM campaigns ORDER BY year DESC,survey_no DESC").all().map((campaign) => ({ ...campaign, progress:overviewPayload(database,campaign.id).totals }));
    return json(response,200,{ campaigns });
  }
  if (request.method === "POST" && path === "/api/campaigns") {
    requireJet(request);
    const body = await parseBody(request);
    const id = String(body.id || `campaign-${body.year}-${body.survey_no}`).trim();
    if (!id || !body.name || !Number.isInteger(Number(body.year)) || !Number.isInteger(Number(body.survey_no)) || !body.open_date || !body.close_date) throw Object.assign(new Error("Dati campagna incompleti"),{ status:422 });
    if (new Date(body.close_date) <= new Date(body.open_date)) throw Object.assign(new Error("La chiusura deve essere successiva all'apertura"),{ status:422 });
    database.prepare("INSERT INTO campaigns(id,name,year,survey_no,open_date,close_date,status) VALUES(?,?,?,?,?,?,?)").run(id,String(body.name).trim(),Number(body.year),Number(body.survey_no),body.open_date,body.close_date,["draft","open","closed"].includes(body.status)?body.status:"draft");
    ensureCampaignLinks(database);
    database.prepare("INSERT INTO audit_events(campaign_id,event_type,actor,payload) VALUES(?,?,?,?)").run(id,"campaign_created","JET Admin",JSON.stringify({ name:body.name }));
    return json(response,201,{ ok:true,id });
  }
  if (request.method === "POST" && path === "/api/integrations/jotform/sync") {
    requireJet(request);
    if (COLLECTION_MODE !== "jotform") throw Object.assign(new Error("L'integrazione Jotform è disattivata"),{ status:404 });
    const summary = await syncSubmissions(database,JOTFORM);
    return json(response,200,summary);
  }
  const webhookMatch = path.match(/^\/api\/integrations\/jotform\/webhook\/([^/]+)$/);
  if (request.method === "POST" && webhookMatch) {
    if (COLLECTION_MODE !== "jotform") throw Object.assign(new Error("L'integrazione Jotform è disattivata"),{ status:404 });
    rateLimit(request,"jotform-webhook",60,60_000);
    if (!JOTFORM.webhookSecret) throw Object.assign(new Error("Webhook Jotform non configurato"),{ status:503 });
    if (!safeSecretEqual(decodeURIComponent(webhookMatch[1]),JOTFORM.webhookSecret)) throw Object.assign(new Error("Secret webhook non valido"),{ status:401 });
    const parsed = parseWebhook(await parseBody(request,512_000));
    if (!parsed.submissionId || !parsed.formId) throw Object.assign(new Error("Webhook privo di form ID o submission ID"),{ status:422 });
    if (JOTFORM.formId && parsed.formId !== JOTFORM.formId) throw Object.assign(new Error("Form ID non autorizzato"),{ status:422 });
    const verified = JOTFORM.apiKey ? await fetchSubmission(parsed.submissionId,JOTFORM) : { ...parsed.raw,id:parsed.submissionId,form_id:parsed.formId };
    return json(response,200,{ ok:true,...persistJotformSubmission(database,verified,JOTFORM) });
  }
  const publicCollectionMatch = path.match(/^\/api\/compila\/([^/]+)(?:\/(draft|submit))?$/);
  if (publicCollectionMatch) {
    rateLimit(request,"dealer-link",120,60_000);
    const token = decodeURIComponent(publicCollectionMatch[1]);
    if (request.method === "GET" && !publicCollectionMatch[2]) return json(response,200,collectionPayload(database,token,{ recordOpen:true }));
    if (["PUT","POST"].includes(request.method) && publicCollectionMatch[2]) {
      if (COLLECTION_MODE === "jotform" && JOTFORM.mode === "live" && JOTFORM.liveReady) throw Object.assign(new Error("In modalità Jotform live l'invio avviene tramite Jotform"),{ status:409 });
      const body = await parseBody(request);
      return json(response,200,saveProprietaryCollection(database,token,body.values,publicCollectionMatch[2] === "submit"));
    }
  }
  if (request.method === "POST" && path === "/api/reminders/prepare") {
    requireJet(request);
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
    const template = "dealer_id,name,region,area,manager,email\nDEMO-100,Concessionario Esempio Demo,Lombardia,Nord Ovest,Giulia Ferri Demo,demo-100@demo.sdf.invalid\n";
    response.writeHead(200,{ "content-type":"text/csv; charset=utf-8", "content-disposition":"attachment; filename=template-concessionari.csv" });
    return response.end(`\ufeff${template}`);
  }
  if (request.method === "POST" && path === "/api/dealers/import") {
    requireJet(request);
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
  if (request.method === "GET" && dealerMatch) return json(response,200,dealerDetail(database,decodeURIComponent(dealerMatch[1]),url.searchParams.get("campaignId"),request));
  const linkMatch = path.match(/^\/api\/dealers\/([^/]+)\/collection-link(?:\/(regenerate|revoke))?$/);
  if (linkMatch) {
    const dealerId = decodeURIComponent(linkMatch[1]);
    const campaign = selectedCampaign(database,url.searchParams.get("campaignId"));
    if (!campaign || !database.prepare("SELECT 1 FROM dealers WHERE id=?").get(dealerId)) throw Object.assign(new Error("Dealer o campagna non trovati"),{ status:404 });
    if (request.method === "GET" && !linkMatch[2]) { requireJet(request); return json(response,200,adminLinkPayload(database,dealerId,campaign.id,request)); }
    if (request.method === "POST" && linkMatch[2] === "regenerate") {
      requireJet(request);
      const row = database.prepare("SELECT id FROM dealer_campaign_links WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaign.id);
      const created = createDealerLinkToken(JOTFORM.linkSecret,row?.id);
      database.prepare("UPDATE dealer_campaign_links SET token_hash=?,token_nonce=?,status='ACTIVE',revoked_at=NULL,created_at=CURRENT_TIMESTAMP WHERE id=?").run(created.tokenHash,created.nonce,row.id);
      database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(dealerId,campaign.id,"dealer_link_regenerated","JET Admin",JSON.stringify({ linkId:row.id }));
      return json(response,200,adminLinkPayload(database,dealerId,campaign.id,request));
    }
    if (request.method === "POST" && linkMatch[2] === "revoke") {
      requireJet(request);
      database.prepare("UPDATE dealer_campaign_links SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP WHERE dealer_id=? AND campaign_id=?").run(dealerId,campaign.id);
      database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(dealerId,campaign.id,"dealer_link_revoked","JET Admin","{}");
      return json(response,200,{ ok:true,status:"REVOKED" });
    }
  }
  const qrMatch = path.match(/^\/api\/collection-links\/([^/]+)\/qr\.svg$/);
  if (request.method === "GET" && qrMatch) {
    requireJet(request);
    const row = database.prepare("SELECT * FROM dealer_campaign_links WHERE id=?").get(decodeURIComponent(qrMatch[1]));
    if (!row) throw Object.assign(new Error("QR non trovato"),{ status:404 });
    const token = restoreDealerLinkToken(JOTFORM.linkSecret,row.id,row.token_nonce);
    const target = collectionLinkUrl(token,request);
    const svg = await QRCode.toString(target,{ type:"svg",errorCorrectionLevel:"M",margin:2,color:{ dark:"#11151D",light:"#FFFFFFFF" } });
    response.writeHead(200,{ "content-type":"image/svg+xml; charset=utf-8","content-disposition":`inline; filename=qr-${row.dealer_id}.svg`,"cache-control":"no-store","x-qr-target":target });
    return response.end(svg);
  }
  const noteMatch = path.match(/^\/api\/dealers\/([^/]+)\/notes$/);
  if (request.method === "POST" && noteMatch) {
    requireJet(request);
    const body = await parseBody(request);
    if (!String(body.body || "").trim()) throw Object.assign(new Error("La nota non può essere vuota"),{ status:422 });
    database.prepare("INSERT INTO notes(dealer_id,author,body) VALUES(?,?,?)").run(decodeURIComponent(noteMatch[1]),String(body.author || "JET Admin"),String(body.body).trim());
    return json(response,201,{ ok:true });
  }
  const stateMatch = path.match(/^\/api\/dealers\/([^/]+)\/submission\/status$/);
  if (request.method === "POST" && stateMatch) {
    requireJet(request);
    const dealerId=decodeURIComponent(stateMatch[1]); const body=await parseBody(request); const campaign=selectedCampaign(database,body.campaignId || url.searchParams.get("campaignId"));
    const allowed=["NEEDS_REVIEW","VALIDATED","REOPENED"];
    if (!allowed.includes(body.status)) throw Object.assign(new Error("Stato non valido"),{ status:422 });
    const submission=database.prepare("SELECT id,collection_status,status FROM submissions WHERE dealer_id=? AND campaign_id=?").get(dealerId,campaign?.id);
    if (!submission) throw Object.assign(new Error("Compilazione non trovata"),{ status:404 });
    const legacy=body.status === "NEEDS_REVIEW" ? "verify" : body.status === "REOPENED" ? "draft" : "submitted";
    database.prepare("UPDATE submissions SET collection_status=?,status=?,updated_at=CURRENT_TIMESTAMP,reviewed_at=CURRENT_TIMESTAMP,reviewed_by='JET Admin' WHERE id=?").run(body.status,legacy,submission.id);
    const auditPayload={ previousStatus:publicCollectionStatus(submission),newStatus:body.status };
    if (body.status === "REOPENED") auditPayload.originalValues=storedQuestionnaireValues(database,submission.id);
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)").run(dealerId,campaign.id,body.status === "REOPENED" ? "submission_reopened" : "submission_status_changed","JET Admin",JSON.stringify(auditPayload));
    return json(response,200,{ ok:true,status:body.status });
  }
  const valuesMatch = path.match(/^\/api\/dealers\/([^/]+)\/submission\/values$/);
  if (request.method === "PUT" && valuesMatch) {
    requireJet(request);
    const body = await parseBody(request);
    return json(response,200,updateSubmittedQuestionnaire(database,decodeURIComponent(valuesMatch[1]),body.campaignId || url.searchParams.get("campaignId"),body.values));
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
  const requested = pathname === "/" || pathname.startsWith("/compila/") ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(ROOT,safePath);
  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) return json(response,404,{ error:"File non trovato" });
  response.writeHead(200,{ "content-type":contentTypes[extname(filePath)] || "application/octet-stream", "cache-control":"no-cache", "x-content-type-options":"nosniff", "referrer-policy":"strict-origin-when-cross-origin", "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src https://form.jotform.com https://www.jotform.com" });
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
