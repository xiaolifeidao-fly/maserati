"use client";

import type { UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HomeOutlined,
  ReloadOutlined,
  SearchOutlined,
  HeartFilled,
  HeartOutlined,
  EyeOutlined,
  LeftOutlined,
  RightOutlined,
  CloseOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, Select, Space, Spin, Tag, Tooltip, message } from "antd";
import {
  type CollectionWorkspaceState,
  type CollectRecordUpdatePayload,
  CollectBatchRecord,
  CollectRecordPreview,
} from "../api/collection.api";
import {
  fetchCollectionWorkspaceState,
  fetchCollectBatch,
  fetchCollectBatchRecords,
  fetchCollectBatchTestingOptions,
  fetchCollectionShopOptions,
  navigateCollectionWorkspace,
  previewCollectionWorkspaceRecord,
  selectCollectionWorkspaceRecord,
  setCollectionWorkspaceRightPanelVisible,
  updateCollectRecord,
  updateWorkspaceRecord,
  getCollectedProductRawData,
  saveStandardProductData,
} from "../api/collection.api";
import { convertRawDataToStandard } from "./standard-product.types";
import { normalizeCollectSourceType, type CollectSourceType } from "../api/collection.api";
import { ProductDetailEditor } from "./ProductDetailEditor";

type FeedSource = "server" | "injected";

interface FeedRecord extends CollectRecordPreview {
  source: FeedSource;
  clientKey: string;
}

interface InjectedCollectTestingItem {
  id?: number;
  appUserId?: number;
  collectBatchId?: number;
  productName?: string;
  sourceProductId?: string;
  sourceSnapshotUrl?: string;
  isFavorite?: boolean;
  status?: string;
}

interface CollectTestingBridge {
  prependCollectBatchItems(items: InjectedCollectTestingItem[]): void;
  replaceCollectBatchItems(items: InjectedCollectTestingItem[]): void;
  clearCollectBatchItems(): void;
}

type CollectTestingWindow = Window & {
  collectTestingBridge?: CollectTestingBridge;
  __COLLECTION_WORKSPACE_UPDATE__?: (nextState: CollectionWorkspaceState) => void;
};

const DEFAULT_PAGE_SIZE = 12;

function createEmptyWorkspaceState(): CollectionWorkspaceState {
  return {
    batch: new CollectBatchRecord(),
    records: [],
    selectedRecordId: 0,
    sourceType: "unknown",
  };
}

