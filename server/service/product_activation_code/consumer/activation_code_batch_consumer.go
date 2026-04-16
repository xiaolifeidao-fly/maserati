package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	redisMiddleware "common/middleware/redis"

	"github.com/go-redis/redis"
)

const ActivationCodeBatchQueueKey = "product_activation_code:batch:queue"

type ActivationCodeBatchProcessor interface {
	ProcessBatch(batchID uint64, userID uint64) error
}

type ActivationCodeBatchMessage struct {
	BatchID uint64 `json:"batchId"`
	UserID  uint64 `json:"userId"`
}

func EnqueueActivationCodeBatch(batchID uint64, userID uint64) error {
	if redisMiddleware.Rdb == nil {
		return fmt.Errorf("redis is not initialized")
	}
	payload, err := json.Marshal(ActivationCodeBatchMessage{BatchID: batchID, UserID: userID})
	if err != nil {
		return err
	}
	return redisMiddleware.Rdb.RPush(ActivationCodeBatchQueueKey, string(payload)).Err()
}

func StartActivationCodeBatchConsumer(ctx context.Context, processor ActivationCodeBatchProcessor) {
	if redisMiddleware.Rdb == nil {
		log.Printf("activation code batch consumer skipped: redis is not initialized")
		return
	}
	if processor == nil {
		log.Printf("activation code batch consumer skipped: processor is nil")
		return
	}
	go func() {
		log.Printf("activation code batch consumer started")
		for {
			select {
			case <-ctx.Done():
				log.Printf("activation code batch consumer stopped")
				return
			default:
			}
			values, err := redisMiddleware.Rdb.BRPop(5*time.Second, ActivationCodeBatchQueueKey).Result()
			if err != nil {
				if err != redis.Nil {
					log.Printf("activation code batch consumer pop failed: %v", err)
				}
				continue
			}
			if len(values) < 2 {
				continue
			}
			var message ActivationCodeBatchMessage
			if err := json.Unmarshal([]byte(values[1]), &message); err != nil {
				log.Printf("activation code batch consumer invalid message: %v", err)
				continue
			}
			if err := processor.ProcessBatch(message.BatchID, message.UserID); err != nil {
				log.Printf("activation code batch %d failed: %v", message.BatchID, err)
			}
		}
	}()
}
