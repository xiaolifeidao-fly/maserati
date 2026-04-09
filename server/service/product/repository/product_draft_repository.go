package repository

import (
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	"strings"
)

type ProductDraftRepository struct{ db.Repository[*ProductDraft] }

func (r *ProductDraftRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if err := r.Db.AutoMigrate(&ProductDraft{}); err != nil {
		return err
	}
	migrator := r.Db.Migrator()
	if migrator.HasColumn(&ProductDraft{}, "product_id") {
		if err := migrator.DropColumn(&ProductDraft{}, "product_id"); err != nil {
			return err
		}
	}
	return nil
}

func (r *ProductDraftRepository) CountByQuery(query productDTO.ProductDraftQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductDraft{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.SourceProductID); value != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", value)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.TbCatID); value != "" {
		dbQuery = dbQuery.Where("tb_cat_id = ?", value)
	}
	if value := strings.TrimSpace(query.TbDraftID); value != "" {
		dbQuery = dbQuery.Where("tb_draft_id = ?", value)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductDraftRepository) ListByQuery(query productDTO.ProductDraftQueryDTO, pageIndex, pageSize int) ([]*ProductDraft, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductDraft{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.SourceProductID); value != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", value)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.TbCatID); value != "" {
		dbQuery = dbQuery.Where("tb_cat_id = ?", value)
	}
	if value := strings.TrimSpace(query.TbDraftID); value != "" {
		dbQuery = dbQuery.Where("tb_draft_id = ?", value)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*ProductDraft
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// CountByShopAndCat 查询指定店铺+分类下的草稿数量（用于判断是否超过10个限制）
func (r *ProductDraftRepository) CountByShopAndCat(shopID uint64, tbCatID string) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	if err := r.Db.Model(&ProductDraft{}).
		Where("active = ? AND shop_id = ? AND tb_cat_id = ?", 1, shopID, tbCatID).
		Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

// ListOldestByShopAndCat 按创建时间升序列出指定店铺+分类下的草稿（用于删除最旧的）
func (r *ProductDraftRepository) ListOldestByShopAndCat(shopID uint64, tbCatID string, limit int) ([]*ProductDraft, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*ProductDraft
	if err := r.Db.Model(&ProductDraft{}).
		Where("active = ? AND shop_id = ? AND tb_cat_id = ?", 1, shopID, tbCatID).
		Order("id ASC").
		Limit(limit).
		Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// FindByTbDraftID 通过淘宝草稿ID查找记录
func (r *ProductDraftRepository) FindByTbDraftID(tbDraftID string) (*ProductDraft, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity ProductDraft
	if err := r.Db.Where("tb_draft_id = ? AND active = ?", tbDraftID, 1).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// FindByIdentity 通过 source_product_id + shop_id + tb_cat_id 查找草稿记录
func (r *ProductDraftRepository) FindByIdentity(sourceProductID string, shopID uint64, tbCatID string) (*ProductDraft, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity ProductDraft
	if err := r.Db.
		Where(
			"source_product_id = ? AND shop_id = ? AND tb_cat_id = ? AND active = ?",
			strings.TrimSpace(sourceProductID),
			shopID,
			strings.TrimSpace(tbCatID),
			1,
		).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}
