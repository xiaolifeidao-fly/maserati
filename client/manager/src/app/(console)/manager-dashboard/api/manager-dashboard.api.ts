"use client";

import { getData } from "@/utils/axios";

export class ActivationCodeTypeMetricRecord {
  typeId = 0;

  typeName = "";

  durationDays = 0;

  price = "0.00";

  todayConsumeAmount = "0.00";

  todayGeneratedCount = 0;

  todayActivatedCount = 0;
}

export class ShopCategoryMetricRecord {
  categoryCode = "";

  categoryName = "";

  count = 0;
}

export class ManagerDashboardOverview {
  generatedAt = "";

  todayStart = "";

  todayConsumeAmount = "0.00";

  todayGeneratedActivationCodes = 0;

  todayActivatedActivationCodes = 0;

  activationCodeTodayByType: ActivationCodeTypeMetricRecord[] = [];

  todayPublishedProductCount = 0;

  todayCollectedCount = 0;

  todayCollectedByShopCategory: ShopCategoryMetricRecord[] = [];

  todayNewShopCount = 0;

  todayNewShopByCategory: ShopCategoryMetricRecord[] = [];

  todayNewRegisteredAccountCount = 0;

  totalUserCount = 0;

  totalShopCount = 0;

  totalShopByCategory: ShopCategoryMetricRecord[] = [];
}

export async function fetchManagerDashboardOverview() {
  return getData(ManagerDashboardOverview, "/manager-dashboard/overview");
}
