"use client";

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  fetchHumanTasks,
  resolveHumanTask,
  unableHumanTask,
  type HumanTaskRecord,
} from "../api/human-task.api";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待处理" },
  { value: "assigned", label: "已分配" },
  { value: "resolved", label: "已解决" },
  { value: "unable", label: "无法处理" },
  { value: "cancelled", label: "已取消" },
];

const BLOCKER_TYPE_LABELS: Record<string, string> = {
  captcha_text: "文字验证码",
  captcha_image: "图片验证码",
  sms: "短信验证",
  risk_control: "风控拦截",
  manual_decision: "人工决策",
};

const WORKER_TYPE_LABELS: Record<string, string> = {
  monitor: "监控",
  collect: "采集",
  publish: "发布",
};

function StatusTag({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "gold", label: "待处理" },
    assigned: { color: "blue", label: "已分配" },
    resolved: { color: "green", label: "已解决" },
    unable: { color: "red", label: "无法处理" },
    cancelled: { color: "default", label: "已取消" },
  };
  const cfg = map[status] || { color: "default", label: status };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function BlockerTypeTag({ type }: { type: string }) {
  const map: Record<string, string> = {
    captcha_text: "orange",
    captcha_image: "volcano",
    sms: "blue",
    risk_control: "red",
    manual_decision: "purple",
  };
  return <Tag color={map[type] || "default"}>{BLOCKER_TYPE_LABELS[type] || type}</Tag>;
}

function formatDateTime(val?: string | null) {
  if (!val) return "-";
  return val.replace("T", " ").slice(0, 19);
}

