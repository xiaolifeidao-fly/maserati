package repository

import "common/middleware/db"

type Shop struct {
	db.BaseEntity
	Code         string `gorm:"column:code;type:varchar(50)" description:"编码"`
	Name         string `gorm:"column:name;type:varchar(50)" description:"名称"`
	SortID       int64  `gorm:"column:sort_id;type:bigint" description:"排序"`
	ShopGroupID  int64  `gorm:"column:shop_group_id;type:bigint;index:idx_shop_group_id" description:"分组ID"`
	ShopTypeCode string `gorm:"column:shop_type_code;type:varchar(50)" description:"商品类型编码"`
	ApproveFlag  int8   `gorm:"column:approve_flag;type:tinyint(1)" description:"审核标志"`
}

func (s *Shop) TableName() string { return "shop" }

type ShopCategory struct {
	db.BaseEntity
	Price                 string `gorm:"column:price;type:decimal(38,8);not null;default:0.00000000" description:"单价"`
	SecretKey             string `gorm:"column:secret_key;type:varchar(50)" description:"密钥"`
	LowerLimit            int64  `gorm:"column:lower_limit;type:bigint" description:"最小值"`
	UpperLimit            int64  `gorm:"column:upper_limit;type:bigint" description:"最大值"`
	ShopID                int64  `gorm:"column:shop_id;type:bigint;index:idx_shop_id" description:"商品ID"`
	Name                  string `gorm:"column:name;type:varchar(50)" description:"名称"`
	BarryShopCategoryCode string `gorm:"column:barry_shop_category_code;type:varchar(50)" description:"Barry编码"`
	Status                string `gorm:"column:status;type:varchar(50)" description:"状态"`
}

func (s *ShopCategory) TableName() string { return "shop_category" }

type ShopCategoryChange struct {
	db.BaseEntity
	UserID           uint64 `gorm:"column:user_id;type:bigint unsigned;index:idx_user_id" description:"用户ID"`
	ShopID           uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id" description:"商品ID"`
	ShopCategoryID   uint64 `gorm:"column:shop_category_id;type:bigint unsigned;index:idx_shop_category_id" description:"商品分类ID"`
	ShopCategoryName string `gorm:"column:shop_category_name;type:varchar(50)" description:"商品分类名称"`
	OldPrice         string `gorm:"column:old_price;type:decimal(38,8);not null;default:0.00000000" description:"旧价格"`
	NewPrice         string `gorm:"column:new_price;type:decimal(38,8);not null;default:0.00000000" description:"新价格"`
	OldLowerLimit    int64  `gorm:"column:old_lower_limit;type:bigint" description:"旧最小值"`
	NewLowerLimit    int64  `gorm:"column:new_lower_limit;type:bigint" description:"新最小值"`
	OldUpperLimit    int64  `gorm:"column:old_upper_limit;type:bigint" description:"旧最大值"`
	NewUpperLimit    int64  `gorm:"column:new_upper_limit;type:bigint" description:"新最大值"`
}

func (s *ShopCategoryChange) TableName() string { return "shop_category_change" }

type ShopExtParam struct {
	db.BaseEntity
	Name           string `gorm:"column:name;type:varchar(50)" description:"名称"`
	Code           string `gorm:"column:code;type:varchar(50)" description:"编码"`
	ShopID         uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id" description:"商品ID"`
	Type           string `gorm:"column:type;type:varchar(50)" description:"类型"`
	Processor      string `gorm:"column:processor;type:varchar(50)" description:"处理器"`
	CandidateValue string `gorm:"column:candidate_value;type:varchar(50)" description:"候选值"`
}

func (s *ShopExtParam) TableName() string { return "shop_ext_param" }

type ShopGroup struct {
	db.BaseEntity
	Code            string `gorm:"column:code;type:varchar(50);index:idx_code" description:"编码"`
	Name            string `gorm:"column:name;type:varchar(50)" description:"名称"`
	BusinessType    string `gorm:"column:business_type;type:varchar(50)" description:"业务类型"`
	BusinessCode    string `gorm:"column:business_code;type:varchar(50)" description:"业务编码"`
	SettleDay       int    `gorm:"column:settle_day;type:int" description:"结算天数"`
	SettleFlag      int8   `gorm:"column:settle_flag;type:tinyint(1)" description:"结算标识"`
	Price           string `gorm:"column:price;type:varchar(50)" description:"价格"`
	CalRgFlag       int8   `gorm:"column:cal_rg_flag;type:tinyint(1)" description:"计算标识"`
	ChargeType      string `gorm:"column:charge_type;type:varchar(50)" description:"收费类型"`
	GroupName       string `gorm:"column:group_name;type:varchar(50)" description:"分组名"`
	DashboardActive int8   `gorm:"column:dashboard_active;type:tinyint(1)" description:"仪表盘启用"`
	DashboardTitle  string `gorm:"column:dashboard_title;type:varchar(50)" description:"仪表盘标题"`
	DashboardSortID int    `gorm:"column:dashboard_sort_id;type:int" description:"仪表盘排序"`
}

func (s *ShopGroup) TableName() string { return "shop_group" }

type TenantShop struct {
	db.BaseEntity
	ShopID   uint64 `gorm:"column:shop_id;type:bigint unsigned" description:"商品ID"`
	TenantID uint64 `gorm:"column:tenant_id;type:bigint unsigned;index:idx_tenant_id" description:"租户ID"`
}

func (t *TenantShop) TableName() string { return "tenant_shop" }

type TenantShopCategory struct {
	db.BaseEntity
	TenantID       uint64 `gorm:"column:tenant_id;type:bigint unsigned;index:idx_tenant_id" description:"租户ID"`
	ShopCategoryID uint64 `gorm:"column:shop_category_id;type:bigint unsigned" description:"商品分类ID"`
}

func (t *TenantShopCategory) TableName() string { return "tenant_shop_category" }
