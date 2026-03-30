"use client";

import type { UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HomeOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, Modal, Select, Space, Spin, Tag, message } from "antd";
import type { CollectBatchRecord, CollectRecordDetailRecord } from "../api/collection.api";
import {
  fetchCollectBatchRecords,
  fetchCollectBatchTestingOptions,
  navigateCollectionWorkspace,
  updateCollectRecord,
} from "../api/collection.api";

type TestingDialog = "batch-list" | "product-detail" | null;

type FeedSource = "server" | "injected";

interface FeedRecord extends CollectRecordDetailRecord {
  source: FeedSource;
  clientKey: string;
}

interface InjectedCollectTestingItem {
  id?: number;
  appUserId?: number;
  collectBatchId?: number;
  productId?: number;
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
};

const DEFAULT_PAGE_SIZE = 12;

function normalizeInjectedItems(items: InjectedCollectTestingItem[], fallbackBatchId: number) {
  const now = Date.now();
  return items.map<FeedRecord>((item, index) => ({
    id: Number(item.id || 0),
    appUserId: Number(item.appUserId || 0),
    collectBatchId: Number(item.collectBatchId || fallbackBatchId || 0),
    productId: Number(item.productId || 0),
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

export function CollectionTestingPanel() {
  const [activeDialog, setActiveDialog] = useState<TestingDialog>(null);
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

  useEffect(() => {
    selectedBatchIdRef.current = selectedBatchId;
  }, [selectedBatchId]);

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

  const handleWorkspaceNavigation = async (action: "back" | "forward" | "home") => {
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
          <Button type="primary" onClick={() => setActiveDialog("batch-list")}>
            采集批次列表按钮
          </Button>
          <Button onClick={() => setActiveDialog("product-detail")}>
            商品详情按钮
          </Button>
          <Button
            icon={<LeftOutlined />}
            loading={navigatingAction === "back"}
            onClick={() => void handleWorkspaceNavigation("back")}
          >
            后退
          </Button>
          <Button
            icon={<RightOutlined />}
            loading={navigatingAction === "forward"}
            onClick={() => void handleWorkspaceNavigation("forward")}
          >
            前进
          </Button>
          <Button
            icon={<HomeOutlined />}
            loading={navigatingAction === "home"}
            onClick={() => void handleWorkspaceNavigation("home")}
          >
            首页
          </Button>
        </Space>
      </div>

      <Modal
        title="采集批次列表"
        open={activeDialog === "batch-list"}
        onCancel={() => setActiveDialog(null)}
        footer={null}
        width={980}
        destroyOnClose={false}
      >
        <div style={{ marginTop: 8 }}>
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
              手动注入 {filteredInjectedRecords.length} 条 / 服务端 {serverTotal} 条
            </Tag>
          </div>

          <div
            onScroll={(event) => void handleScroll(event)}
            style={{
              maxHeight: 520,
              overflowY: "auto",
              paddingRight: 6,
              display: "grid",
              gap: 12,
            }}
          >
            {mergedRecords.map((record) => (
              <div
                key={record.clientKey}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: 16,
                  borderRadius: 18,
                  border: "1px solid rgba(170,192,238,0.22)",
                  background:
                    record.source === "injected"
                      ? "linear-gradient(135deg, rgba(255, 244, 204, 0.55), rgba(255,255,255,0.94))"
                      : "linear-gradient(135deg, rgba(170,192,238,0.16), rgba(255,255,255,0.94))",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--manager-text)", fontSize: 16 }}>{record.productName || `商品 #${record.productId || record.id}`}</strong>
                    <Tag color={record.source === "injected" ? "gold" : "blue"}>{record.source === "injected" ? "Playwright注入" : "服务端分页"}</Tag>
                    <Tag>{record.status || "PENDING"}</Tag>
                  </div>
                  <div style={{ marginTop: 8, color: "var(--manager-text-faint)" }}>
                    商品ID：{record.productId || "-"}　来源商品ID：{record.sourceProductId || "-"}
                  </div>
                  <div style={{ marginTop: 6, color: "var(--manager-text-faint)" }}>
                    批次ID：{record.collectBatchId || "-"}　快照：{record.sourceSnapshotUrl || "暂无"}
                  </div>
                </div>

                <Button
                  type="text"
                  loading={Boolean(togglingKeys[record.clientKey])}
                  icon={
                    record.isFavorite ? (
                      <StarFilled style={{ color: "#f5a623", fontSize: 18 }} />
                    ) : (
                      <StarOutlined style={{ color: "var(--manager-text-faint)", fontSize: 18 }} />
                    )
                  }
                  onClick={() => void handleToggleFavorite(record)}
                />
              </div>
            ))}

            {!loading && mergedRecords.length === 0 ? <Empty description="当前批次下还没有采集商品" /> : null}

            {loading ? (
              <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
                <Spin />
              </div>
            ) : null}

            {loadingMore ? (
              <div style={{ display: "grid", placeItems: "center", padding: 18, color: "var(--manager-text-faint)" }}>
                正在加载更多...
              </div>
            ) : null}

            {!loading && !loadingMore && hasMore ? (
              <div style={{ textAlign: "center", padding: "4px 0 12px", color: "var(--manager-text-faint)" }}>
                下拉继续加载更多
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        title="商品详情"
        open={activeDialog === "product-detail"}
        onCancel={() => setActiveDialog(null)}
        footer={null}
        width={720}
      >
        <div
          style={{
            minHeight: 280,
            borderRadius: 20,
            border: "1px dashed rgba(170,192,238,0.35)",
            background: "linear-gradient(135deg, rgba(170,192,238,0.12), rgba(255,255,255,0.92))",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            color: "var(--manager-text-soft)",
            padding: 24,
          }}
        >
          <div>
            <div className="manager-section-label">商品详情测试页</div>
            <h3 style={{ margin: "10px 0 8px", color: "var(--manager-text)" }}>TODO</h3>
            <div>这里先保留占位，后续你需要真实商品采集详情时，我们再把明细内容补进去。</div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
