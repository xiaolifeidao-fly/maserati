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
	publishTaskRepository "service/publish_task/repository"
)

var publishLogFileNameSanitizer = regexp.MustCompile(`[\\/:*?"<>|]+`)

const publishLogPreviewMaxBytes = 1024 * 1024

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
	task, err := s.taskRepository.FindById(taskID)
	if err != nil {
		return nil, err
	}
	if task.Active == 0 {
		return nil, errors.New("publish task not found")
	}
	task.LogOssPath = ossPath
	if _, err := s.taskRepository.SaveOrUpdate(task); err != nil {
		return nil, err
	}

	return &publishTaskDTO.UploadPublishLogResultDTO{Path: ossPath}, nil
}

func (s *PublishTaskService) GetTaskDetail(taskID uint) (*publishTaskDTO.PublishTaskDetailDTO, error) {
	task, err := s.GetTaskByID(taskID)
	if err != nil {
		return nil, err
	}
	steps, err := s.ListSteps(taskID)
	if err != nil {
		return nil, err
	}

	logPreview, err := s.GetTaskLog(taskID)
	if err != nil {
		logPreview = nil
	}

	stepDetails := make([]*publishTaskDTO.PublishStepWithLogDTO, 0, len(steps))
	for _, step := range steps {
		item := &publishTaskDTO.PublishStepWithLogDTO{
			PublishStepDTO: *step,
		}
		if logPreview != nil {
			item.Log = buildStepLogPreview(logPreview, uint64(taskID), step.StepCode)
		}
		stepDetails = append(stepDetails, item)
	}

	return &publishTaskDTO.PublishTaskDetailDTO{
		Task:  task,
		Steps: stepDetails,
		Log:   logPreview,
	}, nil
}

func (s *PublishTaskService) GetTaskLog(taskID uint) (*publishTaskDTO.PublishTaskLogDTO, error) {
	task, err := s.taskRepository.FindById(taskID)
	if err != nil {
		return nil, err
	}
	if task.Active == 0 {
		return nil, errors.New("publish task not found")
	}
	path := strings.TrimSpace(task.LogOssPath)
	if !oss.IsEnabled() {
		return nil, errors.New("oss not init")
	}
	data, resolvedPath, err := s.readTaskLogData(task, path)
	if err != nil {
		return nil, errors.New("publish log not found")
	}
	if path == "" && resolvedPath != "" {
		task.LogOssPath = resolvedPath
		_, _ = s.taskRepository.SaveOrUpdate(task)
	}
	content := string(data)
	truncated := false
	if len(data) > publishLogPreviewMaxBytes {
		truncated = true
		content = string(data[len(data)-publishLogPreviewMaxBytes:])
	}
	return &publishTaskDTO.PublishTaskLogDTO{
		Path:      resolvedPath,
		FileName:  filepath.Base(resolvedPath),
		Content:   content,
		Size:      len(data),
		Truncated: truncated,
	}, nil
}

func (s *PublishTaskService) DownloadTaskLog(taskID uint) (*publishTaskDTO.PublishTaskLogFileDTO, error) {
	task, err := s.taskRepository.FindById(taskID)
	if err != nil {
		return nil, err
	}
	if task.Active == 0 {
		return nil, errors.New("publish task not found")
	}
	if !oss.IsEnabled() {
		return nil, errors.New("oss not init")
	}
	data, resolvedPath, err := s.readTaskLogData(task, strings.TrimSpace(task.LogOssPath))
	if err != nil {
		return nil, errors.New("publish log not found")
	}
	if strings.TrimSpace(task.LogOssPath) == "" && resolvedPath != "" {
		task.LogOssPath = resolvedPath
		_, _ = s.taskRepository.SaveOrUpdate(task)
	}
	return &publishTaskDTO.PublishTaskLogFileDTO{
		FileName:    filepath.Base(resolvedPath),
		ContentType: "text/plain; charset=utf-8",
		Data:        data,
	}, nil
}

func (s *PublishTaskService) readTaskLogData(task *publishTaskRepository.PublishTask, path string) ([]byte, string, error) {
	candidates := make([]string, 0, 4)
	if strings.TrimSpace(path) != "" {
		candidates = append(candidates, strings.TrimSpace(path))
	}
	fileName := sanitizePublishLogFileName(task.SourceProductID, uint(task.Id))
	for _, t := range []time.Time{task.UpdatedTime, task.CreatedTime, time.Now()} {
		if t.IsZero() {
			continue
		}
		candidate := fmt.Sprintf("publish/%s/%s", t.Format("2006-01-02"), fileName)
		if !containsString(candidates, candidate) {
			candidates = append(candidates, candidate)
		}
	}
	for _, candidate := range candidates {
		data, err := oss.Get(candidate)
		if err == nil {
			return data, candidate, nil
		}
	}
	return nil, "", errors.New("publish log not found")
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func buildStepLogPreview(log *publishTaskDTO.PublishTaskLogDTO, taskID uint64, stepCode string) *publishTaskDTO.PublishTaskLogDTO {
	if log == nil {
		return nil
	}
	stepCode = strings.TrimSpace(stepCode)
	if stepCode == "" {
		return nil
	}
	taskToken := fmt.Sprintf("[task:%d]", taskID)
	stepToken := fmt.Sprintf("[step:%s]", stepCode)
	lines := strings.Split(log.Content, "\n")
	matched := make([]string, 0)
	for _, line := range lines {
		if strings.Contains(line, taskToken) && strings.Contains(line, stepToken) {
			matched = append(matched, line)
		}
	}
	if len(matched) == 0 {
		return nil
	}
	content := strings.Join(matched, "\n")
	return &publishTaskDTO.PublishTaskLogDTO{
		Path:      log.Path,
		FileName:  log.FileName,
		Content:   content,
		Size:      len([]byte(content)),
		Truncated: log.Truncated,
	}
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
