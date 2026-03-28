package repository

import (
	"common/middleware/db"
	"fmt"
	appUserDTO "service/app_user/dto"
	"strings"
)

type AppUserRepository struct {
	db.Repository[*AppUser]
}

func (r *AppUserRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AppUser{})
}

func (r *AppUserRepository) FindByUsername(username string) (*AppUser, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity AppUser
	if err := r.Db.Where("username = ? AND active = ?", username, 1).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *AppUserRepository) CountRecentLoginUsers() (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var count int64
	if err := r.Db.Model(&AppUser{}).
		Where("active = ?", 1).
		Where("last_login_time IS NOT NULL").
		Where("last_login_time > ?", "1970-01-02 00:00:00").
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AppUserRepository) CountVisibleUsers() (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var count int64
	if err := r.Db.Model(&AppUser{}).Where("active = ?", 1).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AppUserRepository) CountActiveUsers() (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var count int64
	if err := r.Db.Model(&AppUser{}).Where("active = ?", 1).Where("status = ?", "active").Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AppUserRepository) CountUsersByQuery(query appUserDTO.AppUserQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	whereSQL, values := buildAppUserListWhere(query)
	sql := "SELECT u.id FROM app_user u " + whereSQL
	return r.CountBySQL(sql, values...)
}

func (r *AppUserRepository) ListUsersByQuery(query appUserDTO.AppUserQueryDTO, pageIndex, pageSize int) ([]AppUserListRow, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	whereSQL, values := buildAppUserListWhere(query)
	sql := `SELECT
		u.id, u.active, u.created_time, u.updated_time, u.created_by, u.updated_by,
		u.name, u.username, u.email, u.phone, u.department, u.password,
		u.origin_password, u.status, u.last_login_time, u.secret_key, u.remark,
		u.pub_token, u.ban_count
	FROM app_user u ` + whereSQL + ` ORDER BY u.id DESC LIMIT ? OFFSET ?`
	values = append(values, pageSize, (pageIndex-1)*pageSize)
	var rows []AppUserListRow
	if err := r.QueryBySQL(&rows, sql, values...); err != nil {
		return nil, err
	}
	return rows, nil
}

func buildAppUserListWhere(query appUserDTO.AppUserQueryDTO) (string, []interface{}) {
	clauses := []string{"WHERE u.active = 1"}
	values := make([]interface{}, 0, 16)

	if value := strings.TrimSpace(query.Search); value != "" {
		likeValue := "%" + value + "%"
		clauses = append(clauses, `(u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.department LIKE ? OR u.remark LIKE ?)`)
		values = append(values, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue)
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		clauses = append(clauses, "u.name LIKE ?")
		values = append(values, "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Username); value != "" {
		clauses = append(clauses, "u.username LIKE ?")
		values = append(values, "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Email); value != "" {
		clauses = append(clauses, "u.email LIKE ?")
		values = append(values, "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Phone); value != "" {
		clauses = append(clauses, "u.phone LIKE ?")
		values = append(values, "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Department); value != "" {
		clauses = append(clauses, "u.department LIKE ?")
		values = append(values, "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		clauses = append(clauses, "u.status = ?")
		values = append(values, value)
	}
	if value := strings.TrimSpace(query.SecretKey); value != "" {
		clauses = append(clauses, "u.secret_key = ?")
		values = append(values, value)
	}
	if value := strings.TrimSpace(query.PubToken); value != "" {
		clauses = append(clauses, "u.pub_token = ?")
		values = append(values, value)
	}

	return strings.Join(clauses, " AND "), values
}

type AppUserLoginRecordRepository struct {
	db.Repository[*AppUserLoginRecord]
}

func (r *AppUserLoginRecordRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AppUserLoginRecord{})
}

func (r *AppUserLoginRecordRepository) CountByQuery(query appUserDTO.AppUserLoginRecordQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&AppUserLoginRecord{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if value := strings.TrimSpace(query.IP); value != "" {
		dbQuery = dbQuery.Where("ip LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *AppUserLoginRecordRepository) ListByQuery(query appUserDTO.AppUserLoginRecordQueryDTO, pageIndex, pageSize int) ([]*AppUserLoginRecord, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&AppUserLoginRecord{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if value := strings.TrimSpace(query.IP); value != "" {
		dbQuery = dbQuery.Where("ip LIKE ?", "%"+value+"%")
	}
	var entities []*AppUserLoginRecord
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