function normalizeInjectedItems(items: InjectedCollectTestingItem[], fallbackBatchId: number) {
  const now = Date.now();
  return items.map<FeedRecord>((item, index) => ({
    id: Number(item.id || 0),
    appUserId: Number(item.appUserId || 0),
    collectBatchId: Number(item.collectBatchId || fallbackBatchId || 0),
    productName: String(item.productName || "").trim() || `临时商品 ${now}-${index + 1}`,
    sourceProductId: String(item.sourceProductId || "").trim(),
    sourceSnapshotUrl: String(item.sourceSnapshotUrl || "").trim(),
    isFavorite: Boolean(item.isFavorite),
    status: String(item.status || "INJECTED").trim() || "INJECTED",
    active: 1,
    createdTime: undefined,
    updatedTime: undefined,
    source: "injected",
    clientKey: `injected-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  }));
}

function getStatusColor(status: string) {
  switch (status?.toUpperCase()) {
    case "COLLECTED": return "#10b981";
    case "SUCCESS": return "#10b981";
    case "RUNNING": return "#3b82f6";
    case "PENDING": return "#f59e0b";
    case "FAILED": return "#ef4444";
    case "MATCHED": return "#8b5cf6";
    case "LOADING": return "#94a3b8";
    default: return "#94a3b8";
  }
}

function getStatusLabel(status: string) {
  switch (status?.toUpperCase()) {
    case "COLLECTED": return "已采集";
    case "SUCCESS": return "成功";
    case "RUNNING": return "采集中";
    case "PENDING": return "待处理";
    case "FAILED": return "失败";
    case "MATCHED": return "已匹配";
    case "LOADING": return "保存中";
    default: return status || "未知";
  }
}

async function loadBatchWorkspaceState(batchId: number): Promise<CollectionWorkspaceState> {
  const [batch, recordsResult, shopsResult] = await Promise.all([
    fetchCollectBatch(batchId),
    fetchCollectBatchRecords(batchId, { pageIndex: 1, pageSize: 200 }),
    fetchCollectionShopOptions(),
  ]);
  const records = Array.isArray(recordsResult.data) ? recordsResult.data : [];
  const shops = Array.isArray(shopsResult.data) ? shopsResult.data : [];
  const sourceType = normalizeCollectSourceType(shops.find((item) => item.id === batch.shopId)?.platform);
  return {
    batch,
    records,
    selectedRecordId: records[0]?.id || 0,
    sourceType,
  };
}

function hasWorkspacePayload(state: CollectionWorkspaceState | null | undefined) {
  return Boolean(state && (state.batch?.id || state.records?.length));
}

function useCollectionWorkspaceState({ enabled = true, fallbackBatchId = 0 } = {}) {
  const [workspaceState, setWorkspaceState] = useState<CollectionWorkspaceState>(createEmptyWorkspaceState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const collectionWindow = window as CollectTestingWindow;
    const handleWorkspaceUpdate = (nextState: CollectionWorkspaceState) => {
      setWorkspaceState({
        batch: nextState.batch || new CollectBatchRecord(),
        records: Array.isArray(nextState.records) ? nextState.records : [],
        selectedRecordId: Number(nextState.selectedRecordId || nextState.records?.[0]?.id || 0),
        sourceType: nextState.sourceType || "unknown",
      });
      setLoading(false);
    };

    collectionWindow.__COLLECTION_WORKSPACE_UPDATE__ = handleWorkspaceUpdate;

    void (async () => {
      try {
        const nextState = await fetchCollectionWorkspaceState();
        if (hasWorkspacePayload(nextState)) {
          handleWorkspaceUpdate(nextState);
          return;
        }
        if (fallbackBatchId > 0) {
          handleWorkspaceUpdate(await loadBatchWorkspaceState(fallbackBatchId));
          return;
        }
        handleWorkspaceUpdate(nextState);
      } catch (error) {
        if (fallbackBatchId > 0) {
          try {
            handleWorkspaceUpdate(await loadBatchWorkspaceState(fallbackBatchId));
            return;
          } catch (fallbackError) {
            setLoading(false);
            message.error(fallbackError instanceof Error ? fallbackError.message : "采集工作台状态加载失败");
            return;
          }
        }
        setLoading(false);
        message.error(error instanceof Error ? error.message : "采集工作台状态加载失败");
      }
    })();

    return () => {
      if (collectionWindow.__COLLECTION_WORKSPACE_UPDATE__ === handleWorkspaceUpdate) {
        delete collectionWindow.__COLLECTION_WORKSPACE_UPDATE__;
      }
    };
  }, [enabled, fallbackBatchId]);

  return { workspaceState, loading };
}

export function CollectionWorkspaceLeftPanel({
  workspaceState: propState,
  loading: propLoading,
  onSelectRecord: propOnSelectRecord,
  onToggleFavorite: propOnToggleFavorite,
  onPreviewRecord: propOnPreviewRecord,
  fallbackBatchId,
}: {
  workspaceState?: CollectionWorkspaceState;
  loading?: boolean;
  onSelectRecord?: (recordId: number) => void;
  onToggleFavorite?: (record: CollectRecordPreview) => Promise<void> | void;
  onPreviewRecord?: (record: CollectRecordPreview) => Promise<void> | void;
  fallbackBatchId?: number;
} = {}) {
  const isControlled = propState !== undefined;
  const { workspaceState: hookState, loading: hookLoading } = useCollectionWorkspaceState({
    enabled: !isControlled,
    fallbackBatchId,
  });
  const workspaceState = isControlled ? propState : hookState;
  const loading = propLoading !== undefined ? propLoading : hookLoading;
  const [navigatingAction, setNavigatingAction] = useState<string>("");
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  const handleWorkspaceNavigation = async (action: "back" | "forward" | "home" | "refresh") => {
    setNavigatingAction(action);
    try {
      await navigateCollectionWorkspace(action);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "采集工作台导航失败");
    } finally {
      setNavigatingAction("");
    }
  };

  const handleSelectRecord = async (recordId: number) => {
    const targetRecord = workspaceState.records.find((item) => item.id === recordId);
    if (propOnSelectRecord) {
      propOnSelectRecord(recordId);
      if (targetRecord && propOnPreviewRecord) {
        await propOnPreviewRecord(targetRecord);
      }
      return;
    }
    try {
      // selectRecord in main process: updates selectedRecordId + loads local HTML snapshot if available
      await selectCollectionWorkspaceRecord(recordId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "切换采集商品失败");
    }
  };

  const handlePreviewRecord = async (record: CollectRecordPreview, event: React.MouseEvent) => {
    event.stopPropagation();
    if (record.isLoading) return;
    if (propOnSelectRecord) {
      propOnSelectRecord(record.id);
      if (propOnPreviewRecord) {
        await propOnPreviewRecord(record);
      }
      return;
    }
    try {
      await previewCollectionWorkspaceRecord(record.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开商品详情失败");
    }
  };

  const handleToggleFavorite = async (record: CollectRecordPreview, event: React.MouseEvent) => {
    event.stopPropagation();
    if (record.isLoading || togglingIds.has(record.id)) return;
    if (propOnToggleFavorite) {
      await propOnToggleFavorite(record);
      return;
    }
    setTogglingIds((prev) => new Set(prev).add(record.id));
    try {
      await updateWorkspaceRecord(record.id, { isFavorite: !record.isFavorite });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "收藏状态更新失败");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const records = workspaceState.records;
  const favoriteCount = records.filter((record) => record.isFavorite).length;

  return (
    <section
      style={{
        flex: "0 0 auto",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          borderRadius: 16,
          padding: "14px 16px",
          marginBottom: 10,
          background: "linear-gradient(135deg, rgba(241,247,255,0.98) 0%, rgba(228,238,252,0.98) 100%)",
          border: "1px solid rgba(128,164,214,0.18)",
          boxShadow: "0 12px 28px rgba(57,97,145,0.08)",
          color: "#1a3552",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.72, textTransform: "uppercase", marginBottom: 4 }}>
          采集批次
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, marginBottom: 2 }}>
          {workspaceState.batch?.name || `批次 #${workspaceState.batch?.id || 0}`}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>
          ID: {workspaceState.batch?.id || 0} · 已加载 {records.length} 件商品
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.82)",
              border: "1px solid rgba(128,164,214,0.18)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            已关注 {favoriteCount}
          </div>
          <div
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              background: "rgba(216,161,47,0.12)",
              border: "1px solid rgba(216,161,47,0.22)",
              color: "#8a6a1d",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            占比 {records.length > 0 ? `${Math.round((favoriteCount / records.length) * 100)}%` : "0%"}
          </div>
        </div>
      </div>

      {/* Navigation - only shown in Electron workspace context */}
      {!isControlled && <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          padding: "10px 12px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(226,232,240,0.8)",
          boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
        }}
      >
        {(["back", "forward", "home", "refresh"] as const).map((action) => {
          const icons = {
            back: <LeftOutlined />,
            forward: <RightOutlined />,
            home: <HomeOutlined />,
            refresh: <ReloadOutlined />,
          };
          const labels = { back: "后退", forward: "前进", home: "首页", refresh: "刷新" };
          return (
            <button
              key={action}
              type="button"
              disabled={navigatingAction !== ""}
              onClick={() => void handleWorkspaceNavigation(action)}
              style={{
                flex: 1,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRadius: 8,
                border: "1px solid rgba(226,232,240,0.9)",
                background: navigatingAction === action ? "#2f6fec" : "rgba(248,250,252,0.9)",
                color: navigatingAction === action ? "#fff" : "#475569",
                fontSize: 12,
                fontWeight: 500,
                cursor: navigatingAction !== "" ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                opacity: navigatingAction !== "" && navigatingAction !== action ? 0.5 : 1,
              }}
            >
              {navigatingAction === action ? <Spin size="small" /> : icons[action]}
              <span style={{ display: "none" }}>{labels[action]}</span>
            </button>
          );
        })}
      </div>}

      {/* List Header */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", letterSpacing: 0.5 }}>
          采集列表
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>点击商品查看详情</div>
      </div>

      {/* Records */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowX: "hidden",
          overflowY: "auto",
          display: "grid",
          gap: 8,
          alignContent: "start",
          paddingRight: 4,
          scrollbarGutter: "stable",
        }}
      >
        {loading && (
          <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}>
            <Spin />
          </div>
        )}

        {!loading && records.length === 0 && (
          <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}>
            <Empty description={<span style={{ color: "#94a3b8", fontSize: 13 }}>暂无采集商品</span>} />
          </div>
        )}

        {!loading &&
          records.map((record) => {
            const isSelected = record.id === workspaceState.selectedRecordId;
            const isLoadingRecord = record.isLoading === true;
            const isToggling = togglingIds.has(record.id);

            return (
              <button
                key={record.id || record.sourceProductId}
                type="button"
                onClick={() => !isLoadingRecord && void handleSelectRecord(record.id)}
                style={{
                  width: "100%",
                  height: 90,
                  textAlign: "left",
                  cursor: isLoadingRecord ? "default" : "pointer",
                  borderRadius: 12,
                  padding: "8px 80px 8px 12px",
                  border: isSelected
                    ? "1.5px solid rgba(59,130,246,0.7)"
                    : "1px solid rgba(226,232,240,0.7)",
                  background: isLoadingRecord
                    ? "linear-gradient(135deg, rgba(241,245,249,0.95), rgba(255,255,255,0.9))"
                    : isSelected
                    ? "linear-gradient(135deg, rgba(219,234,254,0.9), rgba(255,255,255,0.97))"
                    : "rgba(255,255,255,0.92)",
                  boxShadow: isSelected
                    ? "0 2px 12px rgba(59,130,246,0.12)"
                    : "0 1px 4px rgba(15,23,42,0.05)",
                  transition: "all 0.15s",
                  position: "relative",
                }}
              >
                {isLoadingRecord && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(90deg, transparent 0%, rgba(148,163,184,0.06) 50%, transparent 100%)",
                      animation: "shimmer 1.5s infinite",
                    }}
                  />
                )}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    gap: 6,
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isLoadingRecord ? "#94a3b8" : "#1e293b",
                        lineHeight: 1.4,
                        marginBottom: 6,
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                        overflow: "hidden",
                      }}
                      title={record.productName || `商品 #${record.id}`}
                    >
                      {isLoadingRecord ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Spin size="small" />
                          <span>{record.productName || "采集中..."}</span>
                        </span>
                      ) : (
                        <Tooltip title={record.productName || `商品 #${record.id}`}>
                          <span
                            style={{
                              display: "-webkit-box",
                              whiteSpace: "normal",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                              WebkitBoxOrient: "vertical",
                              WebkitLineClamp: 2,
                              overflow: "hidden",
                            }}
                          >
                            {record.productName || `商品 #${record.id}`}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {record.sourceProductId && (
                        <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                          #{record.sourceProductId.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {!isLoadingRecord && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        position: "absolute",
                        right: 12,
                        bottom: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => void handleToggleFavorite(record, e)}
                        disabled={isToggling}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          border: "1px solid rgba(226,232,240,0.8)",
                          background: record.isFavorite ? "rgba(255,237,213,0.9)" : "rgba(248,250,252,0.9)",
                          cursor: isToggling ? "default" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          transition: "all 0.15s",
                        }}
                        title={record.isFavorite ? "取消收藏" : "收藏"}
                      >
                        {isToggling ? (
                          <Spin size="small" />
                        ) : record.isFavorite ? (
                          <HeartFilled style={{ color: "#f97316" }} />
                        ) : (
                          <HeartOutlined style={{ color: "#cbd5e1" }} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => void handlePreviewRecord(record, e)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          border: "1px solid rgba(226,232,240,0.8)",
                          background: isSelected ? "rgba(219,234,254,0.9)" : "rgba(248,250,252,0.9)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          transition: "all 0.15s",
                        }}
                        title="查看详情"
                      >
                        <EyeOutlined style={{ color: isSelected ? "#3b82f6" : "#cbd5e1" }} />
                      </button>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </section>
  );
}

