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
    revenue: "revenueTotal",
    margin: "operatingMargin",
    machines: "unitsSold",
    parts_share: "partsRevenueShare",
    active_customers: "activeCustomers",
    quote_conversion: "quotesConversion",
    response_hours: "responseHours",
    customer_satisfaction: "customerSatisfaction",
    service_incidence: "serviceRevenueShare",
    annual_growth: "annualGrowth",
    workshop_utilization: "workshopUtilization",
    service_revenue: "serviceRevenue",
    parts_revenue: "partsRevenue",
    inventory_turns: "inventoryTurns",
    lead_conversion: "leadConversion",
    training_hours: "trainingHours",
    used_machine_share: "usedMachineShare",
    average_stock_age: "averageStockAge",
    service_satisfaction: "serviceSatisfaction",
    warranty_hours_ratio: "warrantyHoursRatio"
  })
});
