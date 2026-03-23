package barry

type BarryService struct {
	client *Client

	ProductType     *ProductTypeService
	ProductCategory *ProductCategoryService
	Channel         *ChannelService
	UserPoint       *UserPointService
	User            *UserService
	PointWithdraw   *PointWithdrawService
	Entry           *EntryService
	Return          *ReturnService
	OrderSummary    *OrderSummaryService
}

func NewBarryService() *BarryService {
	client := NewClient()
	return &BarryService{
		client:          client,
		ProductType:     NewProductTypeService(client),
		ProductCategory: NewProductCategoryService(client),
		Channel:         NewChannelService(client),
		UserPoint:       NewUserPointService(client),
		User:            NewUserService(client),
		PointWithdraw:   NewPointWithdrawService(client),
		Entry:           NewEntryService(client),
		Return:          NewReturnService(client),
		OrderSummary:    NewOrderSummaryService(client),
	}
}

func (s *BarryService) Client() *Client {
	return s.client
}
