"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PublishTaskDetailDrawer } from "../../../collect/batches/components/PublishTaskDetailDrawer";
import {
  createPublishTask,
  downloadPublishTaskLog,
  fetchPublishTaskDetail,
  fetchPublishTasks,
  updatePublishTask,
  type PublishTaskDetailRecord,
  type PublishTaskPayload,
  type PublishTaskRecord,
} from "../api/publish-task.api";

const { Text } = Typography;

const pageSize = 12;

const statusOptions = [
  { label: "待发布", value: "PENDING" },
  { label: "发布中", value: "RUNNING" },
  { label: "成功", value: "SUCCESS" },
  { label: "失败", value: "FAILED" },
  { label: "取消", value: "CANCELLED" },
];

const sourceOptions = [
  { label: "淘宝", value: "TB" },
  { label: "拼多多", value: "PXX" },
];

const stepLabels: Record<string, string> = {
  UNKNOWN: "准备中",
  PARSE_SOURCE: "解析源商品",
  UPLOAD_IMAGES: "上传图片",
  SEARCH_CATEGORY: "识别类目",
  FILL_DRAFT: "填写草稿",
  EDIT_DRAFT: "编辑草稿",
  PUBLISH: "提交发布",
};

interface PublishTaskFilters {
  sourceProductId?: string;
  status?: string;
  sourceType?: string;
  appUserId?: number;
  shopId?: number;
  collectBatchId?: number;
}

interface PublishTaskFormValues {
  appUserId?: number;
  shopId?: number;
  collectBatchId?: number;
  productId?: number;
  sourceType?: string;
  sourceProductId?: string;
  sourceRecordId?: number;
  status?: string;
  currentStepCode?: string;
  errorMessage?: string;
  outerItemId?: string;
  logOssPath?: string;
  remark?: string;
}

