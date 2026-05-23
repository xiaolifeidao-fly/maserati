package consumer

import (
	"context"
	"log"
	"time"

	commonRedis "common/middleware/redis"
)

type LeaseSweeper interface {
	SweepExpiredLeases(limit int64) (int, error)
}

func StartLeaseSweeper(ctx context.Context, sweeper LeaseSweeper) {
	if commonRedis.Rdb == nil {
		log.Printf("robot lease sweeper skipped: redis is not initialized")
		return
	}
	if sweeper == nil {
		log.Printf("robot lease sweeper skipped: sweeper is nil")
		return
	}
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		log.Printf("robot lease sweeper started")
		for {
			select {
			case <-ctx.Done():
				log.Printf("robot lease sweeper stopped")
				return
			case <-ticker.C:
				if swept, err := sweeper.SweepExpiredLeases(100); err != nil {
					log.Printf("robot lease sweep failed: %v", err)
				} else if swept > 0 {
					log.Printf("robot lease swept expired leases: %d", swept)
				}
			}
		}
	}()
}
