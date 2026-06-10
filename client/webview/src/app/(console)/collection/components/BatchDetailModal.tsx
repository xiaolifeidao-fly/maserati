"use client";

import { useEffect, useState } from "react";
import { SaveOutlined, ShareAltOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Segmented, Space, Spin, Tabs, Tag, Typography, message } from "antd";
import {
  CollectBatchRecord,
  CollectRecordPreview,
  CollectionWorkspaceState,
  type CollectShareRecord,
  type CollectSourceType,
  type CollectRecordSource,
} from "../api/collection.api";
import {
  batchUpdateCollectRecordShare,
  cancelCollectBatchShare,
  fetchCollectBatchShares,
  fetchCollectBatchRecords,
  normalizeCollectRecordSource,
  previewCollectedRecord,
  shareCollectBatch,
  updateCollectRecord,
} from "../api/collection.api";
import { CollectionWorkspaceLeftPanel } from "./CollectionTestingPanel";
import { CollectionWorkspaceRightPanel } from "./CollectionTestingPanel";

const { Text } = Typography;

type PublishStatusFilter = "ALL" | "FAILED" | "SUCCESS";

const publishStatusOptions: Array<{ label: string; value: PublishStatusFilter }> = [
  { label: "全部", value: "ALL" },
  { label: "发布失败", value: "FAILED" },
  { label: "发布成功", value: "SUCCESS" },
];

interface BatchDetailModalProps {
  open: boolean;
  batch: CollectBatchRecord | null;
  sourceType: CollectSourceType;
  focusRecordId?: number;
  readOnly?: boolean;
  favoritesOnly?: boolean;
  sharedOnly?: boolean;
  showPublishStatus?: boolean;
  showFavoriteInfo?: boolean;
  onClose: () => void;
}

