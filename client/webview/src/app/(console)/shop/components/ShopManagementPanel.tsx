"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { type ShopLoginPayload, type ShopPayload, type ShopRecord } from "../api/shop.api";
import { useShopManagement } from "../hooks/useShopManagement";
import { formatDateTime } from "@/utils/format";

interface ShopFormValues extends ShopPayload {}

interface AuthorizeFormValues {
  businessId: string;
  activationCode: string;
  validDays: number;
}

interface LoginFormValues extends ShopLoginPayload {}

const platformOptions = [
  { label: "淘宝", value: "taobao" },
  { label: "天猫", value: "tmall" },
  { label: "京东", value: "jd" },
  { label: "拼多多", value: "pdd" },
  { label: "抖店", value: "douyin" },
];

function getShopStage(record: ShopRecord) {
  if (record.authorizationStatus === "AUTHORIZED") {
    return {
      label: "已完成接入",
      color: "green" as const,
      description: "可以直接进入采集流程",
    };
  }
  if (record.loginStatus === "LOGGED_IN") {
    return {
      label: "待授权",
      color: "gold" as const,
      description: "外部账号已登录，下一步完成授权",
    };
  }
  return {
    label: "待登录",
    color: "default" as const,
    description: "先绑定外部账号并完成登录",
  };
}

