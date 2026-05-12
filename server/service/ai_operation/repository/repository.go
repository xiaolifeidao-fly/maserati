package repository

import (
	"common/middleware/db"
	"fmt"
	aiOperationDTO "service/ai_operation/dto"
	"strings"

	"gorm.io/gorm"
)

type AiOperationRobotRepository struct {
	db.Repository[*AiOperationRobot]
}

func (r *AiOperationRobotRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AiOperationRobot{})
}

func (r *AiOperationRobotRepository) CountByQuery(query aiOperationDTO.AiOperationRobotQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.buildQuery(query)
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *AiOperationRobotRepository) ListByQuery(query aiOperationDTO.AiOperationRobotQueryDTO, pageIndex, pageSize int) ([]*AiOperationRobot, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*AiOperationRobot
	err := r.buildQuery(query).
		Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	if err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *AiOperationRobotRepository) FindByCode(code string) (*AiOperationRobot, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity AiOperationRobot
	err := r.Db.Where("active = ? AND code = ?", 1, strings.TrimSpace(code)).
		Order("id DESC").
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *AiOperationRobotRepository) buildQuery(query aiOperationDTO.AiOperationRobotQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&AiOperationRobot{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Search); value != "" {
		likeValue := "%" + value + "%"
		dbQuery = dbQuery.Where("(name LIKE ? OR code LIKE ? OR remark LIKE ?)", likeValue, likeValue, likeValue)
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", strings.ToUpper(value))
	}
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.PublishShopID > 0 {
		dbQuery = dbQuery.Where("publish_shop_id = ?", query.PublishShopID)
	}
	if query.CollectAppUserID > 0 {
		dbQuery = dbQuery.Where("collect_app_user_id = ?", query.CollectAppUserID)
	}
	return dbQuery
}
