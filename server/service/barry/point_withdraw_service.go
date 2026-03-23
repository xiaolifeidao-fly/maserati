package barry

import (
	"context"
	barryDTO "service/barry/dto"
)

const pointWithdrawPath = "barry.services.point-withdraw.path"

type PointWithdrawService struct {
	client *Client
}

func NewPointWithdrawService(client *Client) *PointWithdrawService {
	return &PointWithdrawService{client: client}
}

func (s *PointWithdrawService) List(ctx context.Context, query barryDTO.PointWithdrawQueryDTO) (*barryDTO.ListResponseDTO[barryDTO.PointWithdrawDTO], error) {
	response := &barryDTO.ListResponseDTO[barryDTO.PointWithdrawDTO]{}
	err := s.client.Get(ctx, servicePath(pointWithdrawPath), buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"withdrawId", query.WithdrawID,
		"userId", query.UserID,
		"status", query.Status,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
