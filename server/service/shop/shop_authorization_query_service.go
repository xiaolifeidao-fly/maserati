package shop

import (
	baseDTO "common/base/dto"
	shopDTO "service/shop/dto"
	"strings"
)

func (s *ShopService) ListShopAuthorizations(query shopDTO.ShopAuthorizationQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopAuthorizationDTO], error) {
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	repositoryQuery := query
	repositoryQuery.Status = strings.TrimSpace(repositoryQuery.Status)
	if repositoryQuery.Status != "" {
		repositoryQuery.Status = normalizeShopAuthorizationStatus(repositoryQuery.Status)
	}
	total, err := s.shopAuthorizationRepository.CountByQuery(repositoryQuery)
	if err != nil {
		return nil, err
	}
	entities, err := s.shopAuthorizationRepository.ListByQuery(repositoryQuery, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), toShopAuthorizationDTOs(entities)), nil
}
