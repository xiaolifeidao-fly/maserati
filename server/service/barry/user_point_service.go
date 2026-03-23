package barry

import (
	"context"
	barryDTO "service/barry/dto"
)

const userPointPath = "barry.services.user-point.path"

type UserPointService struct {
	client *Client
}

func NewUserPointService(client *Client) *UserPointService {
	return &UserPointService{client: client}
}

func (s *UserPointService) List(ctx context.Context, query barryDTO.UserPointQueryDTO) (*barryDTO.ListResponseDTO[barryDTO.UserPointDTO], error) {
	response := &barryDTO.ListResponseDTO[barryDTO.UserPointDTO]{}
	err := s.client.Get(ctx, servicePath(userPointPath), buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"userId", query.UserID,
		"username", query.Username,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
