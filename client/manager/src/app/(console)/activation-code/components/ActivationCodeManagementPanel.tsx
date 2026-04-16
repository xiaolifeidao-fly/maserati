"use client";

import { useMemo, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ProfileOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  type ActivationCodeBatchRecord,
  type ActivationCodeTypePayload,
  type ActivationCodeTypeRecord,
} from "../api/activation-code.api";
import { ActivationCodeBatchDetailModal } from "./ActivationCodeBatchDetailModal";
import { ActivationCodeDetailDrawer } from "./ActivationCodeDetailDrawer";
import { GenerateActivationCodeBatchModal } from "./GenerateActivationCodeBatchModal";
import { ActivationCodeTypeFormModal } from "./ActivationCodeTypeFormModal";
import { useActivationCodeTypeManagement } from "../hooks/useActivationCodeTypeManagement";

const { Text } = Typography;

interface ActivationCodeManagementPanelProps {
  scope?: "admin" | "tenant";
}

export function ActivationCodeManagementPanel({
  scope = "admin",
}: ActivationCodeManagementPanelProps) {
  const isTenantScope = scope === "tenant";
  const { types, total, query, loading, submitting, refresh, saveType, removeType } =
    useActivationCodeTypeManagement({ scope });
  const [filters, setFilters] = useState({ name: "", durationDays: 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDetailOpen, setBatchDetailOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ActivationCodeTypeRecord | null>(null);
  const [batchRecord, setBatchRecord] = useState<ActivationCodeTypeRecord | null>(null);
  const [batchDetailRecord, setBatchDetailRecord] = useState<ActivationCodeTypeRecord | null>(null);
  const [detailTypeRecord, setDetailTypeRecord] = useState<ActivationCodeTypeRecord | null>(null);
  const [detailBatchRecord, setDetailBatchRecord] = useState<ActivationCodeBatchRecord | null>(null);

  const stats = useMemo(
    () => [
      { label: isTenantScope ? "已分配类别" : "类别总数", value: total },
      {
        label: "当前页有效天数",
        value: types.reduce((sum, item) => sum + item.durationDays, 0),
      },
      {
        label: "当前页均价",
        value:
          types.length === 0
            ? "0.00"
            : (
                types.reduce((sum, item) => sum + Number(item.price || 0), 0) / types.length
              ).toFixed(2),
      },
    ],
    [isTenantScope, types, total],
  );

  const columns: ColumnsType<ActivationCodeTypeRecord> = [
    {
      title: "类别名称",
      dataIndex: "name",
      width: 220,
      render: (value: string) => (
        <Text style={{ color: "var(--manager-text)", fontWeight: 600 }}>{value || "-"}</Text>
      ),
    },
    {
      title: "有效天数",
      dataIndex: "durationDays",
      width: 140,
      render: (value: number) => <Tag color="blue">{value} 天</Tag>,
    },
    {
      title: "价格",
      dataIndex: "price",
      width: 140,
      render: (value: string) => <span className="manager-value">{value || "0.00"}</span>,
    },
    {
      title: "创建时间",
      dataIndex: "createdTime",
      width: 220,
      render: (value: string) => (
        <Text style={{ color: "var(--manager-text-soft)" }}>
          {value ? new Date(value).toLocaleString() : "-"}
        </Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 230,
      fixed: "right",
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="生成新批次">
            <Button
              type="text"
              icon={<ThunderboltOutlined />}
              onClick={() => {
                setBatchRecord(record);
                setBatchOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="明细详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => {
                setDetailTypeRecord(record);
                setDetailBatchRecord(null);
                setDetailDrawerOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="批次详情">
            <Button
              type="text"
              icon={<ProfileOutlined />}
              onClick={() => {
                setBatchDetailRecord(record);
                setBatchDetailOpen(true);
              }}
            />
          </Tooltip>
          {!isTenantScope && (
            <>
              <Tooltip title="修改">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingRecord(record);
                    setFormOpen(true);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title="确认删除这个激活码类别吗？"
                okText="删除"
                cancelText="取消"
                onConfirm={async () => {
                  try {
                    await removeType(record.id);
                    message.success("激活码类别已删除");
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除激活码类别失败");
                  }
                }}
              >
                <Tooltip title="删除">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const handleSubmit = async (payload: ActivationCodeTypePayload) => {
    try {
      await saveType(editingRecord?.id ?? null, payload);
      message.success(editingRecord ? "激活码类别修改成功" : "激活码类别添加成功");
      setFormOpen(false);
      setEditingRecord(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存激活码类别失败");
    }
  };

  return (
    <div className="manager-page-stack">
      <section
        className="manager-stats-grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        {stats.map((item) => (
          <div key={item.label} className="manager-data-card">
            <div className="manager-section-label">{item.label}</div>
            <div className="manager-display-title" style={{ fontSize: 32, marginTop: 12 }}>
              {item.value}
            </div>
          </div>
        ))}
      </section>

      <section className="manager-data-card">
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              prefix={<SearchOutlined style={{ color: "var(--manager-text-faint)" }} />}
              placeholder="类别名称"
              value={filters.name}
              onChange={(event) =>
                setFilters((current) => ({ ...current, name: event.target.value }))
              }
              onPressEnter={() => void refresh({ pageIndex: 1, ...filters })}
              style={{ width: 260, maxWidth: "100%" }}
            />
            <InputNumber
              className="manager-filter-input"
              min={0}
              precision={0}
              placeholder="有效天数"
              value={filters.durationDays || null}
              onChange={(value) =>
                setFilters((current) => ({ ...current, durationDays: Number(value || 0) }))
              }
              onPressEnter={() => void refresh({ pageIndex: 1, ...filters })}
              style={{ width: 180, maxWidth: "100%" }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => void refresh({ pageIndex: 1, ...filters })}
            >
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>

          <Space wrap>
            <Tag
              style={{
                color: "var(--manager-text-soft)",
                background: "rgba(170,192,238,0.16)",
                border: "none",
              }}
            >
              共 {total} 条
            </Tag>
            {!isTenantScope && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingRecord(null);
                  setFormOpen(true);
                }}
                style={{
                  color: "#ffffff",
                  border: "none",
                  background: "linear-gradient(135deg, #5d7df6 0%, #6d8cff 100%)",
                }}
              >
                新增类别
              </Button>
            )}
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ActivationCodeTypeRecord>
          rowKey="id"
          loading={loading}
          dataSource={types}
          columns={columns}
          scroll={{ x: 1180 }}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: false,
            onChange: (page) => void refresh({ pageIndex: page, ...filters }),
          }}
        />
      </section>

      <ActivationCodeTypeFormModal
        open={formOpen}
        submitting={submitting}
        record={editingRecord}
        onCancel={() => {
          setFormOpen(false);
          setEditingRecord(null);
        }}
        onSubmit={handleSubmit}
      />

      <GenerateActivationCodeBatchModal
        open={batchOpen}
        record={batchRecord}
        onCancel={() => {
          setBatchOpen(false);
          setBatchRecord(null);
        }}
      />

      <ActivationCodeBatchDetailModal
        open={batchDetailOpen}
        record={batchDetailRecord}
        onCancel={() => {
          setBatchDetailOpen(false);
          setBatchDetailRecord(null);
        }}
        onOpenDetails={(record) => {
          setDetailTypeRecord(batchDetailRecord);
          setDetailBatchRecord(record);
          setDetailDrawerOpen(true);
        }}
      />

      <ActivationCodeDetailDrawer
        open={detailDrawerOpen}
        typeRecord={detailTypeRecord}
        batchRecord={detailBatchRecord}
        onClose={() => {
          setDetailDrawerOpen(false);
          setDetailTypeRecord(null);
          setDetailBatchRecord(null);
        }}
      />
    </div>
  );
}
