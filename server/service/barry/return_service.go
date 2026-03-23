package barry

import (
	"context"
	barryDTO "service/barry/dto"
)

const returnPath = "barry.services.return.path"

type ReturnService struct {
	client *Client
}

func NewReturnService(client *Client) *ReturnService {
	return &ReturnService{client: client}
}

func (s *ReturnService) List(ctx context.Context, query barryDTO.ReturnQueryDTO) (*barryDTO.ListResponseDTO[barryDTO.ReturnDTO], error) {
	response := &barryDTO.ListResponseDTO[barryDTO.ReturnDTO]{}
	err := s.client.Get(ctx, servicePath(returnPath), buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"returnId", query.ReturnID,
		"orderNo", query.OrderNo,
		"userId", query.UserID,
		"status", query.Status,
		"startAt", query.StartAt,
		"endAt", query.EndAt,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
