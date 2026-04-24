"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShareAltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Progress, Select, Space, Table, Tabs, Tag, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import {
  importCollectBatchZip,
  type ImportCollectBatchProgress,
  subscribeImportCollectProgress,
  type CollectBatchRecord,
  normalizeCollectSourceType,
  shareCollectBatch,
  startCollection as startCollectionByRoute,
  type CollectSourceType,
} from "../api/collection.api";
import { useCollectionManagement } from "../hooks/useCollectionManagement";
import { BatchDetailModal } from "./BatchDetailModal";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { getPublishWindowApi } from "@/utils/publish-window";
import { formatDateTime } from "@/utils/format";

interface CollectionFormValues {
  name: string;
  platform: string;
  shopId: number;
}

interface ImportFormValues {
  shopType: "tb" | "pdd";
}

interface ShareFormValues {
  username: string;
}

function formatShopLabel(shop?: {
  id?: number;
  nickname?: string;
  remark?: string;
  name?: string;
  code?: string;
  platform?: string;
}) {
  if (!shop) {
    return "-";
  }

  const primary = shop.name || shop.code || shop.platform || `采集账号 #${shop.id ?? 0}`;
  const details = [
    shop.nickname?.trim() ? `昵称：${shop.nickname.trim()}` : "",
    shop.remark?.trim() ? `备注：${shop.remark.trim()}` : "",
  ].filter(Boolean);

  return details.length > 0 ? `${primary} · ${details.join(" · ")}` : primary;
}

function buildBatchSerial(record: Pick<CollectBatchRecord, "id" | "createdTime" | "updatedTime">) {
  const timeSource = record.createdTime || record.updatedTime || "";
  const timePart = timeSource.replace(/\D/g, "").slice(0, 14) || "00000000000000";
  return `${timePart}-${String(record.id || 0).padStart(6, "0")}`;
}

const platformOptions = [
  { key: "tb", label: "淘宝", value: "tb" },
  { key: "pxx", label: "拼多多", value: "pxx" },
];

