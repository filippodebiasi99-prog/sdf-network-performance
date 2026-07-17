/**
 * Central Jotform field mapping. Values are the Jotform "unique name" fields,
 * not labels and not frontend selectors. Update this file when the real form is built.
 */
export const jotformFieldMap = Object.freeze({
  metadata: Object.freeze({
    dealer_id: "dealerId",
    dealer_name: "dealerName",
    campaign_id: "campaignId",
    campaign_name: "campaignName",
    dealer_token: "dealerToken",
    period_start: "periodStart",
    period_end: "periodEnd"
  }),
  kpis: Object.freeze({
    company_revenue_total: "companyRevenueTotal",
    parts_revenue_total: "partsRevenueTotal",
    sdf_parts_revenue_total: "sdfPartsRevenueTotal",
    parts_average_cost: "partsAverageCost",
    sdf_parts_average_cost: "sdfPartsAverageCost",
    external_parts_revenue_total: "externalPartsRevenueTotal",
    external_sdf_parts_revenue_total: "externalSdfPartsRevenueTotal",
    inventory_end_value: "inventoryEndValue",
    urgent_parts_orders_pct: "urgentPartsOrdersPct",
    workshop_labor_rate: "workshopLaborRate",
    field_labor_rate: "fieldLaborRate",
    inventory_turnover: "inventoryTurnover",
    technician_presence_hours: "technicianPresenceHours",
    workshop_worked_hours_total: "workshopWorkedHoursTotal",
    customer_sold_hours_total: "customerSoldHoursTotal"
  })
});
