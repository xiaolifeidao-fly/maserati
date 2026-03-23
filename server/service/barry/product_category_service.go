package barry

import (
	"context"
	"fmt"

	barryDTO "service/barry/dto"
)

type ProductCategoryService struct {
	client *Client
}

func NewProductCategoryService(client *Client) *ProductCategoryService {
	return &ProductCategoryService{client: client}
}

func (s *ProductCategoryService) List(ctx context.Context, query barryDTO.ProductCategoryQueryDTO) (*barryDTO.ProductCategoryListResponseDTO, error) {
	response := &barryDTO.ProductCategoryListResponseDTO{}
	requestURL := innerServicePath(barryInnerManualListSuffixPath)
	err := s.client.GetAbsolute(ctx, requestURL, buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"code", query.Code,
		"name", query.Name,
		"status", query.Status,
		"shopGroupId", query.ShopGroupID,
		"shopTypeCode", query.ShopTypeCode,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}

func (s *ProductCategoryService) Save(ctx context.Context, req *barryDTO.SaveProductCategoryDTO) (*barryDTO.ProductCategoryActionResultDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	response := &barryDTO.ProductCategoryActionResultDTO{}
	err := s.client.PostAbsolute(ctx, innerServicePath(barryInnerManualSaveSuffixPath), req, response)
	if err != nil {
		return nil, err
	}
	return response, nil
}

func (s *ProductCategoryService) Delete(ctx context.Context, req *barryDTO.ProductCategoryOperateDTO) (*barryDTO.ProductCategoryActionResultDTO, error) {
	return s.operate(ctx, innerServicePath(barryInnerManualDeleteSuffixPath), req)
}

func (s *ProductCategoryService) Expire(ctx context.Context, req *barryDTO.ProductCategoryOperateDTO) (*barryDTO.ProductCategoryActionResultDTO, error) {
	return s.operate(ctx, innerServicePath(barryInnerManualExpireSuffixPath), req)
}

func (s *ProductCategoryService) Active(ctx context.Context, req *barryDTO.ProductCategoryOperateDTO) (*barryDTO.ProductCategoryActionResultDTO, error) {
	return s.operate(ctx, innerServicePath(barryInnerManualActiveSuffixPath), req)
}

func (s *ProductCategoryService) operate(ctx context.Context, requestURL string, req *barryDTO.ProductCategoryOperateDTO) (*barryDTO.ProductCategoryActionResultDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	response := &barryDTO.ProductCategoryActionResultDTO{}
	err := s.client.PostAbsolute(ctx, requestURL, req, response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
