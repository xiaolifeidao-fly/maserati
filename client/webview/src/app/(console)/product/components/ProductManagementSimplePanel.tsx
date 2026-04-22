"use client";

import { useMemo, useState } from "react";
import { CopyOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type ProductRecord } from "../api/product.api";
import { useProductManagement } from "../hooks/useProductManagement";
import {
  fetchCollectBatch,
  fetchCollectRecord,
  getCollectedProductRawData,
  normalizeCollectSourceType,
} from "@/app/(console)/collection/api/collection.api";
import { ProductDetailEditor } from "@/app/(console)/collection/components/ProductDetailEditor";
import { convertRawDataToStandard, type StandardProductData } from "@/app/(console)/collection/components/standard-product.types";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { formatDateTime } from "@/utils/format";
import { getPublishWindowApi } from "@/utils/publish-window";

const TAOBAO_ITEM_URL_PREFIX = "https://item.taobao.com/item.htm";

const PRODUCT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "gold" },
  PUBLISHED: { label: "已发布", color: "green" },
  OFFLINE: { label: "已下线", color: "default" },
  ARCHIVED: { label: "已归档", color: "default" },
};

const platformOptions = [
  { key: "tb", label: "淘宝", value: "tb" },
  { key: "pxx", label: "拼多多", value: "pxx" },
];

function buildTaobaoItemUrl(itemId: string): string {
  return `${TAOBAO_ITEM_URL_PREFIX}?id=${encodeURIComponent(itemId)}`;
}

