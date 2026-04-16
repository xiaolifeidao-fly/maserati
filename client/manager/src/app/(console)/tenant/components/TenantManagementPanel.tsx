"use client";

import { useMemo, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { type TenantPayload, type TenantRecord } from "../api/tenant.api";
import { TenantBindingModal } from "./TenantBindingModal";
import { TenantFormModal } from "./TenantFormModal";
import { useTenantManagement } from "../hooks/useTenantManagement";

const { Text } = Typography;

export function TenantManagementPanel() {
  const { tenants, total, query, loading, submitting, refresh, saveTenant, removeTenant } =
    useTenantManagement();
  const [filters, setFilters] = useState({ name: "", code: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRecord | null>(null);
  const [bindingTenant, setBindingTenant] = useState<TenantRecord | null>(null);

  const stats = useMemo(
    () => [
      { label: "租户总数", value: total },
      {
        label: "已分配类别租户",
        value: tenants.filter((item) => (item.currentActivationCodeTypes?.length ?? 0) > 0).length,
      },
      {
        label: "当前分配类别数",
        value: tenants.reduce((sum, item) => sum + (item.currentActivationCodeTypes?.length ?? 0), 0),
      },
    ],
    [tenants, total],
  );

  const columns: ColumnsType<TenantRecord> = [
    {
      title: "租户名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => (
        <Text style={{ color: "var(--manager-text)", fontWeight: 600 }}>{value || "-"}</Text>
      ),
    },
    {
      title: "租户编码",
      dataIndex: "code",
      width: 180,
      render: (value: string) => <span className="manager-value">{value || "-"}</span>,
    },
    {
      title: "已分配激活码类别",
      key: "currentActivationCodeTypes",
      render: (_, record) => {
        if (!record.currentActivationCodeTypes?.length) {
          return <Text style={{ color: "var(--manager-text-faint)" }}>未分配</Text>;
        }
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {record.currentActivationCodeTypes.map((item) => (
              <Tag key={item.id || item.activationCodeTypeId} color="blue">
                {item.activationCodeName || `类别#${item.activationCodeTypeId}`}
              </Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      fixed: "right",
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="新增租户">
            <Button
              type="text"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingTenant(null);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="修改租户">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingTenant(record);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="分配激活码类别">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => {
                setBindingTenant(record);
                setBindingOpen(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除这个租户吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeTenant(record.id);
                message.success("租户已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除租户失败");
              }
            }}
          >
            <Tooltip title="删除租户">
              <Button danger type="text" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async (payload: TenantPayload) => {
    try {
      await saveTenant(editingTenant?.id ?? null, payload);
      message.success(editingTenant ? "租户修改成功" : "租户添加成功");
      setFormOpen(false);
      setEditingTenant(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存租户失败");
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
              placeholder="租户名称"
              value={filters.name}
              onChange={(event) =>
                setFilters((current) => ({ ...current, name: event.target.value }))
              }
              onPressEnter={() => void refresh({ pageIndex: 1, ...filters })}
              style={{ width: 260, maxWidth: "100%" }}
            />
            <Input
              className="manager-filter-input"
              placeholder="租户编码"
              value={filters.code}
              onChange={(event) =>
                setFilters((current) => ({ ...current, code: event.target.value }))
              }
              onPressEnter={() => void refresh({ pageIndex: 1, ...filters })}
              style={{ width: 220, maxWidth: "100%" }}
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingTenant(null);
                setFormOpen(true);
              }}
              style={{
                color: "#ffffff",
                border: "none",
                background: "linear-gradient(135deg, #5d7df6 0%, #6d8cff 100%)",
              }}
            >
              新增租户
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<TenantRecord>
          rowKey="id"
          loading={loading}
          dataSource={tenants}
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

      <TenantFormModal
        open={formOpen}
        submitting={submitting}
        tenant={editingTenant}
        onCancel={() => {
          setFormOpen(false);
          setEditingTenant(null);
        }}
        onSubmit={handleSubmit}
      />

      <TenantBindingModal
        open={bindingOpen}
        tenant={bindingTenant}
        onCancel={() => {
          setBindingOpen(false);
          setBindingTenant(null);
        }}
        onSaved={async () => {
          await refresh();
        }}
      />
    </div>
  );
}
