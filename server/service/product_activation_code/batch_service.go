package product_activation_code

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	baseDTO "common/base/dto"
	accountRepository "service/account/repository"
	productActivationCodeConsumer "service/product_activation_code/consumer"
	productActivationCodeDTO "service/product_activation_code/dto"
	productActivationCodeRepository "service/product_activation_code/repository"

	"gorm.io/gorm"
)

const (
	ActivationCodeBatchStatusPending    = "PENDING"
	ActivationCodeBatchStatusProcessing = "PROCESSING"
	ActivationCodeBatchStatusCompleted  = "COMPLETED"
	ActivationCodeBatchStatusFailed     = "FAILED"
)

func normalizeActivationCodeBatchStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "", ActivationCodeBatchStatusPending:
		return ActivationCodeBatchStatusPending
	case ActivationCodeBatchStatusProcessing:
		return ActivationCodeBatchStatusProcessing
	case ActivationCodeBatchStatusCompleted:
		return ActivationCodeBatchStatusCompleted
	case ActivationCodeBatchStatusFailed:
		return ActivationCodeBatchStatusFailed
	default:
		return ""
	}
}

func generateActivationCode() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.ToUpper(hex.EncodeToString(buf)), nil
}

func parseDecimalRat(value string) (*big.Rat, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		value = "0"
	}
	result, ok := new(big.Rat).SetString(value)
	if !ok {
		return nil, fmt.Errorf("decimal value is invalid")
	}
	return result, nil
}

func formatDecimalRat(value *big.Rat, precision int) string {
	if value == nil {
		value = new(big.Rat)
	}
	return value.FloatString(precision)
}

func multiplyDecimalByInt(value string, count int) (string, *big.Rat, error) {
	rat, err := parseDecimalRat(value)
	if err != nil {
		return "", nil, err
	}
	total := new(big.Rat).Mul(rat, new(big.Rat).SetInt64(int64(count)))
	return formatDecimalRat(total, 8), total, nil
}

func compareDecimal(value string, target *big.Rat) (int, error) {
	rat, err := parseDecimalRat(value)
	if err != nil {
		return 0, err
	}
	return rat.Cmp(target), nil
}

func (s *ProductActivationCodeService) ListBatches(query productActivationCodeDTO.ProductActivationCodeBatchQueryDTO) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeBatchDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	query.Status = strings.TrimSpace(query.Status)
	if query.Status != "" {
		query.Status = normalizeActivationCodeBatchStatus(query.Status)
		if query.Status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
	}
	total, err := s.batchRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.batchRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), toProductActivationCodeBatchDTOs(entities)), nil
}

func (s *ProductActivationCodeService) GetBatchByID(id uint) (*productActivationCodeDTO.ProductActivationCodeBatchDTO, error) {
	entity, err := s.batchRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return toProductActivationCodeBatchDTO(entity), nil
}

func (s *ProductActivationCodeService) GenerateBatch(req *productActivationCodeDTO.GenerateProductActivationCodeBatchDTO) (*productActivationCodeDTO.ProductActivationCodeBatchDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if req.Count <= 0 {
		return nil, fmt.Errorf("count must be positive")
	}
	if req.Count > 100000 {
		return nil, fmt.Errorf("count must be less than or equal to 100000")
	}
	if req.UserID == 0 {
		return nil, fmt.Errorf("userId must be positive")
	}
	typeEntity, err := validateActivationCodeType(s.typeRepository, req.TypeID)
	if err != nil {
		return nil, err
	}
	totalPrice, totalPriceRat, err := multiplyDecimalByInt(normalizeActivationCodePrice(typeEntity.Price), req.Count)
	if err != nil {
		return nil, err
	}
	account, err := s.accountRepository.FindActiveByUserID(req.UserID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("所属账户不存在")
		}
		return nil, err
	}
	if cmp, err := compareDecimal(account.BalanceAmount, totalPriceRat); err != nil {
		return nil, err
	} else if cmp < 0 {
		return nil, fmt.Errorf("账户余额不足，本次需要 %s，当前余额 %s", totalPrice, account.BalanceAmount)
	}
	entity, err := s.batchRepository.Create(&productActivationCodeRepository.ProductActivationCodeBatch{
		TypeID:        req.TypeID,
		UserID:        req.UserID,
		TotalCount:    req.Count,
		TotalPrice:    totalPrice,
		ActualConsume: "0.00000000",
		Status:        ActivationCodeBatchStatusPending,
		Message:       "waiting for generation",
	})
	if err != nil {
		return nil, err
	}
	if err := productActivationCodeConsumer.EnqueueActivationCodeBatch(uint64(entity.Id), req.UserID); err != nil {
		now := time.Now()
		entity.Status = ActivationCodeBatchStatusFailed
		entity.Message = err.Error()
		entity.CompletedTime = &now
		_, _ = s.batchRepository.SaveOrUpdate(entity)
		return toProductActivationCodeBatchDTO(entity), err
	}
	return toProductActivationCodeBatchDTO(entity), nil
}

