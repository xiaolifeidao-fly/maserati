package barry

import (
	"context"
	barryDTO "service/barry/dto"
)

const channelPath = "barry.services.channel.path"

type ChannelService struct {
	client *Client
}

func NewChannelService(client *Client) *ChannelService {
	return &ChannelService{client: client}
}

func (s *ChannelService) List(ctx context.Context, query barryDTO.ChannelQueryDTO) (*barryDTO.ListResponseDTO[barryDTO.ChannelDTO], error) {
	response := &barryDTO.ListResponseDTO[barryDTO.ChannelDTO]{}
	err := s.client.Get(ctx, servicePath(channelPath), buildValues(
		"requestId", query.RequestID,
		"page", query.Page,
		"pageIndex", query.PageIndex,
		"pageSize", query.PageSize,
		"code", query.Code,
		"name", query.Name,
		"type", query.Type,
	), response)
	if err != nil {
		return nil, err
	}
	return response, nil
}
