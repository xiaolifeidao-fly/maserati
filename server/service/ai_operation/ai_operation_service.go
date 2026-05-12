package ai_operation

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	aiOperationDTO "service/ai_operation/dto"
	aiOperationRepository "service/ai_operation/repository"
	appUserRepository "service/app_user/repository"
	shopRepository "service/shop/repository"
	"strings"

	"gorm.io/gorm"
)

type AiOperationService struct {
	robotRepository   *aiOperationRepository.AiOperationRobotRepository
	shopRepository    *shopRepository.ShopRepository
	appUserRepository *appUserRepository.AppUserRepository
}

func NewAiOperationService() *AiOperationService {
	return &AiOperationService{
		robotRepository:   db.GetRepository[aiOperationRepository.AiOperationRobotRepository](),
		shopRepository:    db.GetRepository[shopRepository.ShopRepository](),
		appUserRepository: db.GetRepository[appUserRepository.AppUserRepository](),
	}
}

func (s *AiOperationService) EnsureTable() error {
	return s.robotRepository.EnsureTable()
}

func (s *AiOperationService) ListRobots(query aiOperationDTO.AiOperationRobotQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.AiOperationRobotDTO], error) {
	pageIndex, pageSize := normalizeRobotPage(query.Page, query.PageIndex, query.PageSize)
	query.Status = normalizeRobotStatus(query.Status)
	total, err := s.robotRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.robotRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), s.toRobotDTOs(entities)), nil
}

func (s *AiOperationService) GetRobotByID(id uint) (*aiOperationDTO.AiOperationRobotDTO, error) {
	entity, err := s.robotRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return s.toRobotDTO(entity), nil
}

func (s *AiOperationService) CreateRobot(req *aiOperationDTO.CreateAiOperationRobotDTO) (*aiOperationDTO.AiOperationRobotDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	code := strings.TrimSpace(req.Code)
	status := normalizeRobotStatus(req.Status)
	remark := strings.TrimSpace(req.Remark)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if code == "" {
		return nil, fmt.Errorf("code is required")
	}
	if status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	if err := s.ensureOwnerAppUser(req.AppUserID); err != nil {
		return nil, err
	}
	if err := s.ensurePublishShop(req.PublishShopID, req.AppUserID); err != nil {
		return nil, err
	}
	if err := s.ensureCollectAppUser(req.CollectAppUserID); err != nil {
		return nil, err
	}
	existing, err := s.robotRepository.FindByCode(code)
	if err == nil && existing != nil && existing.Active == 1 {
		return nil, fmt.Errorf("code already exists")
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	created, err := s.robotRepository.Create(&aiOperationRepository.AiOperationRobot{
		Name:             name,
		Code:             code,
		Status:           status,
		AppUserID:        req.AppUserID,
		PublishShopID:    req.PublishShopID,
		CollectAppUserID: req.CollectAppUserID,
		Remark:           remark,
	})
	if err != nil {
		return nil, err
	}
	return s.toRobotDTO(created), nil
}

func (s *AiOperationService) UpdateRobot(id uint, req *aiOperationDTO.UpdateAiOperationRobotDTO) (*aiOperationDTO.AiOperationRobotDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.robotRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		value := strings.TrimSpace(*req.Name)
		if value == "" {
			return nil, fmt.Errorf("name is required")
		}
		entity.Name = value
	}
	if req.Code != nil {
		value := strings.TrimSpace(*req.Code)
		if value == "" {
			return nil, fmt.Errorf("code is required")
		}
		existing, err := s.robotRepository.FindByCode(value)
		if err == nil && existing != nil && existing.Active == 1 && existing.Id != entity.Id {
			return nil, fmt.Errorf("code already exists")
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, err
		}
		entity.Code = value
	}
	if req.Status != nil {
		status := normalizeRobotStatus(*req.Status)
		if status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
		entity.Status = status
	}
	if req.AppUserID != nil {
		if err := s.ensureOwnerAppUser(*req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	if req.PublishShopID != nil {
		if err := s.ensurePublishShop(*req.PublishShopID, entity.AppUserID); err != nil {
			return nil, err
		}
		entity.PublishShopID = *req.PublishShopID
	}
	if req.CollectAppUserID != nil {
		if err := s.ensureCollectAppUser(*req.CollectAppUserID); err != nil {
			return nil, err
		}
		entity.CollectAppUserID = *req.CollectAppUserID
	}
	if req.Remark != nil {
		entity.Remark = strings.TrimSpace(*req.Remark)
	}
	saved, err := s.robotRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return s.toRobotDTO(saved), nil
}

func (s *AiOperationService) DeleteRobot(id uint) error {
	entity, err := s.robotRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.robotRepository.SaveOrUpdate(entity)
	return err
}

func normalizeRobotPage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return pageIndex, pageSize
}

func normalizeRobotStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "", "ENABLED", "ACTIVE":
		return "ENABLED"
	case "DISABLED", "INACTIVE":
		return "DISABLED"
	default:
		return ""
	}
}

