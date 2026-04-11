package publish_task

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	appUserRepository "service/app_user/repository"
	categoryRepository "service/category/repository"
	collectRepository "service/collect/repository"
	productRepository "service/product/repository"
	publishTaskDTO "service/publish_task/dto"
	publishTaskRepository "service/publish_task/repository"
	shopRepository "service/shop/repository"

	"gorm.io/gorm"
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
	taskRepository               *publishTaskRepository.PublishTaskRepository
	stepRepository               *publishTaskRepository.PublishStepRepository
	appUserRepository            *appUserRepository.AppUserRepository
	shopRepository               *shopRepository.ShopRepository
	collectBatchRepository       *collectRepository.CollectBatchRepository
	collectRecordRepository      *collectRepository.CollectRecordRepository
	productRepository            *productRepository.ProductRepository
	categoryRepository           *categoryRepository.CategoryRepository
	sourceProductTbCatRepository *categoryRepository.SourceProductTbCategoryRepository
	productDraftRepository       *productRepository.ProductDraftRepository
}

func NewPublishTaskService() *PublishTaskService {
	return &PublishTaskService{
		taskRepository:               db.GetRepository[publishTaskRepository.PublishTaskRepository](),
		stepRepository:               db.GetRepository[publishTaskRepository.PublishStepRepository](),
		appUserRepository:            db.GetRepository[appUserRepository.AppUserRepository](),
		shopRepository:               db.GetRepository[shopRepository.ShopRepository](),
		collectBatchRepository:       db.GetRepository[collectRepository.CollectBatchRepository](),
		collectRecordRepository:      db.GetRepository[collectRepository.CollectRecordRepository](),
		productRepository:            db.GetRepository[productRepository.ProductRepository](),
		categoryRepository:           db.GetRepository[categoryRepository.CategoryRepository](),
		sourceProductTbCatRepository: db.GetRepository[categoryRepository.SourceProductTbCategoryRepository](),
		productDraftRepository:       db.GetRepository[productRepository.ProductDraftRepository](),
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

type publishSuccessPayload struct {
	ProductTitle string
	TbCatID      string
	CategoryInfo string
	TbDraftID    string
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

func (s *PublishTaskService) GetBatchRepublishStats(batchID, appUserID uint64) (*publishTaskDTO.PublishBatchRepublishStatsDTO, error) {
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
		saved, err = s.finalizeSuccessTask(saved, successPayload)
		if err != nil {
			return nil, err
		}
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

func (s *PublishTaskService) resolveCollectBatchID(collectBatchID, sourceRecordID uint64) (uint64, error) {
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

func (s *PublishTaskService) finalizeSuccessTask(task *publishTaskRepository.PublishTask, payload publishSuccessPayload) (*publishTaskRepository.PublishTask, error) {
	if task == nil {
		return nil, fmt.Errorf("publish task is nil")
	}

	categoryEntity, err := s.upsertCategory(payload)
	if err != nil {
		return nil, err
	}
	if err := s.upsertSourceProductCategory(task, payload); err != nil {
		return nil, err
	}

	productID, err := s.upsertProduct(task, payload, categoryEntity)
	if err != nil {
		return nil, err
	}
	if productID > 0 {
		task.ProductID = productID
	}
	if err := s.deleteDraftRecord(task, payload); err != nil {
		return nil, err
	}

	saved, err := s.taskRepository.SaveOrUpdate(task)
	if err != nil {
		return nil, err
	}
	return saved, nil
}

func (s *PublishTaskService) upsertProduct(
	task *publishTaskRepository.PublishTask,
	payload publishSuccessPayload,
	categoryEntity *categoryRepository.Category,
) (uint64, error) {
	if task == nil {
		return 0, fmt.Errorf("publish task is nil")
	}
	title := strings.TrimSpace(payload.ProductTitle)
	if title == "" {
		title = strings.TrimSpace(task.SourceProductID)
	}

	var entity *productRepository.Product
	var err error
	switch {
	case task.ProductID > 0:
		entity, err = s.productRepository.FindById(uint(task.ProductID))
	case task.SourceRecordID > 0:
		entity, err = s.productRepository.FindByCollectRecordID(task.SourceRecordID)
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}
	if entity != nil && entity.Active == 0 {
		entity = nil
	}

	categoryID := uint64(0)
	if categoryEntity != nil {
		categoryID = uint64(categoryEntity.Id)
	}

	if entity == nil {
		created, createErr := s.productRepository.Create(&productRepository.Product{
			AppUserID:       task.AppUserID,
			ShopID:          task.ShopID,
			CategoryID:      categoryID,
			CollectRecordID: task.SourceRecordID,
			Title:           title,
			OuterProductID:  strings.TrimSpace(task.OuterItemID),
			Status:          "PUBLISHED",
		})
		if createErr != nil {
			return 0, createErr
		}
		return uint64(created.Id), nil
	}

	entity.AppUserID = task.AppUserID
	entity.ShopID = task.ShopID
	entity.CollectRecordID = task.SourceRecordID
	entity.OuterProductID = strings.TrimSpace(task.OuterItemID)
	entity.Status = "PUBLISHED"
	if title != "" {
		entity.Title = title
	}
	if categoryID > 0 {
		entity.CategoryID = categoryID
	}
	saved, saveErr := s.productRepository.SaveOrUpdate(entity)
	if saveErr != nil {
		return 0, saveErr
	}
	return uint64(saved.Id), nil
}

func (s *PublishTaskService) upsertCategory(payload publishSuccessPayload) (*categoryRepository.Category, error) {
	tbCatID, catName := extractTbCategory(payload.TbCatID, payload.CategoryInfo)
	if tbCatID == "" {
		return nil, nil
	}
	existing, err := s.categoryRepository.FindByCode(tbCatID)
	if err == nil && existing != nil {
		if catName != "" && existing.Name != catName {
			existing.Name = catName
			saved, saveErr := s.categoryRepository.SaveOrUpdate(existing)
			if saveErr != nil {
				return nil, saveErr
			}
			return saved, nil
		}
		return existing, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	created, createErr := s.categoryRepository.Create(&categoryRepository.Category{
		PlatformID: 0,
		Code:       tbCatID,
		Name:       defaultString(catName, tbCatID),
	})
	if createErr != nil {
		return nil, createErr
	}
	return created, nil
}

func (s *PublishTaskService) upsertSourceProductCategory(
	task *publishTaskRepository.PublishTask,
	payload publishSuccessPayload,
) error {
	sourceProductID := strings.TrimSpace(task.SourceProductID)
	tbCatID, _ := extractTbCategory(payload.TbCatID, payload.CategoryInfo)
	if sourceProductID == "" || tbCatID == "" {
		return nil
	}
	existing, err := s.sourceProductTbCatRepository.FindBySourceProductID(sourceProductID)
	if err == nil && existing != nil {
		existing.TbCatID = tbCatID
		if payload.CategoryInfo != "" {
			existing.CategoryInfo = payload.CategoryInfo
		}
		_, saveErr := s.sourceProductTbCatRepository.SaveOrUpdate(existing)
		return saveErr
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	_, createErr := s.sourceProductTbCatRepository.Create(&categoryRepository.SourceProductTbCategory{
		SourceProductID: sourceProductID,
		TbCatID:         tbCatID,
		CategoryInfo:    payload.CategoryInfo,
	})
	return createErr
}

func (s *PublishTaskService) deleteDraftRecord(
	task *publishTaskRepository.PublishTask,
	payload publishSuccessPayload,
) error {
	tbDraftID := strings.TrimSpace(payload.TbDraftID)
	tbCatID, _ := extractTbCategory(payload.TbCatID, payload.CategoryInfo)

	var entity *productRepository.ProductDraft
	var err error
	if tbDraftID != "" {
		entity, err = s.productDraftRepository.FindByTbDraftID(tbDraftID)
	} else if strings.TrimSpace(task.SourceProductID) != "" && task.ShopID > 0 && tbCatID != "" {
		entity, err = s.productDraftRepository.FindByIdentity(task.SourceProductID, task.ShopID, tbCatID)
	}
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if entity == nil || entity.Active == 0 {
		return nil
	}
	entity.Status = "PUBLISHED"
	entity.Active = 0
	_, err = s.productDraftRepository.SaveOrUpdate(entity)
	return err
}

func extractTbCategory(tbCatID, categoryInfo string) (string, string) {
	tbCatID = strings.TrimSpace(tbCatID)
	categoryInfo = strings.TrimSpace(categoryInfo)
	if categoryInfo == "" {
		return tbCatID, ""
	}
	var payload struct {
		CatID   string `json:"catId"`
		CatName string `json:"catName"`
	}
	if err := json.Unmarshal([]byte(categoryInfo), &payload); err != nil {
		return tbCatID, ""
	}
	if strings.TrimSpace(payload.CatID) != "" {
		tbCatID = strings.TrimSpace(payload.CatID)
	}
	return tbCatID, strings.TrimSpace(payload.CatName)
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return strings.TrimSpace(fallback)
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
