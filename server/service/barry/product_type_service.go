package barry

import (
	"context"
	"net/url"
	"strings"

	barryDTO "service/barry/dto"
)

type ProductTypeService struct {
	client *Client
}

func NewProductTypeService(client *Client) *ProductTypeService {
	return &ProductTypeService{client: client}
}

func (s *ProductTypeService) List(ctx context.Context, query barryDTO.ProductTypeQueryDTO) (*barryDTO.ProductTypeListResponseDTO, error) {
	response := &barryDTO.ProductTypeListResponseDTO{}
	requestURL := innerServicePath(barryInnerShopSuffixPath)
	err := s.client.GetAbsolute(ctx, requestURL, buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"code", query.Code,
		"name", query.Name,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}

func buildValues(pairs ...any) url.Values {
	values := url.Values{}
	for index := 0; index+1 < len(pairs); index += 2 {
		key, ok := pairs[index].(string)
		if !ok || strings.TrimSpace(key) == "" {
			continue
		}
		switch value := pairs[index+1].(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				values.Set(key, strings.TrimSpace(value))
			}
		case int:
			if value > 0 {
				values.Set(key, intToString(value))
			}
		case int64:
			if value > 0 {
				values.Set(key, int64ToString(value))
			}
		}
	}
	return values
}
