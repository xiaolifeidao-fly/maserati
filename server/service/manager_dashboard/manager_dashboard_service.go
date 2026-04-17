package manager_dashboard

import (
	"common/middleware/db"
	"fmt"
	"math/big"
	managerDashboardDTO "service/manager_dashboard/dto"
	"strings"
	"time"
)

type ManagerDashboardService struct{}

type activationCodeTypeMetricRow struct {
	TypeID              uint64 `gorm:"column:type_id"`
	TypeName            string `gorm:"column:type_name"`
	DurationDays        int    `gorm:"column:duration_days"`
	Price               string `gorm:"column:price"`
	TodayConsumeAmount  string `gorm:"column:today_consume_amount"`
	TodayGeneratedCount int64  `gorm:"column:today_generated_count"`
	TodayActivatedCount int64  `gorm:"column:today_activated_count"`
}

type shopCategoryMetricRow struct {
	CategoryCode string `gorm:"column:category_code"`
	CategoryName string `gorm:"column:category_name"`
	Count        int64  `gorm:"column:count"`
}

func NewManagerDashboardService() *ManagerDashboardService {
	return &ManagerDashboardService{}
}

func (s *ManagerDashboardService) GetOverview() (*managerDashboardDTO.ManagerDashboardOverviewDTO, error) {
	if db.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	tomorrowStart := todayStart.AddDate(0, 0, 1)

	activationRows, err := s.listActivationCodeTypeMetrics(todayStart, tomorrowStart)
	if err != nil {
		return nil, err
	}
	collectedRows, err := s.listTodayCollectedByShopCategory(todayStart, tomorrowStart)
	if err != nil {
		return nil, err
	}
	newShopRows, err := s.listTodayNewShopByCategory(todayStart, tomorrowStart)
	if err != nil {
		return nil, err
	}
	totalShopRows, err := s.listTotalShopByCategory()
	if err != nil {
		return nil, err
	}

	todayPublishedProductCount, err := countActiveByCreatedWindow("product", todayStart, tomorrowStart)
	if err != nil {
		return nil, err
	}
	todayNewRegisteredAccountCount, err := countActiveByCreatedWindow("app_user", todayStart, tomorrowStart)
	if err != nil {
		return nil, err
	}
	totalUserCount, err := countActive("app_user")
	if err != nil {
		return nil, err
	}

	overview := &managerDashboardDTO.ManagerDashboardOverviewDTO{
		GeneratedAt:                    now.Format(time.RFC3339),
		TodayStart:                     todayStart.Format(time.RFC3339),
		ActivationCodeTodayByType:      toActivationCodeTypeMetrics(activationRows),
		TodayPublishedProductCount:     todayPublishedProductCount,
		TodayCollectedByShopCategory:   toShopCategoryMetrics(collectedRows),
		TodayNewShopByCategory:         toShopCategoryMetrics(newShopRows),
		TodayNewRegisteredAccountCount: todayNewRegisteredAccountCount,
		TotalUserCount:                 totalUserCount,
		TotalShopByCategory:            toShopCategoryMetrics(totalShopRows),
	}

	for _, item := range overview.ActivationCodeTodayByType {
		overview.TodayConsumeAmount = addDecimalStrings(overview.TodayConsumeAmount, item.TodayConsumeAmount)
		overview.TodayGeneratedActivationCodes += item.TodayGeneratedCount
		overview.TodayActivatedActivationCodes += item.TodayActivatedCount
	}
	overview.TodayCollectedCount = sumShopCategoryCount(overview.TodayCollectedByShopCategory)
	overview.TodayNewShopCount = sumShopCategoryCount(overview.TodayNewShopByCategory)
	overview.TotalShopCount = sumShopCategoryCount(overview.TotalShopByCategory)
	overview.TodayConsumeAmount = normalizeDecimalString(overview.TodayConsumeAmount)

	return overview, nil
}

func (s *ManagerDashboardService) listActivationCodeTypeMetrics(todayStart, tomorrowStart time.Time) ([]activationCodeTypeMetricRow, error) {
	var rows []activationCodeTypeMetricRow
	err := db.Db.Raw(`
SELECT
	pact.id AS type_id,
	pact.name AS type_name,
	pact.duration_days AS duration_days,
	pact.price AS price,
	COALESCE(SUM(CASE WHEN pacb.created_time >= ? AND pacb.created_time < ? THEN pacb.actual_consume ELSE 0 END), 0) AS today_consume_amount,
	COALESCE(gen_stats.today_generated_count, 0) AS today_generated_count,
	COALESCE(activated.today_activated_count, 0) AS today_activated_count
FROM product_activation_code_type pact
LEFT JOIN product_activation_code_batch pacb
	ON pacb.type_id = pact.id AND pacb.active = 1
LEFT JOIN (
	SELECT type_id, COUNT(1) AS today_generated_count
	FROM product_activation_code_detail
	WHERE active = 1
		AND created_time >= ?
		AND created_time < ?
	GROUP BY type_id
) gen_stats ON gen_stats.type_id = pact.id
LEFT JOIN (
	SELECT type_id, COUNT(1) AS today_activated_count
	FROM product_activation_code_detail
	WHERE active = 1
		AND status = 'ACTIVATED'
		AND COALESCE(start_time, updated_time) >= ?
		AND COALESCE(start_time, updated_time) < ?
	GROUP BY type_id
) activated ON activated.type_id = pact.id
WHERE pact.active = 1
GROUP BY pact.id, pact.name, pact.duration_days, pact.price, gen_stats.today_generated_count, activated.today_activated_count
ORDER BY today_consume_amount DESC, pact.id DESC
`, todayStart, tomorrowStart, todayStart, tomorrowStart, todayStart, tomorrowStart).Scan(&rows).Error
	return rows, err
}

