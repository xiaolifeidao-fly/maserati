"use client";

import { useMemo, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type CollectAccountOption,
  type PublishShopOption,
} from "../api/ai-operation.api";
import { useAiOperationRobots } from "../hooks/useAiOperationRobots";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { formatDateTime } from "@/utils/format";

const { Paragraph, Title } = Typography;

interface RobotFormValues extends AiOperationRobotPayload {}

function getShopLabel(shop: PublishShopOption) {
  const name = shop.remark || shop.nickname || shop.name || shop.code || `店铺 #${shop.id}`;
  return `${name}${shop.platform ? ` / ${shop.platform}` : ""}`;
}

function getAccountLabel(account: CollectAccountOption) {
  const name = account.name || account.username || `账号 #${account.id}`;
  return `${name}${account.username && account.username !== name ? ` / ${account.username}` : ""}`;
}

export function AiOperationRobotPanel() {
  const [form] = Form.useForm<RobotFormValues>();
  const {
    robots,
    publishShops,
    collectAccounts,
    total,
    query,
    loading,
    optionsLoading,
    submitting,
    refresh,
    refreshOptions,
    saveRobot,
    removeRobot,
  } = useAiOperationRobots();
  const [filters, setFilters] = useState({
    search: "",
    status: "",
  });
  const [editingRobot, setEditingRobot] = useState<AiOperationRobotRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const publishShopOptions = useMemo(
    () => publishShops.map((item) => ({ label: getShopLabel(item), value: item.id })),
    [publishShops],
  );
  const collectAccountOptions = useMemo(
    () => collectAccounts.map((item) => ({ label: getAccountLabel(item), value: item.id })),
    [collectAccounts],
  );

  const openCreateModal = () => {
    setEditingRobot(null);
    form.setFieldsValue({
      name: "",
      code: "",
      status: "ENABLED",
      publishShopId: publishShops[0]?.id,
      collectAppUserId: collectAccounts[0]?.id,
      remark: "",
    });
    setEditOpen(true);
    void refreshOptions();
  };

  const openEditModal = (record: AiOperationRobotRecord) => {
    setEditingRobot(record);
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      status: normalizeRobotStatus(record.status),
      publishShopId: record.publishShopId,
      collectAppUserId: record.collectAppUserId,
      remark: record.remark,
    });
    setEditOpen(true);
    void refreshOptions();
  };

  const handleSaveRobot = async () => {
    const values = await form.validateFields();
    try {
      await saveRobot(editingRobot?.id ?? null, {
        name: values.name.trim(),
        code: values.code.trim(),
        status: normalizeRobotStatus(values.status),
        publishShopId: Number(values.publishShopId),
        collectAppUserId: Number(values.collectAppUserId),
        remark: (values.remark || "").trim(),
      });
      message.success(editingRobot ? "机器人已更新" : "机器人已创建");
      setEditOpen(false);
      setEditingRobot(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存机器人失败");
    }
  };

  const columns: ColumnsType<AiOperationRobotRecord> = [
    {
      title: "机器人",
      dataIndex: "name",
      width: 260,
      render: (_, record) => (
        <div>
          <Space size={8}>
            <RobotOutlined style={{ color: "var(--manager-primary-strong)" }} />
            <span style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name || "-"}</span>
          </Space>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 6 }}>{record.code || "-"}</div>
          {record.remark ? (
            <div style={{ color: "var(--manager-text-soft)", marginTop: 6 }}>{record.remark}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "发布店铺",
      key: "publishShop",
      width: 240,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 600 }}>
            {record.publishShopName || `店铺 #${record.publishShopId}`}
          </div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            平台：{record.publishShopPlatform || "-"}
          </div>
        </div>
      ),
    },
    {
      title: "采集账号",
      key: "collectAccount",
      width: 240,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 600 }}>
            {record.collectAppUserName || `账号 #${record.collectAppUserId}`}
          </div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            用户名：{record.collectAppUserUsername || "-"}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => (
        <Tag color={normalizeRobotStatus(value) === "ENABLED" ? "green" : "default"}>
          {normalizeRobotStatus(value) === "ENABLED" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedTime",
      width: 180,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          <IconOnlyButton type="text" icon={<EditOutlined />} tooltip="编辑机器人" onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确认删除这个机器人吗？"
            description="删除后该机器人会从当前列表移除，请确认后继续。"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeRobot(record.id);
                message.success("机器人已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除机器人失败");
              }
            }}
          >
            <IconOnlyButton danger type="text" icon={<DeleteOutlined />} tooltip="删除机器人" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-shell-card manager-commerce-hero">
        <div>
          <div className="manager-brand-kicker">AI智能运营</div>
          <Title level={1} className="manager-display-title" style={{ marginTop: 14, marginBottom: 12 }}>
            AI运营
          </Title>
          <Paragraph style={{ maxWidth: 720, marginBottom: 0, color: "var(--manager-text-soft)" }}>
            管理 AI 运营机器人，并为每个机器人分配一个发布店铺和一个采集账号。
          </Paragraph>
        </div>
        <div className="manager-commerce-hero-spotlight">
          <div className="manager-commerce-hero-icon"><RobotOutlined /></div>
          <span style={{ color: "rgba(122, 74, 39, 0.72)" }}>机器人配置</span>
          <div style={{ marginTop: 8, fontWeight: 700, color: "#7a3d1a", lineHeight: 1.6 }}>
            当前共 {total} 个机器人，可通过新增或编辑调整发布店铺与采集账号。
          </div>
        </div>
      </section>

      <section className="manager-data-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              placeholder="按名称、编码或备注筛选"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              style={{ width: 260, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="机器人状态"
              value={filters.status || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, status: value || "" }))}
              options={[
                { label: "启用", value: "ENABLED" },
                { label: "停用", value: "DISABLED" },
              ]}
              style={{ width: 150 }}
            />
            <IconOnlyButton
              type="primary"
              icon={<SearchOutlined />}
              tooltip="查询机器人"
              onClick={() => void refresh({ pageIndex: 1, ...filters })}
            />
            <IconOnlyButton icon={<ReloadOutlined />} tooltip="刷新机器人列表" onClick={() => void refresh()} />
            <IconOnlyButton type="primary" icon={<PlusOutlined />} tooltip="新增机器人" onClick={openCreateModal} />
          </Space>
          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            共 {total} 条
          </Tag>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<AiOperationRobotRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={Array.isArray(robots) ? robots : []}
          columns={columns}
          scroll={{ x: 1180 }}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => void refresh({ pageIndex: page, pageSize }),
          }}
        />
      </section>

      <Modal
        title={editingRobot ? "编辑机器人" : "新增机器人"}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingRobot(null);
        }}
        onOk={() => void handleSaveRobot()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<RobotFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="机器人名称" rules={[{ required: true, message: "请输入机器人名称" }]}>
            <Input placeholder="例如：标题优化机器人" maxLength={100} />
          </Form.Item>
          <Form.Item name="code" label="机器人编码" rules={[{ required: true, message: "请输入机器人编码" }]}>
            <Input placeholder="例如：title_optimizer_01" maxLength={64} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              options={[
                { label: "启用", value: "ENABLED" },
                { label: "停用", value: "DISABLED" },
              ]}
            />
          </Form.Item>
          <Form.Item name="publishShopId" label="发布店铺" rules={[{ required: true, message: "请选择发布店铺" }]}>
            <Select
              showSearch
              loading={optionsLoading}
              placeholder="请选择发布店铺"
              optionFilterProp="label"
              options={publishShopOptions}
              notFoundContent={optionsLoading ? "加载中" : "暂无发布店铺"}
            />
          </Form.Item>
          <Form.Item name="collectAppUserId" label="采集账号" rules={[{ required: true, message: "请选择采集账号" }]}>
            <Select
              showSearch
              loading={optionsLoading}
              placeholder="请选择采集账号"
              optionFilterProp="label"
              options={collectAccountOptions}
              notFoundContent={optionsLoading ? "加载中" : "暂无采集账号"}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="补充机器人的运营职责、使用场景或注意事项" rows={4} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function normalizeRobotStatus(status: string) {
  const normalized = (status || "").trim().toUpperCase();
  if (normalized === "DISABLED" || normalized === "INACTIVE") {
    return "DISABLED";
  }
  return "ENABLED";
}
