package shop

import (
	baseDTO "common/base/dto"
	"fmt"
	shopDTO "service/shop/dto"
	shopRepository "service/shop/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *ShopService) ListShops(query shopDTO.ShopQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopDTO], error) {
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	repositoryQuery := query
	repositoryQuery.LoginStatus = strings.TrimSpace(repositoryQuery.LoginStatus)
	if repositoryQuery.LoginStatus != "" {
		repositoryQuery.LoginStatus = normalizeShopStatus(repositoryQuery.LoginStatus)
	}
	repositoryQuery.AuthorizationStatus = strings.TrimSpace(repositoryQuery.AuthorizationStatus)
	if repositoryQuery.AuthorizationStatus != "" {
		repositoryQuery.AuthorizationStatus = normalizeShopAuthorizationStatus(repositoryQuery.AuthorizationStatus)
	}
	total, err := s.shopRepository.CountByQuery(repositoryQuery)
	if err != nil {
		return nil, err
	}
	entities, err := s.shopRepository.ListByQuery(repositoryQuery, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	for _, entity := range entities {
		if err := s.refreshShopAuthorizationState(entity); err != nil {
			return nil, err
		}
	}
	return baseDTO.BuildPage(int(total), toShopDTOs(entities)), nil
}
func (s *ShopService) GetShopByID(id uint) (*shopDTO.ShopDTO, error) {
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if err := s.refreshShopAuthorizationState(entity); err != nil {
		return nil, err
	}
	return toShopDTO(entity), nil
}
func (s *ShopService) CreateShop(req *shopDTO.CreateShopDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	platform := strings.TrimSpace(req.Platform)
	if platform == "" {
		return nil, fmt.Errorf("platform is required")
	}
	remark := strings.TrimSpace(req.Remark)
	displayName := defaultShopDisplayName(platform, remark)
	if err := ensureShopAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	created, err := s.shopRepository.Create(&shopRepository.Shop{
		AppUserID:           req.AppUserID,
		Code:                displayName,
		Name:                displayName,
		Platform:            platform,
		Remark:              remark,
		LoginStatus:         normalizeShopStatus(req.LoginStatus),
		AuthorizationStatus: "UNAUTHORIZED",
	})
	if err != nil {
		return nil, err
	}
	if err := s.refreshShopAuthorizationState(created); err != nil {
		return nil, err
	}
	saved, err := s.shopRepository.SaveOrUpdate(created)
	if err != nil {
		return nil, err
	}
	return toShopDTO(saved), nil
}
func (s *ShopService) UpdateShop(id uint, req *shopDTO.UpdateShopDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.AppUserID != nil {
		if err := ensureShopAppUserExists(s.appUserRepository, *req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	previousDisplayName := defaultShopDisplayName(entity.Platform, entity.Remark)
	if req.Platform != nil {
		entity.Platform = strings.TrimSpace(*req.Platform)
	}
	if req.Remark != nil {
		entity.Remark = strings.TrimSpace(*req.Remark)
	}
	if req.LoginStatus != nil {
		entity.LoginStatus = normalizeShopStatus(*req.LoginStatus)
	}
	nextDisplayName := defaultShopDisplayName(entity.Platform, entity.Remark)
	if strings.TrimSpace(entity.Name) == "" || entity.Name == previousDisplayName {
		entity.Name = nextDisplayName
	}
	if strings.TrimSpace(entity.Code) == "" || entity.Code == previousDisplayName {
		entity.Code = nextDisplayName
	}
	if err := s.refreshShopAuthorizationState(entity); err != nil {
		return nil, err
	}
	saved, err := s.shopRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return toShopDTO(saved), nil
}
func (s *ShopService) DeleteShop(id uint) error {
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	entity.LoginStatus = "PENDING"
	_, err = s.shopRepository.SaveOrUpdate(entity)
	return err
}
