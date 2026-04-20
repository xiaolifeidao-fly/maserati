package publish_task

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"errors"
	"fmt"
	"strings"

	collectRepository "service/collect/repository"
	publishTaskDTO "service/publish_task/dto"
	publishTaskRepository "service/publish_task/repository"

	"gorm.io/gorm"
)

var validTaskStatuses = map[string]struct{}{
	"PENDING":   {},
	"RUNNING":   {},
	"SUCCESS":   {},
	"FAILED":    {},
	"CANCELLED": {},
}

var validSourceTypes = map[string]struct{}{
	"TB":  {},
	"PXX": {},
}

type PublishTaskManagementService struct {
	taskRepository          *publishTaskRepository.PublishTaskRepository
	collectBatchRepository  *collectRepository.CollectBatchRepository
	collectRecordRepository *collectRepository.CollectRecordRepository
	successService          *PublishTaskSuccessService
}

func NewPublishTaskManagementService(
	taskRepository *publishTaskRepository.PublishTaskRepository,
	successService *PublishTaskSuccessService,
) *PublishTaskManagementService {
	return &PublishTaskManagementService{
		taskRepository:          taskRepository,
		collectBatchRepository:  db.GetRepository[collectRepository.CollectBatchRepository](),
		collectRecordRepository: db.GetRepository[collectRepository.CollectRecordRepository](),
		successService:          successService,
	}
}

func normalizeTaskPage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeTaskStatus(v string) (string, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	if v == "" {
		return "PENDING", nil
	}
	if _, ok := validTaskStatuses[v]; !ok {
		return "", fmt.Errorf("invalid task status: %s", v)
	}
	return v, nil
}

func normalizeSourceType(v string) (string, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	if _, ok := validSourceTypes[v]; !ok {
		return "", fmt.Errorf("invalid source type: %s, must be TB or PXX", v)
	}
	return v, nil
}

func (s *PublishTaskManagementService) ListTasks(query publishTaskDTO.PublishTaskQueryDTO) (*baseDTO.PageDTO[publishTaskDTO.PublishTaskDTO], error) {
	pageIndex, pageSize := normalizeTaskPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.taskRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.taskRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[publishTaskDTO.PublishTaskDTO](entities)), nil
}

func (s *PublishTaskManagementService) GetTaskByID(id uint) (*publishTaskDTO.PublishTaskDTO, error) {
	entity, err := s.taskRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, fmt.Errorf("publish task not found")
	}
	return db.ToDTO[publishTaskDTO.PublishTaskDTO](entity), nil
}

func (s *PublishTaskManagementService) GetBatchRepublishStats(batchID, appUserID uint64) (*publishTaskDTO.PublishBatchRepublishStatsDTO, error) {
	batch, err := s.collectBatchRepository.FindById(uint(batchID))
	if err != nil {
		return nil, err
	}
	if batch.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	row, err := s.taskRepository.GetBatchRepublishStats(batchID, appUserID)
	if err != nil {
		return nil, err
	}
	return &publishTaskDTO.PublishBatchRepublishStatsDTO{
		BatchID:      batchID,
		TotalCount:   row.TotalCount,
		SuccessCount: row.SuccessCount,
		FailedCount:  row.FailedCount,
		PendingCount: row.PendingCount,
	}, nil
}

func (s *PublishTaskManagementService) CreateTask(req *publishTaskDTO.CreatePublishTaskDTO) (*publishTaskDTO.PublishTaskDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if req.ShopID == 0 {
		return nil, fmt.Errorf("shopId is required")
	}
	sourceType, err := normalizeSourceType(req.SourceType)
	if err != nil {
		return nil, err
	}
	sourceProductID := strings.TrimSpace(req.SourceProductID)
	if sourceProductID == "" {
		return nil, fmt.Errorf("sourceProductId is required")
	}
	if req.SourceRecordID == 0 {
		return nil, fmt.Errorf("sourceRecordId is required")
	}
	collectBatchID, err := s.resolveCollectBatchID(req.CollectBatchID, req.SourceRecordID)
	if err != nil {
		return nil, err
	}
	if collectBatchID == 0 {
		return nil, fmt.Errorf("collectBatchId is required")
	}
	existingSuccess, err := s.taskRepository.FindLatestSuccessByIdentity(
		collectBatchID,
		req.AppUserID,
		req.ShopID,
		sourceProductID,
	)
	if err == nil && existingSuccess != nil {
		return db.ToDTO[publishTaskDTO.PublishTaskDTO](existingSuccess), nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	entity, err := s.taskRepository.Create(&publishTaskRepository.PublishTask{
		AppUserID:       req.AppUserID,
		ShopID:          req.ShopID,
		CollectBatchID:  collectBatchID,
		ProductID:       req.ProductID,
		SourceType:      sourceType,
		SourceProductID: sourceProductID,
		SourceRecordID:  req.SourceRecordID,
		Status:          "PENDING",
		Remark:          strings.TrimSpace(req.Remark),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishTaskDTO.PublishTaskDTO](entity), nil
}

func (s *PublishTaskManagementService) UpdateTask(id uint, req *publishTaskDTO.UpdatePublishTaskDTO) (*publishTaskDTO.PublishTaskDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.taskRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, fmt.Errorf("publish task not found")
	}
	successPayload := publishSuccessPayload{}
	if req.CollectBatchID != nil {
		entity.CollectBatchID = *req.CollectBatchID
	}
	if req.ProductID != nil {
		entity.ProductID = *req.ProductID
	}
	if req.Status != nil {
		status, err := normalizeTaskStatus(*req.Status)
		if err != nil {
			return nil, err
		}
		entity.Status = status
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
	if req.ProductTitle != nil {
		successPayload.ProductTitle = strings.TrimSpace(*req.ProductTitle)
	}
	if req.TbCatID != nil {
		successPayload.TbCatID = strings.TrimSpace(*req.TbCatID)
	}
	if req.CategoryInfo != nil {
		successPayload.CategoryInfo = strings.TrimSpace(*req.CategoryInfo)
	}
	if req.TbDraftID != nil {
		successPayload.TbDraftID = strings.TrimSpace(*req.TbDraftID)
	}
	if req.Remark != nil {
		entity.Remark = strings.TrimSpace(*req.Remark)
	}
	saved, err := s.taskRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	if saved.Status == "SUCCESS" {
		saved, err = s.successService.finalizeSuccessTask(saved, successPayload)
		if err != nil {
			return nil, err
		}
	}
	return db.ToDTO[publishTaskDTO.PublishTaskDTO](saved), nil
}

func (s *PublishTaskManagementService) DeleteTask(id uint) error {
	entity, err := s.taskRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return fmt.Errorf("publish task not found")
	}
	entity.Active = 0
	_, err = s.taskRepository.SaveOrUpdate(entity)
	return err
}

func (s *PublishTaskManagementService) resolveCollectBatchID(collectBatchID, sourceRecordID uint64) (uint64, error) {
	if collectBatchID > 0 {
		return collectBatchID, nil
	}
	if sourceRecordID == 0 {
		return 0, nil
	}
	record, err := s.collectRecordRepository.FindById(uint(sourceRecordID))
	if err != nil {
		return 0, err
	}
	if record.Active == 0 {
		return 0, gorm.ErrRecordNotFound
	}
	return record.CollectBatchID, nil
}
