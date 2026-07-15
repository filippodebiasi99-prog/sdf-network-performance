export const QUESTIONNAIRE_VERSION = "demo-v1";

const field = (definition) => Object.freeze({
  type:"decimal",unit:"",required:true,min:0,max:null,decimals:0,placeholder:"0",validation:"NON_NEGATIVE",active:true,...definition
});

export const questionnaireFields = Object.freeze([
  field({code:"revenue_total",label:"Fatturato totale",description:"Fatturato complessivo del periodo di rilevazione.",section:"Performance commerciale",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 4.500.000",order:1}),
  field({code:"revenue_target",label:"Obiettivo fatturato",description:"Obiettivo di fatturato assegnato per il periodo.",section:"Performance commerciale",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 4.800.000",order:2}),
  field({code:"units_sold",label:"Unità vendute",description:"Totale macchine vendute nel periodo.",section:"Performance commerciale",type:"integer",unit:"unità",order:3}),
  field({code:"new_units_sold",label:"Macchine nuove vendute",description:"Numero di macchine nuove vendute.",section:"Performance commerciale",type:"integer",unit:"unità",order:4}),
  field({code:"used_units_sold",label:"Macchine usate vendute",description:"Numero di macchine usate vendute.",section:"Performance commerciale",type:"integer",unit:"unità",order:5}),
  field({code:"quotes_issued",label:"Preventivi emessi",description:"Preventivi commerciali emessi nel periodo.",section:"Performance commerciale",type:"integer",unit:"preventivi",order:6}),
  field({code:"orders_acquired",label:"Ordini acquisiti",description:"Ordini cliente acquisiti nel periodo.",section:"Performance commerciale",type:"integer",unit:"ordini",order:7}),
  field({code:"active_customers",label:"Clienti attivi",description:"Clienti con almeno un'attività nel periodo.",section:"Performance commerciale",type:"integer",unit:"clienti",order:8}),

  field({code:"parts_revenue",label:"Ricavi ricambi",description:"Ricavi generati dalla vendita di ricambi.",section:"Ricambi",type:"currency",unit:"EUR",decimals:2,order:9}),
  field({code:"parts_target",label:"Obiettivo ricambi",description:"Obiettivo ricavi del reparto ricambi.",section:"Ricambi",type:"currency",unit:"EUR",decimals:2,order:10}),
  field({code:"parts_orders",label:"Ordini ricambi",description:"Numero di ordini ricambi gestiti.",section:"Ricambi",type:"integer",unit:"ordini",order:11}),
  field({code:"lost_parts_sales",label:"Vendite ricambi perse",description:"Valore stimato delle vendite ricambi non concluse.",section:"Ricambi",type:"currency",unit:"EUR",decimals:2,order:12}),

  field({code:"service_revenue",label:"Ricavi assistenza",description:"Ricavi complessivi di assistenza e officina.",section:"Assistenza e officina",type:"currency",unit:"EUR",decimals:2,order:13}),
  field({code:"workshop_available_hours",label:"Ore disponibili officina",description:"Ore complessivamente disponibili nel periodo.",section:"Assistenza e officina",type:"hours",unit:"ore",decimals:1,order:14}),
  field({code:"workshop_worked_hours",label:"Ore lavorate officina",description:"Ore effettivamente lavorate nel periodo.",section:"Assistenza e officina",type:"hours",unit:"ore",decimals:1,order:15}),
  field({code:"workshop_billed_hours",label:"Ore fatturate officina",description:"Ore addebitate ai clienti nel periodo.",section:"Assistenza e officina",type:"hours",unit:"ore",decimals:1,order:16}),
  field({code:"work_orders",label:"Ordini di lavoro",description:"Numero di ordini di lavoro chiusi o fatturati.",section:"Assistenza e officina",type:"integer",unit:"ordini",order:17}),
  field({code:"warranty_hours",label:"Ore in garanzia",description:"Ore lavorate su interventi in garanzia.",section:"Assistenza e officina",type:"hours",unit:"ore",decimals:1,order:18}),

  field({code:"customer_satisfaction",label:"Soddisfazione cliente",description:"Valutazione media della soddisfazione clienti.",section:"Soddisfazione e rete",type:"score",unit:"/10",max:10,decimals:1,placeholder:"es. 8,5",order:19}),
  field({code:"employees_total",label:"Dipendenti totali",description:"Numero complessivo di dipendenti del concessionario.",section:"Soddisfazione e rete",type:"integer",unit:"persone",order:20})
]);

const derived = (definition) => Object.freeze({ derived:true,active:true,required:false,type:"decimal",decimals:2,direction:"NEUTRAL",...definition });

export const derivedKpiDefinitions = Object.freeze([
  derived({code:"TOTAL_UNITS_SOLD",label:"Totale unità calcolato",description:"Macchine nuove più macchine usate.",section:"KPI derivati",unit:"unità",requiredMetrics:["new_units_sold","used_units_sold"],formulaVersion:"demo-v1.0",order:101}),
  derived({code:"QUOTE_TO_ORDER_CONVERSION",label:"Conversione preventivi",description:"Ordini acquisiti sui preventivi emessi.",section:"KPI derivati",type:"percentage",unit:"%",requiredMetrics:["orders_acquired","quotes_issued"],formulaVersion:"demo-v1.0",order:102}),
  derived({code:"REVENUE_TARGET_ACHIEVEMENT",label:"Raggiungimento obiettivo fatturato",description:"Fatturato totale sull'obiettivo di fatturato.",section:"KPI derivati",type:"percentage",unit:"%",requiredMetrics:["revenue_total","revenue_target"],formulaVersion:"demo-v1.0",order:103}),
  derived({code:"PARTS_TARGET_ACHIEVEMENT",label:"Raggiungimento obiettivo ricambi",description:"Ricavi ricambi sull'obiettivo ricambi.",section:"KPI derivati",type:"percentage",unit:"%",requiredMetrics:["parts_revenue","parts_target"],formulaVersion:"demo-v1.0",order:104}),
  derived({code:"WORKSHOP_UTILIZATION",label:"Utilizzo officina",description:"Ore lavorate sulle ore disponibili.",section:"KPI derivati",type:"percentage",unit:"%",requiredMetrics:["workshop_worked_hours","workshop_available_hours"],formulaVersion:"demo-v1.0",order:105}),
  derived({code:"WORKSHOP_BILLING_EFFICIENCY",label:"Efficienza fatturazione officina",description:"Ore fatturate sulle ore lavorate.",section:"KPI derivati",type:"percentage",unit:"%",requiredMetrics:["workshop_billed_hours","workshop_worked_hours"],formulaVersion:"demo-v1.0",order:106}),
  derived({code:"REVENUE_PER_UNIT",label:"Ricavo per unità",description:"Fatturato totale per unità venduta.",section:"KPI derivati",type:"currency",unit:"EUR/unità",requiredMetrics:["revenue_total","units_sold"],formulaVersion:"demo-v1.0",order:107}),
  derived({code:"SERVICE_REVENUE_PER_WORK_ORDER",label:"Ricavo assistenza per ordine",description:"Ricavi assistenza per ordine di lavoro.",section:"KPI derivati",type:"currency",unit:"EUR/ordine",requiredMetrics:["service_revenue","work_orders"],formulaVersion:"demo-v1.0",order:108})
]);

export const questionnaireSections = Object.freeze([...new Set(questionnaireFields.map((item) => item.section))]);

export function definitionId(code) {
  return `kpi-${code.toLowerCase().replaceAll("_","-")}`;
}

export function databaseDefinitions() {
  return [...questionnaireFields,...derivedKpiDefinitions].map((item) => ({
    id:definitionId(item.code),code:item.code,name:item.label,description:item.description,unit:item.unit,
    kind:item.type === "integer" ? "integer" : item.type === "currency" ? "currency" : item.type === "percentage" ? "percentage" : item.type === "score" ? "score" : item.type === "hours" ? "hours" : "decimal",
    required:item.required ? 1 : 0,min_value:item.min ?? null,max_value:item.max ?? null,sort_order:item.order,
    section:item.section,decimals:item.decimals,placeholder:item.placeholder || "",validation:item.validation || "",active:item.active ? 1 : 0,derived:item.derived ? 1 : 0,
    questionnaire_version:QUESTIONNAIRE_VERSION,formula_version:item.formulaVersion || null,required_metrics:JSON.stringify(item.requiredMetrics || [])
  }));
}

function normalizeNumber(raw) {
  if (typeof raw === "number") return raw;
  const text=String(raw).trim().replace(/\s/g,"");
  const normalized=text.includes(",") ? text.replace(/\./g,"").replace(",",".") : text;
  return Number(normalized);
}

export function validateQuestionnaire(inputValues, { finalSubmit = false } = {}) {
  const values={}; const errors={};
  for (const item of questionnaireFields.filter((entry)=>entry.active)) {
    const raw=inputValues?.[item.code] ?? inputValues?.[definitionId(item.code)];
    if (raw === "" || raw === null || raw === undefined) {
      if (finalSubmit && item.required) errors[item.code]="Campo obbligatorio";
      continue;
    }
    const value=normalizeNumber(raw);
    if (!Number.isFinite(value)) { errors[item.code]="Inserire un numero valido"; continue; }
    if (item.min !== null && value < item.min) { errors[item.code]=`Il valore minimo è ${item.min}`; continue; }
    if (item.max !== null && value > item.max) { errors[item.code]=`Il valore massimo è ${item.max}`; continue; }
    if (item.type === "integer" && !Number.isInteger(value)) { errors[item.code]="Inserire un numero intero"; continue; }
    values[item.code]=value;
  }
  return { values,errors };
}

const divide=(numerator,denominator,multiplier=1)=>Number.isFinite(numerator)&&Number.isFinite(denominator)&&denominator!==0 ? numerator/denominator*multiplier : null;

export function calculateDerivedKpis(values) {
  const results={
    TOTAL_UNITS_SOLD:Number.isFinite(values.new_units_sold)&&Number.isFinite(values.used_units_sold) ? values.new_units_sold+values.used_units_sold : null,
    QUOTE_TO_ORDER_CONVERSION:divide(values.orders_acquired,values.quotes_issued,100),
    REVENUE_TARGET_ACHIEVEMENT:divide(values.revenue_total,values.revenue_target,100),
    PARTS_TARGET_ACHIEVEMENT:divide(values.parts_revenue,values.parts_target,100),
    WORKSHOP_UTILIZATION:divide(values.workshop_worked_hours,values.workshop_available_hours,100),
    WORKSHOP_BILLING_EFFICIENCY:divide(values.workshop_billed_hours,values.workshop_worked_hours,100),
    REVENUE_PER_UNIT:divide(values.revenue_total,values.units_sold),
    SERVICE_REVENUE_PER_WORK_ORDER:divide(values.service_revenue,values.work_orders)
  };
  return Object.fromEntries(Object.entries(results).filter(([,value])=>Number.isFinite(value)));
}

export function questionnaireWarnings(values) {
  const warnings=[];
  if (Number.isFinite(values.units_sold)&&Number.isFinite(values.new_units_sold)&&Number.isFinite(values.used_units_sold)&&values.units_sold!==values.new_units_sold+values.used_units_sold) warnings.push("Il totale unità non coincide con nuove più usate");
  if (values.orders_acquired>values.quotes_issued) warnings.push("Gli ordini acquisiti superano i preventivi emessi");
  if (values.workshop_billed_hours>values.workshop_worked_hours*1.2) warnings.push("Le ore fatturate superano sensibilmente le ore lavorate");
  if (values.warranty_hours>values.workshop_worked_hours) warnings.push("Le ore in garanzia superano le ore lavorate");
  return warnings;
}
