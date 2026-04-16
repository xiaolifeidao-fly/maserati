"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { DeleteOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  deleteActivationCodeDetail,
  disableActivationCodeDetail,
  fetchActivationCodeDetails,
  type ActivationCodeBatchRecord,
  type ActivationCodeDetailRecord,
  type ActivationCodeDetailListQuery,
  type ActivationCodeTypeRecord,
} from "../api/activation-code.api";

const { Text } = Typography;

interface ActivationCodeDetailDrawerProps {
  open: boolean;
  typeRecord: ActivationCodeTypeRecord | null;
  batchRecord: ActivationCodeBatchRecord | null;
  onClose: () => void;
}

interface DetailFilters {
  activationCode: string;
  batchId: number;
  status: string;
}

const defaultPageSize = 10;
const defaultStatus = "UNUSED";

const detailStatusOptions = [
  { label: "全部状态", value: "" },
  { label: "未使用", value: "UNUSED" },
  { label: "已锁定", value: "LOCKED" },
  { label: "已激活", value: "ACTIVATED" },
  { label: "已过期", value: "EXPIRED" },
  { label: "已禁用", value: "DISABLED" },
];

function getDetailStatusText(status: string) {
  switch (status) {
    case "UNUSED":
      return "未使用";
    case "LOCKED":
      return "已锁定";
    case "ACTIVATED":
      return "已激活";
    case "EXPIRED":
      return "已过期";
    case "DISABLED":
      return "已禁用";
    default:
      return "未知";
  }
}

