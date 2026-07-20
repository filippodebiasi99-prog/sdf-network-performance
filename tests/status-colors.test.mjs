import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const portal=readFileSync(new URL("../portal.js",import.meta.url),"utf8");
const styles=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const overrides=readFileSync(new URL("../design-overrides.css",import.meta.url),"utf8");

test("collection states use one semantic class mapping everywhere",()=>{
  assert.match(portal,/status === "VALIDATED"\) return "complete"/);
  assert.match(portal,/\["SUBMITTED","NEEDS_REVIEW"\]\.includes\(status\)\) return "verify"/);
  assert.match(portal,/\["DRAFT","REOPENED"\]\.includes\(status\)\) return "draft"/);
  assert.match(portal,/status-\$\{collectionStatusClass\(data\.submission\.collection_status\)\}/);
});

test("status colors stay consistent across badges, details and summaries",()=>{
  assert.match(styles,/\.badge\.complete \{ color:var\(--success\)/);
  assert.match(styles,/\.badge\.verify \{ color:var\(--warning\)/);
  assert.match(styles,/\.badge\.draft \{ color:var\(--danger\)/);
  assert.match(styles,/\.badge\.missing \{ color:#707985/);
  assert.match(overrides,/\.summary-cell\.status-complete \{ background: var\(--success\)/);
  assert.match(overrides,/\.summary-cell\.status-verify \{ background: var\(--accent\)/);
  assert.match(overrides,/\.summary-cell\.status-draft \{ background: var\(--danger\)/);
  assert.match(overrides,/\.summary-cell\.status-missing \{ background: #747572/);
});
