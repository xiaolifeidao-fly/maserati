"use client";

import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Alert, Button, Drawer, Empty, Input, Space, Spin, Tag, Tooltip, Typography, message } from "antd";
import type {
  PublishStepRecord,
  PublishTaskDetailRecord,
  PublishTaskRecord,
} from "../../../product/publish/api/publish-task.api";
import { downloadPublishTaskLog } from "../../../product/publish/api/publish-task.api";

const { Text } = Typography;

interface PublishTaskDetailDrawerProps {
  open: boolean;
  loading: boolean;
  task: PublishTaskRecord | null;
  detail: PublishTaskDetailRecord | null;
  onClose: () => void;
}

interface LogLineView {
  lineNo: number;
  text: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG" | "DEFAULT";
  matchIndexes: number[];
  matchLength: number;
}

interface StepLogRange {
  stepCode: string;
  startLineNo?: number;
  endLineNo?: number;
}

export function PublishTaskDetailDrawer({
  open,
  loading,
  task,
  detail,
  onClose,
}: PublishTaskDetailDrawerProps) {
  const [search, setSearch] = useState("");
  const currentTask = detail?.task ?? task;
  const steps = useMemo(
    () => [...(detail?.steps ?? [])].sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0)),
    [detail?.steps],
  );
  const logContent = detail?.log?.content ?? "";
  const logLines = useMemo(() => buildLogLineViews(logContent, search), [logContent, search]);
  const ranges = useMemo(() => buildStepLogRanges(logLines, currentTask?.id, steps), [currentTask?.id, logLines, steps]);
  const rangeMap = useMemo(() => {
    const map = new Map<string, StepLogRange>();
    ranges.forEach((range) => map.set(range.stepCode, range));
    return map;
  }, [ranges]);
  const matchCount = useMemo(
    () => logLines.reduce((sum, line) => sum + line.matchIndexes.length, 0),
    [logLines],
  );
  const canDownloadLog = Boolean(currentTask?.id && detail?.log?.fileName);

  const handleDownloadLog = async () => {
    if (!currentTask?.id) return;
    try {
      const result = await downloadPublishTaskLog(currentTask.id);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "下载日志失败");
    }
  };

  return (
    <Drawer
      className="publish-task-detail-drawer"
      open={open}
      width={1000}
      title={
        <Space size={8}>
          <FileTextOutlined />
          <span>{currentTask ? `发布任务 #${currentTask.id}` : "发布任务详情"}</span>
        </Space>
      }
      destroyOnClose
      onClose={onClose}
    >
      <Spin spinning={loading} tip="正在读取任务详情">
        {currentTask ? (
          <Space direction="vertical" size={12} className="publish-task-detail-stack">
            <div className="publish-task-summary">
              <Space size={8} wrap>
                <Tag color={getPublishTaskTagColor(currentTask.status)}>{currentTask.status}</Tag>
                {currentTask.currentStepCode ? <Tag>{localizePublishStepCode(currentTask.currentStepCode)}</Tag> : null}
                {currentTask.outerItemId ? <Tag color="green">商品 {currentTask.outerItemId}</Tag> : null}
              </Space>
              <Text type="secondary" copyable={currentTask.sourceProductId ? { text: currentTask.sourceProductId } : false}>
                来源商品ID: {currentTask.sourceProductId || "-"}
              </Text>
              {currentTask.errorMessage ? <Alert type="error" showIcon message={currentTask.errorMessage} /> : null}
            </div>

            <section className="publish-task-section">
              <div className="publish-task-section-title">发布步骤</div>
              {steps.length > 0 ? (
                <div
                  className="publish-step-grid"
                  style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(112px, 1fr))` }}
                >
                  {steps.map((step, index) => {
                    const color = getPublishStepColor(step.status, Boolean(step.errorMessage));
                    const range = rangeMap.get(step.stepCode);
                    return (
                      <button
                        key={step.id || step.stepCode}
                        type="button"
                        className="publish-step-tile"
                        style={{
                          background: color.background,
                          borderColor: color.border,
                          color: color.text,
                        }}
                        onClick={() => scrollToLogLine(range?.startLineNo)}
                      >
                        <div className="publish-step-tile-head">
                          {getPublishStepIcon(step.status, Boolean(step.errorMessage))}
                          <strong>{localizePublishStepCode(step.stepCode)}</strong>
                          <span>#{index + 1}</span>
                        </div>
                        <div className="publish-step-tile-meta">
                          {step.status}
                          {range?.startLineNo ? ` · L${range.startLineNo}` : " · 日志未定位"}
                        </div>
                        {step.errorMessage ? (
                          <Tooltip title={step.errorMessage}>
                            <div className="publish-step-error">{step.errorMessage}</div>
                          </Tooltip>
                        ) : null}
                        {step.log?.content ? <div className="publish-step-log-snippet">{firstLogLine(step.log.content)}</div> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 step 记录" />
              )}
            </section>

            <section className="publish-task-section">
              <div className="publish-log-toolbar">
                <Space size={8} wrap>
                  <Text strong>相关日志</Text>
                  {detail?.log?.fileName ? <Tag color="blue">{detail.log.fileName}</Tag> : null}
                  {detail?.log?.size ? <Tag>{formatFileSize(detail.log.size)}</Tag> : null}
                  {detail?.log?.truncated ? <Tag color="warning">仅展示末尾日志</Tag> : null}
                </Space>
                <Space size={8}>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    disabled={!canDownloadLog}
                    onClick={() => void handleDownloadLog()}
                  >
                    下载日志
                  </Button>
                  <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    value={search}
                    placeholder="搜索日志"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </Space>
              </div>
              {logLines.length > 0 ? (
                <>
                  <Text type="secondary">{search.trim() ? `匹配 ${matchCount} 处` : "点击步骤可跳转到对应日志位置"}</Text>
                  <div className="publish-log-viewer">
                    {logLines.map((line) => (
                      <div key={line.lineNo} id={`manager-publish-log-line-${line.lineNo}`}>
                        {ranges
                          .filter((range) => range.startLineNo === line.lineNo)
                          .map((range) => (
                            <div key={`${range.stepCode}-start`} className="publish-log-boundary is-start">
                              {localizePublishStepCode(range.stepCode)} 开始
                            </div>
                          ))}
                        <div
                          className="publish-log-line"
                          style={{ background: getStepRangeBackground(line.lineNo, ranges) }}
                        >
                          <span className="publish-log-line-no">{line.lineNo}</span>
                          <span className={`publish-log-line-text level-${line.level.toLowerCase()}`}>
                            {renderLogLine(line)}
                          </span>
                        </div>
                        {ranges
                          .filter((range) => range.endLineNo === line.lineNo)
                          .map((range) => (
                            <div key={`${range.stepCode}-end`} className="publish-log-boundary is-end">
                              {localizePublishStepCode(range.stepCode)} 结束
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Empty description={detail?.log ? "日志内容为空" : "暂无可展示的 OSS 日志"} />
              )}
            </section>
          </Space>
        ) : (
          <Empty description="请选择发布任务" />
        )}
      </Spin>
      <style jsx global>{`
        .publish-task-detail-drawer .ant-drawer-body {
          padding: 16px;
          background: #f6f8fb;
        }
        .publish-task-detail-stack {
          width: 100%;
        }
        .publish-task-summary,
        .publish-task-section {
          background: #fff;
          border: 1px solid #e5e9f0;
          border-radius: 8px;
          padding: 12px;
        }
        .publish-task-summary {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .publish-task-section-title {
          margin-bottom: 10px;
          font-size: 13px;
          font-weight: 700;
          color: #172033;
        }
        .publish-step-grid {
          display: grid;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }
        .publish-step-tile {
          min-width: 0;
          min-height: 66px;
          border: 1px solid;
          border-radius: 6px;
          padding: 8px;
          text-align: left;
          cursor: pointer;
        }
        .publish-step-tile-head {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr) auto;
          align-items: center;
          gap: 6px;
        }
        .publish-step-tile-head strong,
        .publish-step-error,
        .publish-step-log-snippet {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .publish-step-tile-meta {
          margin-top: 5px;
          font-size: 11px;
        }
        .publish-step-error {
          margin-top: 4px;
          color: #991b1b;
          font-size: 11px;
        }
        .publish-step-log-snippet {
          display: none;
          margin-top: 4px;
          color: #475569;
          font-size: 11px;
        }
        .publish-log-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .publish-log-toolbar .ant-input-affix-wrapper {
          width: 220px;
          flex: 0 0 auto;
        }
        .publish-log-viewer {
          margin-top: 8px;
          max-height: calc(100vh - 470px);
          min-height: 260px;
          overflow: auto;
          border: 1px solid #1e293b;
          border-radius: 8px;
          background: #0f172a;
          color: #dbeafe;
          font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
          font-size: 12px;
          line-height: 1.65;
        }
        .publish-log-line {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        .publish-log-line-no {
          user-select: none;
          color: #64748b;
          text-align: right;
          padding: 0 10px;
          background: rgba(15, 23, 42, 0.95);
        }
        .publish-log-line-text {
          white-space: pre-wrap;
          word-break: break-word;
          padding: 0 10px;
        }
        .publish-log-line-text.level-error {
          color: #fecaca;
        }
        .publish-log-line-text.level-warn {
          color: #fde68a;
        }
        .publish-log-line-text.level-info {
          color: #dbeafe;
        }
        .publish-log-line-text.level-debug {
          color: #cbd5e1;
        }
        .publish-log-boundary {
          padding: 3px 12px 3px 70px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          font-size: 12px;
          font-weight: 700;
        }
        .publish-log-boundary.is-start {
          background: rgba(34, 197, 94, 0.18);
          color: #bbf7d0;
        }
        .publish-log-boundary.is-end {
          background: rgba(251, 146, 60, 0.18);
          color: #fed7aa;
        }
        .publish-log-match {
          background: #facc15;
          color: #111827;
          border-radius: 2px;
        }
      `}</style>
    </Drawer>
  );
}

function scrollToLogLine(lineNo?: number) {
  if (!lineNo || typeof document === "undefined") return;
  document.getElementById(`manager-publish-log-line-${lineNo}`)?.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
}

function firstLogLine(content: string) {
  return String(content || "").split(/\r?\n/).find(Boolean) || "";
}

function buildStepLogRanges(
  lines: LogLineView[],
  taskId: number | undefined,
  steps: PublishStepRecord[],
): StepLogRange[] {
  if (!taskId || steps.length === 0) return [];
  const taskToken = `[task:${taskId}]`;
  return steps.map((step) => {
    const stepToken = `[step:${step.stepCode}]`;
    const stepLines = lines.filter((line) => line.text.includes(taskToken) && line.text.includes(stepToken));
    const start = stepLines.find((line) => /\[phase:start\]/.test(line.text)) ?? stepLines[0];
    const explicitEnd = [...stepLines].reverse().find((line) => /\[phase:(finish|captcha)\]/.test(line.text));
    const failedEnd = stepLines.find((line) => /\b(ERROR|failed)\b/i.test(line.text));
    const end = explicitEnd ?? failedEnd ?? stepLines[stepLines.length - 1];
    return {
      stepCode: step.stepCode,
      startLineNo: start?.lineNo,
      endLineNo: end?.lineNo,
    };
  });
}

function getStepRangeBackground(lineNo: number, ranges: StepLogRange[]) {
  const inRange = ranges.some((range) => (
    range.startLineNo !== undefined
    && range.endLineNo !== undefined
    && lineNo >= range.startLineNo
    && lineNo <= range.endLineNo
  ));
  return inRange ? "rgba(30, 64, 175, 0.16)" : "transparent";
}

function getPublishTaskTagColor(status?: string) {
  if (status === "SUCCESS") return "green";
  if (status === "FAILED") return "red";
  if (status === "RUNNING") return "processing";
  if (status === "CANCELLED" || status === "CANCELED") return "default";
  return "gold";
}

function getPublishStepColor(status?: string, hasError = false) {
  if (status === "SUCCESS") return { background: "#f0fdf4", border: "#86efac", text: "#166534" };
  if (status === "FAILED" || hasError) return { background: "#fef2f2", border: "#fca5a5", text: "#991b1b" };
  if (status === "RUNNING") return { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" };
  return { background: "#f8fafc", border: "#cbd5e1", text: "#334155" };
}

function getPublishStepIcon(status?: string, hasError = false) {
  if (status === "SUCCESS") return <CheckCircleOutlined />;
  if (status === "FAILED" || hasError) return <CloseCircleOutlined />;
  return <ClockCircleOutlined />;
}

function localizePublishStepCode(stepCode?: string) {
  const map: Record<string, string> = {
    UNKNOWN: "准备中",
    PARSE_SOURCE: "解析源商品",
    UPLOAD_IMAGES: "上传图片",
    SEARCH_CATEGORY: "识别类目",
    FILL_DRAFT: "填写草稿",
    EDIT_DRAFT: "编辑草稿",
    PUBLISH: "提交发布",
  };
  return map[String(stepCode || "").toUpperCase()] || stepCode || "-";
}

function buildLogLineViews(content: string, search: string): LogLineView[] {
  const keyword = search.trim();
  const matcher = keyword ? new RegExp(escapeRegExp(keyword), "gi") : null;
  return String(content || "")
    .split(/\r?\n/)
    .map((text, index) => {
      const matchIndexes: number[] = [];
      if (matcher) {
        matcher.lastIndex = 0;
        let match = matcher.exec(text);
        while (match) {
          matchIndexes.push(match.index);
          match = matcher.exec(text);
        }
      }
      return {
        lineNo: index + 1,
        text,
        level: detectLogLevel(text),
        matchIndexes,
        matchLength: keyword.length,
      };
    });
}

function renderLogLine(line: LogLineView) {
  if (line.matchIndexes.length === 0) return line.text;
  const parts: JSX.Element[] = [];
  let cursor = 0;
  line.matchIndexes.forEach((index, partIndex) => {
    if (index > cursor) {
      parts.push(<span key={`text-${partIndex}`}>{line.text.slice(cursor, index)}</span>);
    }
    parts.push(
      <mark key={`match-${partIndex}`} className="publish-log-match">
        {line.text.slice(index, index + line.matchLength)}
      </mark>,
    );
    cursor = index + line.matchLength;
  });
  if (cursor < line.text.length) {
    parts.push(<span key="tail">{line.text.slice(cursor)}</span>);
  }
  return parts;
}

function detectLogLevel(text: string): LogLineView["level"] {
  if (/\bERROR\b/i.test(text)) return "ERROR";
  if (/\bWARN\b/i.test(text)) return "WARN";
  if (/\bINFO\b/i.test(text)) return "INFO";
  if (/\bDEBUG\b/i.test(text)) return "DEBUG";
  return "DEFAULT";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
