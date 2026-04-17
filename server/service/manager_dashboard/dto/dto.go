package dto

type ActivationCodeTypeMetricDTO struct {
	TypeID              uint64 `json:"typeId"`
	TypeName            string `json:"typeName"`
	DurationDays        int    `json:"durationDays"`
	Price               string `json:"price"`
	TodayConsumeAmount  string `json:"todayConsumeAmount"`
	TodayGeneratedCount int64  `json:"todayGeneratedCount"`
	TodayActivatedCount int64  `json:"todayActivatedCount"`
}

type ShopCategoryMetricDTO struct {
	CategoryCode string `json:"categoryCode"`
	CategoryName string `json:"categoryName"`
	Count        int64  `json:"count"`
}

type ManagerDashboardOverviewDTO struct {
	GeneratedAt                    string                         `json:"generatedAt"`
	TodayStart                     string                         `json:"todayStart"`
	TodayConsumeAmount             string                         `json:"todayConsumeAmount"`
	TodayGeneratedActivationCodes  int64                          `json:"todayGeneratedActivationCodes"`
	TodayActivatedActivationCodes  int64                          `json:"todayActivatedActivationCodes"`
	ActivationCodeTodayByType      []*ActivationCodeTypeMetricDTO `json:"activationCodeTodayByType"`
	TodayPublishedProductCount     int64                          `json:"todayPublishedProductCount"`
	TodayCollectedCount            int64                          `json:"todayCollectedCount"`
	TodayCollectedByShopCategory   []*ShopCategoryMetricDTO       `json:"todayCollectedByShopCategory"`
	TodayNewShopCount              int64                          `json:"todayNewShopCount"`
	TodayNewShopByCategory         []*ShopCategoryMetricDTO       `json:"todayNewShopByCategory"`
	TodayNewRegisteredAccountCount int64                          `json:"todayNewRegisteredAccountCount"`
	TotalUserCount                 int64                          `json:"totalUserCount"`
	TotalShopCount                 int64                          `json:"totalShopCount"`
	TotalShopByCategory            []*ShopCategoryMetricDTO       `json:"totalShopByCategory"`
}
