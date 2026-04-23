package collect_share

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	appUserRepository "service/app_user/repository"
	collectRepository "service/collect/repository"
	collectShareDTO "service/collect_share/dto"
	collectShareRepository "service/collect_share/repository"
	"strings"

	"gorm.io/gorm"
)

type CollectShareService struct {
	shareRepository        *collectShareRepository.CollectShareRepository
	collectBatchRepository *collectRepository.CollectBatchRepository
	appUserRepository      *appUserRepository.AppUserRepository
}

func NewCollectShareService() *CollectShareService {
	return &CollectShareService{
		shareRepository:        db.GetRepository[collectShareRepository.CollectShareRepository](),
		collectBatchRepository: db.GetRepository[collectRepository.CollectBatchRepository](),
		appUserRepository:      db.GetRepository[appUserRepository.AppUserRepository](),
	}
}

func (s *CollectShareService) EnsureTable() error {
	return s.shareRepository.EnsureTable()
}

func (s *CollectShareService) ShareCollectBatch(ownerUserID uint64, req *collectShareDTO.CreateCollectShareDTO) (*collectShareDTO.CollectShareDTO, error) {
	if ownerUserID == 0 {
		return nil, fmt.Errorf("用户未登录")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if req.CollectBatchID == 0 {
		return nil, fmt.Errorf("collectBatchId is required")
	}
	username := strings.TrimSpace(req.Username)
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}
	batch, err := s.collectBatchRepository.FindById(uint(req.CollectBatchID))
	if err != nil {
		return nil, err
	}
	if batch.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if batch.AppUserID != ownerUserID {
		return nil, fmt.Errorf("只能分享自己的采集批次")
	}
	targetUser, err := s.appUserRepository.FindByUsername(username)
	if err != nil {
		return nil, err
	}
	if targetUser.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if uint64(targetUser.Id) == ownerUserID {
		return nil, fmt.Errorf("不能分享给自己")
	}

	entity, err := s.shareRepository.FindByIdentity(req.CollectBatchID, ownerUserID, uint64(targetUser.Id))
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	if err == gorm.ErrRecordNotFound {
		entity, err = s.shareRepository.Create(&collectShareRepository.CollectShare{
			CollectBatchID: req.CollectBatchID,
			OwnerUserID:    ownerUserID,
			ShareUserID:    uint64(targetUser.Id),
			Status:         "ACTIVE",
		})
		if err != nil {
			return nil, err
		}
	} else {
		entity.Status = "ACTIVE"
		entity.Active = 1
		entity, err = s.shareRepository.SaveOrUpdate(entity)
		if err != nil {
			return nil, err
		}
	}

	return s.toShareDTO(entity, batch.Name, "", targetUser.Username), nil
}

func (s *CollectShareService) ListMyShares(ownerUserID uint64, query collectShareDTO.CollectShareQueryDTO) (*baseDTO.PageDTO[collectShareDTO.CollectShareDTO], error) {
	if ownerUserID == 0 {
		return nil, fmt.Errorf("用户未登录")
	}
	pageIndex, pageSize := normalizeSharePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.shareRepository.CountMine(ownerUserID, query)
	if err != nil {
		return nil, err
	}
	rows, err := s.shareRepository.ListMine(ownerUserID, query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	data := make([]*collectShareDTO.CollectShareDTO, 0, len(rows))
	for _, row := range rows {
		data = append(data, &collectShareDTO.CollectShareDTO{
			BaseDTO:        shareBaseDTO(row.BaseEntity),
			CollectBatchID: row.CollectBatchID,
			OwnerUserID:    row.OwnerUserID,
			ShareUserID:    row.ShareUserID,
			Status:         row.Status,
			BatchName:      row.BatchName,
			OwnerUsername:  row.OwnerUsername,
			ShareUsername:  row.ShareUsername,
		})
	}
	return baseDTO.BuildPage(int(total), data), nil
}

func (s *CollectShareService) ListSharedToMe(shareUserID uint64, query collectShareDTO.CollectShareQueryDTO) (*baseDTO.PageDTO[collectShareDTO.SharedCollectBatchDTO], error) {
	if shareUserID == 0 {
		return nil, fmt.Errorf("用户未登录")
	}
	pageIndex, pageSize := normalizeSharePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.shareRepository.CountSharedToMe(shareUserID, query)
	if err != nil {
		return nil, err
	}
	rows, err := s.shareRepository.ListSharedToMe(shareUserID, query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	data := make([]*collectShareDTO.SharedCollectBatchDTO, 0, len(rows))
	for _, row := range rows {
		data = append(data, &collectShareDTO.SharedCollectBatchDTO{
			BaseDTO:          shareBaseDTO(row.BaseEntity),
			AppUserID:        row.AppUserID,
			ShopID:           row.ShopID,
			Platform:         row.Platform,
			Name:             row.Name,
			Status:           row.Status,
			OssURL:           row.OssURL,
			CollectedCount:   row.CollectedCount,
			ShareID:          row.ShareID,
			ShareStatus:      row.ShareStatus,
			OwnerUserID:      row.OwnerUserID,
			OwnerUsername:    row.OwnerUsername,
			ShareUserID:      row.ShareUserID,
			ShareUsername:    row.ShareUsername,
			ShareCreatedTime: row.ShareCreatedTime,
		})
	}
	return baseDTO.BuildPage(int(total), data), nil
}

func (s *CollectShareService) CancelShare(ownerUserID uint64, id uint) error {
	if ownerUserID == 0 {
		return fmt.Errorf("用户未登录")
	}
	entity, err := s.shareRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 || entity.OwnerUserID != ownerUserID {
		return gorm.ErrRecordNotFound
	}
	entity.Status = "CANCELLED"
	_, err = s.shareRepository.SaveOrUpdate(entity)
	return err
}

func (s *CollectShareService) toShareDTO(entity *collectShareRepository.CollectShare, batchName, ownerUsername, shareUsername string) *collectShareDTO.CollectShareDTO {
	if entity == nil {
		return nil
	}
	return &collectShareDTO.CollectShareDTO{
		BaseDTO:        shareBaseDTO(entity.BaseEntity),
		CollectBatchID: entity.CollectBatchID,
		OwnerUserID:    entity.OwnerUserID,
		ShareUserID:    entity.ShareUserID,
		Status:         entity.Status,
		BatchName:      batchName,
		OwnerUsername:  ownerUsername,
		ShareUsername:  shareUsername,
	}
}

func shareBaseDTO(entity db.BaseEntity) baseDTO.BaseDTO {
	return baseDTO.BaseDTO{
		Id:          entity.Id,
		Active:      entity.Active,
		CreatedTime: entity.CreatedTime,
		CreatedBy:   entity.CreatedBy,
		UpdatedTime: entity.UpdatedTime,
		UpdatedBy:   entity.UpdatedBy,
	}
}

func normalizeSharePage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return pageIndex, pageSize
}
