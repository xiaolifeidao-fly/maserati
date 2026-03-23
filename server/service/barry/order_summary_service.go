package barry

import (
	"context"
	barryDTO "service/barry/dto"
)

const orderSummaryPath = "barry.services.order-summary.path"

type OrderSummaryService struct {
	client *Client
}

func NewOrderSummaryService(client *Client) *OrderSummaryService {
	return &OrderSummaryService{client: client}
}

func (s *OrderSummaryService) List(ctx context.Context, query barryDTO.OrderSummaryQueryDTO) (*barryDTO.ListResponseDTO[barryDTO.OrderSummaryDTO], error) {
	response := &barryDTO.ListResponseDTO[barryDTO.OrderSummaryDTO]{}
	err := s.client.Get(ctx, servicePath(orderSummaryPath), buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"orderNo", query.OrderNo,
		"userId", query.UserID,
		"orderStatus", query.OrderStatus,
		"productCode", query.ProductCode,
		"channelCode", query.ChannelCode,
		"categoryCode", query.CategoryCode,
		"productTypeCode", query.ProductTypeCode,
		"startAt", query.StartAt,
		"endAt", query.EndAt,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