func (s *AiOperationService) ensureOwnerAppUser(appUserID uint64) error {
	if appUserID == 0 {
		return fmt.Errorf("appUserId must be positive")
	}
	entity, err := s.appUserRepository.FindById(uint(appUserID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *AiOperationService) ensurePublishShop(shopID uint64, appUserID uint64) error {
	if shopID == 0 {
		return fmt.Errorf("publishShopId must be positive")
	}
	entity, err := s.shopRepository.FindById(uint(shopID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	if appUserID > 0 && entity.AppUserID != appUserID {
		return fmt.Errorf("publish shop does not belong to current app user")
	}
	if strings.ToUpper(strings.TrimSpace(entity.ShopUsage)) != "PUBLISH" {
		return fmt.Errorf("publish shop must be a PUBLISH shop")
	}
	return nil
}

func (s *AiOperationService) ensureCollectAppUser(appUserID uint64) error {
	if appUserID == 0 {
		return fmt.Errorf("collectAppUserId must be positive")
	}
	entity, err := s.appUserRepository.FindById(uint(appUserID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *AiOperationService) toRobotDTOs(entities []*aiOperationRepository.AiOperationRobot) []*aiOperationDTO.AiOperationRobotDTO {
	dtos := make([]*aiOperationDTO.AiOperationRobotDTO, 0, len(entities))
	for _, entity := range entities {
		dtos = append(dtos, s.toRobotDTO(entity))
	}
	return dtos
}

func (s *AiOperationService) toRobotDTO(entity *aiOperationRepository.AiOperationRobot) *aiOperationDTO.AiOperationRobotDTO {
	if entity == nil {
		return nil
	}
	result := &aiOperationDTO.AiOperationRobotDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		Name:             entity.Name,
		Code:             entity.Code,
		Status:           normalizeRobotStatus(entity.Status),
		AppUserID:        entity.AppUserID,
		PublishShopID:    entity.PublishShopID,
		CollectAppUserID: entity.CollectAppUserID,
		Remark:           entity.Remark,
	}
	if shopEntity, err := s.shopRepository.FindById(uint(entity.PublishShopID)); err == nil && shopEntity != nil && shopEntity.Active == 1 {
		result.PublishShopName = firstNonEmpty(shopEntity.Remark, shopEntity.Nickname, shopEntity.Name, shopEntity.Code, shopEntity.Platform)
		result.PublishShopPlatform = shopEntity.Platform
	}
	if appUserEntity, err := s.appUserRepository.FindById(uint(entity.CollectAppUserID)); err == nil && appUserEntity != nil && appUserEntity.Active == 1 {
		result.CollectAppUserName = firstNonEmpty(appUserEntity.Name, appUserEntity.Username)
		result.CollectAppUserUsername = appUserEntity.Username
	}
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
