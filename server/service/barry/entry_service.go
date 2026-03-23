package barry

import (
	"context"
	barryDTO "service/barry/dto"
)

const entryPath = "barry.services.entry.path"

type EntryService struct {
	client *Client
}

func NewEntryService(client *Client) *EntryService {
	return &EntryService{client: client}
}

func (s *EntryService) List(ctx context.Context, query barryDTO.EntryQueryDTO) (*barryDTO.ListResponseDTO[barryDTO.EntryDTO], error) {
	response := &barryDTO.ListResponseDTO[barryDTO.EntryDTO]{}
	err := s.client.Get(ctx, servicePath(entryPath), buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"entryId", query.EntryID,
		"orderNo", query.OrderNo,
		"userId", query.UserID,
		"status", query.Status,
		"startAt", query.StartAt,
		"endAt", query.EndAt,
		"channel", query.Channel,
		"shopCode", query.ShopCode,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
