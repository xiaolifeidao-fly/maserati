"use client";

import { useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type ShopPayload, type ShopRecord } from "../api/shop.api";
import { useShopManagement } from "../hooks/useShopManagement";
import { formatDateTime } from "@/utils/format";

interface ShopFormValues extends ShopPayload {}

interface AuthorizeFormValues {
  businessId: string;
  activationCode: string;
  validDays: number;
}

const platformOptions = [
  { label: "淘宝", value: "taobao" },
  { label: "天猫", value: "tmall" },
  { label: "京东", value: "jd" },
  { label: "拼多多", value: "pdd" },
  { label: "抖店", value: "douyin" },
];

export function ShopManagementPanel() {
  const [shopForm] = Form.useForm<ShopFormValues>();
  const [authorizeForm] = Form.useForm<AuthorizeFormValues>();
  const { shops, total, query, loading, submitting, refresh, saveShop, bindActivationCode, removeShop } =
    useShopManagement();
  const [filters, setFilters] = useState({
    name: "",
    businessId: "",
    platform: "",
    authorizationStatus: "",
  });
  const [editingShop, setEditingShop] = useState<ShopRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [authorizeTarget, setAuthorizeTarget] = useState<ShopRecord | null>(null);

  const openCreateModal = () => {
    setEditingShop(null);
    shopForm.setFieldsValue({
      code: "",
      name: "",
      sortId: 0,
      shopGroupId: 0,
      shopTypeCode: "",
      approveFlag: 0,
      platform: "taobao",
      platformShopId: "",
      businessId: "",
    });
    setEditOpen(true);
  };

  const openEditModal = (record: ShopRecord) => {
    setEditingShop(record);
    shopForm.setFieldsValue({
      code: record.code,
      name: record.name,
      sortId: record.sortId,
      shopGroupId: record.shopGroupId,
      shopTypeCode: record.shopTypeCode,
      approveFlag: record.approveFlag,
      platform: record.platform || "taobao",
      platformShopId: record.platformShopId,
      businessId: record.businessId,
    });
    setEditOpen(true);
  };

  const openAuthorizeModal = (record: ShopRecord) => {
    setAuthorizeTarget(record);
    authorizeForm.setFieldsValue({
      businessId: record.businessId,
      activationCode: record.authorizationCode,
      validDays: 365,
    });
    setAuthorizeOpen(true);
  };

  const handleSaveShop = async () => {
    const values = await shopForm.validateFields();
    try {
      await saveShop(editingShop?.id ?? null, {
        ...values,
        code: values.code.trim(),
        name: values.name.trim(),
        shopTypeCode: values.shopTypeCode.trim(),
        platform: values.platform.trim(),
        platformShopId: values.platformShopId.trim(),
        businessId: values.businessId.trim(),
      });
      message.success(editingShop ? "店铺已更新" : "店铺已创建");
      setEditOpen(false);
      setEditingShop(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存店铺失败");
    }
  };

  const handleAuthorize = async () => {
    if (!authorizeTarget) {
      return;
    }
    const values = await authorizeForm.validateFields();
    try {
      await bindActivationCode(authorizeTarget.id, {
        activationCode: values.activationCode.trim(),
        businessId: values.businessId.trim(),
        validDays: Number(values.validDays || 365),
      });
      message.success("激活码授权已完成");
      setAuthorizeOpen(false);
      setAuthorizeTarget(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "激活码授权失败");
    }
  };

  const columns: ColumnsType<ShopRecord> = [
    { title: "ID", dataIndex: "id", width: 72 },
    {
      title: "店铺",
      dataIndex: "name",
      width: 220,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name || "-"}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{record.code || "-"}</div>
        </div>
      ),
    },
    {
      title: "平台 / 三方店铺ID",
      key: "platformShopId",
      width: 220,
      render: (_, record) => (
        <div>
          <div>{record.platform || "-"}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{record.platformShopId || "-"}</div>
        </div>
      ),
    },
    {
      title: "业务ID",
      dataIndex: "businessId",
      width: 180,
      render: (value: string) => <span className="manager-value">{value || "-"}</span>,
    },
    {
      title: "登录状态",
      dataIndex: "loginStatus",
      width: 120,
      render: (value: string) => <Tag color={value === "LOGGED_IN" ? "green" : "default"}>{value || "PENDING"}</Tag>,
    },
    {
      title: "授权状态",
      dataIndex: "authorizationStatus",
      width: 130,
      render: (value: string) => (
        <Tag color={value === "AUTHORIZED" ? "green" : value === "EXPIRED" ? "orange" : "default"}>
          {value || "UNAUTHORIZED"}
        </Tag>
      ),
    },
    {
      title: "激活码 / 到期",
      key: "authorization",
      width: 220,
      render: (_, record) => (
        <div>
          <div>{record.authorizationCode || "-"}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{formatDateTime(record.authorizationExpiresAt)}</div>
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 170,
      render: (_, record) => (
        <Space size={2}>
          <Button type="text" icon={<KeyOutlined />} onClick={() => openAuthorizeModal(record)} />
          <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确认删除这个店铺记录吗？"
            description="删除后该店铺会从当前列表移除，请确认后继续。"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeShop(record.id);
                message.success("店铺记录已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除店铺失败");
              }
            }}
          >
            <Button danger type="text" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              placeholder="按店铺名称筛选"
              value={filters.name}
              onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
              style={{ width: 220, maxWidth: "100%", height: 44 }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按业务ID筛选"
              value={filters.businessId}
              onChange={(event) => setFilters((current) => ({ ...current, businessId: event.target.value }))}
              style={{ width: 220, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="平台"
              value={filters.platform || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, platform: value || "" }))}
              options={platformOptions}
              style={{ width: 140 }}
            />
            <Select
              allowClear
              placeholder="授权状态"
              value={filters.authorizationStatus || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, authorizationStatus: value || "" }))}
              options={[
                { label: "已授权", value: "AUTHORIZED" },
                { label: "未授权", value: "UNAUTHORIZED" },
                { label: "已过期", value: "EXPIRED" },
              ]}
              style={{ width: 150 }}
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
            <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
              共 {total} 条
            </Tag>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增店铺
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ShopRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={shops}
          columns={columns}
          scroll={{ x: 1380 }}
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
        title={editingShop ? "编辑店铺" : "新增店铺"}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingShop(null);
        }}
        onOk={() => void handleSaveShop()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<ShopFormValues> form={shopForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: "请输入店铺名称" }]}>
            <Input placeholder="例如：华东旗舰店" />
          </Form.Item>
          <Form.Item name="code" label="店铺编码" rules={[{ required: true, message: "请输入店铺编码" }]}>
            <Input placeholder="例如：SHOP_EAST_001" />
          </Form.Item>
          <Form.Item name="platform" label="所属平台" rules={[{ required: true, message: "请选择平台" }]}>
            <Select options={platformOptions} />
          </Form.Item>
          <Form.Item name="platformShopId" label="平台店铺ID">
            <Input placeholder="例如：7291882" />
          </Form.Item>
          <Form.Item name="businessId" label="业务ID">
            <Input placeholder="例如：biz-shop-east-01" />
          </Form.Item>
          <Form.Item name="shopTypeCode" label="店铺类型编码">
            <Input placeholder="例如：flagship" />
          </Form.Item>
          <Form.Item name="sortId" label="排序值">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="shopGroupId" label="店铺组ID">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="approveFlag" label="审核标记">
            <InputNumber min={0} max={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="激活码授权"
        open={authorizeOpen}
        onCancel={() => {
          setAuthorizeOpen(false);
          setAuthorizeTarget(null);
        }}
        onOk={() => void handleAuthorize()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<AuthorizeFormValues> form={authorizeForm} layout="vertical" preserve={false}>
          <Form.Item name="businessId" label="业务ID" rules={[{ required: true, message: "请输入业务ID" }]}>
            <Input placeholder="例如：biz-shop-east-01" />
          </Form.Item>
          <Form.Item name="activationCode" label="激活码" rules={[{ required: true, message: "请输入激活码" }]}>
            <Input placeholder="请输入激活码" />
          </Form.Item>
          <Form.Item name="validDays" label="有效天数" rules={[{ required: true, message: "请输入有效天数" }]}>
            <InputNumber min={1} max={3650} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
