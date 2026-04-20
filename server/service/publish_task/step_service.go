package publish_task

import (
	"common/middleware/db"
	"fmt"
	"strings"
	"time"

	publishTaskDTO "service/publish_task/dto"
	publishTaskRepository "service/publish_task/repository"
)

var validStepStatuses = map[string]struct{}{
	"PENDING": {},
	"RUNNING": {},
	"SUCCESS": {},
	"FAILED":  {},
	"SKIPPED": {},
}

type PublishTaskStepService struct {
	taskRepository *publishTaskRepository.PublishTaskRepository
	stepRepository *publishTaskRepository.PublishStepRepository
}

func NewPublishTaskStepService(
	taskRepository *publishTaskRepository.PublishTaskRepository,
	stepRepository *publishTaskRepository.PublishStepRepository,
) *PublishTaskStepService {
	return &PublishTaskStepService{
		taskRepository: taskRepository,
		stepRepository: stepRepository,
	}
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

func (s *PublishTaskStepService) ListSteps(taskID uint) ([]*publishTaskDTO.PublishStepDTO, error) {
	entities, err := s.stepRepository.ListByTaskID(uint64(taskID))
	if err != nil {
		return nil, err
	}
	return db.ToDTOs[publishTaskDTO.PublishStepDTO](entities), nil
}

func (s *PublishTaskStepService) CreateStep(taskID uint, req *publishTaskDTO.CreatePublishStepDTO) (*publishTaskDTO.PublishStepDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.StepCode) == "" {
		return nil, fmt.Errorf("stepCode is required")
	}
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

func (s *PublishTaskStepService) UpdateStep(taskID uint, stepID uint, req *publishTaskDTO.UpdatePublishStepDTO) (*publishTaskDTO.PublishStepDTO, error) {
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