export function ProductManagementSimplePanel() {
  const { products, shops, categories, total, query, loading, submitting, refresh, refreshOptions, removeProduct } = useProductManagement();
  const safeShops = Array.isArray(shops) ? shops : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const [filters, setFilters] = useState({
    title: "",
    shopId: 0,
    status: "",
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewingRecordId, setPreviewingRecordId] = useState(0);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailData, setDetailData] = useState<StandardProductData | null>(null);
  const activePlatform = query.platform || "tb";

  const shopNameMap = useMemo(
    () => new Map(safeShops.map((item) => [item.id, item.remark || item.nickname || item.name || item.code || item.platform])),
    [safeShops],
  );
  const categoryNameMap = useMemo(
    () => new Map(safeCategories.map((item) => [item.id, item.name || item.code])),
    [safeCategories],
  );

  const openPreviewModal = async (record: ProductRecord) => {
    if (!record.collectRecordId) {
      message.warning("该商品没有关联采集记录，暂时无法打开采集详情");
      return;
    }

    setPreviewLoading(true);
    setPreviewingRecordId(record.id);
    try {
      const collectRecord = await fetchCollectRecord(record.collectRecordId);
      if (!collectRecord.sourceProductId) {
        throw new Error("关联采集商品缺少源商品ID");
      }

      if (!collectRecord.collectBatchId) {
        throw new Error("关联采集批次不存在");
      }

      const batch = await fetchCollectBatch(collectRecord.collectBatchId);
      const shop = safeShops.find((item) => item.id === batch.shopId);
      const sourceType = normalizeCollectSourceType(shop?.platform);
      const rawData = await getCollectedProductRawData(collectRecord.sourceProductId, sourceType);

      if (!rawData || typeof rawData !== "object") {
        throw new Error("未找到该商品的采集详情数据");
      }

      setDetailTitle(record.title || collectRecord.productName || `商品 #${record.id}`);
      setDetailData(
        convertRawDataToStandard(sourceType, rawData as Record<string, unknown>, {
          productName: collectRecord.productName || record.title,
          sourceProductId: collectRecord.sourceProductId,
          sourceUrl: collectRecord.sourceSnapshotUrl,
        }),
      );
      setDetailModalOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载采集详情失败");
    } finally {
      setPreviewLoading(false);
      setPreviewingRecordId(0);
    }
  };

  const handleCopySourceUrl = async (record: ProductRecord) => {
    if (!record.collectRecordId) {
      message.warning("该商品没有关联采集记录，无法复制原采集链接");
      return;
    }

    try {
      const collectRecord = await fetchCollectRecord(record.collectRecordId);
      const sourceUrl = String(collectRecord.sourceSnapshotUrl || "").trim();

      if (!sourceUrl) {
        message.warning("该商品暂未记录原采集链接");
        return;
      }

      await navigator.clipboard.writeText(sourceUrl);
      message.success("原采集链接已复制");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "复制原采集链接失败");
    }
  };

  const productColumns: ColumnsType<ProductRecord> = [
    {
      title: "商品",
      dataIndex: "title",
      width: 260,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.title || "-"}</div>
          <div style={{ marginTop: 4 }}>
            {record.outerProductId ? (
              <Typography.Link href={buildTaobaoItemUrl(record.outerProductId)} target="_blank" rel="noreferrer">
                {record.outerProductId}
              </Typography.Link>
            ) : (
              <span style={{ color: "var(--manager-text-faint)" }}>-</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "店铺 / 分类",
      key: "meta",
      width: 220,
      render: (_, record) => (
        <div>
          <div>{shopNameMap.get(record.shopId) || `#${record.shopId}`}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            {categoryNameMap.get(record.categoryId) || `#${record.categoryId}`}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => {
        const normalized = String(value || "DRAFT").toUpperCase();
        const status = PRODUCT_STATUS_LABELS[normalized] || { label: normalized || "草稿", color: "default" };
        return <Tag color={status.color}>{status.label}</Tag>;
      },
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
      width: 200,
      render: (_, record) => (
        <Space size={2}>
          <IconOnlyButton
            type="text"
            icon={<CopyOutlined />}
            tooltip="复制原采集链接"
            onClick={() => void handleCopySourceUrl(record)}
          />
          <IconOnlyButton
            type="text"
            icon={<EyeOutlined />}
            tooltip="预览商品详情"
            loading={previewLoading && previewingRecordId === record.id}
            onClick={() => void openPreviewModal(record)}
          />
          <Popconfirm
            title="确认删除这条商品数据吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeProduct(record.id);
                message.success("商品已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除商品失败");
              }
            }}
          >
            <IconOnlyButton danger type="text" icon={<DeleteOutlined />} tooltip="删除商品" />
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
            <Typography.Text type="secondary" style={{ lineHeight: "44px" }}>
              采集来源
            </Typography.Text>
            <Tabs
              activeKey={activePlatform}
              items={platformOptions}
              onChange={(platform) => {
                setFilters((current) => ({ ...current, shopId: 0 }));
                void Promise.all([
                  refresh({ pageIndex: 1, platform, shopId: undefined }),
                  refreshOptions(platform),
                ]);
              }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按商品标题筛选"
              value={filters.title}
              onChange={(event) => setFilters((current) => ({ ...current, title: event.target.value }))}
              style={{ width: 240, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="发布店铺"
              value={filters.shopId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, shopId: Number(value || 0) }))}
              options={safeShops.map((item) => ({ label: item.remark || item.nickname || item.name || item.code || item.platform, value: item.id }))}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="商品状态"
              value={filters.status || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, status: value || "" }))}
              options={[
                { label: "已发布", value: "PUBLISHED" },
                { label: "草稿", value: "DRAFT" },
                { label: "已下线", value: "OFFLINE" },
                { label: "已归档", value: "ARCHIVED" },
              ]}
              style={{ width: 160 }}
            />
            <IconOnlyButton
              type="primary"
              icon={<SearchOutlined />}
              tooltip="查询商品"
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  platform: activePlatform,
                  title: filters.title,
                  shopId: filters.shopId || undefined,
                  status: filters.status,
                })
              }
            />
            <IconOnlyButton icon={<ReloadOutlined />} tooltip="刷新商品列表" onClick={() => void refresh()} />
            <IconOnlyButton
              icon={<PlayCircleOutlined />}
              tooltip="打开发布界面"
              onClick={() => void getPublishWindowApi().openPublishWindow({ entryScene: "product" })}
            />
          </Space>

          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            共 {total} 条
          </Tag>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ProductRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={products}
          columns={productColumns}
          scroll={{ x: 1120 }}
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
        title={detailTitle ? `商品详情预览 · ${detailTitle}` : "商品详情预览"}
        open={detailModalOpen}
        onCancel={() => {
          setDetailModalOpen(false);
          setDetailTitle("");
          setDetailData(null);
        }}
        footer={null}
        width="82vw"
        style={{ top: 24 }}
        styles={{ body: { minHeight: "72vh", maxHeight: "72vh", overflow: "auto", paddingTop: 12 } }}
        destroyOnClose
      >
        <ProductDetailEditor data={detailData} loading={previewLoading} readonly />
      </Modal>

    </div>
  );
}