export function ShopManagementPanel() {
  const router = useRouter();
  const [shopForm] = Form.useForm<ShopFormValues>();
  const [authorizeForm] = Form.useForm<AuthorizeFormValues>();
  const [loginForm] = Form.useForm<LoginFormValues>();
  const { shops, total, query, loading, submitting, refresh, saveShop, submitShopLogin, bindActivationCode, removeShop } =
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<ShopRecord | null>(null);
  const safeShops = Array.isArray(shops) ? shops : [];

  const shopStats = useMemo(() => {
    const authorized = safeShops.filter((item) => item.authorizationStatus === "AUTHORIZED").length;
    const loggedIn = safeShops.filter((item) => item.loginStatus === "LOGGED_IN").length;
    return {
      authorized,
      loggedIn,
      pending: Math.max(safeShops.length - authorized, 0),
    };
  }, [safeShops]);

  const openCreateModal = () => {
    setEditingShop(null);
    shopForm.setFieldsValue({
      code: "",
      name: "",
      sortId: 0,
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

  const openLoginModal = (record?: ShopRecord) => {
    setLoginTarget(record ?? null);
    loginForm.setFieldsValue({
      name: record?.name || "",
      code: record?.code || "",
      platform: record?.platform || "taobao",
      platformShopId: record?.platformShopId || "",
      businessId: record?.businessId || "",
    });
    setLoginOpen(true);
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

  const handleLoginShop = async () => {
    const values = await loginForm.validateFields();
    try {
      await submitShopLogin({
        name: values.name.trim(),
        code: values.code.trim(),
        platform: values.platform.trim(),
        platformShopId: values.platformShopId.trim(),
        businessId: values.businessId.trim(),
      });
      message.success(loginTarget ? "外部账号已重新登录" : "外部账号登录已完成");
      setLoginOpen(false);
      setLoginTarget(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "外部账号登录失败");
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
      width: 240,
      render: (_, record) => {
        const stage = getShopStage(record);
        return (
          <div>
            <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name || "-"}</div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
              {record.code || "-"} · {record.platform || "-"}
            </div>
            <div style={{ marginTop: 8 }}>
              <Tag color={stage.color}>{stage.label}</Tag>
            </div>
          </div>
        );
      },
    },
    {
      title: "外部账号",
      key: "platformAccount",
      width: 220,
      render: (_, record) => (
        <div>
          <div>{record.platformShopId || "-"}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{record.businessId || "待补充业务ID"}</div>
        </div>
      ),
    },
    {
      title: "登录 / 授权",
      key: "status",
      width: 220,
      render: (_, record) => (
        <div>
          <div>
            <Tag color={record.loginStatus === "LOGGED_IN" ? "green" : "default"}>
              {record.loginStatus === "LOGGED_IN" ? "已登录" : "待登录"}
            </Tag>
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
          </div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 6 }}>
            最近登录：{formatDateTime(record.lastLoginAt)}
          </div>
        </div>
      ),
    },
    {
      title: "授权到期",
      dataIndex: "authorizationExpiresAt",
      width: 180,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "下一步",
      key: "nextStep",
      width: 220,
      render: (_, record) => {
        const stage = getShopStage(record);
        return <span className="manager-muted">{stage.description}</span>;
      },
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 260,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button type="text" icon={<LinkOutlined />} onClick={() => openLoginModal(record)}>
            外部登录
          </Button>
          <Button type="text" icon={<KeyOutlined />} onClick={() => openAuthorizeModal(record)}>
            授权
          </Button>
          <Button type="text" icon={<ArrowRightOutlined />} onClick={() => router.push(`/collection?shopId=${record.id}`)}>
            去采集
          </Button>
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
        <div className="manager-flow-hero">
          <div>
            <div className="manager-section-label">Step 1</div>
            <h2 className="manager-display-title" style={{ margin: "10px 0 8px" }}>
              新增店铺后，直接完成外部账号登录与授权
            </h2>
            <p className="manager-muted" style={{ margin: 0, maxWidth: 760 }}>
              这一步只做三件事：先建店铺基础档案，再绑定外部账号登录，最后补齐激活码授权。完成后就可以直接进入采集批次。
            </p>
          </div>

          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增店铺
            </Button>
            <Button icon={<LinkOutlined />} onClick={() => openLoginModal()}>
              直接录入登录店铺
            </Button>
          </Space>
        </div>

        <div className="manager-kpi-grid">
          <div className="manager-kpi-card">
            <Statistic title="当前店铺数" value={total} prefix={<ShopOutlined />} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="已完成外部登录" value={shopStats.loggedIn} prefix={<LinkOutlined />} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="已授权可采集" value={shopStats.authorized} prefix={<CheckCircleOutlined />} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="待继续处理" value={shopStats.pending} prefix={<ArrowRightOutlined />} />
          </div>
        </div>

        <div className="manager-step-strip">
          <div className="manager-step-pill is-active">1. 新增店铺资料</div>
          <div className="manager-step-pill">2. 绑定外部账号登录</div>
          <div className="manager-step-pill">3. 输入激活码授权</div>
          <div className="manager-step-pill">4. 进入采集批次</div>
        </div>
      </section>

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
            <Button type="primary" icon={<SearchOutlined />} onClick={() => void refresh({ pageIndex: 1, ...filters })}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
              刷新
            </Button>
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
          scroll={{ x: 1540 }}
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
          <Form.Item name="approveFlag" label="审核标记">
            <InputNumber min={0} max={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={loginTarget ? "重新绑定外部账号登录" : "绑定外部账号登录"}
        open={loginOpen}
        onCancel={() => {
          setLoginOpen(false);
          setLoginTarget(null);
        }}
        onOk={() => void handleLoginShop()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<LoginFormValues> form={loginForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: "请输入店铺名称" }]}>
            <Input placeholder="例如：华东旗舰店" />
          </Form.Item>
          <Form.Item name="code" label="店铺编码">
            <Input placeholder="例如：SHOP_EAST_001" />
          </Form.Item>
          <Form.Item name="platform" label="所属平台" rules={[{ required: true, message: "请选择平台" }]}>
            <Select options={platformOptions} />
          </Form.Item>
          <Form.Item name="platformShopId" label="平台店铺ID" rules={[{ required: true, message: "请输入平台店铺ID" }]}>
            <Input placeholder="例如：7291882" />
          </Form.Item>
          <Form.Item name="businessId" label="业务ID" rules={[{ required: true, message: "请输入业务ID" }]}>
            <Input placeholder="例如：biz-shop-east-01" />
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
