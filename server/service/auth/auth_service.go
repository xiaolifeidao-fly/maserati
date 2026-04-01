package auth

import (
	"common/middleware/db"
	redisMiddleware "common/middleware/redis"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	appUserPassword "service/app_user/password"
	appUserRepository "service/app_user/repository"

	"gorm.io/gorm"
)

const (
	userTokenPrefix    = "KAKROLOT_APP_USER_TOKEN_PRE_"
	userIPLoginPrefix  = "Kakrolot_app_user_ip_login_"
	tokenExpireSeconds = 3 * 24 * 60 * 60
)

var (
	ErrNotLogin           = errors.New("user not login")
	ErrInvalidCredential  = errors.New("用户名或密码错误")
	ErrUserDisabled       = errors.New("该用户已被封禁")
	ErrLoginTooManyErrors = errors.New("用户密码错误次数太多,请一小时后再试")
)

type LoginUser struct {
	ID       uint64 `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Status   string `json:"status"`
}

type AuthService struct {
	appUserRepository            *appUserRepository.AppUserRepository
	appUserLoginRecordRepository *appUserRepository.AppUserLoginRecordRepository
}

func NewAuthService() *AuthService {
	return &AuthService{
		appUserRepository:            db.GetRepository[appUserRepository.AppUserRepository](),
		appUserLoginRecordRepository: db.GetRepository[appUserRepository.AppUserLoginRecordRepository](),
	}
}

func (s *AuthService) Login(username, password, ip string, maxLoginErrorNum int64) (string, *LoginUser, error) {
	if err := ensureRedisReady(); err != nil {
		return "", nil, err
	}
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)
	ip = strings.TrimSpace(ip)
	if username == "" || password == "" {
		return "", nil, ErrInvalidCredential
	}
	if s.isLimit(ip, maxLoginErrorNum) {
		return "", nil, ErrLoginTooManyErrors
	}
	if s.appUserRepository.Db == nil {
		return "", nil, fmt.Errorf("database is not initialized")
	}

	user, err := s.appUserRepository.FindByUsername(username)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			s.calLoginError(ip)
			return "", nil, ErrInvalidCredential
		}
		return "", nil, err
	}
	if user.Active == 0 || !strings.EqualFold(strings.TrimSpace(user.Status), "active") {
		return "", nil, ErrUserDisabled
	}
	encryptedPassword := appUserPassword.Encrypt(username, password)
	if !strings.EqualFold(encryptedPassword, strings.TrimSpace(user.Password)) {
		s.calLoginError(ip)
		return "", nil, ErrInvalidCredential
	}

	now := time.Now()
	user.LastLoginTime = &now
	if _, err := s.appUserRepository.SaveOrUpdate(user); err != nil {
		return "", nil, err
	}
	if _, err := s.appUserLoginRecordRepository.Create(&appUserRepository.AppUserLoginRecord{
		IP:        ip,
		AppUserID: uint64(user.Id),
	}); err != nil {
		return "", nil, err
	}

	loginUser := toLoginUser(user)
	token, err := s.initAndGetToken(loginUser)
	if err != nil {
		return "", nil, err
	}
	return token, loginUser, nil
}

func (s *AuthService) ValidateToken(token, requestURL string) (*LoginUser, error) {
	if err := ensureRedisReady(); err != nil {
		return nil, err
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrNotLogin
	}

	loginUser, err := s.findUserByToken(token)
	if err != nil {
		return nil, err
	}
	if loginUser == nil {
		return nil, ErrNotLogin
	}
	if err := s.ensureLoginUserValid(loginUser); err != nil {
		if err == ErrNotLogin || err == ErrUserDisabled {
			redisMiddleware.Del(buildUserTokenKey(token))
		}
		return nil, err
	}
	if err := s.flushExpireTime(token); err != nil {
		return nil, err
	}
	return loginUser, nil
}

func (s *AuthService) Logout(token string) error {
	if err := ensureRedisReady(); err != nil {
		return err
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	redisMiddleware.Del(buildUserTokenKey(token))
	return nil
}

func (s *AuthService) initAndGetToken(user *LoginUser) (string, error) {
	payload, err := json.Marshal(user)
	if err != nil {
		return "", err
	}
	token := strings.ReplaceAll(fmt.Sprintf("%d_%d", user.ID, time.Now().UnixNano()), "-", "")
	tokenKey := buildUserTokenKey(token)
	if err := redisMiddleware.SetEx(tokenKey, string(payload), tokenExpireSeconds); err != nil {
		return "", err
	}
	if !redisMiddleware.Exists(tokenKey) {
		return "", fmt.Errorf("token was not persisted to redis")
	}
	ttl := redisMiddleware.TTL(tokenKey)
	if ttl <= 0 {
		return "", fmt.Errorf("token ttl was not applied")
	}
	return token, nil
}

func (s *AuthService) findUserByToken(token string) (*LoginUser, error) {
	value := redisMiddleware.Get(buildUserTokenKey(token))
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	var user LoginUser
	if err := json.Unmarshal([]byte(value), &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) ensureLoginUserValid(loginUser *LoginUser) error {
	if loginUser == nil || loginUser.ID == 0 {
		return ErrNotLogin
	}
	if s.appUserRepository.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	entity, err := s.appUserRepository.FindById(uint(loginUser.ID))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrNotLogin
		}
		return err
	}
	if entity.Active == 0 {
		return ErrNotLogin
	}
	if !strings.EqualFold(strings.TrimSpace(entity.Status), "active") {
		return ErrUserDisabled
	}

	loginUser.Name = entity.Name
	loginUser.Username = entity.Username
	loginUser.Status = entity.Status
	return nil
}

func (s *AuthService) flushExpireTime(token string) error {
	redisMiddleware.Expire(buildUserTokenKey(token), time.Duration(tokenExpireSeconds)*time.Second)
	return nil
}

func (s *AuthService) isLimit(ip string, maxLoginErrorNum int64) bool {
	if strings.TrimSpace(ip) == "" || maxLoginErrorNum <= 0 {
		return false
	}
	value := redisMiddleware.Get(buildIPKey(ip))
	errorNum, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return false
	}
	return errorNum > maxLoginErrorNum
}

func (s *AuthService) calLoginError(ip string) {
	if strings.TrimSpace(ip) == "" {
		return
	}
	key := buildIPKey(ip)
	redisMiddleware.Incr(key)
	redisMiddleware.Expire(key, time.Hour)
}

func ensureRedisReady() error {
	if redisMiddleware.Rdb == nil {
		return fmt.Errorf("redis is not initialized")
	}
	return nil
}

func buildUserTokenKey(token string) string {
	return userTokenPrefix + "_" + strings.TrimSpace(token)
}

func buildIPKey(ip string) string {
	return userIPLoginPrefix + strings.TrimSpace(ip)
}

func toLoginUser(user *appUserRepository.AppUser) *LoginUser {
	return &LoginUser{
		ID:       uint64(user.Id),
		Name:     user.Name,
		Username: user.Username,
		Status:   user.Status,
	}
}
