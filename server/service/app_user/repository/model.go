package repository

import (
	"common/middleware/db"
	"time"
)

type AppUser struct {
	db.BaseEntity
	Name           string    `gorm:"column:name;type:varchar(100);index:idx_name" orm:"column(name);size(100);null" description:"姓名"`
	Username       string    `gorm:"column:username;type:varchar(50);uniqueIndex:idx_app_username" orm:"column(username);size(50);null" description:"用户名"`
	Email          string    `gorm:"column:email;type:varchar(100);index:idx_email" orm:"column(email);size(100);null" description:"邮箱"`
	Phone          string    `gorm:"column:phone;type:varchar(32);index:idx_phone" orm:"column(phone);size(32);null" description:"手机号"`
	Department     string    `gorm:"column:department;type:varchar(100);index:idx_department" orm:"column(department);size(100);null" description:"部门"`
	Password       string    `gorm:"column:password;type:varchar(50)" orm:"column(password);size(50);null" description:"密码"`
	OriginPassword string    `gorm:"column:origin_password;type:varchar(50)" orm:"column(origin_password);size(50);null" description:"原始密码"`
	Status         string    `gorm:"column:status;type:varchar(50)" orm:"column(status);size(50);null" description:"状态"`
	LastLoginTime  *time.Time `gorm:"column:last_login_time;type:datetime" orm:"column(last_login_time);null" description:"最后登录时间"`
	SecretKey      string    `gorm:"column:secret_key;type:varchar(50);index:idx_secret_key" orm:"column(secret_key);size(50);null" description:"密钥"`
	Remark         string    `gorm:"column:remark;type:varchar(50)" orm:"column(remark);size(50);null" description:"备注"`
	PubToken       string    `gorm:"column:pub_token;type:varchar(100);uniqueIndex:idx_app_pub_token" orm:"column(pub_token);size(100);null" description:"公钥token"`
	BanCount       uint32    `gorm:"column:ban_count;type:int unsigned;default:0" orm:"column(ban_count);null" description:"封禁次数"`
}

func (u *AppUser) TableName() string {
	return "app_user"
}

type AppUserLoginRecord struct {
	db.BaseEntity
	IP        string `gorm:"column:ip;type:varchar(50)" orm:"column(ip);size(50);null" description:"登录IP"`
	AppUserID uint64 `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" orm:"column(app_user_id);null" description:"客户端用户ID"`
}

func (u *AppUserLoginRecord) TableName() string {
	return "app_user_login_record"
}

type AppUserListRow struct {
	db.BaseEntity
	Name           string    `gorm:"column:name"`
	Username       string    `gorm:"column:username"`
	Email          string    `gorm:"column:email"`
	Phone          string    `gorm:"column:phone"`
	Department     string    `gorm:"column:department"`
	Password       string    `gorm:"column:password"`
	OriginPassword string    `gorm:"column:origin_password"`
	Status         string    `gorm:"column:status"`
	LastLoginTime  *time.Time `gorm:"column:last_login_time"`
	SecretKey      string    `gorm:"column:secret_key"`
	Remark         string    `gorm:"column:remark"`
	PubToken       string    `gorm:"column:pub_token"`
	BanCount       uint32    `gorm:"column:ban_count"`
}
