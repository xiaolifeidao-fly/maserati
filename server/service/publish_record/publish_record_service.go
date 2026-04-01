package publish_record

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	"strings"
	"time"

	appUserRepository "service/app_user/repository"
	collectRepository "service/collect/repository"
	publishRecordDTO "service/publish_record/dto"
	publishRecordRepository "service/publish_record/repository"
	publishTaskRepository "service/publish_task/repository"
	shopRepository "service/shop/repository"
)

var validRecordStatuses = map[string]struct{}{
	"PENDING":   {},
	"RUNNING":   {},
	"SUCCESS":   {},
	"FAILED":    {},
	"CANCELLED": {},
}

var validRecordStepStatuses = map[string]struct{}{
	"PENDING": {},
	"RUNNING": {},
	"SUCCESS": {},
	"FAILED":  {},
	"SKIPPED": {},
}

type PublishRecordService struct {
	recordRepository      *publishRecordRepository.PublishRecordRepository
	stepRepository        *publishRecordRepository.PublishRecordStepRepository
	appUserRepository     *appUserRepository.AppUserRepository
	shopRepository        *shopRepository.ShopRepository
	collectRecordRepo     *collectRepository.CollectRecordRepository
	publishTaskRepository *publishTaskRepository.PublishTaskRepository
}

func NewPublishRecordService() *PublishRecordService {
	return &PublishRecordService{
		recordRepository:      db.GetRepository[publishRecordRepository.PublishRecordRepository](),
		stepRepository:        db.GetRepository[publishRecordRepository.PublishRecordStepRepository](),
		appUserRepository:     db.GetRepository[appUserRepository.AppUserRepository](),
		shopRepository:        db.GetRepository[shopRepository.ShopRepository](),
		collectRecordRepo:     db.GetRepository[collectRepository.CollectRecordRepository](),
		publishTaskRepository: db.GetRepository[publishTaskRepository.PublishTaskRepository](),
	}
}

func (s *PublishRecordService) EnsureTable() error {
	if err := s.recordRepository.EnsureTable(); err != nil {
		return err
	}
	return s.stepRepository.EnsureTable()
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

func normalizeRecordPage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return pageIndex, pageSize
}

func normalizeRecordStatus(v string) (string, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	if v == "" {
		return "PENDING", nil
	}
	if _, ok := validRecordStatuses[v]; !ok {
		return "", fmt.Errorf("invalid record status: %s", v)
	}
	return v, nil
}

func normalizeRecordStepStatus(v string) (string, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	if v == "" {
		return "PENDING", nil
	}
	if _, ok := validRecordStepStatuses[v]; !ok {
		return "", fmt.Errorf("invalid step status: %s", v)
	}
	return v, nil
}

// ─── PublishRecord CRUD ───────────────────────────────────────────────────────

func (s *PublishRecordService) ListRecords(query publishRecordDTO.PublishRecordQueryDTO) (*baseDTO.PageDTO[publishRecordDTO.PublishRecordDTO], error) {
	pageIndex, pageSize := normalizeRecordPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.recordRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.recordRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[publishRecordDTO.PublishRecordDTO](entities)), nil
}

func (s *PublishRecordService) GetRecordByID(id uint) (*publishRecordDTO.PublishRecordDTO, error) {
	entity, err := s.recordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, fmt.Errorf("publish record not found")
	}
	return db.ToDTO[publishRecordDTO.PublishRecordDTO](entity), nil
}

