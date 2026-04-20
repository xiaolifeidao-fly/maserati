package publish_task

import (
	"common/middleware/db"

	publishTaskRepository "service/publish_task/repository"
)

type PublishTaskService struct {
	*PublishTaskManagementService
	*PublishTaskStepService

	taskRepository *publishTaskRepository.PublishTaskRepository
	stepRepository *publishTaskRepository.PublishStepRepository
}

func NewPublishTaskService() *PublishTaskService {
	taskRepository := db.GetRepository[publishTaskRepository.PublishTaskRepository]()
	stepRepository := db.GetRepository[publishTaskRepository.PublishStepRepository]()
	successService := NewPublishTaskSuccessService(taskRepository)

	return &PublishTaskService{
		PublishTaskManagementService: NewPublishTaskManagementService(taskRepository, successService),
		PublishTaskStepService:       NewPublishTaskStepService(taskRepository, stepRepository),
		taskRepository:               taskRepository,
		stepRepository:               stepRepository,
	}
}

func (s *PublishTaskService) EnsureTable() error {
	if err := s.taskRepository.EnsureTable(); err != nil {
		return err
	}
	return s.stepRepository.EnsureTable()
}
