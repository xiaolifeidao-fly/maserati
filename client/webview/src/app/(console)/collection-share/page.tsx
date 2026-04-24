"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShareAltOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  cancelCollectShare,
  fetchMyCollectShares,
  fetchSharedCollectBatches,
  normalizeCollectSourceType,
  shareCollectBatch,
  type CollectBatchRecord,
  type CollectShareRecord,
  type SharedCollectBatchRecord,
} from "../collection/api/collection.api";
import { BatchDetailModal } from "../collection/components/BatchDetailModal";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { formatDateTime } from "@/utils/format";
import { getPublishWindowApi } from "@/utils/publish-window";

interface ShareFormValues {
  username: string;
}

type ShareTabKey = "to-me" | "mine";

function shareStatusTag(status: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") {
    return <Tag color="green">分享中</Tag>;
  }
  if (normalized === "CANCELLED") {
    return <Tag color="default">已取消</Tag>;
  }
  return <Tag color="blue">{status || "-"}</Tag>;
}

export default function CollectionSharePage() {
  const [shareForm] = Form.useForm<ShareFormValues>();
  const [activeTab, setActiveTab] = useState<ShareTabKey>("to-me");
  const [keyword, setKeyword] = useState("");
  const [mineStatus, setMineStatus] = useState<string | undefined>();
  const [sharedBatches, setSharedBatches] = useState<SharedCollectBatchRecord[]>([]);
  const [myShares, setMyShares] = useState<CollectShareRecord[]>([]);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [mineTotal, setMineTotal] = useState(0);
  const [sharedPage, setSharedPage] = useState({ pageIndex: 1, pageSize: 10 });
  const [minePage, setMinePage] = useState({ pageIndex: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [detailBatch, setDetailBatch] = useState<CollectBatchRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sharingBatchId, setSharingBatchId] = useState(0);
  const [sharingBatchName, setSharingBatchName] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);

  const loadSharedBatches = async (nextPage = sharedPage, nextKeyword = keyword) => {
    setLoading(true);
    try {
      const result = await fetchSharedCollectBatches({
        pageIndex: nextPage.pageIndex,
        pageSize: nextPage.pageSize,
        keyword: nextKeyword.trim() || undefined,
      });
      setSharedBatches(Array.isArray(result.data) ? result.data : []);
      setSharedTotal(result.total);
      setSharedPage(nextPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载分享给我的批次失败");
    } finally {
      setLoading(false);
    }
  };

  const loadMyShares = async (nextPage = minePage, nextKeyword = keyword, nextStatus = mineStatus) => {
    setLoading(true);
    try {
      const result = await fetchMyCollectShares({
        pageIndex: nextPage.pageIndex,
        pageSize: nextPage.pageSize,
        keyword: nextKeyword.trim() || undefined,
        status: nextStatus,
      });
      setMyShares(Array.isArray(result.data) ? result.data : []);
      setMineTotal(result.total);
      setMinePage(nextPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载我分享的批次失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshActiveTab = async () => {
    if (activeTab === "to-me") {
      await loadSharedBatches({ ...sharedPage, pageIndex: 1 });
      return;
    }
    await loadMyShares({ ...minePage, pageIndex: 1 });
  };

  useEffect(() => {
    void Promise.all([loadSharedBatches(), loadMyShares()]);
  }, []);

  const openBatchDetail = (record: SharedCollectBatchRecord) => {
    setDetailBatch(record);
    setDetailOpen(true);
  };

  const openPublishWindow = (
    record: Pick<CollectBatchRecord, "id" | "shopId" | "platform" | "name" | "status" | "collectedCount">,
    initialView?: "progress",
  ) => {
    void getPublishWindowApi().openPublishWindow({
      batchId: record.id,
      batch: {
        id: record.id,
        shopId: record.shopId,
        platform: record.platform,
        name: record.name,
        status: record.status,
        collectedCount: record.collectedCount,
      },
      entryScene: "collection",
      initialView,
    });
  };

  const openShareModal = (batchId: number, batchName: string) => {
    setSharingBatchId(batchId);
    setSharingBatchName(batchName);
    shareForm.resetFields();
    setShareOpen(true);
  };

  const handleShareSubmit = async () => {
    if (sharingBatchId <= 0) {
      return;
    }
    const values = await shareForm.validateFields();
    setShareSubmitting(true);
    try {
      await shareCollectBatch({
        collectBatchId: sharingBatchId,
        username: values.username.trim(),
      });
      message.success("分享成功");
      setShareOpen(false);
      setSharingBatchId(0);
      setSharingBatchName("");
      await loadMyShares();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分享采集批次失败");
    } finally {
      setShareSubmitting(false);
    }
  };

  const handleCancelShare = async (record: CollectShareRecord) => {
    try {
      await cancelCollectShare(record.id);
      message.success("已取消分享");
      await loadMyShares();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "取消分享失败");
    }
  };

  const sharedColumns = useMemo<ColumnsType<SharedCollectBatchRecord>>(
    () => [
      {
        title: "采集批次",
        dataIndex: "name",
        width: 260,
        render: (_, record) => (
          <div>
            <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{record.name}</div>
            <div style={{ marginTop: 4, color: "var(--manager-text-faint)" }}>批次 #{record.id}</div>
          </div>
        ),
      },
      { title: "分享人", dataIndex: "ownerUsername", width: 150 },
      { title: "采集数量", dataIndex: "collectedCount", width: 110 },
      {
        title: "分享状态",
        dataIndex: "shareStatus",
        width: 110,
        render: (value: string) => shareStatusTag(value),
      },
      {
        title: "分享时间",
        dataIndex: "shareCreatedTime",
        width: 180,
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 180,
        render: (_, record) => (
          <Space size={4}>
            <IconOnlyButton type="text" icon={<EyeOutlined />} tooltip="查看详情" onClick={() => openBatchDetail(record)} />
            <IconOnlyButton type="text" icon={<ArrowRightOutlined />} tooltip="去发布" onClick={() => openPublishWindow(record)} />
            <IconOnlyButton type="text" icon={<ClockCircleOutlined />} tooltip="发布进度" onClick={() => openPublishWindow(record, "progress")} />
          </Space>
        ),
      },
    ],
    [],
  );

  const mineColumns = useMemo<ColumnsType<CollectShareRecord>>(
    () => [
      {
        title: "采集批次",
        dataIndex: "batchName",
        width: 260,
        render: (value: string, record) => (
          <div>
            <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{value || `批次 #${record.collectBatchId}`}</div>
            <div style={{ marginTop: 4, color: "var(--manager-text-faint)" }}>批次 #{record.collectBatchId}</div>
          </div>
        ),
      },
      { title: "分享给", dataIndex: "shareUsername", width: 150 },
      {
        title: "分享状态",
        dataIndex: "status",
        width: 110,
        render: (value: string) => shareStatusTag(value),
      },
      {
        title: "创建时间",
        dataIndex: "createdTime",
        width: 180,
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 150,
        render: (_, record) => (
          <Space size={4}>
            <IconOnlyButton
              type="text"
              icon={<ShareAltOutlined />}
              tooltip="再次分享"
              onClick={() => openShareModal(record.collectBatchId, record.batchName || `批次 #${record.collectBatchId}`)}
            />
            <Popconfirm
              title="确认取消这条分享吗？"
              okText="取消分享"
              cancelText="返回"
              disabled={record.status !== "ACTIVE"}
              onConfirm={() => void handleCancelShare(record)}
            >
              <IconOnlyButton
                danger
                type="text"
                icon={<StopOutlined />}
                tooltip={record.status === "ACTIVE" ? "取消分享" : "已取消"}
                disabled={record.status !== "ACTIVE"}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  const tabItems = [
    {
      key: "to-me",
      label: "分享给我的",
      children: (
        <Table<SharedCollectBatchRecord>
          rowKey={(record) => `${record.shareId}-${record.id}`}
          loading={loading && activeTab === "to-me"}
          columns={sharedColumns}
          dataSource={sharedBatches}
          pagination={{
            current: sharedPage.pageIndex,
            pageSize: sharedPage.pageSize,
            total: sharedTotal,
            showSizeChanger: true,
            onChange: (pageIndex, pageSize) => void loadSharedBatches({ pageIndex, pageSize }),
          }}
          scroll={{ x: 980 }}
        />
      ),
    },
    {
      key: "mine",
      label: "我分享的",
      children: (
        <Table<CollectShareRecord>
          rowKey="id"
          loading={loading && activeTab === "mine"}
          columns={mineColumns}
          dataSource={myShares}
          pagination={{
            current: minePage.pageIndex,
            pageSize: minePage.pageSize,
            total: mineTotal,
            showSizeChanger: true,
            onChange: (pageIndex, pageSize) => void loadMyShares({ pageIndex, pageSize }),
          }}
          scroll={{ x: 850 }}
        />
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
              placeholder={activeTab === "to-me" ? "按批次或分享人筛选" : "按批次或用户名筛选"}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => void refreshActiveTab()}
              style={{ width: 260, maxWidth: "100%", height: 44 }}
            />
            {activeTab === "mine" ? (
              <Select
                allowClear
                placeholder="分享状态"
                value={mineStatus}
                onChange={(value) => {
                  setMineStatus(value);
                  void loadMyShares({ ...minePage, pageIndex: 1 }, keyword, value);
                }}
                options={[
                  { label: "分享中", value: "ACTIVE" },
                  { label: "已取消", value: "CANCELLED" },
                ]}
                style={{ width: 160 }}
              />
            ) : null}
            <IconOnlyButton type="primary" icon={<SearchOutlined />} tooltip="查询分享" onClick={() => void refreshActiveTab()} />
            <IconOnlyButton icon={<ReloadOutlined />} tooltip="刷新分享列表" onClick={() => void refreshActiveTab()} />
          </Space>
          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            {activeTab === "to-me" ? `共 ${sharedTotal} 条` : `共 ${mineTotal} 条`}
          </Tag>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as ShareTabKey)} items={tabItems} />
      </section>

      <BatchDetailModal
        open={detailOpen}
        batch={detailBatch}
        sourceType={normalizeCollectSourceType(detailBatch?.platform)}
        onClose={() => setDetailOpen(false)}
      />

      <Modal
        title={sharingBatchName ? `再次分享 · ${sharingBatchName}` : "再次分享"}
        open={shareOpen}
        onCancel={() => {
          setShareOpen(false);
          setSharingBatchId(0);
          setSharingBatchName("");
          shareForm.resetFields();
        }}
        onOk={() => void handleShareSubmit()}
        confirmLoading={shareSubmitting}
        destroyOnClose
      >
        <Form<ShareFormValues> form={shareForm} layout="vertical" preserve={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入要分享给的用户名" }]}>
            <Input placeholder="请输入对方用户名" maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