export function CollectionWorkspaceRightPanel({
  workspaceState: propState,
  loading: propLoading,
  onToggleFavorite: propOnToggleFavorite,
  fallbackBatchId,
}: {
  workspaceState?: CollectionWorkspaceState;
  loading?: boolean;
  onToggleFavorite?: (record: CollectRecordPreview) => Promise<void> | void;
  fallbackBatchId?: number;
} = {}) {
  const isControlled = propState !== undefined;
  const { workspaceState: hookState, loading: hookLoading } = useCollectionWorkspaceState({
    enabled: !isControlled,
    fallbackBatchId,
  });
  const workspaceState = isControlled ? propState : hookState;
  const loading = propLoading !== undefined ? propLoading : hookLoading;
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [editedData, setEditedData] = useState<import("./standard-product.types").StandardProductData | null>(null);
  const [closingPanel, setClosingPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const isTbWorkspace = workspaceState.sourceType === "tb";

  const selectedRecord = useMemo(() => {
    return workspaceState.records.find((item) => item.id === workspaceState.selectedRecordId) || null;
  }, [workspaceState.records, workspaceState.selectedRecordId]);

  useEffect(() => {
    if (!selectedRecord?.sourceProductId) {
      setRawData(null);
      return;
    }
    setDataLoading(true);
    void getCollectedProductRawData(selectedRecord.sourceProductId, workspaceState.sourceType)
      .then((data) => {
        setRawData(data && typeof data === "object" ? (data as Record<string, unknown>) : null);
      })
      .catch(() => setRawData(null))
      .finally(() => setDataLoading(false));
  }, [selectedRecord?.sourceProductId]);

  // 将 pxx 原始数据转换为标准结构
  const standardData = useMemo(() => {
    if (!rawData) return null;
    return convertRawDataToStandard(workspaceState.sourceType, rawData, {
      productName: selectedRecord?.productName,
      sourceProductId: selectedRecord?.sourceProductId,
      sourceUrl: selectedRecord?.sourceSnapshotUrl,
    });
  }, [rawData, selectedRecord, workspaceState.sourceType]);

  useEffect(() => {
    setEditedData(standardData);
  }, [standardData]);

  const handleToggleFavorite = async () => {
    if (!selectedRecord || selectedRecord.isLoading || togglingFavorite) return;
    if (propOnToggleFavorite) {
      await propOnToggleFavorite(selectedRecord);
      return;
    }
    setTogglingFavorite(true);
    try {
      await updateWorkspaceRecord(selectedRecord.id, { isFavorite: !selectedRecord.isFavorite });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "收藏状态更新失败");
    } finally {
      setTogglingFavorite(false);
    }
  };

  const handleSave = async () => {
    if (!selectedRecord?.sourceProductId || !editedData || saving) return;
    setSaving(true);
    try {
      await saveStandardProductData(selectedRecord.sourceProductId, workspaceState.sourceType, editedData);
      void message.success("商品数据已保存");
    } catch (error) {
      void message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleClosePanel = async () => {
    if (isControlled) {
      return;
    }
    setClosingPanel(true);
    try {
      await setCollectionWorkspaceRightPanelVisible(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "收起详情面板失败");
    } finally {
      setClosingPanel(false);
    }
  };

  return (
    <section
      style={{
        flex: "0 0 auto",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 10,
          background: "linear-gradient(135deg, rgba(241,247,255,0.98) 0%, rgba(228,238,252,0.98) 100%)",
          border: "1px solid rgba(128,164,214,0.18)",
          boxShadow: "0 12px 28px rgba(57,97,145,0.08)",
          color: "#1a3552",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.65, textTransform: "uppercase", marginBottom: 2 }}>
            商品详情编辑
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.9,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={
              selectedRecord
                ? selectedRecord.productName || `商品 #${selectedRecord.id}`
                : "请在左侧列表选择商品"
            }
          >
            {selectedRecord
              ? selectedRecord.productName || `商品 #${selectedRecord.id}`
              : "请在左侧列表选择商品"}
          </div>
        </div>

        {selectedRecord && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {!isControlled && isTbWorkspace && (
              <Button
                size="small"
                onClick={() => void handleClosePanel()}
                loading={closingPanel}
                style={{
                  border: "none",
                  boxShadow: "0 8px 24px rgba(57,97,145,0.12)",
                }}
              >
                <CloseOutlined />
              </Button>
            )}
            <Button
              type="primary"
              size="small"
              onClick={() => void handleSave()}
              loading={saving}
              disabled={dataLoading || !editedData}
              style={{
                border: "none",
                boxShadow: "0 8px 24px rgba(47,111,236,0.14)",
              }}
            >
              保存
            </Button>

            {/* 收藏按钮 */}
            <button
              type="button"
              onClick={() => void handleToggleFavorite()}
              disabled={togglingFavorite || selectedRecord.isLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 16,
                color: selectedRecord.isFavorite ? "#fb923c" : "rgba(255,255,255,0.5)",
                background: "transparent",
                border: "none",
                cursor: togglingFavorite || selectedRecord.isLoading ? "default" : "pointer",
                padding: 0,
                transition: "color 0.15s",
              }}
            >
              {togglingFavorite ? (
                <Spin size="small" />
              ) : selectedRecord.isFavorite ? (
                <HeartFilled />
              ) : (
                <HeartOutlined />
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "grid", placeItems: "center", flex: 1 }}>
          <Spin />
        </div>
      ) : !selectedRecord ? (
        <div style={{ display: "grid", placeItems: "center", flex: 1 }}>
          <div style={{ textAlign: "center" }}>
            <InboxOutlined style={{ fontSize: 36, color: "#cbd5e1", marginBottom: 10 }} />
            <div style={{ color: "#94a3b8", fontSize: 13 }}>暂无选中商品</div>
          </div>
        </div>
      ) : (
        <ProductDetailEditor
          data={editedData}
          loading={dataLoading}
          onChange={setEditedData}
        />
      )}
    </section>
  );
}