export function HumanTaskWorkbench() {
  const [tasks, setTasks] = useState<HumanTaskRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [runIdFilter, setRunIdFilter] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HumanTaskRecord | null>(null);
  const [resolving, setResolving] = useState(false);
  const [unabling, setUnabling] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchHumanTasks({
        pageIndex,
        pageSize,
        status: statusFilter || undefined,
        runId: runIdFilter.trim() || undefined,
      });
      setTasks(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total || 0);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载人工任务失败");
    } finally {
      setLoading(false);
    }
  }, [pageIndex, pageSize, statusFilter, runIdFilter]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleResolve = async () => {
    if (!selectedTask) return;
    setResolving(true);
    try {
      const updated = await resolveHumanTask(selectedTask.humanTaskId, {
        resolution: {
          solvedBy: "human_workbench",
          solvedAt: new Date().toISOString(),
        },
      });
      setSelectedTask(updated);
      setTasks((prev) => prev.map((t) => (t.humanTaskId === updated.humanTaskId ? updated : t)));
      message.success("任务已解决");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "提交解决方案失败");
    } finally {
      setResolving(false);
    }
  };

  const handleUnable = async () => {
    if (!selectedTask) return;
    setUnabling(true);
    try {
      const updated = await unableHumanTask(selectedTask.humanTaskId, { reason: "人工标记无法处理" });
      setSelectedTask(updated);
      setTasks((prev) => prev.map((t) => (t.humanTaskId === updated.humanTaskId ? updated : t)));
      message.success("已标记为无法处理");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "标记失败");
    } finally {
      setUnabling(false);
    }
  };

  const handleViewDetail = (task: HumanTaskRecord) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const assignedCount = tasks.filter((t) => t.status === "assigned").length;

  const columns: ColumnsType<HumanTaskRecord> = [
    {
      title: "任务 ID",
      dataIndex: "humanTaskId",
      width: 180,
      ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{v}</span>,
    },
    {
      title: "业务标识",
      dataIndex: "businessKey",
      width: 140,
      ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{v || "-"}</span>,
    },
    {
      title: "业务名称",
      dataIndex: "businessName",
      width: 180,
      ellipsis: true,
      render: (v: string) => v || "-",
    },
    {
      title: "阻塞类型",
      dataIndex: "blockerType",
      width: 110,
      render: (v: string) => <BlockerTypeTag type={v} />,
    },
    {
      title: "工作类型",
      dataIndex: "workerType",
      width: 80,
      render: (v: string) => <Tag>{WORKER_TYPE_LABELS[v] || v}</Tag>,
    },
    {
      title: "运行实例",
      dataIndex: "runId",
      width: 160,
      ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{v || "-"}</span>,
    },
    {
      title: "提示信息",
      dataIndex: "prompt",
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (v: string) => <StatusTag status={v} />,
    },
    {
      title: "创建时间",
      dataIndex: "createdTime",
      width: 150,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: "操作",
      width: 80,
      fixed: "right" as const,
      render: (_: unknown, record: HumanTaskRecord) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  const canResolve = selectedTask?.status === "assigned" || selectedTask?.status === "pending";
  const canUnable = selectedTask?.status === "assigned" || selectedTask?.status === "pending";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Space size={8}>
          <Badge count={pendingCount} color="gold" offset={[6, 0]}>
            <Tag style={{ margin: 0 }}>待处理</Tag>
          </Badge>
          <Badge count={assignedCount} color="blue" offset={[6, 0]}>
            <Tag style={{ margin: 0 }}>已分配</Tag>
          </Badge>
        </Space>
        <div style={{ flex: 1 }} />
        <Select
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPageIndex(1); }}
          options={STATUS_OPTIONS}
          style={{ width: 130 }}
          size="small"
        />
        <Input
          placeholder="运行实例 ID"
          value={runIdFilter}
          onChange={(e) => { setRunIdFilter(e.target.value); setPageIndex(1); }}
          allowClear
          style={{ width: 200 }}
          size="small"
        />
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadTasks()} loading={loading}>
          刷新
        </Button>
      </div>

      <Table<HumanTaskRecord>
        rowKey="humanTaskId"
        size="small"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        scroll={{ x: 1220 }}
        pagination={{
          current: pageIndex,
          pageSize,
          total,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page) => setPageIndex(page),
        }}
      />

      <Drawer
        title="人工任务详情"
        open={detailOpen}
        width={560}
        onClose={() => setDetailOpen(false)}
      >
        {selectedTask && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="任务 ID">
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{selectedTask.humanTaskId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="状态"><StatusTag status={selectedTask.status} /></Descriptions.Item>
              <Descriptions.Item label="阻塞类型"><BlockerTypeTag type={selectedTask.blockerType} /></Descriptions.Item>
              <Descriptions.Item label="工作类型">{WORKER_TYPE_LABELS[selectedTask.workerType] || selectedTask.workerType}</Descriptions.Item>
              <Descriptions.Item label="业务标识">
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{selectedTask.businessKey || "-"}</span>
              </Descriptions.Item>
              <Descriptions.Item label="业务名称">{selectedTask.businessName || "-"}</Descriptions.Item>
              <Descriptions.Item label="运行实例">
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{selectedTask.runId || "-"}</span>
              </Descriptions.Item>
              <Descriptions.Item label="SLA 到期">{formatDateTime(selectedTask.suspendSlaAt)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(selectedTask.createdTime)}</Descriptions.Item>
              {selectedTask.assignedAt && (
                <Descriptions.Item label="分配时间">{formatDateTime(selectedTask.assignedAt)}</Descriptions.Item>
              )}
              {selectedTask.resolvedAt && (
                <Descriptions.Item label="解决时间">{formatDateTime(selectedTask.resolvedAt)}</Descriptions.Item>
              )}
            </Descriptions>

            {(canResolve || canUnable) && (
              <Space>
                {canResolve && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={resolving}
                    onClick={() => void handleResolve()}
                    size="small"
                  >
                    确认解决
                  </Button>
                )}
                {canUnable && (
                  <Popconfirm
                    title="确认标记为无法处理？"
                    onConfirm={() => void handleUnable()}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      loading={unabling}
                      size="small"
                    >
                      无法处理
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