func (s *ManagerDashboardService) listTodayCollectedByShopCategory(todayStart, tomorrowStart time.Time) ([]shopCategoryMetricRow, error) {
	var rows []shopCategoryMetricRow
	err := db.Db.Raw(`
SELECT
	COALESCE(NULLIF(s.shop_type_code, ''), NULLIF(s.platform, ''), 'uncategorized') AS category_code,
	COALESCE(NULLIF(s.shop_type_code, ''), NULLIF(s.platform, ''), '未分类') AS category_name,
	COUNT(1) AS count
FROM collect_record cr
LEFT JOIN collect_batch cb ON cb.id = cr.collect_batch_id AND cb.active = 1
LEFT JOIN shop s ON s.id = cb.shop_id AND s.active = 1
WHERE cr.active = 1
	AND cr.created_time >= ?
	AND cr.created_time < ?
GROUP BY category_code, category_name
ORDER BY count DESC, category_name ASC
`, todayStart, tomorrowStart).Scan(&rows).Error
	return rows, err
}

func (s *ManagerDashboardService) listTodayNewShopByCategory(todayStart, tomorrowStart time.Time) ([]shopCategoryMetricRow, error) {
	var rows []shopCategoryMetricRow
	err := db.Db.Raw(shopCategorySQL("WHERE active = 1 AND created_time >= ? AND created_time < ?"), todayStart, tomorrowStart).Scan(&rows).Error
	return rows, err
}

func (s *ManagerDashboardService) listTotalShopByCategory() ([]shopCategoryMetricRow, error) {
	var rows []shopCategoryMetricRow
	err := db.Db.Raw(shopCategorySQL("WHERE active = 1")).Scan(&rows).Error
	return rows, err
}

func shopCategorySQL(whereClause string) string {
	return `
SELECT
	COALESCE(NULLIF(shop_type_code, ''), NULLIF(platform, ''), 'uncategorized') AS category_code,
	COALESCE(NULLIF(shop_type_code, ''), NULLIF(platform, ''), '未分类') AS category_name,
	COUNT(1) AS count
FROM shop
` + whereClause + `
GROUP BY category_code, category_name
ORDER BY count DESC, category_name ASC
`
}

func countActiveByCreatedWindow(tableName string, todayStart, tomorrowStart time.Time) (int64, error) {
	var count int64
	err := db.Db.Table(tableName).
		Where("active = ?", 1).
		Where("created_time >= ? AND created_time < ?", todayStart, tomorrowStart).
		Count(&count).Error
	return count, err
}

func countActive(tableName string) (int64, error) {
	var count int64
	err := db.Db.Table(tableName).Where("active = ?", 1).Count(&count).Error
	return count, err
}

func toActivationCodeTypeMetrics(rows []activationCodeTypeMetricRow) []*managerDashboardDTO.ActivationCodeTypeMetricDTO {
	result := make([]*managerDashboardDTO.ActivationCodeTypeMetricDTO, 0, len(rows))
	for _, row := range rows {
		result = append(result, &managerDashboardDTO.ActivationCodeTypeMetricDTO{
			TypeID:              row.TypeID,
			TypeName:            row.TypeName,
			DurationDays:        row.DurationDays,
			Price:               normalizeDecimalString(row.Price),
			TodayConsumeAmount:  normalizeDecimalString(row.TodayConsumeAmount),
			TodayGeneratedCount: row.TodayGeneratedCount,
			TodayActivatedCount: row.TodayActivatedCount,
		})
	}
	return result
}

func toShopCategoryMetrics(rows []shopCategoryMetricRow) []*managerDashboardDTO.ShopCategoryMetricDTO {
	result := make([]*managerDashboardDTO.ShopCategoryMetricDTO, 0, len(rows))
	for _, row := range rows {
		result = append(result, &managerDashboardDTO.ShopCategoryMetricDTO{
			CategoryCode: row.CategoryCode,
			CategoryName: row.CategoryName,
			Count:        row.Count,
		})
	}
	return result
}

func sumShopCategoryCount(items []*managerDashboardDTO.ShopCategoryMetricDTO) int64 {
	var total int64
	for _, item := range items {
		total += item.Count
	}
	return total
}

func normalizeDecimalString(value string) string {
	if value == "" {
		return "0.00"
	}
	return value
}

func addDecimalStrings(left string, right string) string {
	leftValue, ok := new(big.Rat).SetString(defaultDecimalInput(left))
	if !ok {
		leftValue = new(big.Rat)
	}
	rightValue, ok := new(big.Rat).SetString(defaultDecimalInput(right))
	if !ok {
		rightValue = new(big.Rat)
	}
	return new(big.Rat).Add(leftValue, rightValue).FloatString(2)
}

func defaultDecimalInput(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0"
	}
	return value
}
