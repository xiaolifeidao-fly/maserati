package publish_task

import (
	"common/middleware/db"
	"fmt"
	publishTaskDTO "service/publish_task/dto"
	publishTaskRepository "service/publish_task/repository"
	"strings"
)

// 合法的任务状态集合
var validTaskStatuses = map[string]struct{}{
	"PENDING": {}, "RUNNING": {}, "PAUSED": {}, "SUCCESS": {}, "FAILED": {},
}

// 合法的步骤状态集合
var validStepStatuses = map[string]struct{}{
	"PENDING": {}, "RUNNING": {}, "SUCCESS": {}, "FAILED": {}, "SKIPPED": {}, "WAITING_CAPTCHA": {},
}

type PublishTaskService struct {
	taskRepo *publishTaskRepository.PublishTaskRepository
	stepRepo *publishTaskRepository.PublishTaskStepRepository
}

func NewPublishTaskService() *PublishTaskService {
	return &PublishTaskService{
		taskRepo: db.GetRepository[publishTaskRepository.PublishTaskRepository](),
		stepRepo: db.GetRepository[publishTaskRepository.PublishTaskStepRepository](),
	}
}

func (s *PublishTaskService) EnsureTable() error {
	if err := s.taskRepo.EnsureTable(); err != nil {
		return err
	}
	return s.stepRepo.EnsureTable()
}

// ─── 分页查询 ─────────────────────────────────────────────────────────────────

func (s *PublishTaskService) ListTasks(
	dto publishTaskDTO.PublishTaskQueryDTO,
) ([]*publishTaskDTO.PublishTaskDTO, int64, error) {
	pageIndex, pageSize := normalizePage(dto.Page, dto.PageIndex, dto.PageSize)

	total, err := s.taskRepo.CountByQuery(dto)
	if err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []*publishTaskDTO.PublishTaskDTO{}, 0, nil
	}

	entities, err := s.taskRepo.ListByQuery(dto, pageIndex, pageSize)
	if err != nil {
		return nil, 0, err
	}

	result := make([]*publishTaskDTO.PublishTaskDTO, 0, len(entities))
	for _, e := range entities {
		result = append(result, taskToDTO(e, nil))
	}
	return result, total, nil
}

// ─── 单个查询 ─────────────────────────────────────────────────────────────────

func (s *PublishTaskService) GetTaskByID(
	appUserID, taskID uint64,
) (*publishTaskDTO.PublishTaskDTO, error) {
	entity, err := s.taskRepo.FindByID(taskID)
	if err != nil {
		return nil, err
	}
	if entity == nil || entity.AppUserID != appUserID {
		return nil, fmt.Errorf("task not found: %d", taskID)
	}

	steps, err := s.stepRepo.ListByTaskID(taskID)
	if err != nil {
		return nil, err
	}

	return taskToDTO(entity, steps), nil
}

// ─── 创建任务 ─────────────────────────────────────────────────────────────────

func (s *PublishTaskService) CreateTask(
	dto publishTaskDTO.CreatePublishTaskDTO,
) (*publishTaskDTO.PublishTaskDTO, error) {
	if dto.AppUserID == 0 {
		return nil, fmt.Errorf("appUserID is required")
	}
	if dto.ShopID == 0 {
		return nil, fmt.Errorf("shopID is required")
	}
	sourceType := normalizeSourceType(dto.SourceType)
	if sourceType == "" {
		return nil, fmt.Errorf("invalid sourceType: %s", dto.SourceType)
	}

	entity := &publishTaskRepository.PublishTask{
		AppUserID:       dto.AppUserID,
		ShopID:          dto.ShopID,
		ProductID:       dto.ProductID,
		OuterProductID:  dto.OuterProductID,
		SourceType:      sourceType,
		Status:          "PENDING",
		ContextSnapshot: dto.ContextSnapshot,
	}

	if err := s.taskRepo.Create(entity); err != nil {
		return nil, err
	}
	return taskToDTO(entity, nil), nil
}

// ─── 更新任务 ─────────────────────────────────────────────────────────────────

