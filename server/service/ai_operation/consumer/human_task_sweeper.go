package consumer

import (
	"context"
	"log"
	"time"

	commonRedis "common/middleware/redis"
)

type HumanTaskSweeper interface {
	SweepHumanTaskDispatchExpiry(limit int64) (int, error)
}

func StartHumanTaskSweeper(ctx context.Context, sweeper HumanTaskSweeper) {
	if commonRedis.Rdb == nil {
		log.Printf("human task sweeper skipped: redis is not initialized")
		return
	}
	if sweeper == nil {
		log.Printf("human task sweeper skipped: sweeper is nil")
		return
	}
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		log.Printf("human task sweeper started")
		for {
			select {
			case <-ctx.Done():
				log.Printf("human task sweeper stopped")
				return
			case <-ticker.C:
				if swept, err := sweeper.SweepHumanTaskDispatchExpiry(100); err != nil {
					log.Printf("human task dispatch expiry sweep failed: %v", err)
				} else if swept > 0 {
					log.Printf("human task dispatch expiry swept: %d", swept)
				}
			}
		}
	}()
}
