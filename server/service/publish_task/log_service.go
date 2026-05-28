package publish_task

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"common/middleware/storage/oss"
	publishTaskDTO "service/publish_task/dto"
)

var publishLogFileNameSanitizer = regexp.MustCompile(`[\\/:*?"<>|]+`)

func (s *PublishTaskService) UploadLog(taskID uint, req *publishTaskDTO.UploadPublishLogDTO) (*publishTaskDTO.UploadPublishLogResultDTO, error) {
	if taskID == 0 {
		return nil, errors.New("publish task id is required")
	}
	if req == nil || strings.TrimSpace(req.Content) == "" {
		return nil, errors.New("publish log content is required")
	}
	if !oss.IsEnabled() {
		return nil, errors.New("oss not init")
	}

	fileName := sanitizePublishLogFileName(req.FileName, taskID)
	date := time.Now().Format("2006-01-02")
	ossPath := fmt.Sprintf("publish/%s/%s", date, fileName)
	if err := oss.Put(ossPath, []byte(req.Content)); err != nil {
		return nil, err
	}

	return &publishTaskDTO.UploadPublishLogResultDTO{Path: ossPath}, nil
}

func sanitizePublishLogFileName(fileName string, taskID uint) string {
	name := strings.TrimSpace(filepath.Base(fileName))
	name = publishLogFileNameSanitizer.ReplaceAllString(name, "_")
	name = strings.Trim(name, ". ")
	if name == "" || name == "." {
		name = fmt.Sprintf("publish-task-%d.log", taskID)
	}
	if !strings.HasSuffix(strings.ToLower(name), ".log") {
		name += ".log"
	}
	return name
}