export function CollectionTestingPanel() {
  const [batchOptions, setBatchOptions] = useState<CollectBatchRecord[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(0);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [records, setRecords] = useState<FeedRecord[]>([]);
  const [injectedRecords, setInjectedRecords] = useState<FeedRecord[]>([]);
  const [pageIndex, setPageIndex] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [navigatingAction, setNavigatingAction] = useState<string>("");
  const [togglingKeys, setTogglingKeys] = useState<Record<string, boolean>>({});
  const selectedBatchIdRef = useRef(0);

  // 商品详情 Drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<FeedRecord | null>(null);
  const [detailData, setDetailData] = useState<import("./standard-product.types").StandardProductData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSourceType, setDetailSourceType] = useState<CollectSourceType>("pxx");

  const handleViewDetail = async (record: FeedRecord) => {
    setDetailRecord(record);
    setDetailData(null);
    setDetailOpen(true);
    if (!record.sourceProductId) return;
    setDetailLoading(true);
    try {
      const raw = await getCollectedProductRawData(record.sourceProductId, detailSourceType);
      if (raw && typeof raw === "object") {
        setDetailData(
          convertRawDataToStandard(detailSourceType, raw as Record<string, unknown>, {
            productName: record.productName,
            sourceProductId: record.sourceProductId,
            sourceUrl: record.sourceSnapshotUrl,
          })
        );
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "商品数据加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    selectedBatchIdRef.current = selectedBatchId;
  }, [selectedBatchId]);

  useEffect(() => {
    const currentBatch = batchOptions.find((item) => item.id === selectedBatchId);
    if (currentBatch) {
      setDetailSourceType("pxx");
    }
  }, [batchOptions, selectedBatchId]);

  const loadBatchOptions = useCallback(async () => {
    try {
      const result = await fetchCollectBatchTestingOptions();
      const nextOptions = Array.isArray(result.data) ? result.data : [];
      setBatchOptions(nextOptions);
      setSelectedBatchId((current) => {
        if (current > 0 && nextOptions.some((item) => item.id === current)) {
          return current;
        }
        return nextOptions[0]?.id ?? 0;
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "采集批次加载失败");
    }
  }, []);

  const loadRecords = useCallback(
    async (nextPageIndex: number, append: boolean) => {
      if (selectedBatchIdRef.current <= 0) {
        setRecords([]);
        setServerTotal(0);
        setPageIndex(1);
        return;
      }

      const runner = append ? setLoadingMore : setLoading;
      runner(true);
      try {
        const result = await fetchCollectBatchRecords(selectedBatchIdRef.current, {
          pageIndex: nextPageIndex,
          pageSize: DEFAULT_PAGE_SIZE,
          productName: keyword || undefined,
        });
        const nextRecords = (Array.isArray(result.data) ? result.data : []).map<FeedRecord>((item) => ({
          ...item,
          source: "server",
          clientKey: `server-${item.id}`,
        }));
        setRecords((current) => (append ? [...current, ...nextRecords] : nextRecords));
        setPageIndex(nextPageIndex);
        setServerTotal(result.total);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "采集商品加载失败");
      } finally {
        runner(false);
      }
    },
    [keyword],
  );

  useEffect(() => {
    void loadBatchOptions();
  }, [loadBatchOptions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const collectTestingWindow = window as CollectTestingWindow;
    const bridge: CollectTestingBridge = {
      prependCollectBatchItems(items: InjectedCollectTestingItem[]) {
        setInjectedRecords((current) => [
          ...normalizeInjectedItems(items, selectedBatchIdRef.current),
          ...current,
        ]);
      },
      replaceCollectBatchItems(items: InjectedCollectTestingItem[]) {
        setInjectedRecords(normalizeInjectedItems(items, selectedBatchIdRef.current));
      },
      clearCollectBatchItems() {
        setInjectedRecords([]);
      },
    };
    collectTestingWindow.collectTestingBridge = bridge;
    return () => {
      if (collectTestingWindow.collectTestingBridge === bridge) {
        delete collectTestingWindow.collectTestingBridge;
      }
    };
  }, []);

  const filteredInjectedRecords = useMemo(() => {
    return injectedRecords.filter((item) => {
      if (selectedBatchId > 0 && item.collectBatchId > 0 && item.collectBatchId !== selectedBatchId) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return item.productName.toLowerCase().includes(keyword.toLowerCase());
    });
  }, [injectedRecords, keyword, selectedBatchId]);

  const mergedRecords = useMemo(() => [...filteredInjectedRecords, ...records], [filteredInjectedRecords, records]);
  const hasMore = records.length < serverTotal;

  const handleSearch = () => {
    const nextKeyword = keywordInput.trim();
    if (nextKeyword === keyword) {
      void loadRecords(1, false);
      return;
    }
    setKeyword(nextKeyword);
  };

  const handleReset = () => {
    setKeywordInput("");
    setKeyword("");
    void loadRecords(1, false);
  };

  useEffect(() => {
    if (selectedBatchId <= 0) {
      return;
    }
    void loadRecords(1, false);
  }, [keyword, loadRecords, selectedBatchId]);

  const handleScroll = async (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom > 80 || loading || loadingMore || !hasMore) {
      return;
    }
    await loadRecords(pageIndex + 1, true);
  };

  const handleToggleFavorite = async (record: FeedRecord) => {
    const nextFavorite = !record.isFavorite;
    if (record.source === "injected" || record.id <= 0) {
      setInjectedRecords((current) =>
        current.map((item) => (item.clientKey === record.clientKey ? { ...item, isFavorite: nextFavorite } : item)),
      );
      return;
    }

    setTogglingKeys((current) => ({ ...current, [record.clientKey]: true }));
    try {
      const saved = await updateCollectRecord(record.id, { isFavorite: nextFavorite });
      setRecords((current) =>
        current.map((item) =>
          item.clientKey === record.clientKey
            ? { ...item, isFavorite: saved.isFavorite, productName: saved.productName || item.productName }
            : item,
        ),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "收藏状态更新失败");
    } finally {
      setTogglingKeys((current) => {
        const nextState = { ...current };
        delete nextState[record.clientKey];
        return nextState;
      });
    }
  };

  const handleWorkspaceNavigation = async (action: "back" | "forward" | "home" | "refresh") => {
    setNavigatingAction(action);
    try {
      await navigateCollectionWorkspace(action);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "采集工作台导航失败");
    } finally {
      setNavigatingAction("");
    }
  };

  return (
    <section className="manager-data-card">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="manager-section-label">测试入口</div>
          <h3 style={{ margin: "10px 0 6px", color: "var(--manager-text)" }}>采集管理临时测试面板</h3>
          <div className="manager-muted">这块是临时加的，后续你要删时直接移除这个组件即可。</div>
        </div>

        <Space wrap>
          <Button icon={<LeftOutlined />} loading={navigatingAction === "back"} onClick={() => void handleWorkspaceNavigation("back")}>
            后退
          </Button>
          <Button icon={<RightOutlined />} loading={navigatingAction === "forward"} onClick={() => void handleWorkspaceNavigation("forward")}>
            前进
          </Button>
          <Button icon={<HomeOutlined />} loading={navigatingAction === "home"} onClick={() => void handleWorkspaceNavigation("home")}>
            首页
          </Button>
          <Button icon={<ReloadOutlined />} loading={navigatingAction === "refresh"} onClick={() => void handleWorkspaceNavigation("refresh")}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <Select
            placeholder="选择采集批次"
            value={selectedBatchId || undefined}
            onChange={(value) => setSelectedBatchId(Number(value || 0))}
            options={batchOptions.map((item) => ({ label: item.name || `批次 #${item.id}`, value: item.id }))}
            style={{ width: 240 }}
          />
          <Input
            placeholder="按商品名称搜索"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 280, maxWidth: "100%" }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            刷新
          </Button>
          <Tag style={{ marginInlineStart: 0, border: "none", background: "rgba(170,192,238,0.16)", color: "var(--manager-text-soft)" }}>
            注入 {filteredInjectedRecords.length} 条 / 服务端 {serverTotal} 条
          </Tag>
        </div>

        <div
          onScroll={(event) => void handleScroll(event)}
          style={{ maxHeight: 520, overflowY: "auto", paddingRight: 6, display: "grid", gap: 10 }}
        >
          {mergedRecords.map((record) => (
            <div
              key={record.clientKey}
              style={{
                display: "flex",
                flexDirection: "column",
                height: 90,
                gap: 6,
                padding: "8px 82px 8px 14px",
                borderRadius: 14,
                border: "1px solid rgba(226,232,240,0.7)",
                background:
                  record.source === "injected"
                    ? "linear-gradient(135deg, rgba(255,247,237,0.8), rgba(255,255,255,0.95))"
                    : "rgba(255,255,255,0.9)",
                boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                position: "relative",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <strong
                    style={{
                      color: "#0f172a",
                      fontSize: 14,
                      lineHeight: 1.45,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      flex: "1 1 100%",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                    }}
                  >
                    {record.productName || `商品 #${record.id}`}
                  </strong>
                  {record.source === "injected" && (
                    <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>注入</Tag>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  来源ID：{record.sourceProductId || "-"} · 批次：{record.collectBatchId || "-"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  position: "absolute",
                  right: 14,
                  bottom: 8,
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined style={{ fontSize: 16 }} />}
                  onClick={() => void handleViewDetail(record)}
                  title="查看商品详情"
                />
                <Button
                  type="text"
                  size="small"
                  loading={Boolean(togglingKeys[record.clientKey])}
                  icon={
                    record.isFavorite ? (
                      <HeartFilled style={{ color: "#f97316", fontSize: 16 }} />
                    ) : (
                      <HeartOutlined style={{ color: "#cbd5e1", fontSize: 16 }} />
                    )
                  }
                  onClick={() => void handleToggleFavorite(record)}
                />
              </div>
            </div>
          ))}

          {!loading && mergedRecords.length === 0 && (
            <Empty description="当前批次下还没有采集商品" />
          )}

          {loading && (
            <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
              <Spin />
            </div>
          )}

          {loadingMore && (
            <div style={{ textAlign: "center", padding: 16, color: "#94a3b8", fontSize: 13 }}>
              加载更多...
            </div>
          )}

          {!loading && !loadingMore && hasMore && (
            <div style={{ textAlign: "center", padding: "4px 0 12px", color: "#cbd5e1", fontSize: 12 }}>
              下拉继续加载
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function CollectionWorkspaceLeftPanelPage() {
  const fallbackBatchId = typeof window === "undefined"
    ? 0
    : Number(new URLSearchParams(window.location.search).get("batchId") || 0);
  return <CollectionWorkspaceLeftPanel fallbackBatchId={fallbackBatchId} />;
}

export function CollectionWorkspaceRightPanelPage() {
  const fallbackBatchId = typeof window === "undefined"
    ? 0
    : Number(new URLSearchParams(window.location.search).get("batchId") || 0);
  return <CollectionWorkspaceRightPanel fallbackBatchId={fallbackBatchId} />;
}
