package shop

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	shopDTO "service/shop/dto"
	shopRepository "service/shop/repository"
	"strings"

	"gorm.io/gorm"
)

type ShopService struct {
	shopRepository               *shopRepository.ShopRepository
	shopCategoryRepository       *shopRepository.ShopCategoryRepository
	shopCategoryChangeRepository *shopRepository.ShopCategoryChangeRepository
	shopExtParamRepository       *shopRepository.ShopExtParamRepository
	shopGroupRepository          *shopRepository.ShopGroupRepository
	tenantShopRepository         *shopRepository.TenantShopRepository
	tenantShopCategoryRepository *shopRepository.TenantShopCategoryRepository
}

func NewShopService() *ShopService {
	return &ShopService{
		shopRepository:               db.GetRepository[shopRepository.ShopRepository](),
		shopCategoryRepository:       db.GetRepository[shopRepository.ShopCategoryRepository](),
		shopCategoryChangeRepository: db.GetRepository[shopRepository.ShopCategoryChangeRepository](),
		shopExtParamRepository:       db.GetRepository[shopRepository.ShopExtParamRepository](),
		shopGroupRepository:          db.GetRepository[shopRepository.ShopGroupRepository](),
		tenantShopRepository:         db.GetRepository[shopRepository.TenantShopRepository](),
		tenantShopCategoryRepository: db.GetRepository[shopRepository.TenantShopCategoryRepository](),
	}
}

func (s *ShopService) EnsureTable() error {
	for _, ensure := range []func() error{
		s.shopRepository.EnsureTable,
		s.shopCategoryRepository.EnsureTable,
		s.shopCategoryChangeRepository.EnsureTable,
		s.shopExtParamRepository.EnsureTable,
		s.shopGroupRepository.EnsureTable,
		s.tenantShopRepository.EnsureTable,
		s.tenantShopCategoryRepository.EnsureTable,
	} {
		if err := ensure(); err != nil {
			return err
		}
	}
	return nil
}

func normalizeShopPage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return pageIndex, pageSize
}

func defaultShopDecimal(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0.00000000"
	}
	return value
}

func normalizeShopCategoryStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "EXPIRE":
		return "EXPIRE"
	default:
		return "ACTIVE"
	}
}

func buildShopCategoryChangeEntity(entity *shopRepository.ShopCategory, newPrice string, newLowerLimit, newUpperLimit int64) *shopRepository.ShopCategoryChange {
	return &shopRepository.ShopCategoryChange{
		UserID:           0,
		ShopID:           uint64(entity.ShopID),
		ShopCategoryID:   uint64(entity.Id),
		ShopCategoryName: strings.TrimSpace(entity.Name),
		OldPrice:         defaultShopDecimal(entity.Price),
		NewPrice:         defaultShopDecimal(newPrice),
		OldLowerLimit:    entity.LowerLimit,
		NewLowerLimit:    newLowerLimit,
		OldUpperLimit:    entity.UpperLimit,
		NewUpperLimit:    newUpperLimit,
	}
}

func toShopCategoryChangeDTO(entity *shopRepository.ShopCategoryChange) *shopDTO.ShopCategoryChangeDTO {
	if entity == nil {
		return nil
	}
	return &shopDTO.ShopCategoryChangeDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		UserID:           entity.UserID,
		ShopID:           entity.ShopID,
		ShopCategoryID:   entity.ShopCategoryID,
		ShopCategoryName: entity.ShopCategoryName,
		OldPrice:         entity.OldPrice,
		NewPrice:         entity.NewPrice,
		OldLowerLimit:    entity.OldLowerLimit,
		NewLowerLimit:    entity.NewLowerLimit,
		OldUpperLimit:    entity.OldUpperLimit,
		NewUpperLimit:    entity.NewUpperLimit,
	}
}

func toShopCategoryChangeDTOs(entities []*shopRepository.ShopCategoryChange) []*shopDTO.ShopCategoryChangeDTO {
	var dtos []*shopDTO.ShopCategoryChangeDTO
	for _, entity := range entities {
		dtos = append(dtos, toShopCategoryChangeDTO(entity))
	}
	return dtos
}