func (s *ProductActivationCodeService) ProcessBatch(batchID uint64, userID uint64) error {
	if batchID == 0 {
		return fmt.Errorf("batchId must be positive")
	}
	batch, err := s.batchRepository.FindById(uint(batchID))
	if err != nil {
		return err
	}
	if batch.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	if batch.Status == ActivationCodeBatchStatusCompleted {
		return nil
	}
	if userID == 0 {
		userID = batch.UserID
	}
	if userID == 0 {
		return s.markBatchFailed(batch, batch.GeneratedCount, "批次缺少操作用户，无法扣减账户余额")
	}
	if batch.UserID == 0 {
		batch.UserID = userID
	}
	if batch.UserID != userID {
		return s.markBatchFailed(batch, batch.GeneratedCount, fmt.Sprintf("批次操作用户不匹配，批次用户 %d，当前用户 %d", batch.UserID, userID))
	}
	typeEntity, err := validateActivationCodeType(s.typeRepository, batch.TypeID)
	if err != nil {
		return err
	}
	unitPrice := normalizeActivationCodePrice(typeEntity.Price)
	unitPriceRat, err := parseDecimalRat(unitPrice)
	if err != nil {
		return err
	}
	if strings.TrimSpace(batch.TotalPrice) == "" {
		totalPrice, _, err := multiplyDecimalByInt(unitPrice, batch.TotalCount)
		if err != nil {
			return err
		}
		batch.TotalPrice = totalPrice
	}
	now := time.Now()
	batch.Status = ActivationCodeBatchStatusProcessing
	batch.Message = "generating activation codes"
	batch.StartedTime = &now
	if _, err := s.batchRepository.SaveOrUpdate(batch); err != nil {
		return err
	}

	generated := batch.GeneratedCount
	actualConsume, err := parseDecimalRat(batch.ActualConsume)
	if err != nil {
		return err
	}
	chunkSize := 200
	for generated < batch.TotalCount {
		currentSize := chunkSize
		if remaining := batch.TotalCount - generated; remaining < currentSize {
			currentSize = remaining
		}
		createdInChunk := 0
		insufficientBalance := false
		var insufficientMessage string
		err := s.batchRepository.Db.Transaction(func(tx *gorm.DB) error {
			account, err := s.accountRepository.FindActiveByUserIDForUpdate(tx, userID)
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					return fmt.Errorf("所属账户不存在")
				}
				return err
			}
			balance, err := parseDecimalRat(account.BalanceAmount)
			if err != nil {
				return err
			}
			for i := 0; i < currentSize; i++ {
				if balance.Cmp(unitPriceRat) < 0 {
					insufficientBalance = true
					insufficientMessage = fmt.Sprintf("账户余额不足，已生成 %d 个，当前余额 %s，单价 %s", generated+createdInChunk, account.BalanceAmount, unitPrice)
					return nil
				}
				code, err := generateActivationCode()
				if err != nil {
					return fmt.Errorf("generate activation code failed: %v", err)
				}
				detail, err := s.detailRepository.WithTx(tx).Create(&productActivationCodeRepository.ProductActivationCodeDetail{
					TypeID:         batch.TypeID,
					BatchID:        batchID,
					DurationDays:   typeEntity.DurationDays,
					ActivationCode: code,
					Price:          unitPrice,
					Status:         "UNUSED",
				})
				if err != nil {
					return fmt.Errorf("save activation code failed: %v", err)
				}
				balance = new(big.Rat).Sub(balance, unitPriceRat)
				actualConsume = new(big.Rat).Add(actualConsume, unitPriceRat)
				account.BalanceAmount = formatDecimalRat(balance, 8)
				if _, err := s.accountRepository.SaveWithTx(tx, account); err != nil {
					return fmt.Errorf("deduct account balance failed: %v", err)
				}
				if _, err := s.accountDetailRepository.CreateWithTx(tx, &accountRepository.AccountDetail{
					AccountID:     uint64(account.Id),
					Amount:        "-" + formatDecimalRat(unitPriceRat, 8),
					BalanceAmount: account.BalanceAmount,
					Operator:      strconv.FormatUint(userID, 10),
					Type:          "ACTIVATION_CODE",
					Description:   "生成激活码扣费",
					BusinessID:    strconv.Itoa(detail.Id),
				}); err != nil {
					return fmt.Errorf("save account detail failed: %v", err)
				}
				createdInChunk++
			}
			return nil
		})
		if err != nil {
			return s.markBatchFailed(batch, generated, err.Error())
		}
		generated += createdInChunk
		batch.GeneratedCount = generated
		batch.ActualConsume = formatDecimalRat(actualConsume, 8)
		batch.Message = "generating activation codes"
		if _, err := s.batchRepository.SaveOrUpdate(batch); err != nil {
			return err
		}
		if insufficientBalance {
			return s.markBatchFailed(batch, generated, insufficientMessage)
		}
	}

	completedTime := time.Now()
	batch.Status = ActivationCodeBatchStatusCompleted
	batch.GeneratedCount = generated
	batch.FailedCount = 0
	batch.ActualConsume = formatDecimalRat(actualConsume, 8)
	batch.Message = "generation completed"
	batch.CompletedTime = &completedTime
	_, err = s.batchRepository.SaveOrUpdate(batch)
	return err
}

func (s *ProductActivationCodeService) markBatchFailed(batch *productActivationCodeRepository.ProductActivationCodeBatch, generated int, message string) error {
	now := time.Now()
	batch.Status = ActivationCodeBatchStatusFailed
	batch.GeneratedCount = generated
	batch.FailedCount = batch.TotalCount - generated
	batch.Message = message
	batch.CompletedTime = &now
	_, err := s.batchRepository.SaveOrUpdate(batch)
	if err != nil {
		return err
	}
	return fmt.Errorf("%s", message)
}
