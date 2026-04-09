package publish_task

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	"strings"
	"time"

	appUserRepository "service/app_user/repository"
	publishTaskDTO "service/publish_task/dto"
	publishTaskRepository "service/publish_task/repository"
	shopRepository "service/shop/repository"
)

// 允许的任务状态值
var validTaskStatuses = map[string]struct{}{
	"PENDING":   {},
	"RUNNING":   {},
	"SUCCESS":   {},
	"FAILED":    {},
	"CANCELLED": {},
}

// 允许的步骤状态值
var validStepStatuses = map[string]struct{}{
	"PENDING": {},
	"RUNNING": {},
	"SUCCESS": {},
	"FAILED":  {},
	"SKIPPED": {},
}

// 允许的源数据类型
var validSourceTypes = map[string]struct{}{
	"TB":  {},
	"PXX": {},
}

type PublishTaskService struct {
	taskRepository    *publishTaskRepository.PublishTaskRepository
	stepRepository    *publishTaskRepository.PublishStepRepository
	appUserRepository *appUserRepository.AppUserRepository
	shopRepository    *shopRepository.ShopRepository
}

func NewPublishTaskService() *PublishTaskService {
	return &PublishTaskService{
		taskRepository:    db.GetRepository[publishTaskRepository.PublishTaskRepository](),
		stepRepository:    db.GetRepository[publishTaskRepository.PublishStepRepository](),
		appUserRepository: db.GetRepository[appUserRepository.AppUserRepository](),
		shopRepository:    db.GetRepository[shopRepository.ShopRepository](),
	}
}

func (s *PublishTaskService) EnsureTable() error {
	if err := s.taskRepository.EnsureTable(); err != nil {
		return err
	}
	return s.stepRepository.EnsureTable()
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

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

func normalizeStepStatus(v string) (string, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	if v == "" {
		return "PENDING", nil
	}
	if _, ok := validStepStatuses[v]; !ok {
		return "", fmt.Errorf("invalid step status: %s", v)
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

// ─── PublishTask CRUD ─────────────────────────────────────────────────────────

func (s *PublishTaskService) ListTasks(query publishTaskDTO.PublishTaskQueryDTO) (*baseDTO.PageDTO[publishTaskDTO.PublishTaskDTO], error) {
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

func (s *PublishTaskService) GetTaskByID(id uint) (*publishTaskDTO.PublishTaskDTO, error) {
	entity, err := s.taskRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, fmt.Errorf("publish task not found")
	}
	return db.ToDTO[publishTaskDTO.PublishTaskDTO](entity), nil
}

func (s *PublishTaskService) CreateTask(req *publishTaskDTO.CreatePublishTaskDTO) (*publishTaskDTO.PublishTaskDTO, error) {
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
	entity, err := s.taskRepository.Create(&publishTaskRepository.PublishTask{
		AppUserID:       req.AppUserID,
		ShopID:          req.ShopID,
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

func (s *PublishTaskService) UpdateTask(id uint, req *publishTaskDTO.UpdatePublishTaskDTO) (*publishTaskDTO.PublishTaskDTO, error) {
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
	if req.Remark != nil {
		entity.Remark = strings.TrimSpace(*req.Remark)
	}
	saved, err := s.taskRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishTaskDTO.PublishTaskDTO](saved), nil
}

func (s *PublishTaskService) DeleteTask(id uint) error {
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

// ─── PublishStep CRUD ─────────────────────────────────────────────────────────

func (s *PublishTaskService) ListSteps(taskID uint) ([]*publishTaskDTO.PublishStepDTO, error) {
	entities, err := s.stepRepository.ListByTaskID(uint64(taskID))
	if err != nil {
		return nil, err
	}
	return db.ToDTOs[publishTaskDTO.PublishStepDTO](entities), nil
}

func (s *PublishTaskService) CreateStep(taskID uint, req *publishTaskDTO.CreatePublishStepDTO) (*publishTaskDTO.PublishStepDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.StepCode) == "" {
		return nil, fmt.Errorf("stepCode is required")
	}
	// 确认所属任务存在
	task, err := s.taskRepository.FindById(taskID)
	if err != nil {
		return nil, err
	}
	if task.Active == 0 {
		return nil, fmt.Errorf("publish task not found")
	}
	status, err := normalizeStepStatus(req.Status)
	if err != nil {
		return nil, err
	}
	entity, err := s.stepRepository.Create(&publishTaskRepository.PublishStep{
		PublishTaskID: uint64(taskID),
		StepCode:      strings.ToUpper(strings.TrimSpace(req.StepCode)),
		StepOrder:     req.StepOrder,
		Status:        status,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[publishTaskDTO.PublishStepDTO](entity), nil
}

func (s *PublishTaskService) UpdateStep(taskID uint, stepID uint, req *publishTaskDTO.UpdatePublishStepDTO) (*publishTaskDTO.PublishStepDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.stepRepository.FindById(stepID)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 || entity.PublishTaskID != uint64(taskID) {
		return nil, fmt.Errorf("publish step not found")
	}
	if req.Status != nil {
		status, err := normalizeStepStatus(*req.Status)
		if err != nil {
			return nil, err
		}
		entity.Status = status
		// 自动填充时间戳
		now := time.Now()
		if status == "RUNNING" && entity.StartedAt == nil {
			entity.StartedAt = &now
		}
		if (status == "SUCCESS" || status == "FAILED" || status == "SKIPPED") && entity.CompletedAt == nil {
			entity.CompletedAt = &now
		}
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
	return db.ToDTO[publishTaskDTO.PublishStepDTO](saved), nil
}
