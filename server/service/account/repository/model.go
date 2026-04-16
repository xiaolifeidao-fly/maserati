package repository

import "common/middleware/db"

type Account struct {
	db.BaseEntity
	UserID        uint64 `gorm:"column:user_id;type:bigint unsigned;index:idx_user_id" orm:"column(user_id);null" description:"用户ID"`
	AccountStatus string `gorm:"column:account_status;type:varchar(32)" orm:"column(account_status);size(32);null" description:"账户状态"`
	BalanceAmount string `gorm:"column:balance_amount;type:decimal(38,8);not null;default:0.00000000" orm:"column(balance_amount);null" description:"账户余额"`
}

func (a *Account) TableName() string {
	return "account"
}

type AccountDetail struct {
	db.BaseEntity
	AccountID     uint64 `gorm:"column:account_id;type:bigint unsigned;index:idx_account_id" orm:"column(account_id);null" description:"账户ID"`
	Amount        string `gorm:"column:amount;type:decimal(38,8);not null;default:0.00000000" orm:"column(amount);null" description:"账户余额变动金额"`
	BalanceAmount string `gorm:"column:balance_amount;type:decimal(38,8);not null;default:0.00000000" orm:"column(balance_amount);null" description:"账户余额"`
	Operator      string `gorm:"column:operator;type:varchar(32)" orm:"column(operator);size(32);null" description:"操作人"`
	IP            string `gorm:"column:ip;type:varchar(128)" orm:"column(ip);size(128);null" description:"IP"`
	Type          string `gorm:"column:type;type:varchar(32)" orm:"column(type);size(32);null" description:"明细类型"`
	Description   string `gorm:"column:description;type:varchar(32)" orm:"column(description);size(32);null" description:"描述"`
	BusinessID    string `gorm:"column:business_id;type:varchar(50)" orm:"column(business_id);size(50);null" description:"业务ID"`
}

func (a *AccountDetail) TableName() string {
	return "account_detail"
}
