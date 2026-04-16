"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, Progress, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  fetchActivationCodeBatches,
  type ActivationCodeBatchRecord,
  type ActivationCodeBatchListQuery,
  type ActivationCodeTypeRecord,
} from "../api/activation-code.api";

const { Text } = Typography;

interface ActivationCodeBatchDetailModalProps {
  open: boolean;
  record: ActivationCodeTypeRecord | null;
  onCancel: () => void;
  onOpenDetails: (batch: ActivationCodeBatchRecord) => void;
}

const defaultPageSize = 10;

function getBatchStatusColor(status: string) {
  switch (status) {
    case "COMPLETED":
      return "green";
    case "FAILED":
      return "red";
    case "PROCESSING":
      return "blue";
    case "PENDING":
      return "gold";
    default:
      return "default";
  }
}

function getBatchStatusText(status: string) {
  switch (status) {
    case "PENDING":
      return "等待生成";
    case "PROCESSING":
      return "生成中";
    case "COMPLETED":
      return "已完成";
    case "FAILED":
      return "失败";
    default:
      return "未知";
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatMoney(value?: string) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return value || "0.00";
  }
  return numeric.toFixed(2);
}

export function ActivationCodeBatchDetailModal({
  open,
  record,
  onCancel,
  onOpenDetails,
}: ActivationCodeBatchDetailModalProps) {
  const [batches, setBatches] = useState<ActivationCodeBatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<
    Required<Pick<ActivationCodeBatchListQuery, "pageIndex" | "pageSize">>
  >({
    pageIndex: 1,
    pageSize: defaultPageSize,
  });

  const loadBatches = useCallback(
    async (pageIndex: number, pageSize: number) => {
      if (!record) {
        return;
      }
      setLoading(true);
      try {
        const result = await fetchActivationCodeBatches({
          pageIndex,
          pageSize,
          typeId: record.id,
        });
        setBatches(result.data);
        setTotal(result.total);
        setQuery({ pageIndex, pageSize });
      } catch (error) {
        message.error(error instanceof Error ? error.message : "获取批次列表失败");
      } finally {
        setLoading(false);
      }
    },
    [record],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadBatches(1, defaultPageSize);
  }, [loadBatches, open]);

  const refresh = (nextQuery?: Partial<ActivationCodeBatchListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    void loadBatches(mergedQuery.pageIndex ?? 1, mergedQuery.pageSize ?? defaultPageSize);
  };

  const columns = useMemo<ColumnsType<ActivationCodeBatchRecord>>(
    () => [
      {
        title: "批次",
        dataIndex: "id",
        width: 100,
        render: (value: number) => <span className="manager-value">#{value}</span>,
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 120,
        render: (value: string) => (
          <Tag color={getBatchStatusColor(value)}>{getBatchStatusText(value)}</Tag>
        ),
      },
      {
        title: "生成进度",
        key: "progress",
        width: 220,
        render: (_, item) => {
          const percent =
            item.totalCount <= 0
              ? 0
              : Math.min(100, Math.round((item.generatedCount / item.totalCount) * 100));
          return (
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              <Progress
                percent={percent}
                size="small"
                status={item.status === "FAILED" ? "exception" : undefined}
              />
              <Text style={{ color: "var(--manager-text-soft)" }}>
                {item.generatedCount} / {item.totalCount}
                {item.failedCount > 0 ? `，失败 ${item.failedCount}` : ""}
              </Text>
            </Space>
          );
        },
      },
      {
        title: "总价",
        dataIndex: "totalPrice",
        width: 120,
        render: (value: string) => (
          <Text style={{ color: "var(--manager-text-soft)" }}>{formatMoney(value)}</Text>
        ),
      },
      {
        title: "实际消费",
        dataIndex: "actualConsume",
        width: 120,
        render: (value: string) => (
          <Text style={{ color: "var(--manager-text-soft)" }}>{formatMoney(value)}</Text>
        ),
      },
      {
        title: "消息",
        dataIndex: "message",
        width: 220,
        ellipsis: true,
        render: (value: string) => (
          <Text style={{ color: "var(--manager-text-soft)" }}>{value || "-"}</Text>
        ),
      },
      {
        title: "开始时间",
        dataIndex: "startedTime",
        width: 180,
        render: (value: string) => (
          <Text style={{ color: "var(--manager-text-soft)" }}>{formatDateTime(value)}</Text>
        ),
      },
      {
        title: "完成时间",
        dataIndex: "completedTime",
        width: 180,
        render: (value: string) => (
          <Text style={{ color: "var(--manager-text-soft)" }}>{formatDateTime(value)}</Text>
        ),
      },
      {
        title: "创建时间",
        dataIndex: "createdTime",
        width: 180,
        render: (value: string) => (
          <Text style={{ color: "var(--manager-text-soft)" }}>{formatDateTime(value)}</Text>
        ),
      },
      {
        title: "操作",
        key: "action",
        width: 90,
        fixed: "right",
        render: (_, item) => (
          <Tooltip title="查看明细">
            <Button type="text" icon={<EyeOutlined />} onClick={() => onOpenDetails(item)} />
          </Tooltip>
        ),
      },
    ],
    [onOpenDetails],
  );

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      width={1120}
      title={record ? `${record.name} · 批次详情` : "批次详情"}
      footer={null}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Text style={{ color: "var(--manager-text-soft)" }}>
            展示该类别下所有生成批次，最新批次排在最前。
          </Text>
          <Space>
            <Tag
              style={{
                color: "var(--manager-text-soft)",
                background: "rgba(170,192,238,0.16)",
                border: "none",
              }}
            >
              共 {total} 条
            </Tag>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
        </Space>
        <div className="manager-table">
          <Table<ActivationCodeBatchRecord>
            rowKey="id"
            loading={loading}
            dataSource={batches}
            columns={columns}
            scroll={{ x: 1530 }}
            pagination={{
              current: query.pageIndex,
              pageSize: query.pageSize,
              total,
              showSizeChanger: false,
              onChange: (page) => refresh({ pageIndex: page }),
            }}
          />
        </div>
      </Space>
    </Modal>
  );
}
