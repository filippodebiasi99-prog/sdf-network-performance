import { getJotformConfig } from "./config.js";

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return value.answer ?? value.value ?? Object.values(value).join(" ");
  return value;
}

export function buildEmbedUrl(context, config = getJotformConfig()) {
  if (!config.formId) return null;
  const url = new URL(`${config.baseUrl}/${encodeURIComponent(config.formId)}`);
  const values = {
    dealer_id:context.dealerId,
    dealer_name:context.dealerName,
    campaign_id:context.campaignId,
    campaign_name:context.campaignName,
    dealer_token:context.dealerToken,
    period_start:context.periodStart,
    period_end:context.periodEnd
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) url.searchParams.set(config.fieldMap.metadata[key], String(value));
  }
  return url.toString();
}

export function parseWebhook(body) {
  const raw = typeof body.rawRequest === "string" ? JSON.parse(body.rawRequest) : (body.rawRequest || body);
  return {
    submissionId:String(body.submissionID || body.submissionId || raw.submissionID || raw.id || ""),
    formId:String(body.formID || body.formId || raw.formID || raw.form_id || ""),
    raw
  };
}

export function readSubmissionField(submission, uniqueName) {
  const content = submission?.content || submission;
  const raw = content?.rawRequest || content?.raw || content || {};
  if (raw[uniqueName] !== undefined) return scalar(raw[uniqueName]);
  const answers = content?.answers || raw.answers || {};
  if (answers[uniqueName] !== undefined) return scalar(answers[uniqueName]);
  for (const answer of Object.values(answers)) {
    if (answer?.name === uniqueName || answer?.uniqueName === uniqueName) return scalar(answer.answer);
  }
  return null;
}

export function normalizeSubmission(submission, config = getJotformConfig()) {
  const metadata = Object.fromEntries(Object.entries(config.fieldMap.metadata).map(([key,name]) => [key,readSubmissionField(submission,name)]));
  const kpis = Object.fromEntries(Object.entries(config.fieldMap.kpis).map(([code,name]) => [code,readSubmissionField(submission,name)]));
  const content = submission?.content || submission;
  return {
    submissionId:String(content?.id || submission?.submissionId || submission?.submissionID || ""),
    formId:String(content?.form_id || content?.formID || submission?.formId || submission?.formID || ""),
    submittedAt:content?.created_at || content?.submittedAt || new Date().toISOString(),
    updatedAt:content?.updated_at || content?.updatedAt || new Date().toISOString(),
    metadata,
    kpis
  };
}

export function mapSubmissionToKpis(submission, definitions, config = getJotformConfig()) {
  const normalized = normalizeSubmission(submission,config);
  const byCode = new Map(definitions.map((item) => [item.code,item]));
  const values = [];
  const issues = [];
  for (const [code, raw] of Object.entries(normalized.kpis)) {
    const definition = byCode.get(code);
    if (!definition || raw === null || raw === "") continue;
    const number = Number(String(raw).replace(",","."));
    if (!Number.isFinite(number)) { issues.push({ code, message:"Valore KPI non numerico" }); continue; }
    if (definition.min_value !== null && number < definition.min_value) issues.push({ code, message:`Valore inferiore al minimo ${definition.min_value}` });
    else if (definition.max_value !== null && number > definition.max_value) issues.push({ code, message:`Valore superiore al massimo ${definition.max_value}` });
    else values.push({ kpiId:definition.id,code,value:number,unit:definition.unit });
  }
  const legacyRequiredCodes = new Set(["revenue","margin","machines","parts_share","active_customers","quote_conversion","response_hours","customer_satisfaction","service_incidence","annual_growth"]);
  for (const definition of definitions.filter((item) => legacyRequiredCodes.has(item.code))) {
    if (!values.some((item) => item.kpiId === definition.id)) issues.push({ code:definition.code,message:"KPI obbligatorio mancante" });
  }
  return { ...normalized, values, issues };
}

async function apiRequest(path, config, fetchImpl) {
  const url = new URL(`${config.apiBaseUrl}${path}`);
  url.searchParams.set("apiKey",config.apiKey);
  const response = await fetchImpl(url,{ headers:{ accept:"application/json" } });
  if (!response.ok) throw Object.assign(new Error(`Jotform API: HTTP ${response.status}`),{ status:502 });
  const payload = await response.json();
  if (payload.responseCode && payload.responseCode !== 200) throw Object.assign(new Error(payload.message || "Risposta Jotform non valida"),{ status:502 });
  return payload.content ?? payload;
}

export function fetchSubmission(submissionId, config = getJotformConfig(), fetchImpl = fetch) {
  if (!config.apiKey) throw Object.assign(new Error("JOTFORM_API_KEY non configurata"),{ status:503 });
  return apiRequest(`/submission/${encodeURIComponent(submissionId)}`,config,fetchImpl);
}

export function fetchFormSubmissions(config = getJotformConfig(), fetchImpl = fetch) {
  if (!config.formId || !config.apiKey) throw Object.assign(new Error("Credenziali Jotform incomplete"),{ status:503 });
  return apiRequest(`/form/${encodeURIComponent(config.formId)}/submissions`,config,fetchImpl);
}
