package logistics

import (
	"common/middleware/db"
	logisticsRepository "service/logistics/repository"
)

type LogisticsService struct {
	addressRepository  *logisticsRepository.AddressRepository
	templateRepository *logisticsRepository.AddressTemplateRepository
}

func NewLogisticsService() *LogisticsService {
	return &LogisticsService{
		addressRepository:  db.GetRepository[logisticsRepository.AddressRepository](),
		templateRepository: db.GetRepository[logisticsRepository.AddressTemplateRepository](),
	}
}

func (s *LogisticsService) EnsureTable() error {
	if err := s.addressRepository.EnsureTable(); err != nil {
		return err
	}
	return s.templateRepository.EnsureTable()
}

func normalizeLogisticsPage(page, pageIndex, pageSize int) (int, int) {
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
