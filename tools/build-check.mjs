import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = [
  "server.mjs","app.js","portal.js",
  "config/jotform-field-map.js",
  "integrations/jotform/config.js","integrations/jotform/index.js","integrations/jotform/link-tokens.js","integrations/jotform/service.js"
];

for (const file of files) {
  if (!existsSync(file)) throw new Error(`File richiesto mancante: ${file}`);
  const result = spawnSync(process.execPath,["--check",file],{ stdio:"inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Build check completato: ${files.length} file verificati.`);
