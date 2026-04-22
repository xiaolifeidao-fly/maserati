"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { type ShopPayload, type ShopRecord } from "../api/shop.api";
import { useShopManagement } from "../hooks/useShopManagement";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { formatDateTime } from "@/utils/format";

interface ShopFormValues extends ShopPayload {}

interface AuthorizeFormValues {
  activationCode: string;
}

function getShopDisplayName(record: Pick<ShopRecord, "remark" | "nickname" | "name" | "code" | "platform">) {
  return record.remark || record.nickname || record.name || record.code || record.platform || "-";
}

const platformOptions = [
  { key: "tb", label: "淘宝", value: "tb" },
  { key: "pxx", label: "拼多多", value: "pxx" },
];

const shopUsageOptions = [
  { label: "采集", value: "COLLECT" },
  { label: "发布", value: "PUBLISH" },
];

function getDefaultShopUsage(platform: string) {
  return normalizePlatform(platform) === "pxx" ? "COLLECT" : "PUBLISH";
}

function getShopUsageLabel(shopUsage: string) {
  return shopUsageOptions.find((item) => item.value === normalizeShopUsage(shopUsage))?.label || "-";
}

export function ShopManagementPanel() {
  const router = useRouter();
  const [shopForm] = Form.useForm<ShopFormValues>();
  const [authorizeForm] = Form.useForm<AuthorizeFormValues>();
  const {
    shops,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveShop,
    bindActivationCode,
    openShopLogin,
    removeShop,
    loginNotice,
    setLoginNotice,
  } = useShopManagement();
  const [filters, setFilters] = useState({
    name: "",
    businessId: "",
    loginStatus: "",
    authorizationStatus: "",
  });
  const [editingShop, setEditingShop] = useState<ShopRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [authorizeTarget, setAuthorizeTarget] = useState<ShopRecord | null>(null);
  const [loggingShopId, setLoggingShopId] = useState(0);
  const safeShops = Array.isArray(shops) ? shops : [];
  const activePlatform = query.platform || "tb";

  const openCreateModal = () => {
    setEditingShop(null);
    shopForm.setFieldsValue({
      platform: "tb",
      shopUsage: "PUBLISH",
      remark: "",
    });
    setEditOpen(true);
  };

  const openEditModal = (record: ShopRecord) => {
    setEditingShop(record);
    shopForm.setFieldsValue({
      platform: normalizePlatform(record.platform),
      shopUsage: normalizeShopUsage(record.shopUsage || getDefaultShopUsage(record.platform)),
      remark: record.remark,
    });
    setEditOpen(true);
  };

  const openAuthorizeModal = (record: ShopRecord) => {
    setAuthorizeTarget(record);
    authorizeForm.setFieldsValue({
      activationCode: record.authorizationCode,
    });
    setAuthorizeOpen(true);
  };

  const handleLogin = async (record: ShopRecord) => {
    setLoggingShopId(record.id);
    try {
      const result = await openShopLogin(record.id);
      message.success(result.message || "登录窗口已打开");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开登录窗口失败");
    } finally {
      setLoggingShopId(0);
    }
  };

  const handleSaveShop = async () => {
    const values = await shopForm.validateFields();
    try {
      await saveShop(editingShop?.id ?? null, {
        platform: values.platform.trim(),
        shopUsage: normalizeShopUsage(values.shopUsage || getDefaultShopUsage(values.platform)),
        remark: (values.remark || "").trim(),
        loginStatus: editingShop?.loginStatus || "PENDING",
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
      });
      message.success("店铺授权已完成");
      setAuthorizeOpen(false);
      setAuthorizeTarget(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "店铺授权失败");
    }
  };

  const columns: ColumnsType<ShopRecord> = [
    {
      title: "接入店铺",
      dataIndex: "name",
      width: 280,
      render: (_, record) => {
        return (
          <div>
            <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{getShopDisplayName(record)}</div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
              店铺昵称：{record.nickname || record.name || "-"}
            </div>
            <div style={{ marginTop: 6 }}>
              <Tag color={normalizeShopUsage(record.shopUsage) === "COLLECT" ? "blue" : "purple"}>
                {getShopUsageLabel(record.shopUsage)}
              </Tag>
            </div>
          </div>
        );
      },
    },
    {
      title: "外部账号",
      key: "platformAccount",
      width: 240,
      render: (_, record) => (
        <div>
          <div>{record.platformShopId || "-"}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            业务ID：{record.businessId || "待补充"}
          </div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            昵称来源：{record.nickname || record.name || "等待外部登录同步"}
          </div>
        </div>
      ),
    },
    {
      title: "登录 / 授权",
      key: "status",
      width: 220,
      render: (_, record) => {
        const isCollect = normalizeShopUsage(record.shopUsage) === "COLLECT";
        return (
          <div>
            <div>
              <Tag color={record.loginStatus === "LOGGED_IN" ? "green" : "default"}>
                {record.loginStatus === "LOGGED_IN" ? "已登录" : "待登录"}
              </Tag>
              {!isCollect && (
                <Tag
                  color={
                    record.authorizationStatus === "AUTHORIZED"
                      ? "green"
                      : record.authorizationStatus === "EXPIRED"
                        ? "orange"
                        : "default"
                  }
                >
                  {record.authorizationStatus === "AUTHORIZED"
                    ? "已授权"
                    : record.authorizationStatus === "EXPIRED"
                      ? "已过期"
                      : "未授权"}
                </Tag>
              )}
            </div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 6 }}>
              最近登录：{formatDateTime(record.lastLoginAt)}
            </div>
          </div>
        );
      },
    },
    {
      title: "授权到期",
      dataIndex: "authorizationExpiresAt",
      width: 180,
      render: (value?: string, record?: ShopRecord) =>
        normalizeShopUsage(record?.shopUsage || "") === "COLLECT" ? "-" : formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 260,
      render: (_, record) => (
        <Space size={4} wrap>
          <IconOnlyButton
            type="text"
            icon={<LinkOutlined />}
            tooltip="打开外部登录"
            loading={loggingShopId === record.id}
            onClick={() => void handleLogin(record)}
          />
          {normalizeShopUsage(record.shopUsage) !== "COLLECT" && (
            <IconOnlyButton type="text" icon={<KeyOutlined />} tooltip="激活码授权" onClick={() => openAuthorizeModal(record)} />
          )}
          <IconOnlyButton type="text" icon={<ArrowRightOutlined />} tooltip="进入采集管理" onClick={() => router.push(`/collection?shopId=${record.id}`)} />
          <IconOnlyButton type="text" icon={<EditOutlined />} tooltip="编辑店铺" onClick={() => openEditModal(record)} />
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
            <IconOnlyButton danger type="text" icon={<DeleteOutlined />} tooltip="删除店铺" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        {loginNotice ? (
          <Alert
            style={{ marginBottom: 16 }}
            type={loginNotice.type}
            showIcon
            closable
            message={loginNotice.title}
            description={loginNotice.description}
            onClose={() => setLoginNotice(null)}
          />
        ) : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Tabs
              activeKey={activePlatform}
              items={platformOptions}
              onChange={(platform) => void refresh({ pageIndex: 1, platform })}
            />
            <Input
              className="manager-filter-input"
              placeholder="按备注或店铺名称筛选"
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
            <Select
              allowClear
              placeholder="登录状态"
              value={filters.loginStatus || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, loginStatus: value || "" }))}
              options={[
                { label: "已登录", value: "LOGGED_IN" },
                { label: "待登录", value: "PENDING" },
              ]}
              style={{ width: 150 }}
            />
            <IconOnlyButton
              type="primary"
              icon={<SearchOutlined />}
              tooltip="查询店铺"
              onClick={() => void refresh({ pageIndex: 1, platform: activePlatform, ...filters })}
            />
            <IconOnlyButton icon={<ReloadOutlined />} tooltip="刷新店铺列表" onClick={() => void refresh()} />
            <IconOnlyButton type="primary" icon={<PlusOutlined />} tooltip="新增店铺" onClick={openCreateModal} />
          </Space>

          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            共 {total} 条
          </Tag>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ShopRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={safeShops}
          columns={columns}
          scroll={{ x: 1320 }}
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
          <Form.Item name="platform" label="所属平台" rules={[{ required: true, message: "请选择平台" }]}>
            <Select
              options={platformOptions}
              onChange={(value) => {
                shopForm.setFieldsValue({ shopUsage: getDefaultShopUsage(value) });
              }}
            />
          </Form.Item>
          <Form.Item name="shopUsage" label="用途" rules={[{ required: true, message: "请选择用途" }]}>
            <Select options={shopUsageOptions} disabled={normalizeShopUsage(editingShop?.shopUsage || "") === "COLLECT"} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="例如：华东旗舰店 / 运营备用号" rows={4} maxLength={255} showCount />
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
          <Form.Item name="activationCode" label="激活码" rules={[{ required: true, message: "请输入激活码" }]}>
            <Input placeholder="请输入激活码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function normalizePlatform(platform: string) {
  const normalized = (platform || "").trim().toLowerCase();
  if (normalized === "taobao" || normalized === "tb") {
    return "tb";
  }
  if (normalized === "pdd" || normalized === "pxx") {
    return "pxx";
  }
  return "tb";
}

function normalizeShopUsage(shopUsage: string) {
  const normalized = (shopUsage || "").trim().toUpperCase();
  if (normalized === "COLLECT" || normalized === "采集") {
    return "COLLECT";
  }
  if (normalized === "PUBLISH" || normalized === "发布") {
    return "PUBLISH";
  }
  return "";
}
