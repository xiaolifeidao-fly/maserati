"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
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
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  fetchBarryProductCategories,
  fetchProducts,
  type BarryProductCategoryRecord,
  type ShopCategoryChangeRecord,
  type ShopCategoryPayload,
  type ShopCategoryRecord,
  type ShopRecord,
} from "../../api/product.api";
import { useProductCategoryManagement } from "../../hooks/useProductCategoryManagement";

const { Text } = Typography;

interface CategoryFormValues {
  shopId: number;
  name: string;
  categoryCode?: string;
  secretKey?: string;
  lowerLimit: number;
  upperLimit: number;
  price: string;
}

const categoryStatusFilterOptions = [
  { label: "上架", value: "ACTIVE" },
  { label: "下架", value: "EXPIRE" },
];

export function ProductCategoryManagementPanel() {
  const [form] = Form.useForm<CategoryFormValues>();
  const {
    categories,
    changes,
    total,
    query,
    loading,
    submitting,
    historyLoading,
    refresh,
    saveCategory,
    removeCategory,
    toggleCategoryStatus,
    loadChanges,
    setChanges,
  } = useProductCategoryManagement();
  const [products, setProducts] = useState<ShopRecord[]>([]);
  const [manualProducts, setManualProducts] = useState<BarryProductCategoryRecord[]>([]);
  const [filters, setFilters] = useState({ shopId: 0, name: "", status: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ShopCategoryRecord | null>(null);
  const [activeHistoryCategory, setActiveHistoryCategory] = useState<ShopCategoryRecord | null>(null);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const result = await fetchProducts({ pageIndex: 1, pageSize: 200 });
        setProducts(result.data);
      } catch {
        setProducts([]);
      }
    };
    void loadProducts();
  }, []);

  useEffect(() => {
    const loadManualProducts = async () => {
      try {
        const result = await fetchBarryProductCategories();
        setManualProducts(result);
      } catch {
        setManualProducts([]);
      }
    };
    void loadManualProducts();
  }, []);

  const productNameMap = useMemo(
    () => new Map(products.map((item) => [item.id, item.name || item.code || `商品#${item.id}`])),
    [products],
  );

  const manualProductOptions = useMemo(
    () =>
      manualProducts
        .filter((item) => item.code?.trim())
        .map((item) => ({
          label: item.name?.trim() ? `${item.name.trim()} (${item.code.trim()})` : item.code.trim(),
          value: item.code.trim(),
        })),
    [manualProducts],
  );

  const stats = useMemo(
    () => [
      { label: "类目总数", value: total },
      { label: "激活类目", value: categories.filter((item) => resolveStatus(item.status) === "ACTIVE").length },
      { label: "已记录调价", value: changes.length },
    ],
    [categories, changes.length, total],
  );

  const openCreateModal = () => {
    setEditingCategory(null);
    form.setFieldsValue({
      shopId: products[0]?.id ?? 0,
      name: "",
      categoryCode: "",
      secretKey: "",
      lowerLimit: 0,
      upperLimit: 0,
      price: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (record: ShopCategoryRecord) => {
    setEditingCategory(record);
    const matchedManualProduct = manualProducts.find((item) => item.code === record.barryShopCategoryCode);
    form.setFieldsValue({
      shopId: record.shopId,
      name: record.name,
      categoryCode: matchedManualProduct?.code || record.barryShopCategoryCode,
      secretKey: record.secretKey,
      lowerLimit: record.lowerLimit,
      upperLimit: record.upperLimit,
      price: record.price,
    });
    setModalOpen(true);
  };

  const openHistoryModal = async (record: ShopCategoryRecord) => {
    setActiveHistoryCategory(record);
    setHistoryOpen(true);
    try {
      await loadChanges(record.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载价格历史失败");
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload: ShopCategoryPayload = {
      shopId: Number(values.shopId || 0),
      name: values.name.trim(),
      barryShopCategoryCode: values.categoryCode?.trim() || "",
      secretKey: values.secretKey?.trim() || "",
      lowerLimit: Number(values.lowerLimit || 0),
      upperLimit: Number(values.upperLimit || 0),
      price: values.price.trim(),
    };
    if (!editingCategory) {
      payload.status = "ACTIVE";
    }
    try {
      await saveCategory(editingCategory?.id ?? null, payload);
      message.success(editingCategory ? "类目已更新" : "类目已创建");
      setModalOpen(false);
      setEditingCategory(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存类目失败");
    }
  };

  const categoryColumns: ColumnsType<ShopCategoryRecord> = [
    { title: "ID", dataIndex: "id", width: 80 },
    {
      title: "商品",
      dataIndex: "shopId",
      width: 160,
      render: (value: number) => productNameMap.get(value) || `商品#${value}`,
    },
    {
      title: "类目名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <Text style={{ color: "var(--manager-text)", fontWeight: 600 }}>{value || "-"}</Text>,
    },
    {
      title: "人工商品编码",
      dataIndex: "barryShopCategoryCode",
      width: 180,
      render: (value: string) => value || "-",
    },
    {
      title: "价格",
      dataIndex: "price",
      width: 120,
      render: (value: string) => <span style={{ fontWeight: 600 }}>￥{value || "0.00000000"}</span>,
    },
    {
      title: "下限 / 上限",
      key: "limitRange",
      width: 160,
      render: (_, record) => `${record.lowerLimit} / ${record.upperLimit}`,
    },
    {
      title: "密钥",
      dataIndex: "secretKey",
      width: 220,
      render: (value: string) => wrapText(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => (
        <Tag color={resolveStatus(value) === "ACTIVE" ? "green" : "default"}>
          {resolveStatus(value) === "ACTIVE" ? "激活" : "冻结"}
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
      width: 208,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑类目">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          {resolveStatus(record.status) === "ACTIVE" ? (
            <Tooltip title="下架类目">
              <Button
                type="text"
                icon={<ArrowDownOutlined />}
                onClick={async () => {
                  try {
                    await toggleCategoryStatus(record.id, "EXPIRE");
                    message.success("类目已下架");
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : "类目下架失败");
                  }
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="上架类目">
              <Button
                type="text"
                icon={<ArrowUpOutlined />}
                onClick={async () => {
                  try {
                    await toggleCategoryStatus(record.id, "ACTIVE");
                    message.success("类目已上架");
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : "类目上架失败");
                  }
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="查看调价历史">
            <Button type="text" icon={<HistoryOutlined />} onClick={() => void openHistoryModal(record)} />
          </Tooltip>
          <Tooltip title="删除类目">
            <Popconfirm
              title="确认删除这个类目吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={async () => {
                try {
                  await removeCategory(record.id);
                  message.success("类目已删除");
                } catch (error) {
                  message.error(error instanceof Error ? error.message : "删除类目失败");
                }
              }}
            >
              <Button danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const historyColumns: ColumnsType<ShopCategoryChangeRecord> = [
    {
      title: "时间",
      dataIndex: "createdTime",
      width: 180,
      render: (value?: string) => formatDateTime(value),
    },
    { title: "旧价格", dataIndex: "oldPrice", width: 120 },
    { title: "新价格", dataIndex: "newPrice", width: 120 },
    {
      title: "旧区间",
      key: "oldRange",
      width: 140,
      render: (_, record) => `${record.oldLowerLimit} / ${record.oldUpperLimit}`,
    },
    {
      title: "新区间",
      key: "newRange",
      width: 140,
      render: (_, record) => `${record.newLowerLimit} / ${record.newUpperLimit}`,
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
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
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Select
              allowClear
              placeholder="按商品筛选"
              value={filters.shopId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, shopId: Number(value ?? 0) }))}
              style={{ width: 220 }}
              options={products.map((item) => ({
                label: item.name || item.code,
                value: item.id,
              }))}
            />
            <Input
              placeholder="按类目名称筛选"
              value={filters.name}
              onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
              style={{ width: 220, height: 44 }}
            />
            <Select
              allowClear
              placeholder="按状态筛选"
              value={filters.status || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, status: String(value ?? "") }))}
              style={{ width: 160 }}
              options={categoryStatusFilterOptions}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => void refresh({ pageIndex: 1, shopId: filters.shopId, name: filters.name, status: filters.status })}
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
              新建类目
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ShopCategoryRecord>
          rowKey="id"
          loading={loading}
          dataSource={categories}
          columns={categoryColumns}
          scroll={{ x: 1560 }}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: false,
            onChange: (page) =>
              void refresh({
                pageIndex: page,
                shopId: filters.shopId,
                name: filters.name,
                status: filters.status,
              }),
          }}
        />
      </section>

      <Modal
        title={editingCategory ? "编辑商品类目" : "新建商品类目"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingCategory(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<CategoryFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="shopId" label="所属商品" rules={[{ required: true, message: "请选择商品" }]}>
            <Select
              placeholder="请选择商品"
              options={products.map((item) => ({
                label: item.name || item.code,
                value: item.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="name" label="类目名称" rules={[{ required: true, message: "请输入类目名称" }]}>
            <Input placeholder="例如：快速点赞" />
          </Form.Item>
          <Form.Item name="categoryCode" label="人工商品列表">
            <Select
              allowClear
              showSearch
              placeholder="请选择人工商品"
              optionFilterProp="label"
              options={manualProductOptions}
              notFoundContent="接口暂无人工商品数据"
            />
          </Form.Item>
          <Form.Item name="secretKey" label="密钥">
            <Input placeholder="请输入密钥" />
          </Form.Item>
          <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}>
            <Input placeholder="例如：0.012" />
          </Form.Item>
          <Space style={{ width: "100%" }} size={12}>
            <Form.Item name="lowerLimit" label="下限" style={{ flex: 1 }} initialValue={0}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="upperLimit" label="上限" style={{ flex: 1 }} initialValue={0}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={`调价历史${activeHistoryCategory ? ` · ${activeHistoryCategory.name}` : ""}`}
        open={historyOpen}
        footer={null}
        width={860}
        onCancel={() => {
          setHistoryOpen(false);
          setActiveHistoryCategory(null);
          setChanges([]);
        }}
      >
        <Table<ShopCategoryChangeRecord>
          rowKey="id"
          loading={historyLoading}
          dataSource={changes}
          columns={historyColumns}
          pagination={false}
          locale={{ emptyText: "当前类目还没有价格变更记录" }}
          scroll={{ x: 700 }}
        />
      </Modal>
    </div>
  );
}

function resolveStatus(value?: string) {
  return value?.trim().toUpperCase() === "EXPIRE" ? "EXPIRE" : "ACTIVE";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function wrapText(value?: string) {
  if (!value) {
    return "-";
  }
  return (
    <div style={{ whiteSpace: "normal", wordBreak: "break-all", color: "var(--manager-text-soft)" }}>
      {value}
    </div>
  );
}
