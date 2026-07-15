import { jotformFieldMap } from "../../config/jotform-field-map.js";

export function getJotformConfig(env = process.env) {
  const mode = String(env.JOTFORM_MODE || "demo").toLowerCase() === "live" ? "live" : "demo";
  return {
    mode,
    formId: String(env.JOTFORM_FORM_ID || "").trim(),
    apiKey: String(env.JOTFORM_API_KEY || "").trim(),
    webhookSecret: String(env.JOTFORM_WEBHOOK_SECRET || "").trim(),
    baseUrl: String(env.JOTFORM_BASE_URL || "https://form.jotform.com").replace(/\/$/, ""),
    apiBaseUrl: String(env.JOTFORM_API_BASE_URL || "https://api.jotform.com").replace(/\/$/, ""),
    publicUrl: String(env.APP_PUBLIC_URL || "http://127.0.0.1:4173").replace(/\/$/, ""),
    linkSecret: String(env.DEALER_LINK_SECRET || env.JOTFORM_WEBHOOK_SECRET || "sdf-demo-link-secret-change-in-production"),
    fieldMap: jotformFieldMap,
    liveReady: mode === "live" && Boolean(env.JOTFORM_FORM_ID && env.JOTFORM_API_KEY && env.JOTFORM_WEBHOOK_SECRET)
  };
}

