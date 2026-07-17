export const QUESTIONNAIRE_VERSION = "sdf-client-v1";

const field = (definition) => Object.freeze({
  type:"decimal",unit:"",required:true,min:0,max:null,decimals:0,placeholder:"0",validation:"NON_NEGATIVE",referenceYearOffset:null,active:true,...definition
});

export const questionnaireFields = Object.freeze([
  field({code:"company_revenue_total",label:"Fatturato complessivo azienda",description:"Fatturato complessivo dell'azienda nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 4.500.000",referenceYearOffset:-1,order:1}),
  field({code:"parts_revenue_total",label:"Fatturato complessivo ricambi",description:"Fatturato complessivo generato dalla vendita di ricambi nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 1.200.000",referenceYearOffset:-1,order:2}),
  field({code:"sdf_parts_revenue_total",label:"Fatturato complessivo ricambi SDF",description:"Quota del fatturato ricambi attribuibile a prodotti SDF nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 750.000",referenceYearOffset:-1,order:3}),
  field({code:"parts_average_cost",label:"Costo medio ricambi complessivi venduti",description:"Costo medio dichiarato dei ricambi complessivamente venduti nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 95,00",referenceYearOffset:-1,order:4}),
  field({code:"sdf_parts_average_cost",label:"Costo medio ricambi SDF venduti",description:"Costo medio dichiarato dei ricambi SDF venduti nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 88,00",referenceYearOffset:-1,order:5}),
  field({code:"external_parts_revenue_total",label:"Fatturato vendite esterne ricambi",description:"Fatturato delle vendite ricambi effettuate all'esterno dell'officina nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 650.000",referenceYearOffset:-1,order:6}),
  field({code:"external_sdf_parts_revenue_total",label:"Fatturato vendite esterne ricambi SDF",description:"Quota delle vendite esterne ricambi attribuibile a prodotti SDF nell'anno di riferimento.",section:"Fatturato e ricambi",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 400.000",referenceYearOffset:-1,order:7}),

  field({code:"inventory_end_value",label:"Stock magazzino a fine anno",description:"Valore economico dello stock ricambi presente in magazzino alla chiusura dell'anno di riferimento.",section:"Magazzino e ordini",type:"currency",unit:"EUR",decimals:2,placeholder:"es. 420.000",referenceYearOffset:-1,order:8}),
  field({code:"urgent_parts_orders_pct",label:"Ordini urgenti ricambi",description:"Percentuale degli ordini ricambi gestiti come urgenti nell'anno di riferimento.",section:"Magazzino e ordini",type:"percentage",unit:"%",max:100,decimals:1,placeholder:"es. 12,5",referenceYearOffset:-1,order:9}),
  field({code:"inventory_turnover",label:"Rotazione del magazzino",description:"Indice di rotazione del magazzino dichiarato per l'anno di riferimento.",section:"Magazzino e ordini",type:"decimal",unit:"giri/anno",decimals:2,placeholder:"es. 3,40",referenceYearOffset:-1,order:10}),

  field({code:"workshop_labor_rate",label:"Tariffa manodopera in officina",description:"Tariffa oraria applicata per le attività svolte in officina.",section:"Tariffe e attività tecnica",type:"currency",unit:"EUR/ora",decimals:2,placeholder:"es. 65,00",order:11}),
  field({code:"field_labor_rate",label:"Tariffa manodopera in campo",description:"Tariffa oraria applicata per gli interventi tecnici svolti in campo.",section:"Tariffe e attività tecnica",type:"currency",unit:"EUR/ora",decimals:2,placeholder:"es. 82,00",order:12}),
  field({code:"technician_presence_hours",label:"Ore di presenza tecnici",description:"Ore complessive annuali di presenza dei tecnici.",section:"Tariffe e attività tecnica",type:"hours",unit:"ore",decimals:1,placeholder:"es. 12.000",referenceYearOffset:-1,order:13}),
  field({code:"workshop_worked_hours_total",label:"Ore lavorate",description:"Ore complessivamente lavorate dai tecnici nell'anno di riferimento.",section:"Tariffe e attività tecnica",type:"hours",unit:"ore",decimals:1,placeholder:"es. 9.500",referenceYearOffset:-1,order:14}),
  field({code:"customer_sold_hours_total",label:"Ore vendute a cliente",description:"Ore di manodopera vendute e fatturate ai clienti nell'anno di riferimento.",section:"Tariffe e attività tecnica",type:"hours",unit:"ore",decimals:1,placeholder:"es. 8.700",referenceYearOffset:-1,order:15})
]);

export const derivedKpiDefinitions = Object.freeze([]);

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

function normalizeNumber(raw,item) {
  if (typeof raw === "number") return raw;
  const text=String(raw).trim().replace(/\s/g,"");
  const italianThousands=["currency","hours","integer"].includes(item.type) && /^\d{1,3}(\.\d{3})+$/.test(text);
  const normalized=text.includes(",") ? text.replace(/\./g,"").replace(",",".") : italianThousands ? text.replace(/\./g,"") : text;
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
    const value=normalizeNumber(raw,item);
    if (!Number.isFinite(value)) { errors[item.code]="Inserire un numero valido"; continue; }
    if (item.min !== null && value < item.min) { errors[item.code]=`Il valore minimo è ${item.min}`; continue; }
    if (item.max !== null && value > item.max) { errors[item.code]=`Il valore massimo è ${item.max}`; continue; }
    if (item.type === "integer" && !Number.isInteger(value)) { errors[item.code]="Inserire un numero intero"; continue; }
    values[item.code]=value;
  }
  return { values,errors };
}

export function calculateDerivedKpis() {
  return {};
}

export function questionnaireWarnings(values) {
  const warnings=[];
  if (values.sdf_parts_revenue_total>values.parts_revenue_total) warnings.push("Il fatturato ricambi SDF supera il fatturato ricambi complessivo");
  if (values.external_parts_revenue_total>values.parts_revenue_total) warnings.push("Le vendite esterne ricambi superano il fatturato ricambi complessivo");
  if (values.external_sdf_parts_revenue_total>values.external_parts_revenue_total) warnings.push("Le vendite esterne ricambi SDF superano le vendite esterne ricambi complessive");
  if (values.workshop_worked_hours_total>values.technician_presence_hours) warnings.push("Le ore lavorate superano le ore di presenza dei tecnici");
  if (values.customer_sold_hours_total>values.workshop_worked_hours_total*1.2) warnings.push("Le ore vendute a cliente superano sensibilmente le ore lavorate");
  return warnings;
}
