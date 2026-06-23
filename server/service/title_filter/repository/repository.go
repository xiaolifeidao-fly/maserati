package repository

import (
	"common/middleware/db"
	"fmt"
	"strings"

	titleFilterDTO "service/title_filter/dto"

	"gorm.io/gorm"
)

type TitleKeywordFilterRepository struct {
	db.Repository[*TitleKeywordFilter]
}

func (r *TitleKeywordFilterRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&TitleKeywordFilter{})
}

func (r *TitleKeywordFilterRepository) buildQuery(query titleFilterDTO.TitleFilterQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&TitleKeywordFilter{}).Where("active = ?", 1)
	if keyword := strings.TrimSpace(query.Keyword); keyword != "" {
		dbQuery = dbQuery.Where("keyword LIKE ?", "%"+keyword+"%")
	}
	return dbQuery
}

func (r *TitleKeywordFilterRepository) CountByQuery(query titleFilterDTO.TitleFilterQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	if err := r.buildQuery(query).Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *TitleKeywordFilterRepository) ListByQuery(query titleFilterDTO.TitleFilterQueryDTO, pageIndex, pageSize int) ([]*TitleKeywordFilter, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*TitleKeywordFilter
	if err := r.buildQuery(query).Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// ListActive 返回全部有效过滤规则，供客户端发布流程拉取。
func (r *TitleKeywordFilterRepository) ListActive() ([]*TitleKeywordFilter, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*TitleKeywordFilter
	if err := r.Db.Model(&TitleKeywordFilter{}).Where("active = ?", 1).Order("id DESC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// FindByKeyword 按关键词精确查找有效规则，用于去重。
func (r *TitleKeywordFilterRepository) FindByKeyword(keyword string) (*TitleKeywordFilter, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity TitleKeywordFilter
	err := r.Db.Model(&TitleKeywordFilter{}).Where("active = ? AND keyword = ?", 1, keyword).First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}