func (s *PublishRecordService) CreateRecord(req *publishRecordDTO.CreatePublishRecordDTO) (*publishRecordDTO.PublishRecordDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if req.CollectRecordID == 0 {
		return nil, fmt.Errorf("collectRecordId is required")
	}
	if req.PublishTaskID == 0 {
		return nil, fmt.Errorf("publishTaskId is required")
	}
	if req.ShopID == 0 {
		return nil, fmt.Errorf("shopId is required")
	}
	// 校验采集记录存在
	collectRecord, err := s.collectRecordRepo.FindById(uint(req.CollectRecordID))
	if err != nil {
		return nil, fmt.Errorf("collect record not found")
	}
	if collectRecord.Active == 0 {
		return nil, fmt.Errorf("collect record not found")
	}
	// 校验发布任务存在
	publishTask, err := s.publishTaskRepository.FindById(uint(req.PublishTaskID))
	if err != nil {
		return nil, fmt.Errorf("publish task not found")
	}
	if publishTask.Active == 0 {
		return nil, fmt.Errorf("publish task not found")
	}
	entity, err := s.recordRepository.Create(&publishRecordRepository.PublishRecord{
		CollectRecordID: req.CollectRecordID,
		PublishTaskID:   req.PublishTaskID,
		AppUserID:       req.AppUserID,
		ShopID:          req.ShopID,
		Status:          "PENDING",
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishRecordDTO.PublishRecordDTO](entity), nil
}

func (s *PublishRecordService) UpdateRecord(id uint, req *publishRecordDTO.UpdatePublishRecordDTO) (*publishRecordDTO.PublishRecordDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.recordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, fmt.Errorf("publish record not found")
	}
	if req.ProductID != nil {
		entity.ProductID = *req.ProductID
	}
	if req.Status != nil {
		status, err := normalizeRecordStatus(*req.Status)
		if err != nil {
			return nil, err
		}
		entity.Status = status
		now := time.Now()
		if status == "RUNNING" && entity.StartedAt == nil {
			entity.StartedAt = &now
		}
		if (status == "SUCCESS" || status == "FAILED" || status == "CANCELLED") && entity.CompletedAt == nil {
			entity.CompletedAt = &now
		}
	}
	if req.CurrentStepCode != nil {
		entity.CurrentStepCode = strings.TrimSpace(*req.CurrentStepCode)
	}
	if req.ErrorMessage != nil {
		entity.ErrorMessage = *req.ErrorMessage
	}
	if req.OuterItemID != nil {
		entity.OuterItemID = strings.TrimSpace(*req.OuterItemID)
	}
	if req.StartedAt != nil {
		entity.StartedAt = req.StartedAt
	}
	if req.CompletedAt != nil {
		entity.CompletedAt = req.CompletedAt
	}
	saved, err := s.recordRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishRecordDTO.PublishRecordDTO](saved), nil
}

func (s *PublishRecordService) DeleteRecord(id uint) error {
	entity, err := s.recordRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return fmt.Errorf("publish record not found")
	}
	entity.Active = 0
	_, err = s.recordRepository.SaveOrUpdate(entity)
	return err
}

// ─── PublishRecordStep CRUD ───────────────────────────────────────────────────

func (s *PublishRecordService) ListSteps(recordID uint) ([]*publishRecordDTO.PublishRecordStepDTO, error) {
	entities, err := s.stepRepository.ListByRecordID(uint64(recordID))
	if err != nil {
		return nil, err
	}
	return db.ToDTOs[publishRecordDTO.PublishRecordStepDTO](entities), nil
}

func (s *PublishRecordService) CreateStep(recordID uint, req *publishRecordDTO.CreatePublishRecordStepDTO) (*publishRecordDTO.PublishRecordStepDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.StepCode) == "" {
		return nil, fmt.Errorf("stepCode is required")
	}
	record, err := s.recordRepository.FindById(recordID)
	if err != nil {
		return nil, err
	}
	if record.Active == 0 {
		return nil, fmt.Errorf("publish record not found")
	}
	status, err := normalizeRecordStepStatus(req.Status)
	if err != nil {
		return nil, err
	}
	entity, err := s.stepRepository.Create(&publishRecordRepository.PublishRecordStep{
		PublishRecordID: uint64(recordID),
		StepCode:        strings.ToUpper(strings.TrimSpace(req.StepCode)),
		StepOrder:       req.StepOrder,
		Status:          status,
		InputData:       req.InputData,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishRecordDTO.PublishRecordStepDTO](entity), nil
}

func (s *PublishRecordService) UpdateStep(recordID uint, stepID uint, req *publishRecordDTO.UpdatePublishRecordStepDTO) (*publishRecordDTO.PublishRecordStepDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.stepRepository.FindById(stepID)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 || entity.PublishRecordID != uint64(recordID) {
		return nil, fmt.Errorf("publish record step not found")
	}
	if req.Status != nil {
		status, err := normalizeRecordStepStatus(*req.Status)
		if err != nil {
			return nil, err
		}
		entity.Status = status
		now := time.Now()
		if status == "RUNNING" && entity.StartedAt == nil {
			entity.StartedAt = &now
		}
		if (status == "SUCCESS" || status == "FAILED" || status == "SKIPPED") && entity.CompletedAt == nil {
			entity.CompletedAt = &now
		}
	}
	if req.InputData != nil {
		entity.InputData = *req.InputData
	}
	if req.OutputData != nil {
		entity.OutputData = *req.OutputData
	}
	if req.ErrorMessage != nil {
		entity.ErrorMessage = *req.ErrorMessage
	}
	if req.RetryCount != nil {
		entity.RetryCount = *req.RetryCount
	}
	if req.StartedAt != nil {
		entity.StartedAt = req.StartedAt
	}
	if req.CompletedAt != nil {
		entity.CompletedAt = req.CompletedAt
	}
	saved, err := s.stepRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishRecordDTO.PublishRecordStepDTO](saved), nil
}
