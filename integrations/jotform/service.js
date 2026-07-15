import { fetchFormSubmissions, mapSubmissionToKpis } from "./index.js";
import { hashDealerToken } from "./link-tokens.js";

function cleanJson(value) {
  return JSON.stringify(value, (_key,item) => typeof item === "string" && item.length > 20_000 ? `${item.slice(0,20_000)}…` : item);
}

export function verifySubmissionContext(database, mapped, expectedFormId) {
  if (!mapped.submissionId) throw Object.assign(new Error("Submission ID mancante"),{ status:422 });
  if (expectedFormId && mapped.formId !== expectedFormId) throw Object.assign(new Error("Form ID non corrispondente"),{ status:422 });
  const token = String(mapped.metadata.dealer_token || "");
  const link = database.prepare("SELECT * FROM dealer_campaign_links WHERE token_hash=?").get(hashDealerToken(token));
  if (!link || link.status !== "ACTIVE") throw Object.assign(new Error("Token dealer non valido o revocato"),{ status:422 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) throw Object.assign(new Error("Token dealer scaduto"),{ status:422 });
  if (String(mapped.metadata.dealer_id) !== link.dealer_id) throw Object.assign(new Error("Dealer non corrispondente al token"),{ status:422 });
  if (String(mapped.metadata.campaign_id) !== link.campaign_id) throw Object.assign(new Error("Campagna non corrispondente al token"),{ status:422 });
  return link;
}

export function persistJotformSubmission(database, payload, config) {
  const definitions = database.prepare("SELECT * FROM kpi_definitions ORDER BY sort_order").all();
  const mapped = mapSubmissionToKpis(payload,definitions,config);
  const link = verifySubmissionContext(database,mapped,config.formId);
  const existing = database.prepare("SELECT * FROM jotform_submissions WHERE jotform_submission_id=?").get(mapped.submissionId);
  const collectionStatus = mapped.issues.length ? "NEEDS_REVIEW" : "SUBMITTED";
  const legacyStatus = mapped.issues.length ? "verify" : "submitted";
  const now = new Date().toISOString();
  database.exec("BEGIN");
  try {
    database.prepare(`INSERT INTO submissions(dealer_id,campaign_id,status,quality_score,updated_at,submitted_at,source_type,collection_status,external_submission_id)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(dealer_id,campaign_id) DO UPDATE SET status=excluded.status,quality_score=excluded.quality_score,updated_at=excluded.updated_at,submitted_at=excluded.submitted_at,source_type=excluded.source_type,collection_status=excluded.collection_status,external_submission_id=excluded.external_submission_id`)
      .run(link.dealer_id,link.campaign_id,legacyStatus,mapped.issues.length ? 72 : 100,now,mapped.submittedAt,"JOTFORM",collectionStatus,mapped.submissionId);
    const internal = database.prepare("SELECT id FROM submissions WHERE dealer_id=? AND campaign_id=?").get(link.dealer_id,link.campaign_id);
    database.prepare("DELETE FROM kpi_values WHERE submission_id=?").run(internal.id);
    const insertValue = database.prepare("INSERT INTO kpi_values(submission_id,kpi_id,value,note,source_type,external_submission_id) VALUES(?,?,?,?,?,?)");
    mapped.values.forEach((item) => insertValue.run(internal.id,item.kpiId,item.value,"","JOTFORM",mapped.submissionId));
    database.prepare(`INSERT INTO jotform_submissions(jotform_submission_id,jotform_form_id,dealer_id,campaign_id,dealer_link_id,internal_submission_id,status,submitted_at,updated_at,raw_payload_json,normalized_payload_json,sync_status,last_synced_at,validation_status,validation_issues_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(jotform_submission_id) DO UPDATE SET updated_at=excluded.updated_at,raw_payload_json=excluded.raw_payload_json,normalized_payload_json=excluded.normalized_payload_json,sync_status=excluded.sync_status,last_synced_at=excluded.last_synced_at,validation_status=excluded.validation_status,validation_issues_json=excluded.validation_issues_json`)
      .run(mapped.submissionId,mapped.formId,link.dealer_id,link.campaign_id,link.id,internal.id,collectionStatus,mapped.submittedAt,mapped.updatedAt,cleanJson(payload),cleanJson(mapped),"SYNCED",now,mapped.issues.length ? "NEEDS_REVIEW" : "VALID",cleanJson(mapped.issues));
    database.prepare("INSERT INTO audit_events(dealer_id,campaign_id,event_type,actor,payload) VALUES(?,?,?,?,?)")
      .run(link.dealer_id,link.campaign_id,existing ? "jotform_webhook_replayed" : "jotform_submission_received","Jotform",cleanJson({ submissionId:mapped.submissionId,issues:mapped.issues.length }));
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return { duplicate:Boolean(existing),submissionId:mapped.submissionId,dealerId:link.dealer_id,campaignId:link.campaign_id,status:collectionStatus,values:mapped.values.length,issues:mapped.issues };
}

export async function syncSubmissions(database, config, fetchImpl = fetch) {
  if (config.mode === "demo") {
    database.prepare("INSERT INTO audit_events(event_type,actor,payload) VALUES(?,?,?)").run("jotform_sync_demo","JET Admin",JSON.stringify({ found:0,existing:0,imported:0,updated:0,errors:0 }));
    return { mode:"demo",found:0,existing:0,imported:0,updated:0,errors:0 };
  }
  const submissions = await fetchFormSubmissions(config,fetchImpl);
  const summary = { mode:"live",found:submissions.length,existing:0,imported:0,updated:0,errors:0 };
  for (const submission of submissions) {
    try {
      const existed = database.prepare("SELECT 1 FROM jotform_submissions WHERE jotform_submission_id=?").get(String(submission.id));
      persistJotformSubmission(database,submission,config);
      if (existed) { summary.existing += 1; summary.updated += 1; } else summary.imported += 1;
    } catch (error) {
      summary.errors += 1;
      database.prepare("INSERT INTO audit_events(event_type,actor,payload) VALUES(?,?,?)").run("jotform_sync_error","system",cleanJson({ submissionId:String(submission?.id || ""),message:error.message }));
    }
  }
  database.prepare("INSERT INTO audit_events(event_type,actor,payload) VALUES(?,?,?)").run("jotform_sync_completed","JET Admin",JSON.stringify(summary));
  return summary;
}