func (s *PublishTaskService) UpdateTask(
	appUserID, taskID uint64,
	dto publishTaskDTO.UpdatePublishTaskDTO,
) (*publishTaskDTO.PublishTaskDTO, error) {
	entity, err := s.taskRepo.FindByID(taskID)
	if err != nil {
		return nil, err
	}
	if entity == nil || entity.AppUserID != appUserID {
		return nil, fmt.Errorf("task not found: %d", taskID)
	}

	if dto.Status != nil {
		normalized := strings.ToUpper(strings.TrimSpace(*dto.Status))
		if _, ok := validTaskStatuses[normalized]; !ok {
			return nil, fmt.Errorf("invalid status: %s", *dto.Status)
		}
		entity.Status = normalized
	}
	if dto.CurrentStepName != nil {
		entity.CurrentStepName = *dto.CurrentStepName
	}
	if dto.TotalSteps != nil {
		entity.TotalSteps = *dto.TotalSteps
	}
	if dto.CompletedSteps != nil {
		entity.CompletedSteps = *dto.CompletedSteps
	}
	if dto.ErrorMessage != nil {
		entity.ErrorMessage = *dto.ErrorMessage
	}
	if dto.ContextSnapshot != nil {
		entity.ContextSnapshot = *dto.ContextSnapshot
	}
	if dto.PublishedItemID != nil {
		entity.PublishedItemID = *dto.PublishedItemID
	}
	if dto.ProductID != nil {
		entity.ProductID = *dto.ProductID
	}

	if err := s.taskRepo.Save(entity); err != nil {
		return nil, err
	}
	return taskToDTO(entity, nil), nil
}

// ─── 更新步骤 ─────────────────────────────────────────────────────────────────

func (s *PublishTaskService) UpsertStep(
	dto publishTaskDTO.UpsertPublishTaskStepDTO,
) (*publishTaskDTO.PublishTaskStepDTO, error) {
	if dto.TaskID == 0 {
		return nil, fmt.Errorf("taskID is required")
	}

	normalized := strings.ToUpper(strings.TrimSpace(dto.Status))
	if _, ok := validStepStatuses[normalized]; !ok {
		return nil, fmt.Errorf("invalid step status: %s", dto.Status)
	}

	// 查找已有步骤
	steps, err := s.stepRepo.ListByTaskID(dto.TaskID)
	if err != nil {
		return nil, err
	}

	var existing *publishTaskRepository.PublishTaskStep
	for _, step := range steps {
		if step.StepName == dto.StepName {
			existing = step
			break
		}
	}

	if existing == nil {
		existing = &publishTaskRepository.PublishTaskStep{
			TaskID:    dto.TaskID,
			StepName:  dto.StepName,
			StepIndex: dto.StepIndex,
		}
	}

	existing.Status = normalized
	existing.ErrorMessage = dto.ErrorMessage
	existing.RetryCount = dto.RetryCount
	existing.StartedAt = dto.StartedAt
	existing.FinishedAt = dto.FinishedAt

	if err := s.stepRepo.UpsertStep(existing); err != nil {
		return nil, err
	}
	return stepToDTO(existing), nil
}

// ─── 私有工具函数 ─────────────────────────────────────────────────────────────

func normalizePage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeSourceType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "tb":
		return "tb"
	case "pxx":
		return "pxx"
	default:
		return ""
	}
}

func taskToDTO(
	e *publishTaskRepository.PublishTask,
	steps []*publishTaskRepository.PublishTaskStep,
) *publishTaskDTO.PublishTaskDTO {
	d := &publishTaskDTO.PublishTaskDTO{
		AppUserID:       e.AppUserID,
		ShopID:          e.ShopID,
		ProductID:       e.ProductID,
		OuterProductID:  e.OuterProductID,
		SourceType:      e.SourceType,
		Status:          e.Status,
		CurrentStepName: e.CurrentStepName,
		TotalSteps:      e.TotalSteps,
		CompletedSteps:  e.CompletedSteps,
		ErrorMessage:    e.ErrorMessage,
		ContextSnapshot: e.ContextSnapshot,
		PublishedItemID: e.PublishedItemID,
	}
	d.ID = e.ID
	d.CreatedTime = e.CreatedTime
	d.UpdatedTime = e.UpdatedTime

	if steps != nil {
		d.Steps = make([]publishTaskDTO.PublishTaskStepDTO, 0, len(steps))
		for _, s := range steps {
			d.Steps = append(d.Steps, *stepToDTO(s))
		}
	}
	return d
}

func stepToDTO(s *publishTaskRepository.PublishTaskStep) *publishTaskDTO.PublishTaskStepDTO {
	d := &publishTaskDTO.PublishTaskStepDTO{
		TaskID:       s.TaskID,
		StepName:     s.StepName,
		StepIndex:    s.StepIndex,
		Status:       s.Status,
		ErrorMessage: s.ErrorMessage,
		RetryCount:   s.RetryCount,
		StartedAt:    s.StartedAt,
		FinishedAt:   s.FinishedAt,
	}
	d.ID = s.ID
	d.CreatedTime = s.CreatedTime
	d.UpdatedTime = s.UpdatedTime
	return d
}
