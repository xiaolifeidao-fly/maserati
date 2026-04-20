package publish_task

import (
	"common/middleware/db"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	categoryRepository "service/category/repository"
	productRepository "service/product/repository"
	publishTaskRepository "service/publish_task/repository"

	"gorm.io/gorm"
)

type publishSuccessPayload struct {
	ProductTitle string
	TbCatID      string
	CategoryInfo string
	TbDraftID    string
}

type PublishTaskSuccessService struct {
	taskRepository               *publishTaskRepository.PublishTaskRepository
	productRepository            *productRepository.ProductRepository
	categoryRepository           *categoryRepository.CategoryRepository
	sourceProductTbCatRepository *categoryRepository.SourceProductTbCategoryRepository
	productDraftRepository       *productRepository.ProductDraftRepository
}

func NewPublishTaskSuccessService(taskRepository *publishTaskRepository.PublishTaskRepository) *PublishTaskSuccessService {
	return &PublishTaskSuccessService{
		taskRepository:               taskRepository,
		productRepository:            db.GetRepository[productRepository.ProductRepository](),
		categoryRepository:           db.GetRepository[categoryRepository.CategoryRepository](),
		sourceProductTbCatRepository: db.GetRepository[categoryRepository.SourceProductTbCategoryRepository](),
		productDraftRepository:       db.GetRepository[productRepository.ProductDraftRepository](),
	}
}

func (s *PublishTaskSuccessService) finalizeSuccessTask(task *publishTaskRepository.PublishTask, payload publishSuccessPayload) (*publishTaskRepository.PublishTask, error) {
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

func (s *PublishTaskSuccessService) upsertProduct(
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

func (s *PublishTaskSuccessService) upsertCategory(payload publishSuccessPayload) (*categoryRepository.Category, error) {
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

func (s *PublishTaskSuccessService) upsertSourceProductCategory(
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

func (s *PublishTaskSuccessService) deleteDraftRecord(
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