export function BatchDetailModal({
  open,
  batch,
  sourceType,
  focusRecordId = 0,
  readOnly = false,
  favoritesOnly = false,
  sharedOnly = false,
  showPublishStatus = true,
  showFavoriteInfo = true,
  onClose,
}: BatchDetailModalProps) {
  const [shareForm] = Form.useForm<{ username: string }>();
  const [records, setRecords] = useState<CollectRecordPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(0);
  const [activeSource, setActiveSource] = useState<CollectRecordSource>("manual");
  const [publishStatusFilter, setPublishStatusFilter] = useState<PublishStatusFilter>("ALL");
  const [shareDrafts, setShareDrafts] = useState<Record<number, boolean>>({});
  const [shareSaving, setShareSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<CollectShareRecord[]>([]);
  const [sharedUsersLoading, setSharedUsersLoading] = useState(false);
  const [cancellingShareId, setCancellingShareId] = useState(0);
  const canManageShare = !readOnly && Boolean(batch?.id);

  const syncElectronPreview = async (record: CollectRecordPreview | null) => {
    if (!record?.sourceProductId) {
      return;
    }
    try {
      await previewCollectedRecord(record.sourceProductId, sourceType);
    } catch (error) {
      if (error instanceof Error && error.message.includes("选品工作台尚未打开")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "加载预览失败");
    }
  };

  const handleToggleFavorite = async (record: CollectRecordPreview) => {
    const nextFavorite = !record.isFavorite;
    setRecords((current) =>
      current.map((item) => (item.id === record.id ? { ...item, isFavorite: nextFavorite } : item)),
    );
    try {
      const saved = await updateCollectRecord(record.id, { isFavorite: nextFavorite });
      setRecords((current) =>
        current.map((item) =>
          item.id === record.id
            ? Object.assign(new CollectRecordPreview(), { ...item, ...saved, source: normalizeCollectRecordSource(saved.source) })
            : item,
        ),
      );
    } catch (error) {
      setRecords((current) =>
        current.map((item) => (item.id === record.id ? { ...item, isFavorite: record.isFavorite } : item)),
      );
      message.error(error instanceof Error ? error.message : "收藏状态更新失败");
    }
  };

  const loadBatchShares = async () => {
    if (!batch?.id || !canManageShare) {
      setSharedUsers([]);
      return;
    }
    setSharedUsersLoading(true);
    try {
      setSharedUsers(await fetchCollectBatchShares(batch.id));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载分享用户失败");
    } finally {
      setSharedUsersLoading(false);
    }
  };

  const getRecordShareValue = (record: CollectRecordPreview) => {
    return shareDrafts[record.id] ?? record.isShared;
  };

  const setRecordsShareDraft = (recordIds: number[], isShared: boolean) => {
    setShareDrafts((current) => {
      const next = { ...current };
      const recordMap = new Map(records.map((record) => [record.id, record]));
      recordIds.forEach((recordId) => {
        const record = recordMap.get(recordId);
        if (!record) return;
        if (record.isShared === isShared) {
          delete next[recordId];
        } else {
          next[recordId] = isShared;
        }
      });
      return next;
    });
  };

  const toggleRecordShareDraft = (record: CollectRecordPreview) => {
    setRecordsShareDraft([record.id], !getRecordShareValue(record));
  };

  const saveShareDrafts = async () => {
    if (!batch?.id) return;
    const entries = Object.entries(shareDrafts).map(([recordId, isShared]) => ({ recordId: Number(recordId), isShared }));
    if (entries.length === 0) {
      message.info("没有需要保存的分享设置");
      return;
    }
    setShareSaving(true);
    try {
      const enabledIds = entries.filter((item) => item.isShared).map((item) => item.recordId);
      const disabledIds = entries.filter((item) => !item.isShared).map((item) => item.recordId);
      if (enabledIds.length > 0) {
        await batchUpdateCollectRecordShare(batch.id, { recordIds: enabledIds, isShared: true });
      }
      if (disabledIds.length > 0) {
        await batchUpdateCollectRecordShare(batch.id, { recordIds: disabledIds, isShared: false });
      }
      setRecords((current) =>
        current.map((record) => {
          const changed = entries.find((item) => item.recordId === record.id);
          return changed ? Object.assign(new CollectRecordPreview(), { ...record, isShared: changed.isShared }) : record;
        }),
      );
      setShareDrafts({});
      message.success("分享设置已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存分享设置失败");
    } finally {
      setShareSaving(false);
    }
  };

  const handleShareSubmit = async () => {
    if (!batch?.id) return;
    const values = await shareForm.validateFields();
    setShareSubmitting(true);
    try {
      await shareCollectBatch({
        collectBatchId: batch.id,
        username: values.username.trim(),
      });
      message.success("分享成功");
      setShareOpen(false);
      shareForm.resetFields();
      await loadBatchShares();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分享选品批次失败");
    } finally {
      setShareSubmitting(false);
    }
  };

  const handleCancelShare = async (record: CollectShareRecord) => {
    if (!batch?.id || !record.id) return;
    setCancellingShareId(record.id);
    try {
      await cancelCollectBatchShare(batch.id, record.id);
      message.success("已取消该用户分享");
      await loadBatchShares();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "取消分享失败");
    } finally {
      setCancellingShareId(0);
    }
  };

  useEffect(() => {
    if (open) {
      setActiveSource("manual");
      setPublishStatusFilter("ALL");
      setShareDrafts({});
    }
  }, [open]);

  useEffect(() => {
    if (!open || !canManageShare) {
      setSharedUsers([]);
      return;
    }
    void loadBatchShares();
  }, [open, batch?.id, canManageShare]);

  useEffect(() => {
    if (!open || !batch?.id) {
      setRecords([]);
      setSelectedRecordId(0);
      setShareDrafts({});
      return;
    }

    setLoading(true);
    void fetchCollectBatchRecords(batch.id, {
      pageIndex: 1,
      pageSize: 200,
      source: activeSource,
      isFavorite: favoritesOnly ? 1 : undefined,
      isShared: sharedOnly ? 1 : undefined,
      publishStatus: showPublishStatus && publishStatusFilter !== "ALL" ? publishStatusFilter : undefined,
    })
      .then((result) => {
        const rawItems = Array.isArray(result.data) ? result.data : [];
        const normalizedItems = rawItems.map((item) =>
          Object.assign(new CollectRecordPreview(), item, { source: normalizeCollectRecordSource(item.source) }),
        );
        const items = focusRecordId > 0 ? normalizedItems.filter((item) => item.id === focusRecordId) : normalizedItems;
        setRecords(items);
        setShareDrafts({});
        setSelectedRecordId(items.find((item) => item.id === focusRecordId)?.id || items[0]?.id || 0);
      })
      .catch((error) => {
        message.error(error instanceof Error ? error.message : "加载选品记录失败");
      })
      .finally(() => setLoading(false));
  }, [open, batch?.id, focusRecordId, activeSource, favoritesOnly, sharedOnly, publishStatusFilter, showPublishStatus]);

  const workspaceState: CollectionWorkspaceState = {
    batch: batch ?? new CollectBatchRecord(),
    records,
    selectedRecordId,
    sourceType,
  };

  return (
    <>
      <Modal
        className="batch-detail-modal"
        open={open}
        onCancel={onClose}
        footer={null}
        width="96vw"
        style={{ top: 12, paddingBottom: 12 }}
        styles={{
          body: {
            padding: 0,
            display: "flex",
            alignItems: "stretch",
            overflow: "hidden",
            minHeight: "78vh",
            height: "78vh",
          },
        }}
        title={
          <Space style={{ width: "100%", justifyContent: "space-between", paddingRight: 28 }}>
            <span>{batch ? `选品详情 · ${batch.name}` : "选品详情"}</span>
            {canManageShare ? (
              <Button
                type="primary"
                size="small"
                icon={<ShareAltOutlined />}
                onClick={() => {
                  shareForm.resetFields();
                  setShareOpen(true);
                }}
              >
                分享批次
              </Button>
            ) : null}
          </Space>
        }
        destroyOnClose
      >
      {/* Left Panel */}
      <div
        style={{
          width: 360,
          flex: "0 0 360px",
          height: "100%",
          minHeight: "78vh",
          padding: "12px 10px",
          background: "linear-gradient(160deg, #f0f4ff 0%, #f8fafc 60%, #eef2f8 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid rgba(226,232,240,0.8)",
        }}
      >
        <Tabs
          activeKey={activeSource}
          onChange={(value) => setActiveSource(value as CollectRecordSource)}
          items={[
            { key: "manual", label: "手动选品" },
            { key: "file", label: "文件来源" },
          ]}
          style={{ flex: "0 0 auto", marginBottom: 10 }}
        />
        {showPublishStatus ? (
          <div
            style={{
              flex: "0 0 auto",
              display: "grid",
              gap: 8,
              padding: "10px 12px",
              marginBottom: 10,
              borderRadius: 8,
              background: "rgba(255,255,255,0.86)",
              border: "1px solid rgba(226,232,240,0.9)",
            }}
          >
            <Space style={{ justifyContent: "space-between" }}>
              <Text type="secondary">发布成功率</Text>
              <strong style={{ color: "#1f2937", fontSize: 18 }}>{batch?.publishSuccessRate || "0%"}</strong>
            </Space>
            <Space size={6}>
              <Tag color="green">成功 {batch?.publishSuccessCount ?? 0}</Tag>
              <Tag color="red">失败 {batch?.publishFailedCount ?? 0}</Tag>
            </Space>
            <Segmented
              block
              size="small"
              value={publishStatusFilter}
              options={publishStatusOptions}
              onChange={(value) => setPublishStatusFilter(value as PublishStatusFilter)}
            />
          </div>
        ) : null}
        {canManageShare ? (
          <>
            <div
              style={{
                flex: "0 0 auto",
                display: "grid",
                gap: 8,
                padding: "10px 12px",
                marginBottom: 10,
                borderRadius: 8,
                background: "rgba(255,255,255,0.86)",
                border: "1px solid rgba(226,232,240,0.9)",
              }}
            >
              <Space style={{ justifyContent: "space-between" }}>
                <Text type="secondary">已分享用户</Text>
                <Tag>{sharedUsers.length}</Tag>
              </Space>
              {sharedUsersLoading ? (
                <div style={{ display: "grid", placeItems: "center", minHeight: 32 }}>
                  <Spin size="small" />
                </div>
              ) : sharedUsers.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>暂未分享给其他用户</Text>
              ) : (
                <div style={{ display: "grid", gap: 6, maxHeight: 96, overflowY: "auto", paddingRight: 2 }}>
                  {sharedUsers.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        minWidth: 0,
                        padding: "6px 8px",
                        borderRadius: 7,
                        background: "rgba(248,250,252,0.9)",
                      }}
                    >
                      <Text ellipsis style={{ minWidth: 0, fontSize: 12 }}>
                        {item.shareUsername || `用户 #${item.shareUserId}`}
                      </Text>
                      <Popconfirm
                        title="确认取消该用户的分享吗？"
                        okText="取消分享"
                        cancelText="保留"
                        onConfirm={() => void handleCancelShare(item)}
                      >
                        <Button danger size="small" type="text" loading={cancellingShareId === item.id}>
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Space size={6} wrap style={{ flex: "0 0 auto", marginBottom: 10 }}>
              <Button
                size="small"
                disabled={records.length === 0}
                onClick={() => setRecordsShareDraft(records.map((record) => record.id), true)}
              >
                批量分享
              </Button>
              <Button
                size="small"
                disabled={records.length === 0}
                onClick={() => setRecordsShareDraft(records.map((record) => record.id), false)}
              >
                批量关闭分享
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                loading={shareSaving}
                disabled={Object.keys(shareDrafts).length === 0}
                onClick={() => void saveShareDrafts()}
              >
                保存
              </Button>
            </Space>
          </>
        ) : null}
        <CollectionWorkspaceLeftPanel
          workspaceState={workspaceState}
          loading={loading}
          onSelectRecord={setSelectedRecordId}
          readOnly={readOnly}
          onToggleFavorite={readOnly ? undefined : (record) => void handleToggleFavorite(record)}
          onPreviewRecord={(record) => void syncElectronPreview(record)}
          showPublishStatus={showPublishStatus}
          showFavoriteInfo={showFavoriteInfo}
          getRecordShareValue={canManageShare ? getRecordShareValue : undefined}
          onToggleRecordShare={canManageShare ? toggleRecordShareDraft : undefined}
        />
      </div>

      {/* Right Panel */}
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          height: "100%",
          minHeight: "78vh",
          padding: "12px 10px",
          background: "linear-gradient(160deg, #f0f4ff 0%, #f8fafc 60%, #eef2f8 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <CollectionWorkspaceRightPanel
          workspaceState={workspaceState}
          loading={loading}
          readOnly={readOnly}
          onToggleFavorite={readOnly ? undefined : (record) => void handleToggleFavorite(record)}
          showFavoriteInfo={showFavoriteInfo}
        />
      </div>
      </Modal>
      <Modal
        title={batch ? `分享选品批次 · ${batch.name}` : "分享选品批次"}
        open={shareOpen}
        onCancel={() => {
          setShareOpen(false);
          shareForm.resetFields();
        }}
        onOk={() => void handleShareSubmit()}
        confirmLoading={shareSubmitting}
        destroyOnClose
      >
        <Form<{ username: string }> form={shareForm} layout="vertical" preserve={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入要分享给的用户名" }]}>
            <Input placeholder="请输入对方用户名" maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>
      <style jsx global>{`
        .batch-detail-modal .ant-modal {
          width: 96vw !important;
          max-width: calc(100vw - 24px);
          padding-bottom: 12px;
        }

        .batch-detail-modal .ant-modal-content {
          min-height: calc(100vh - 24px);
          height: calc(100vh - 24px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .batch-detail-modal .ant-modal-header {
          flex: 0 0 auto;
        }

        .batch-detail-modal .ant-modal-body {
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
        }
      `}</style>
    </>
  );
}
