package notice

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	noticeDTO "service/notice/dto"
	noticeRepository "service/notice/repository"
	"strings"

	"gorm.io/gorm"
)

type NoticeService struct {
	noticeRepository *noticeRepository.NoticeRepository
}

func NewNoticeService() *NoticeService {
	return &NoticeService{
		noticeRepository: db.GetRepository[noticeRepository.NoticeRepository](),
	}
}

func (s *NoticeService) EnsureTable() error {
	return s.noticeRepository.EnsureTable()
}

func (s *NoticeService) ListNotices(query noticeDTO.NoticeQueryDTO) (*baseDTO.PageDTO[noticeDTO.NoticeDTO], error) {
	pageIndex, pageSize := normalizeNoticePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.noticeRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.noticeRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}

	return baseDTO.BuildPage(int(total), db.ToDTOs[noticeDTO.NoticeDTO](entities)), nil
}

func (s *NoticeService) GetNoticeByID(id uint) (*noticeDTO.NoticeDTO, error) {
	entity, err := s.noticeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[noticeDTO.NoticeDTO](entity), nil
}

func (s *NoticeService) CreateNotice(req *noticeDTO.CreateNoticeDTO) (*noticeDTO.NoticeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	created, err := s.noticeRepository.Create(&noticeRepository.Notice{
		AppUserID: req.AppUserID,
		Title:     strings.TrimSpace(req.Title),
		Content:   strings.TrimSpace(req.Content),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[noticeDTO.NoticeDTO](created), nil
}

func (s *NoticeService) UpdateNotice(id uint, req *noticeDTO.UpdateNoticeDTO) (*noticeDTO.NoticeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.noticeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Title != nil {
		entity.Title = strings.TrimSpace(*req.Title)
	}
	if req.Content != nil {
		entity.Content = strings.TrimSpace(*req.Content)
	}
	saved, err := s.noticeRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[noticeDTO.NoticeDTO](saved), nil
}

func (s *NoticeService) DeleteNotice(id uint) error {
	entity, err := s.noticeRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.noticeRepository.SaveOrUpdate(entity)
	return err
}

func normalizeNoticePage(page, pageIndex, pageSize int) (int, int) {
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
