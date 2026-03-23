package repository

import (
	"common/middleware/db"
	"fmt"
)

type ShopRepository struct{ db.Repository[*Shop] }

func (r *ShopRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Shop{})
}

type ShopCategoryRepository struct{ db.Repository[*ShopCategory] }

func (r *ShopCategoryRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ShopCategory{})
}

type ShopCategoryChangeRepository struct {
	db.Repository[*ShopCategoryChange]
}

func (r *ShopCategoryChangeRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ShopCategoryChange{})
}

type ShopExtParamRepository struct{ db.Repository[*ShopExtParam] }

func (r *ShopExtParamRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ShopExtParam{})
}

type ShopGroupRepository struct{ db.Repository[*ShopGroup] }

func (r *ShopGroupRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ShopGroup{})
}

type TenantShopRepository struct{ db.Repository[*TenantShop] }

func (r *TenantShopRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&TenantShop{})
}

type TenantShopCategoryRepository struct {
	db.Repository[*TenantShopCategory]
}

func (r *TenantShopCategoryRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&TenantShopCategory{})
}
