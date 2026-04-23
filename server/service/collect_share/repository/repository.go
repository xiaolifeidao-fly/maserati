package repository

import (
	"common/middleware/db"
	"fmt"
	collectShareDTO "service/collect_share/dto"
	"strings"

	"gorm.io/gorm"
)

type CollectShareRepository struct{ db.Repository[*CollectShare] }

func (r *CollectShareRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&CollectShare{})
}

func (r *CollectShareRepository) FindByIdentity(batchID, ownerUserID, shareUserID uint64) (*CollectShare, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity CollectShare
	err := r.Db.Where(
		"collect_batch_id = ? AND owner_user_id = ? AND share_user_id = ? AND active = ?",
		batchID,
		ownerUserID,
		shareUserID,
		1,
	).Order("id DESC").First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *CollectShareRepository) HasActiveShare(batchID, shareUserID uint64) (bool, error) {
	if r.Db == nil {
		return false, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.Db.Model(&CollectShare{}).
		Where("collect_batch_id = ? AND share_user_id = ? AND active = ? AND status = ?", batchID, shareUserID, 1, "ACTIVE").
		Count(&total).Error
	return total > 0, err
}

func (r *CollectShareRepository) CountMine(ownerUserID uint64, query collectShareDTO.CollectShareQueryDTO) (int64, error) {
	dbQuery, err := r.buildMineQuery(ownerUserID, query)
	if err != nil {
		return 0, err
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *CollectShareRepository) ListMine(ownerUserID uint64, query collectShareDTO.CollectShareQueryDTO, pageIndex, pageSize int) ([]CollectShareListRow, error) {
	dbQuery, err := r.buildMineQuery(ownerUserID, query)
	if err != nil {
		return nil, err
	}
	var rows []CollectShareListRow
	err = dbQuery.Select(`
		collect_share.id,
		collect_share.active,
		collect_share.created_time,
		collect_share.updated_time,
		collect_share.created_by,
		collect_share.updated_by,
		collect_share.collect_batch_id,
		collect_share.owner_user_id,
		collect_share.share_user_id,
		collect_share.status,
		collect_batch.name AS batch_name,
		owner.username AS owner_username,
		share_user.username AS share_username
	`).Order("collect_share.id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Scan(&rows).Error
	return rows, err
}

func (r *CollectShareRepository) CountSharedToMe(shareUserID uint64, query collectShareDTO.CollectShareQueryDTO) (int64, error) {
	dbQuery, err := r.buildSharedToMeQuery(shareUserID, query)
	if err != nil {
		return 0, err
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *CollectShareRepository) ListSharedToMe(shareUserID uint64, query collectShareDTO.CollectShareQueryDTO, pageIndex, pageSize int) ([]SharedCollectBatchRow, error) {
	dbQuery, err := r.buildSharedToMeQuery(shareUserID, query)
	if err != nil {
		return nil, err
	}
	var rows []SharedCollectBatchRow
	err = dbQuery.Select(`
		collect_batch.id,
		collect_batch.active,
		collect_batch.created_time,
		collect_batch.updated_time,
		collect_batch.created_by,
		collect_batch.updated_by,
		collect_batch.app_user_id,
		collect_batch.shop_id,
		shop.platform,
		collect_batch.name,
		collect_batch.status,
		collect_batch.oss_url,
		collect_batch.collected_count,
		collect_share.id AS share_id,
		collect_share.status AS share_status,
		collect_share.owner_user_id,
		owner.username AS owner_username,
		collect_share.share_user_id,
		share_user.username AS share_username,
		DATE_FORMAT(collect_share.created_time, '%Y-%m-%d %H:%i:%s') AS share_created_time
	`).Order("collect_share.id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Scan(&rows).Error
	return rows, err
}

func (r *CollectShareRepository) buildMineQuery(ownerUserID uint64, query collectShareDTO.CollectShareQueryDTO) (*gorm.DB, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectShare{}).
		Joins("JOIN collect_batch ON collect_batch.id = collect_share.collect_batch_id AND collect_batch.active = ?", 1).
		Joins("LEFT JOIN app_user owner ON owner.id = collect_share.owner_user_id AND owner.active = ?", 1).
		Joins("LEFT JOIN app_user share_user ON share_user.id = collect_share.share_user_id AND share_user.active = ?", 1).
		Where("collect_share.active = ? AND collect_share.owner_user_id = ?", 1, ownerUserID)
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("collect_share.status = ?", strings.ToUpper(value))
	}
	if value := strings.TrimSpace(query.Keyword); value != "" {
		likeValue := "%" + value + "%"
		dbQuery = dbQuery.Where("(collect_batch.name LIKE ? OR share_user.username LIKE ?)", likeValue, likeValue)
	}
	return dbQuery, nil
}

func (r *CollectShareRepository) buildSharedToMeQuery(shareUserID uint64, query collectShareDTO.CollectShareQueryDTO) (*gorm.DB, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectShare{}).
		Joins("JOIN collect_batch ON collect_batch.id = collect_share.collect_batch_id AND collect_batch.active = ?", 1).
		Joins("LEFT JOIN shop ON shop.id = collect_batch.shop_id AND shop.active = ?", 1).
		Joins("LEFT JOIN app_user owner ON owner.id = collect_share.owner_user_id AND owner.active = ?", 1).
		Joins("LEFT JOIN app_user share_user ON share_user.id = collect_share.share_user_id AND share_user.active = ?", 1).
		Where("collect_share.active = ? AND collect_share.share_user_id = ? AND collect_share.status = ?", 1, shareUserID, "ACTIVE")
	if value := strings.TrimSpace(query.Keyword); value != "" {
		likeValue := "%" + value + "%"
		dbQuery = dbQuery.Where("(collect_batch.name LIKE ? OR owner.username LIKE ?)", likeValue, likeValue)
	}
	return dbQuery, nil
}
