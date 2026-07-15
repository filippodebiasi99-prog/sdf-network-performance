import { db, initializeDatabase } from "../server.mjs";
import { demoDatasetSummary, resetDemoDataset } from "../demo/demo-dataset.js";

resetDemoDataset(db);
initializeDatabase(db);
const summary=demoDatasetSummary(db);
console.log(`Dataset demo ripristinato: ${summary.dealers} concessionari, ${summary.received} ricevute, ${summary.missing} non inviate, ${summary.completion}% completamento, ${summary.historical} rilevazioni storiche.`);
console.log(`Stati: ${summary.states.VALIDATED} VALIDATED, ${summary.states.SUBMITTED} SUBMITTED, ${summary.states.NEEDS_REVIEW} NEEDS_REVIEW, ${summary.states.DRAFT} DRAFT, ${summary.states.NOT_STARTED} NOT_STARTED.`);
db.close();