func (s *ShopService) ListShops(query shopDTO.ShopQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopDTO], error) {
	if s.shopRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.shopRepository.Db.Model(&shopRepository.Shop{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if query.ShopGroupID > 0 {
		dbQuery = dbQuery.Where("shop_group_id = ?", query.ShopGroupID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.Shop
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[shopDTO.ShopDTO](entities)), nil
}
func (s *ShopService) GetShopByID(id uint) (*shopDTO.ShopDTO, error) {
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[shopDTO.ShopDTO](entity), nil
}
func (s *ShopService) CreateShop(req *shopDTO.CreateShopDTO) (*shopDTO.ShopDTO, error) {
	if s.shopRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.shopRepository.Create(&shopRepository.Shop{
		Code: strings.TrimSpace(req.Code), Name: strings.TrimSpace(req.Name), SortID: req.SortID,
		ShopGroupID: req.ShopGroupID, ShopTypeCode: strings.TrimSpace(req.ShopTypeCode), ApproveFlag: req.ApproveFlag,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopDTO](created), nil
}
func (s *ShopService) UpdateShop(id uint, req *shopDTO.UpdateShopDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.SortID != nil {
		entity.SortID = *req.SortID
	}
	if req.ShopGroupID != nil {
		entity.ShopGroupID = *req.ShopGroupID
	}
	if req.ShopTypeCode != nil {
		entity.ShopTypeCode = strings.TrimSpace(*req.ShopTypeCode)
	}
	if req.ApproveFlag != nil {
		entity.ApproveFlag = *req.ApproveFlag
	}
	saved, err := s.shopRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopDTO](saved), nil
}
func (s *ShopService) DeleteShop(id uint) error {
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.shopRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) ListShopCategories(query shopDTO.ShopCategoryQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopCategoryDTO], error) {
	if s.shopCategoryRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.shopCategoryRepository.Db.Model(&shopRepository.ShopCategory{}).Where("active = ?", 1)
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.ShopCategory
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[shopDTO.ShopCategoryDTO](entities)), nil
}
func (s *ShopService) GetShopCategoryByID(id uint) (*shopDTO.ShopCategoryDTO, error) {
	entity, err := s.shopCategoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[shopDTO.ShopCategoryDTO](entity), nil
}
func (s *ShopService) CreateShopCategory(req *shopDTO.CreateShopCategoryDTO) (*shopDTO.ShopCategoryDTO, error) {
	if s.shopCategoryRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.shopCategoryRepository.Create(&shopRepository.ShopCategory{
		Price: defaultShopDecimal(req.Price), SecretKey: strings.TrimSpace(req.SecretKey), LowerLimit: req.LowerLimit, UpperLimit: req.UpperLimit,
		ShopID: req.ShopID, Name: strings.TrimSpace(req.Name), BarryShopCategoryCode: strings.TrimSpace(req.BarryShopCategoryCode), Status: normalizeShopCategoryStatus(req.Status),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopCategoryDTO](created), nil
}
func (s *ShopService) UpdateShopCategory(id uint, req *shopDTO.UpdateShopCategoryDTO) (*shopDTO.ShopCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if s.shopCategoryRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity, err := s.shopCategoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	nextPrice := defaultShopDecimal(entity.Price)
	if req.Price != nil {
		nextPrice = defaultShopDecimal(*req.Price)
	}
	nextLowerLimit := entity.LowerLimit
	if req.LowerLimit != nil {
		nextLowerLimit = *req.LowerLimit
	}
	nextUpperLimit := entity.UpperLimit
	if req.UpperLimit != nil {
		nextUpperLimit = *req.UpperLimit
	}
	shouldCreatePriceChange := nextPrice != defaultShopDecimal(entity.Price)

	if req.Price != nil {
		entity.Price = nextPrice
	}
	if req.SecretKey != nil {
		entity.SecretKey = strings.TrimSpace(*req.SecretKey)
	}
	if req.LowerLimit != nil {
		entity.LowerLimit = nextLowerLimit
	}
	if req.UpperLimit != nil {
		entity.UpperLimit = nextUpperLimit
	}
	if req.ShopID != nil {
		entity.ShopID = *req.ShopID
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.BarryShopCategoryCode != nil {
		entity.BarryShopCategoryCode = strings.TrimSpace(*req.BarryShopCategoryCode)
	}
	if req.Status != nil {
		entity.Status = normalizeShopCategoryStatus(*req.Status)
	}
	var changeEntity *shopRepository.ShopCategoryChange
	if shouldCreatePriceChange {
		changeEntity = buildShopCategoryChangeEntity(entity, nextPrice, nextLowerLimit, nextUpperLimit)
	}
	if err := s.shopCategoryRepository.Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(entity).Error; err != nil {
			return err
		}
		if changeEntity != nil {
			changeEntity.Init()
			if err := tx.Create(changeEntity).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopCategoryDTO](entity), nil
}

func (s *ShopService) SetShopCategoryStatus(id uint, status string) (*shopDTO.ShopCategoryDTO, error) {
	if s.shopCategoryRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity, err := s.shopCategoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	entity.Status = normalizeShopCategoryStatus(status)
	saved, err := s.shopCategoryRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopCategoryDTO](saved), nil
}

func (s *ShopService) PublishShopCategory(id uint) (*shopDTO.ShopCategoryDTO, error) {
	return s.SetShopCategoryStatus(id, "ACTIVE")
}

func (s *ShopService) UnpublishShopCategory(id uint) (*shopDTO.ShopCategoryDTO, error) {
	return s.SetShopCategoryStatus(id, "EXPIRE")
}

func (s *ShopService) DeleteShopCategory(id uint) error {
	entity, err := s.shopCategoryRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.shopCategoryRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) ListShopCategoryChanges(query shopDTO.ShopCategoryChangeQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopCategoryChangeDTO], error) {
	if s.shopCategoryChangeRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.shopCategoryChangeRepository.Db.Model(&shopRepository.ShopCategoryChange{}).Where("active = ?", 1)
	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if query.ShopCategoryID > 0 {
		dbQuery = dbQuery.Where("shop_category_id = ?", query.ShopCategoryID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.ShopCategoryChange
	if err := dbQuery.Order("created_time DESC, id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), toShopCategoryChangeDTOs(entities)), nil
}

func (s *ShopService) ListShopCategoryChangesByShopCategoryID(id uint, page, pageIndex, pageSize int) (*baseDTO.PageDTO[shopDTO.ShopCategoryChangeDTO], error) {
	return s.ListShopCategoryChanges(shopDTO.ShopCategoryChangeQueryDTO{
		Page:           page,
		PageIndex:      pageIndex,
		PageSize:       pageSize,
		ShopCategoryID: uint64(id),
	})
}

func (s *ShopService) GetShopCategoryChangeByID(id uint) (*shopDTO.ShopCategoryChangeDTO, error) {
	entity, err := s.shopCategoryChangeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return toShopCategoryChangeDTO(entity), nil
}
func (s *ShopService) CreateShopCategoryChange(req *shopDTO.CreateShopCategoryChangeDTO) (*shopDTO.ShopCategoryChangeDTO, error) {
	if s.shopCategoryChangeRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.shopCategoryChangeRepository.Create(&shopRepository.ShopCategoryChange{
		UserID: req.UserID, ShopID: req.ShopID, ShopCategoryID: req.ShopCategoryID, ShopCategoryName: strings.TrimSpace(req.ShopCategoryName),
		OldPrice: defaultShopDecimal(req.OldPrice), NewPrice: defaultShopDecimal(req.NewPrice), OldLowerLimit: req.OldLowerLimit, NewLowerLimit: req.NewLowerLimit,
		OldUpperLimit: req.OldUpperLimit, NewUpperLimit: req.NewUpperLimit,
	})
	if err != nil {
		return nil, err
	}
	return toShopCategoryChangeDTO(created), nil
}
func (s *ShopService) UpdateShopCategoryChange(id uint, req *shopDTO.UpdateShopCategoryChangeDTO) (*shopDTO.ShopCategoryChangeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.shopCategoryChangeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.UserID != nil {
		entity.UserID = *req.UserID
	}
	if req.ShopID != nil {
		entity.ShopID = *req.ShopID
	}
	if req.ShopCategoryID != nil {
		entity.ShopCategoryID = *req.ShopCategoryID
	}
	if req.ShopCategoryName != nil {
		entity.ShopCategoryName = strings.TrimSpace(*req.ShopCategoryName)
	}
	if req.OldPrice != nil {
		entity.OldPrice = defaultShopDecimal(*req.OldPrice)
	}
	if req.NewPrice != nil {
		entity.NewPrice = defaultShopDecimal(*req.NewPrice)
	}
	if req.OldLowerLimit != nil {
		entity.OldLowerLimit = *req.OldLowerLimit
	}
	if req.NewLowerLimit != nil {
		entity.NewLowerLimit = *req.NewLowerLimit
	}
	if req.OldUpperLimit != nil {
		entity.OldUpperLimit = *req.OldUpperLimit
	}
	if req.NewUpperLimit != nil {
		entity.NewUpperLimit = *req.NewUpperLimit
	}
	saved, err := s.shopCategoryChangeRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return toShopCategoryChangeDTO(saved), nil
}
func (s *ShopService) DeleteShopCategoryChange(id uint) error {
	entity, err := s.shopCategoryChangeRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.shopCategoryChangeRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) ListShopExtParams(query shopDTO.ShopExtParamQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopExtParamDTO], error) {
	if s.shopExtParamRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.shopExtParamRepository.Db.Model(&shopRepository.ShopExtParam{}).Where("active = ?", 1)
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Type); value != "" {
		dbQuery = dbQuery.Where("type = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.ShopExtParam
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[shopDTO.ShopExtParamDTO](entities)), nil
}
func (s *ShopService) GetShopExtParamByID(id uint) (*shopDTO.ShopExtParamDTO, error) {
	entity, err := s.shopExtParamRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[shopDTO.ShopExtParamDTO](entity), nil
}
func (s *ShopService) CreateShopExtParam(req *shopDTO.CreateShopExtParamDTO) (*shopDTO.ShopExtParamDTO, error) {
	if s.shopExtParamRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.shopExtParamRepository.Create(&shopRepository.ShopExtParam{
		Name: strings.TrimSpace(req.Name), Code: strings.TrimSpace(req.Code), ShopID: req.ShopID,
		Type: strings.TrimSpace(req.Type), Processor: strings.TrimSpace(req.Processor), CandidateValue: strings.TrimSpace(req.CandidateValue),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopExtParamDTO](created), nil
}
func (s *ShopService) UpdateShopExtParam(id uint, req *shopDTO.UpdateShopExtParamDTO) (*shopDTO.ShopExtParamDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.shopExtParamRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
	}
	if req.ShopID != nil {
		entity.ShopID = *req.ShopID
	}
	if req.Type != nil {
		entity.Type = strings.TrimSpace(*req.Type)
	}
	if req.Processor != nil {
		entity.Processor = strings.TrimSpace(*req.Processor)
	}
	if req.CandidateValue != nil {
		entity.CandidateValue = strings.TrimSpace(*req.CandidateValue)
	}
	saved, err := s.shopExtParamRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopExtParamDTO](saved), nil
}
func (s *ShopService) DeleteShopExtParam(id uint) error {
	entity, err := s.shopExtParamRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.shopExtParamRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) ListShopGroups(query shopDTO.ShopGroupQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopGroupDTO], error) {
	if s.shopGroupRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.shopGroupRepository.Db.Model(&shopRepository.ShopGroup{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.BusinessType); value != "" {
		dbQuery = dbQuery.Where("business_type = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.ShopGroup
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[shopDTO.ShopGroupDTO](entities)), nil
}
func (s *ShopService) GetShopGroupByID(id uint) (*shopDTO.ShopGroupDTO, error) {
	entity, err := s.shopGroupRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[shopDTO.ShopGroupDTO](entity), nil
}
func (s *ShopService) CreateShopGroup(req *shopDTO.CreateShopGroupDTO) (*shopDTO.ShopGroupDTO, error) {
	if s.shopGroupRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.shopGroupRepository.Create(&shopRepository.ShopGroup{
		Code: strings.TrimSpace(req.Code), Name: strings.TrimSpace(req.Name), BusinessType: strings.TrimSpace(req.BusinessType),
		BusinessCode: strings.TrimSpace(req.BusinessCode), SettleDay: req.SettleDay, SettleFlag: req.SettleFlag, Price: strings.TrimSpace(req.Price),
		CalRgFlag: req.CalRgFlag, ChargeType: strings.TrimSpace(req.ChargeType), GroupName: strings.TrimSpace(req.GroupName),
		DashboardActive: req.DashboardActive, DashboardTitle: strings.TrimSpace(req.DashboardTitle), DashboardSortID: req.DashboardSortID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopGroupDTO](created), nil
}
func (s *ShopService) UpdateShopGroup(id uint, req *shopDTO.UpdateShopGroupDTO) (*shopDTO.ShopGroupDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.shopGroupRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.BusinessType != nil {
		entity.BusinessType = strings.TrimSpace(*req.BusinessType)
	}
	if req.BusinessCode != nil {
		entity.BusinessCode = strings.TrimSpace(*req.BusinessCode)
	}
	if req.SettleDay != nil {
		entity.SettleDay = *req.SettleDay
	}
	if req.SettleFlag != nil {
		entity.SettleFlag = *req.SettleFlag
	}
	if req.Price != nil {
		entity.Price = strings.TrimSpace(*req.Price)
	}
	if req.CalRgFlag != nil {
		entity.CalRgFlag = *req.CalRgFlag
	}
	if req.ChargeType != nil {
		entity.ChargeType = strings.TrimSpace(*req.ChargeType)
	}
	if req.GroupName != nil {
		entity.GroupName = strings.TrimSpace(*req.GroupName)
	}
	if req.DashboardActive != nil {
		entity.DashboardActive = *req.DashboardActive
	}
	if req.DashboardTitle != nil {
		entity.DashboardTitle = strings.TrimSpace(*req.DashboardTitle)
	}
	if req.DashboardSortID != nil {
		entity.DashboardSortID = *req.DashboardSortID
	}
	saved, err := s.shopGroupRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.ShopGroupDTO](saved), nil
}
func (s *ShopService) DeleteShopGroup(id uint) error {
	entity, err := s.shopGroupRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.shopGroupRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) ListTenantShops(query shopDTO.TenantShopQueryDTO) (*baseDTO.PageDTO[shopDTO.TenantShopDTO], error) {
	if s.tenantShopRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.tenantShopRepository.Db.Model(&shopRepository.TenantShop{}).Where("active = ?", 1)
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if query.TenantID > 0 {
		dbQuery = dbQuery.Where("tenant_id = ?", query.TenantID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.TenantShop
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[shopDTO.TenantShopDTO](entities)), nil
}
func (s *ShopService) GetTenantShopByID(id uint) (*shopDTO.TenantShopDTO, error) {
	entity, err := s.tenantShopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[shopDTO.TenantShopDTO](entity), nil
}
func (s *ShopService) CreateTenantShop(req *shopDTO.CreateTenantShopDTO) (*shopDTO.TenantShopDTO, error) {
	if s.tenantShopRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.tenantShopRepository.Create(&shopRepository.TenantShop{ShopID: req.ShopID, TenantID: req.TenantID})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.TenantShopDTO](created), nil
}
func (s *ShopService) UpdateTenantShop(id uint, req *shopDTO.UpdateTenantShopDTO) (*shopDTO.TenantShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.tenantShopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.ShopID != nil {
		entity.ShopID = *req.ShopID
	}
	if req.TenantID != nil {
		entity.TenantID = *req.TenantID
	}
	saved, err := s.tenantShopRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.TenantShopDTO](saved), nil
}
func (s *ShopService) DeleteTenantShop(id uint) error {
	entity, err := s.tenantShopRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.tenantShopRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) ListTenantShopCategories(query shopDTO.TenantShopCategoryQueryDTO) (*baseDTO.PageDTO[shopDTO.TenantShopCategoryDTO], error) {
	if s.tenantShopCategoryRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.tenantShopCategoryRepository.Db.Model(&shopRepository.TenantShopCategory{}).Where("active = ?", 1)
	if query.TenantID > 0 {
		dbQuery = dbQuery.Where("tenant_id = ?", query.TenantID)
	}
	if query.ShopCategoryID > 0 {
		dbQuery = dbQuery.Where("shop_category_id = ?", query.ShopCategoryID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*shopRepository.TenantShopCategory
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[shopDTO.TenantShopCategoryDTO](entities)), nil
}
func (s *ShopService) GetTenantShopCategoryByID(id uint) (*shopDTO.TenantShopCategoryDTO, error) {
	entity, err := s.tenantShopCategoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[shopDTO.TenantShopCategoryDTO](entity), nil
}
func (s *ShopService) CreateTenantShopCategory(req *shopDTO.CreateTenantShopCategoryDTO) (*shopDTO.TenantShopCategoryDTO, error) {
	if s.tenantShopCategoryRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.tenantShopCategoryRepository.Create(&shopRepository.TenantShopCategory{TenantID: req.TenantID, ShopCategoryID: req.ShopCategoryID})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.TenantShopCategoryDTO](created), nil
}
func (s *ShopService) UpdateTenantShopCategory(id uint, req *shopDTO.UpdateTenantShopCategoryDTO) (*shopDTO.TenantShopCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.tenantShopCategoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.TenantID != nil {
		entity.TenantID = *req.TenantID
	}
	if req.ShopCategoryID != nil {
		entity.ShopCategoryID = *req.ShopCategoryID
	}
	saved, err := s.tenantShopCategoryRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[shopDTO.TenantShopCategoryDTO](saved), nil
}
func (s *ShopService) DeleteTenantShopCategory(id uint) error {
	entity, err := s.tenantShopCategoryRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.tenantShopCategoryRepository.SaveOrUpdate(entity)
	return err
}