function getDetailStatusColor(status: string) {
  switch (status) {
    case "UNUSED":
      return "green";
    case "LOCKED":
      return "gold";
    case "ACTIVATED":
      return "blue";
    case "EXPIRED":
      return "default";
    case "DISABLED":
      return "red";
    default:
      return "default";
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function ActivationCodeDetailDrawer({
  open,
  typeRecord,
  batchRecord,
  onClose,
}: ActivationCodeDetailDrawerProps) {
  const [details, setDetails] = useState<ActivationCodeDetailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<
    Required<Pick<ActivationCodeDetailListQuery, "pageIndex" | "pageSize">>
  >({
    pageIndex: 1,
    pageSize: defaultPageSize,
  });
  const [filters, setFilters] = useState<DetailFilters>({
    activationCode: "",
    batchId: 0,
    status: defaultStatus,
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [disablingId, setDisablingId] = useState<number | null>(null);

  const loadDetails = useCallback(
    async (pageIndex: number, pageSize: number, activeFilters: DetailFilters) => {
      if (!typeRecord) {
        return;
      }
      setLoading(true);
      try {
        const result = await fetchActivationCodeDetails({
          pageIndex,
          pageSize,
          typeId: typeRecord.id,
          batchId: activeFilters.batchId,
          activationCode: activeFilters.activationCode.trim(),
          status: activeFilters.status,
        });
        setDetails(result.data);
        setTotal(result.total);
        setQuery({ pageIndex, pageSize });
        setFilters(activeFilters);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "获取激活码明细失败");
      } finally {
        setLoading(false);
      }
    },
    [typeRecord],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const initialFilters = {
      activationCode: "",
      batchId: batchRecord?.id ?? 0,
      status: defaultStatus,
    };
    setFilters(initialFilters);
    void loadDetails(1, defaultPageSize, initialFilters);
  }, [batchRecord?.id, loadDetails, open]);

  const refresh = (
    nextQuery?: Partial<ActivationCodeDetailListQuery>,
    nextFilters: DetailFilters = filters,
  ) => {
    const mergedQuery = { ...query, ...nextQuery };
    void loadDetails(
      mergedQuery.pageIndex ?? 1,
      mergedQuery.pageSize ?? defaultPageSize,
      nextFilters,
    );
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteActivationCodeDetail(id);
      message.success("激活码明细已删除");
      const nextPage =
        details.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      refresh({ pageIndex: nextPage });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除激活码明细失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDisable = async (record: ActivationCodeDetailRecord) => {
    if (record.status === "DISABLED") {
      return;
    }
    setDisablingId(record.id);
    try {
      await disableActivationCodeDetail(record.id);
      message.success("激活码已禁用");
      refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "禁用激活码失败");
    } finally {
      setDisablingId(null);
    }
  };

  const columns: ColumnsType<ActivationCodeDetailRecord> = [
    {
      title: "激活码",
      dataIndex: "activationCode",
      width: 260,
      render: (value: string) => (
        <Text copyable style={{ color: "var(--manager-text)", fontFamily: "monospace" }}>
          {value || "-"}
        </Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => (
        <Tag color={getDetailStatusColor(value)}>{getDetailStatusText(value)}</Tag>
      ),
    },
    {
      title: "批次",
      dataIndex: "batchId",
      width: 100,
      render: (value: number) => <span className="manager-value">#{value}</span>,
    },
    {
      title: "有效天数",
      dataIndex: "durationDays",
      width: 110,
      render: (value: number) => <Tag color="blue">{value} 天</Tag>,
    },
    {
      title: "价格",
      dataIndex: "price",
      width: 100,
      render: (value: string) => <span className="manager-value">{value || "0.00"}</span>,
    },
    {
      title: "开始时间",
      dataIndex: "startTime",
      width: 180,
      render: (value: string) => (
        <Text style={{ color: "var(--manager-text-soft)" }}>{formatDateTime(value)}</Text>
      ),
    },
    {
      title: "结束时间",
      dataIndex: "endTime",
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
      key: "actions",
      width: 112,
      fixed: "right",
      render: (_, record) => {
        const disabled = record.status === "DISABLED";
        return (
          <Space size={4}>
            <Popconfirm
              title="确认删除这条激活码明细吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDelete(record.id)}
            >
              <Tooltip title="删除">
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  loading={deletingId === record.id}
                />
              </Tooltip>
            </Popconfirm>
            <Tooltip title={disabled ? "已禁用" : "禁用"}>
              <span>
                <Button
                  danger
                  disabled={disabled}
                  type="text"
                  icon={<StopOutlined />}
                  loading={disablingId === record.id}
                  onClick={() => void handleDisable(record)}
                />
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const title = batchRecord
    ? `${typeRecord?.name ?? "激活码"} · 批次 #${batchRecord.id} 明细`
    : `${typeRecord?.name ?? "激活码"} · 明细`;

  return (
    <Drawer
      destroyOnClose
      title={title}
      open={open}
      width="50vw"
      onClose={onClose}
      styles={{
        body: {
          background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243,247,252,0.98))",
        },
      }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space wrap size={12}>
          <Input
            className="manager-filter-input"
            prefix={<SearchOutlined style={{ color: "var(--manager-text-faint)" }} />}
            placeholder="搜索激活码"
            value={filters.activationCode}
            onChange={(event) =>
              setFilters((current) => ({ ...current, activationCode: event.target.value }))
            }
            onPressEnter={() => refresh({ pageIndex: 1 })}
            style={{ width: 260, maxWidth: "100%" }}
          />
          <InputNumber
            className="manager-filter-input"
            min={0}
            precision={0}
            placeholder="批次号"
            value={filters.batchId || null}
            onChange={(value) =>
              setFilters((current) => ({ ...current, batchId: Number(value || 0) }))
            }
            onPressEnter={() => refresh({ pageIndex: 1 })}
            style={{ width: 150, maxWidth: "100%" }}
          />
          <Select<string>
            className="manager-filter-input"
            value={filters.status}
            options={detailStatusOptions}
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            style={{ width: 150 }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => refresh({ pageIndex: 1 })}
          >
            查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
            刷新
          </Button>
          <Tag
            style={{
              color: "var(--manager-text-soft)",
              background: "rgba(170,192,238,0.16)",
              border: "none",
            }}
          >
            共 {total} 条
          </Tag>
        </Space>

        <div className="manager-table">
          <Table<ActivationCodeDetailRecord>
            rowKey="id"
            loading={loading}
            dataSource={details}
            columns={columns}
            scroll={{ x: 1460 }}
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
    </Drawer>
  );
}
