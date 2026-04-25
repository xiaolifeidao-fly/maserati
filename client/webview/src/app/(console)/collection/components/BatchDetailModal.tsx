"use client";

import { useEffect, useState } from "react";
import { Modal, Tabs, message } from "antd";
import {
  CollectBatchRecord,
  CollectRecordPreview,
  CollectionWorkspaceState,
  type CollectSourceType,
  type CollectRecordSource,
} from "../api/collection.api";
import {
  fetchCollectBatchRecords,
  normalizeCollectRecordSource,
  previewCollectedRecord,
  updateCollectRecord,
} from "../api/collection.api";
import { CollectionWorkspaceLeftPanel } from "./CollectionTestingPanel";
import { CollectionWorkspaceRightPanel } from "./CollectionTestingPanel";

interface BatchDetailModalProps {
  open: boolean;
  batch: CollectBatchRecord | null;
  sourceType: CollectSourceType;
  focusRecordId?: number;
  readOnly?: boolean;
  favoritesOnly?: boolean;
  onClose: () => void;
}

export function BatchDetailModal({
  open,
  batch,
  sourceType,
  focusRecordId = 0,
  readOnly = false,
  favoritesOnly = false,
  onClose,
}: BatchDetailModalProps) {
  const [records, setRecords] = useState<CollectRecordPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(0);
  const [activeSource, setActiveSource] = useState<CollectRecordSource>("manual");

  const syncElectronPreview = async (record: CollectRecordPreview | null) => {
    if (!record?.sourceProductId) {
      return;
    }
    try {
      await previewCollectedRecord(record.sourceProductId, sourceType);
    } catch (error) {
      if (error instanceof Error && error.message.includes("采集工作台尚未打开")) {
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

  useEffect(() => {
    if (open) {
      setActiveSource("manual");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !batch?.id) {
      setRecords([]);
      setSelectedRecordId(0);
      return;
    }

    setLoading(true);
    void fetchCollectBatchRecords(batch.id, {
      pageIndex: 1,
      pageSize: 200,
      source: activeSource,
      isFavorite: favoritesOnly ? 1 : undefined,
    })
      .then((result) => {
        const rawItems = Array.isArray(result.data) ? result.data : [];
        const normalizedItems = rawItems.map((item) =>
          Object.assign(new CollectRecordPreview(), item, { source: normalizeCollectRecordSource(item.source) }),
        );
        const items = focusRecordId > 0 ? normalizedItems.filter((item) => item.id === focusRecordId) : normalizedItems;
        setRecords(items);
        setSelectedRecordId(items.find((item) => item.id === focusRecordId)?.id || items[0]?.id || 0);
      })
      .catch((error) => {
        message.error(error instanceof Error ? error.message : "加载采集记录失败");
      })
      .finally(() => setLoading(false));
  }, [open, batch?.id, focusRecordId, activeSource, favoritesOnly]);

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
        title={batch ? `采集详情 · ${batch.name}` : "采集详情"}
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
            { key: "manual", label: "手动采集" },
            { key: "file", label: "文件来源" },
          ]}
          style={{ flex: "0 0 auto", marginBottom: 10 }}
        />
        <CollectionWorkspaceLeftPanel
          workspaceState={workspaceState}
          loading={loading}
          onSelectRecord={setSelectedRecordId}
          readOnly={readOnly}
          onToggleFavorite={readOnly ? undefined : (record) => void handleToggleFavorite(record)}
          onPreviewRecord={(record) => void syncElectronPreview(record)}
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
        />
      </div>
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