export function PublishTaskManagementPanel() {
  const [form] = Form.useForm<PublishTaskFormValues>();
  const [records, setRecords] = useState<PublishTaskRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [filters, setFilters] = useState<PublishTaskFilters>({});
  const [draftFilters, setDraftFilters] = useState<PublishTaskFilters>({});
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PublishTaskRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PublishTaskRecord | null>(null);
  const [taskDetail, setTaskDetail] = useState<PublishTaskDetailRecord | null>(null);

  const loadRecords = async (nextPage = pageIndex, nextFilters = filters) => {
    setLoading(true);
    try {
      const result = await fetchPublishTasks({
        pageIndex: nextPage,
        pageSize,
        ...compactQuery(nextFilters),
      });
      setRecords(result.data);
      setTotal(result.total);
      setPageIndex(nextPage);
      setFilters(nextFilters);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载发布任务失败");
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async (baseFilters = filters) => {
    setMetricsLoading(true);
    try {
      const entries = await Promise.all(
        statusOptions.map(async (item) => {
          const result = await fetchPublishTasks({
            pageIndex: 1,
            pageSize: 1,
            ...compactQuery({ ...baseFilters, status: item.value }),
          });
          return [item.value, result.total] as const;
        }),
      );
      setStatusCounts(Object.fromEntries(entries));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载发布指标失败");
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords(1, {});
    void loadMetrics({});
  }, []);

  const visibleStats = useMemo(() => {
    const success = statusCounts.SUCCESS ?? 0;
    const failed = statusCounts.FAILED ?? 0;
    const running = statusCounts.RUNNING ?? 0;
    const pending = statusCounts.PENDING ?? 0;
    const done = success + failed + running + pending + (statusCounts.CANCELLED ?? 0);
    const successRate = done > 0 ? Math.round((success / done) * 100) : 0;

    return [
      {
        key: "total",
        label: "任务总量",
        value: total,
        hint: "当前筛选范围",
        icon: <FileSearchOutlined />,
      },
      {
        key: "running",
        label: "运行中",
        value: running,
        hint: `${pending} 个任务等待发布`,
        icon: <SyncOutlined spin={running > 0} />,
      },
      {
        key: "failed",
        label: "失败待处理",
        value: failed,
        hint: failed > 0 ? "建议优先查看日志" : "暂无阻塞任务",
        icon: <AlertOutlined />,
      },
      {
        key: "rate",
        label: "成功率",
        value: `${successRate}%`,
        hint: `${success} 个任务已发布成功`,
        icon: <CheckCircleOutlined />,
      },
    ];
  }, [statusCounts, total]);

  const openCreateModal = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ sourceType: "TB" });
    setFormOpen(true);
  };

  const openEditModal = (record: PublishTaskRecord) => {
    setEditingRecord(record);
    form.resetFields();
    form.setFieldsValue(normalizeRecordForForm(record));
    setFormOpen(true);
  };

  const openTaskDetail = (record: PublishTaskRecord) => {
    setSelectedTask(record);
    setTaskDetail(null);
    setDetailOpen(true);
    setDetailLoading(true);
    void fetchPublishTaskDetail(record.id)
      .then((result) => setTaskDetail(result))
      .catch((error) => message.error(error instanceof Error ? error.message : "加载发布任务详情失败"))
      .finally(() => setDetailLoading(false));
  };

  const handleSubmit = async () => {
    const values = compactPayload(await form.validateFields()) as PublishTaskPayload;
    setSubmitting(true);
    try {
      if (editingRecord) {
        await updatePublishTask(editingRecord.id, values);
        message.success("任务已更新");
      } else {
        await createPublishTask(values);
        message.success("发布任务已创建");
      }
      setFormOpen(false);
      setEditingRecord(null);
      form.resetFields();
      await loadRecords(editingRecord ? pageIndex : 1, filters);
      await loadMetrics(filters);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存发布任务失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSearch = async () => {
    await loadRecords(1, draftFilters);
    await loadMetrics(draftFilters);
  };

  const handleReset = async () => {
    setDraftFilters({});
    await loadRecords(1, {});
    await loadMetrics({});
  };

  const columns: ColumnsType<PublishTaskRecord> = [
    {
      title: "任务",
      dataIndex: "id",
      width: 94,
      fixed: "left",
      render: (value) => <Text strong>#{String(value)}</Text>,
    },
    {
      title: "商品来源",
      dataIndex: "sourceProductId",
      width: 280,
      fixed: "left",
      render: (_, record) => (
        <div className="publish-product-cell">
          <Space size={6} wrap>
            <Tag color={record.sourceType === "PXX" ? "orange" : "blue"}>
              {sourceLabel(record.sourceType)}
            </Tag>
            {record.collectBatchId ? <Tag>批次 {record.collectBatchId}</Tag> : null}
          </Space>
          <Text copyable={{ text: record.sourceProductId || "" }} className="publish-product-id">
            {record.sourceProductId || "-"}
          </Text>
          <Text className="publish-product-sub">
            记录 {record.sourceRecordId || "-"} · 商品 {record.productId || "未关联"}
          </Text>
        </div>
      ),
    },
    {
      title: "账号与店铺",
      dataIndex: "shopId",
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>
            <ShopOutlined /> 店铺 {record.shopId || "-"}
          </Text>
          <Text type="secondary">App 用户 {record.appUserId || "-"}</Text>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 128,
      render: (value) => renderStatusTag(String(value || "")),
    },
    {
      title: "进度",
      dataIndex: "currentStepCode",
      width: 240,
      render: (_, record) => (
        <div className="publish-progress-cell">
          <div>
            <Text strong>{stepLabel(record.currentStepCode)}</Text>
            <Text type="secondary">{progressText(record)}</Text>
          </div>
          <Progress
            percent={progressPercent(record)}
            size="small"
            status={record.status === "FAILED" ? "exception" : record.status === "SUCCESS" ? "success" : "active"}
            showInfo={false}
          />
        </div>
      ),
    },
    {
      title: "外部商品",
      dataIndex: "outerItemId",
      width: 180,
      render: (value) => (
        <Text copyable={value ? { text: String(value) } : false}>
          {value ? String(value) : "-"}
        </Text>
      ),
    },
    {
      title: "异常摘要",
      dataIndex: "errorMessage",
      width: 260,
      ellipsis: true,
      render: (value, record) => record.status === "FAILED" ? (
        <Tooltip title={String(value || "暂无错误信息")}>
          <Text type="danger">{String(value || "发布失败，暂无错误信息")}</Text>
        </Tooltip>
      ) : (
        <Text type="secondary">-</Text>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedTime",
      width: 176,
      render: (value) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
    {
      title: "操作",
      key: "actions",
      width: 152,
      fixed: "right",
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看详情与日志">
            <Button type="text" icon={<EyeOutlined />} onClick={() => openTaskDetail(record)} />
          </Tooltip>
          <Tooltip title="编辑任务">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Tooltip title="下载日志">
            <Button type="text" icon={<DownloadOutlined />} onClick={() => void downloadLog(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="manager-page-stack publish-ops-page">
      <section className="publish-ops-hero">
        <div className="publish-ops-hero-main">
          <div className="manager-section-label">Commerce Publishing</div>
          <h1>商品发布管理</h1>
          <Text>
            集中查看发布任务、排查步骤日志、按店铺和来源定位失败商品。
          </Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => {
            void loadRecords(pageIndex, filters);
            void loadMetrics(filters);
          }}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新增发布任务
          </Button>
        </Space>
      </section>

      <section className="publish-ops-metrics">
        {visibleStats.map((item) => (
          <div key={item.key} className={`publish-ops-metric is-${item.key}`}>
            <div className="publish-ops-metric-icon">{item.icon}</div>
            <div>
              <div className="manager-section-label">{item.label}</div>
              <div className="manager-display-title">{metricsLoading ? "-" : item.value}</div>
              <Text className="manager-card-hint">{item.hint}</Text>
            </div>
          </div>
        ))}
      </section>

      <section className="manager-data-card publish-ops-filter">
        <div className="publish-filter-grid">
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: "var(--manager-text-faint)" }} />}
            placeholder="来源商品 ID"
            value={draftFilters.sourceProductId}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, sourceProductId: event.target.value }))}
            onPressEnter={() => void handleSearch()}
          />
          <Select
            allowClear
            placeholder="任务状态"
            value={draftFilters.status}
            options={statusOptions}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
          />
          <Select
            allowClear
            placeholder="来源平台"
            value={draftFilters.sourceType}
            options={sourceOptions}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, sourceType: value }))}
          />
          <InputNumber
            min={1}
            precision={0}
            placeholder="App 用户 ID"
            value={draftFilters.appUserId}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, appUserId: numberOrUndefined(value) }))}
          />
          <InputNumber
            min={1}
            precision={0}
            placeholder="店铺 ID"
            value={draftFilters.shopId}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, shopId: numberOrUndefined(value) }))}
          />
          <InputNumber
            min={1}
            precision={0}
            placeholder="选品批次 ID"
            value={draftFilters.collectBatchId}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, collectBatchId: numberOrUndefined(value) }))}
          />
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => void handleSearch()}>
              查询
            </Button>
            <Button onClick={() => void handleReset()}>重置</Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table publish-ops-table-card">
        <div className="manager-table-heading">
          <div>
            <h2>发布任务队列</h2>
            <Text>点击详情可查看发布步骤、错误上下文和 OSS 日志。</Text>
          </div>
          <Tag className="manager-count-tag">共 {total} 条</Tag>
        </div>
        <Table<PublishTaskRecord>
          rowKey="id"
          loading={loading}
          dataSource={records}
          columns={columns}
          scroll={{ x: 1690 }}
          pagination={{
            current: pageIndex,
            pageSize,
            total,
            showSizeChanger: false,
            onChange: (page) => void loadRecords(page, filters),
          }}
        />
      </section>

      <Drawer
        className="manager-form-skin"
        open={formOpen}
        title={editingRecord ? `编辑发布任务 #${editingRecord.id}` : "新增发布任务"}
        width={560}
        destroyOnClose
        onClose={() => {
          setFormOpen(false);
          setEditingRecord(null);
          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" preserve={false}>
          {!editingRecord ? (
            <>
              <Form.Item name="appUserId" label="App 用户 ID" rules={[{ required: true, message: "请输入 App 用户 ID" }]}>
                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="shopId" label="店铺 ID" rules={[{ required: true, message: "请输入店铺 ID" }]}>
                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="sourceType" label="来源平台" rules={[{ required: true, message: "请选择来源平台" }]}>
                <Select options={sourceOptions} />
              </Form.Item>
              <Form.Item name="sourceProductId" label="来源商品 ID" rules={[{ required: true, message: "请输入来源商品 ID" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="sourceRecordId" label="来源记录 ID" rules={[{ required: true, message: "请输入来源记录 ID" }]}>
                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </>
          ) : null}

          <Form.Item name="collectBatchId" label="选品批次 ID">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="productId" label="商品 ID">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          {editingRecord ? (
            <>
              <Form.Item name="status" label="状态">
                <Select options={statusOptions} />
              </Form.Item>
              <Form.Item name="currentStepCode" label="当前步骤">
                <Input placeholder="如 FILL_DRAFT" />
              </Form.Item>
              <Form.Item name="outerItemId" label="外部商品 ID">
                <Input />
              </Form.Item>
              <Form.Item name="errorMessage" label="错误信息">
                <Input.TextArea rows={4} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      <PublishTaskDetailDrawer
        open={detailOpen}
        loading={detailLoading}
        task={selectedTask}
        detail={taskDetail}
        onClose={() => {
          setDetailOpen(false);
          setSelectedTask(null);
          setTaskDetail(null);
        }}
      />

      <style jsx global>{`
        .publish-ops-page {
          gap: 14px;
        }
        .publish-ops-hero {
          min-height: 126px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          padding: 24px;
          border: 1px solid var(--manager-border);
          border-radius: 8px;
          background:
            linear-gradient(135deg, rgba(22, 87, 193, 0.1), rgba(18, 160, 109, 0.08)),
            var(--manager-surface);
          box-shadow: var(--manager-shadow-sm);
        }
        .publish-ops-hero h1 {
          margin: 8px 0 6px;
          color: var(--manager-text);
          font-size: 26px;
          line-height: 1.15;
          font-weight: 800;
        }
        .publish-ops-hero .ant-typography {
          color: var(--manager-text-soft);
        }
        .publish-ops-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .publish-ops-metric {
          min-height: 124px;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          padding: 18px;
          border: 1px solid var(--manager-border);
          border-radius: 8px;
          background: var(--manager-surface);
          box-shadow: var(--manager-shadow-sm);
        }
        .publish-ops-metric-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: var(--manager-primary);
          background: var(--manager-primary-light);
          font-size: 18px;
        }
        .publish-ops-metric.is-failed .publish-ops-metric-icon {
          color: var(--manager-danger);
          background: rgba(220, 38, 38, 0.08);
        }
        .publish-ops-metric.is-running .publish-ops-metric-icon {
          color: var(--manager-warning);
          background: rgba(217, 119, 6, 0.1);
        }
        .publish-ops-metric.is-rate .publish-ops-metric-icon {
          color: var(--manager-success);
          background: rgba(18, 160, 109, 0.1);
        }
        .publish-ops-metric .manager-display-title {
          margin-top: 10px;
          color: var(--manager-text);
          font-size: 30px;
          line-height: 1;
        }
        .publish-filter-grid {
          display: grid;
          grid-template-columns: minmax(220px, 1.3fr) repeat(5, minmax(140px, 1fr)) auto;
          gap: 10px;
          align-items: center;
        }
        .publish-filter-grid .ant-input-number,
        .publish-filter-grid .ant-select,
        .publish-filter-grid .ant-input-affix-wrapper {
          width: 100%;
        }
        .publish-product-cell {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .publish-product-id {
          max-width: 230px;
          color: var(--manager-text) !important;
          font-weight: 700;
        }
        .publish-product-sub {
          color: var(--manager-text-faint) !important;
          font-size: 12px;
        }
        .publish-progress-cell {
          display: grid;
          gap: 8px;
          min-width: 0;
        }
        .publish-progress-cell > div:first-child {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }
        .publish-status-tag.ant-tag {
          min-width: 76px;
          margin-inline-end: 0;
          text-align: center;
          font-weight: 700;
          border-radius: 4px;
        }
        .publish-ops-table-card {
          padding: 18px;
        }
        @media (max-width: 1320px) {
          .publish-ops-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .publish-filter-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 760px) {
          .publish-ops-hero {
            grid-template-columns: 1fr;
          }
          .publish-ops-metrics,
          .publish-filter-grid {
            grid-template-columns: 1fr;
          }
          .publish-ops-hero h1 {
            font-size: 22px;
          }
        }
      `}</style>
    </div>
  );
}

function compactQuery(filters: PublishTaskFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function compactPayload(values: object) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function normalizeRecordForForm(record: PublishTaskRecord): PublishTaskFormValues {
  return {
    appUserId: record.appUserId,
    shopId: record.shopId,
    collectBatchId: record.collectBatchId || undefined,
    productId: record.productId || undefined,
    sourceType: record.sourceType,
    sourceProductId: record.sourceProductId,
    sourceRecordId: record.sourceRecordId,
    status: record.status,
    currentStepCode: record.currentStepCode,
    errorMessage: record.errorMessage,
    outerItemId: record.outerItemId,
    logOssPath: record.logOssPath,
    remark: record.remark,
  };
}

function sourceLabel(value?: string) {
  return sourceOptions.find((item) => item.value === value)?.label ?? value ?? "-";
}

function renderStatusTag(status: string) {
  const option = statusOptions.find((item) => item.value === status);
  const color = status === "SUCCESS"
    ? "green"
    : status === "FAILED"
      ? "red"
      : status === "RUNNING"
        ? "processing"
        : status === "CANCELLED"
          ? "default"
          : "gold";
  const icon = status === "SUCCESS"
    ? <CheckCircleOutlined />
    : status === "FAILED"
      ? <CloseCircleOutlined />
      : status === "RUNNING"
        ? <SyncOutlined spin />
        : <ClockCircleOutlined />;

  return (
    <Tag className="publish-status-tag" color={color} icon={icon}>
      {option?.label ?? (status || "-")}
    </Tag>
  );
}

function stepLabel(stepCode?: string) {
  return stepLabels[String(stepCode || "").toUpperCase()] ?? stepCode ?? "未开始";
}

function progressPercent(record: PublishTaskRecord) {
  if (record.status === "SUCCESS") return 100;
  if (record.status === "FAILED") return Math.max(stepPercent(record.currentStepCode), 12);
  if (record.status === "RUNNING") return Math.max(stepPercent(record.currentStepCode), 18);
  if (record.status === "CANCELLED") return 0;
  return 8;
}

function stepPercent(stepCode?: string) {
  const order = ["PARSE_SOURCE", "UPLOAD_IMAGES", "SEARCH_CATEGORY", "FILL_DRAFT", "EDIT_DRAFT", "PUBLISH"];
  const index = order.indexOf(String(stepCode || "").toUpperCase());
  if (index < 0) return 8;
  return Math.round(((index + 1) / order.length) * 88);
}

function progressText(record: PublishTaskRecord) {
  if (record.status === "SUCCESS") return "已完成";
  if (record.status === "FAILED") return "需要排查";
  if (record.status === "RUNNING") return "执行中";
  if (record.status === "CANCELLED") return "已取消";
  return "等待调度";
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 19);
}

function numberOrUndefined(value: string | number | null) {
  if (value === null || value === "") return undefined;
  return Number(value);
}

async function downloadLog(record: PublishTaskRecord) {
  try {
    const result = await downloadPublishTaskLog(record.id);
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
}