export function CollectionManagementSimplePanel() {
  const searchParams = useSearchParams();
  const [form] = Form.useForm<CollectionFormValues>();
  const [importForm] = Form.useForm<ImportFormValues>();
  const [shareForm] = Form.useForm<ShareFormValues>();
  const { collections, shops, total, query, loading, submitting, refresh, refreshOptions, saveCollection, removeCollection } =
    useCollectionManagement();
  const [filters, setFilters] = useState({
    keyword: "",
    shopId: 0,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailBatch, setDetailBatch] = useState<CollectBatchRecord | null>(null);
  const [detailSourceType, setDetailSourceType] = useState<CollectSourceType>("unknown");
  const [editingRecord, setEditingRecord] = useState<CollectBatchRecord | null>(null);
  const [importingRecord, setImportingRecord] = useState<CollectBatchRecord | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileList, setImportFileList] = useState<UploadFile[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportCollectBatchProgress | null>(null);
  const [startingBatchId, setStartingBatchId] = useState(0);
  const [sharingRecord, setSharingRecord] = useState<CollectBatchRecord | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const shopMap = useMemo(() => new Map(shops.map((item) => [item.id, item])), [shops]);
  const activePlatform = query.platform || "tb";

  useEffect(() => {
    const initialShopId = Number(searchParams?.get("shopId") || 0);
    if (initialShopId > 0) {
      setFilters((current) => ({ ...current, shopId: initialShopId }));
      void refresh({ pageIndex: 1, shopId: initialShopId, platform: activePlatform });
    }
  }, [searchParams]);

  useEffect(() => {
    void subscribeImportCollectProgress((progress) => {
      setImportProgress((current) => {
        if (!importingRecord?.id || progress.batchId !== importingRecord.id) {
          return current;
        }
        return progress;
      });
    });
  }, [importingRecord?.id]);

  const openCreateModal = () => {
    setEditingRecord(null);
    const platform = activePlatform;
    form.setFieldsValue({
      name: "",
      platform,
      shopId: filters.shopId || (shops[0]?.id as never),
    });
    setModalOpen(true);
  };

  const openEditModal = (record: CollectBatchRecord) => {
    setEditingRecord(record);
    const shop = shopMap.get(record.shopId);
    const platform = normalizeCollectSourceType(shop?.platform) !== "unknown"
      ? normalizeCollectSourceType(shop?.platform)
      : activePlatform;
    form.setFieldsValue({
      name: record.name,
      platform,
      shopId: record.shopId,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await saveCollection(
        editingRecord?.id ?? null,
        {
          shopId: Number(values.shopId),
          name: values.name.trim(),
          status: editingRecord?.status || "PENDING",
          ossUrl: editingRecord?.ossUrl || "",
          collectedCount: Number(editingRecord?.collectedCount || 0),
        },
        editingRecord,
      );
      message.success(editingRecord ? "采集批次已更新" : "采集批次已创建");
      setModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存采集批次失败");
    }
  };

  const startCollection = async (record: CollectBatchRecord) => {
    setStartingBatchId(record.id);
    try {
      const result = await startCollectionByRoute(record.id);
      message.success(result.message || `批次「${record.name}」采集工作台已打开`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开采集工作台失败");
    } finally {
      setStartingBatchId(0);
    }
  };

  const openPublishModal = (record: CollectBatchRecord) => {
    void getPublishWindowApi().openPublishWindow({
      batchId: record.id,
      entryScene: "collection",
    });
  };

  const openPublishProgressModal = (record: CollectBatchRecord) => {
    void getPublishWindowApi().openPublishWindow({
      batchId: record.id,
      entryScene: "collection",
      initialView: "progress",
    });
  };

  const openShareModal = (record: CollectBatchRecord) => {
    setSharingRecord(record);
    shareForm.resetFields();
    setShareModalOpen(true);
  };

  const openImportModal = (record: CollectBatchRecord) => {
    const shop = shopMap.get(record.shopId);
    const defaultShopType = normalizeCollectSourceType(shop?.platform) === "tb" ? "tb" : "pdd";
    setImportingRecord(record);
    setImportFileList([]);
    setImportProgress(null);
    importForm.setFieldsValue({ shopType: defaultShopType });
    setImportModalOpen(true);
  };

  const openDetailModal = (record: CollectBatchRecord) => {
    const shop = shopMap.get(record.shopId);
    setDetailBatch(record);
    setDetailSourceType(normalizeCollectSourceType(shop?.platform));
    setDetailModalOpen(true);
  };

  const uploadProps: UploadProps = {
    accept: ".zip,application/zip",
    beforeUpload: (file) => {
      setImportFileList([file]);
      return false;
    },
    onRemove: () => {
      setImportFileList([]);
    },
    fileList: importFileList,
    maxCount: 1,
  };

  const handleImportSubmit = async () => {
    if (!importingRecord?.id) {
      return;
    }
    const values = await importForm.validateFields();
    const currentFile = importFileList[0]?.originFileObj as (File & { path?: string }) | undefined;
    const filePath = String(currentFile?.path || "").trim();
    if (!filePath) {
      message.error("请先选择 zip 文件");
      return;
    }

    setImportSubmitting(true);
    try {
      const result = await importCollectBatchZip(importingRecord.id, {
        shopType: values.shopType,
        filePath,
      });
      const successParts = [`新增 ${result.importedCount || 0} 条`, `更新 ${result.updatedCount || 0} 条`];
      if ((result.skippedCount || 0) > 0) {
        successParts.push(`跳过 ${result.skippedCount} 条`);
      }
      message.success(`导入完成，${successParts.join("，")}`);
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        message.warning(result.errors.slice(0, 3).join("；"));
      }
      setImportModalOpen(false);
      setImportingRecord(null);
      setImportFileList([]);
      setImportProgress(null);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入 zip 失败");
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleShareSubmit = async () => {
    if (!sharingRecord?.id) {
      return;
    }
    const values = await shareForm.validateFields();
    setShareSubmitting(true);
    try {
      await shareCollectBatch({
        collectBatchId: sharingRecord.id,
        username: values.username.trim(),
      });
      message.success(`已分享批次「${sharingRecord.name}」`);
      setShareModalOpen(false);
      setSharingRecord(null);
      shareForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分享采集批次失败");
    } finally {
      setShareSubmitting(false);
    }
  };

  const columns: ColumnsType<CollectBatchRecord> = [
    {
      title: "采集批次",
      dataIndex: "name",
      width: 280,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>批次号 {buildBatchSerial(record)}</div>
        </div>
      ),
    },
    {
      title: "采集账号",
      key: "shop",
      width: 220,
      render: (_, record) => {
        const shop = shopMap.get(record.shopId);
        return (
          <div>
            <div>{formatShopLabel(shop ?? { id: record.shopId })}</div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{shop?.platform || "-"}</div>
          </div>
        );
      },
    },
    {
      title: "已采集数",
      dataIndex: "collectedCount",
      width: 120,
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
      width: 360,
      render: (_, record) => {
        const batchShop = shopMap.get(record.shopId);
        const batchShopAuthorized = batchShop?.authorizationStatus === "AUTHORIZED";
        const isCollectShop = (batchShop?.shopUsage || "").toUpperCase() === "COLLECT";
        const canCollect = isCollectShop || batchShopAuthorized;
        return (
        <Space size={4} wrap>
          <IconOnlyButton
            type="text"
            icon={<PlayCircleOutlined />}
            tooltip={canCollect ? "开始采集" : "店铺未授权，无法采集"}
            loading={startingBatchId === record.id}
            disabled={!canCollect}
            onClick={() => void startCollection(record)}
          />
          <IconOnlyButton type="text" icon={<EyeOutlined />} tooltip="查看详情" onClick={() => openDetailModal(record)} />
          <IconOnlyButton type="text" icon={<ImportOutlined />} tooltip="导入 zip" onClick={() => openImportModal(record)} />
          <IconOnlyButton
            type="text"
            icon={<ArrowRightOutlined />}
            tooltip="去发布"
            onClick={() => openPublishModal(record)}
          />
          <IconOnlyButton
            type="text"
            icon={<ClockCircleOutlined />}
            tooltip="发布进度"
            onClick={() => openPublishProgressModal(record)}
          />
          <IconOnlyButton type="text" icon={<ShareAltOutlined />} tooltip="分享采集批次" onClick={() => openShareModal(record)} />
          <IconOnlyButton type="text" icon={<EditOutlined />} tooltip="编辑采集批次" onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确认删除这条采集批次吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeCollection(record.id);
                message.success("采集批次已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除采集批次失败");
              }
            }}
          >
            <IconOnlyButton danger type="text" icon={<DeleteOutlined />} tooltip="删除采集批次" />
          </Popconfirm>
        </Space>
      );
      },
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
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
              placeholder="按批次名称筛选"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              style={{ width: 240, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="采集账号"
              value={filters.shopId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, shopId: Number(value || 0) }))}
              options={shops.map((item) => ({ label: formatShopLabel(item), value: item.id }))}
              style={{ width: 180 }}
            />
            <IconOnlyButton
              type="primary"
              icon={<SearchOutlined />}
              tooltip="查询采集批次"
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  platform: activePlatform,
                  name: filters.keyword,
                  shopId: filters.shopId || undefined,
                })
              }
            />
            <IconOnlyButton
              icon={<ReloadOutlined />}
              tooltip="重置并刷新采集批次"
              onClick={() => {
                setFilters({ keyword: "", shopId: 0 });
                void refresh({ pageIndex: 1, platform: activePlatform, name: "", shopId: undefined, status: "" });
              }}
            />
            <IconOnlyButton type="primary" icon={<PlusOutlined />} tooltip="新增采集批次" onClick={openCreateModal} />
          </Space>

          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            共 {total} 条
          </Tag>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<CollectBatchRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={collections}
          columns={columns}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => void refresh({ pageIndex: page, pageSize }),
          }}
          scroll={{ x: 1240 }}
        />
      </section>

      <Modal
        title={editingRecord ? "编辑采集批次" : "新增采集批次"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingRecord(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<CollectionFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="批次名称" rules={[{ required: true, message: "请输入批次名称" }]}>
            <Input placeholder="例如：春季竞品采集批次" />
          </Form.Item>
          <Form.Item name="platform" label="平台" rules={[{ required: true, message: "请选择平台" }]}>
            <Select
              options={platformOptions}
              onChange={(value) => {
                const platform = String(value || "tb");
                form.setFieldValue("shopId", undefined);
                void refreshOptions(platform);
              }}
            />
          </Form.Item>
          <Form.Item name="shopId" label="采集账号" rules={[{ required: true, message: "请选择采集账号" }]}>
            <Select
              options={shops.map((item) => {
                const authorized = item.authorizationStatus === "AUTHORIZED";
                const isCollect = (item.shopUsage || "").toUpperCase() === "COLLECT";
                const available = isCollect || authorized;
                return {
                  label: available ? formatShopLabel(item) : `${formatShopLabel(item)}（未授权）`,
                  value: item.id,
                  disabled: !available,
                };
              })}
            />
          </Form.Item>
          {!editingRecord ? (
            <div className="manager-muted" style={{ marginTop: 4 }}>
              批次状态默认创建为待处理，批次号将按创建时间 + ID 自动生成。
            </div>
          ) : null}
        </Form>
      </Modal>

      <BatchDetailModal
        open={detailModalOpen}
        batch={detailBatch}
        sourceType={detailSourceType}
        onClose={() => setDetailModalOpen(false)}
      />

      <Modal
        title={sharingRecord ? `分享采集批次 · ${sharingRecord.name}` : "分享采集批次"}
        open={shareModalOpen}
        onCancel={() => {
          setShareModalOpen(false);
          setSharingRecord(null);
          shareForm.resetFields();
        }}
        onOk={() => void handleShareSubmit()}
        confirmLoading={shareSubmitting}
        destroyOnClose
      >
        <Form<ShareFormValues> form={shareForm} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: "请输入要分享给的用户名" }]}
          >
            <Input placeholder="请输入对方用户名" maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={importingRecord ? `导入采集数据 · ${importingRecord.name}` : "导入采集数据"}
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportingRecord(null);
          setImportFileList([]);
          setImportProgress(null);
        }}
        onOk={() => void handleImportSubmit()}
        confirmLoading={importSubmitting}
        destroyOnClose
      >
        <Form<ImportFormValues> form={importForm} layout="vertical" preserve={false}>
          <Form.Item name="shopType" label="店铺类型" rules={[{ required: true, message: "请选择店铺类型" }]}>
            <Select
              options={[
                { label: "tb", value: "tb" },
                { label: "pdd", value: "pdd" },
              ]}
            />
          </Form.Item>
          <Form.Item label="zip 文件" required>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>选择 zip 文件</Button>
            </Upload>
            <div className="manager-muted" style={{ marginTop: 8 }}>
              zip 解压后应为多个 JSON 文件，文件名格式为 {"{原商品ID}.json"}。
            </div>
          </Form.Item>
          {importSubmitting || importProgress ? (
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "rgba(241,245,249,0.9)",
                border: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <Progress percent={importProgress?.percent ?? 0} status={importProgress?.status === "failed" ? "exception" : undefined} />
              <div className="manager-muted" style={{ marginTop: 8 }}>
                {importProgress?.message || "准备开始导入"}
              </div>
              <div className="manager-muted" style={{ marginTop: 4 }}>
                已处理 {importProgress?.processed ?? 0} / {importProgress?.total ?? 0}
                {importProgress?.currentFile ? `，当前文件：${importProgress.currentFile}` : ""}
              </div>
            </div>
          ) : null}
        </Form>
      </Modal>

    </div>
  );
}
