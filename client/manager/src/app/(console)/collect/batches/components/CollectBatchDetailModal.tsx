"use client";

import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { SaveOutlined, ShareAltOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Form, Image, Modal, Pagination, Popconfirm, Segmented, Select, Space, Spin, Switch, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchAppUsers, type AppUserRecord } from "../../../app-user/api/app-user.api";
import {
  convertSourceProductRawDataToTargetData,
  type StandardProductData,
} from "./standard-product.types";
import { PublishTaskDetailDrawer } from "./PublishTaskDetailDrawer";
import {
  fetchPublishTaskDetail,
  fetchPublishTasks,
  type PublishTaskDetailRecord,
  type PublishTaskRecord,
} from "../../../product/publish/api/publish-task.api";
import {
  batchUpdateCollectRecordShare,
  cancelCollectBatchShare,
  fetchCollectBatchShares,
  fetchCollectBatchRecords,
  fetchCollectRecordRawData,
  shareCollectBatch,
  type CollectBatchRecord,
  type CollectShareRecord,
  type CollectRecordRecord,
} from "../api/collect-batch.api";

const { Text } = Typography;

interface CollectBatchDetailModalProps {
  open: boolean;
  batch: CollectBatchRecord | null;
  onClose: () => void;
}

const pageSize = 10;
const taskPageSize = 8;
type PublishStatusFilter = "ALL" | "FAILED" | "SUCCESS";

const publishStatusOptions: Array<{ label: string; value: PublishStatusFilter }> = [
  { label: "全部", value: "ALL" },
  { label: "发布失败", value: "FAILED" },
  { label: "发布成功", value: "SUCCESS" },
];

function normalizePlatform(value: string) {
  const text = value.trim().toLowerCase();
  if (["pdd", "pxx", "pinduoduo"].includes(text)) return "pxx";
  if (["tb", "taobao"].includes(text)) return "tb";
  return "unknown";
}

function getPlatformLabel(value: string) {
  switch (normalizePlatform(value)) {
    case "tb": return "淘宝";
    case "pxx": return "拼多多";
    default: return value.trim() || "未知平台";
  }
}

function statusTag(status: string) {
  const value = status.toUpperCase();
  const color = value === "SUCCESS" ? "green" : value === "FAILED" ? "red" : value === "RUNNING" ? "blue" : "default";
  const labelMap: Record<string, string> = {
    PENDING: "待处理",
    RUNNING: "进行中",
    SUCCESS: "成功",
    FAILED: "失败",
    CANCELLED: "已取消",
    CANCELED: "已取消",
    COLLECTED: "已采集",
    DATA_INCOMPLETE: "数据缺失",
  };
  return <Tag color={color}>{labelMap[value] ?? status}</Tag>;
}

function publishStatusTag(status: string) {
  const value = status.toUpperCase();
  if (value === "SUCCESS") {
    return <Tag color="green">发布成功</Tag>;
  }
  if (value === "FAILED") {
    return <Tag color="red">发布失败</Tag>;
  }
  return null;
}

function buildFallbackProduct(record: CollectRecordRecord | null): StandardProductData | null {
  if (!record) return null;
  return {
    sourceId: record.sourceProductId,
    sourceUrl: record.sourceSnapshotUrl,
    title: record.productName || `商品 ${record.sourceProductId || record.id}`,
    mainImages: [],
    detailImages: [],
    attributes: [],
    skuList: [],
    logistics: {},
  };
}

function ProductDetailPreview({ data, loading }: { data: StandardProductData | null; loading: boolean }) {
  if (loading) {
    return <div className="collect-detail-center-state"><Spin /></div>;
  }
  if (!data) {
    return <div className="collect-detail-center-state"><Empty description="请选择商品" /></div>;
  }

  return (
    <div className="collect-product-detail">
      <div className="collect-product-title">
        <Text type="secondary">{data.sourceId || "-"}</Text>
        <h3>{data.title || "未命名商品"}</h3>
        {data.sourceUrl ? <Text copyable={{ text: data.sourceUrl }}>来源链接</Text> : null}
      </div>

      <section>
        <h4>主图</h4>
        {data.mainImages.length ? (
          <Image.PreviewGroup>
            <div className="collect-image-grid">
              {data.mainImages.slice(0, 8).map((url) => (
                <Image key={url} src={url} alt="商品主图" width={86} height={86} style={{ objectFit: "cover", borderRadius: 6 }} />
              ))}
            </div>
          </Image.PreviewGroup>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无图片" />
        )}
      </section>

      <section>
        <h4>属性</h4>
        {data.attributes.length ? (
          <div className="collect-attribute-grid">
            {data.attributes.slice(0, 24).map((item) => (
              <div key={`${item.name}-${item.value}`} className="collect-attribute-item">
                <Text type="secondary">{item.name}</Text>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无属性" />
        )}
      </section>

      <section>
        <h4>SKU</h4>
        <Table
          size="small"
          rowKey={(record, index) => `${record.skuId || record.spec}-${index}`}
          dataSource={data.skuList.slice(0, 20)}
          pagination={false}
          columns={[
            { title: "规格", dataIndex: "spec", ellipsis: true },
            { title: "价格", dataIndex: "price", width: 90 },
            { title: "库存", dataIndex: "stock", width: 80 },
          ]}
        />
      </section>

      <section>
        <h4>详情图</h4>
        {data.detailImages.length ? (
          <Image.PreviewGroup>
            <div className="collect-detail-images">
              {data.detailImages.slice(0, 20).map((url) => (
                <Image key={url} src={url} alt="商品详情图" width="100%" style={{ borderRadius: 6 }} />
              ))}
            </div>
          </Image.PreviewGroup>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无详情图" />
        )}
      </section>
    </div>
  );
}

export function CollectBatchDetailModal({ open, batch, onClose }: CollectBatchDetailModalProps) {
  const [shareForm] = Form.useForm<{ username: string }>();
  const [records, setRecords] = useState<CollectRecordRecord[]>([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [publishStatusFilter, setPublishStatusFilter] = useState<PublishStatusFilter>("ALL");
  const [selectedRecordIds, setSelectedRecordIds] = useState<Key[]>([]);
  const [shareDrafts, setShareDrafts] = useState<Record<number, boolean>>({});
  const [shareSaving, setShareSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<CollectShareRecord[]>([]);
  const [sharedUsersLoading, setSharedUsersLoading] = useState(false);
  const [cancellingShareId, setCancellingShareId] = useState(0);
  const [userSearching, setUserSearching] = useState(false);
  const [appUserOptions, setAppUserOptions] = useState<Array<{ label: string; value: string; record: AppUserRecord }>>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CollectRecordRecord | null>(null);
  const [productData, setProductData] = useState<StandardProductData | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState("");
  const [tasks, setTasks] = useState<PublishTaskRecord[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskPage, setTaskPage] = useState(1);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PublishTaskRecord | null>(null);
  const [taskDetail, setTaskDetail] = useState<PublishTaskDetailRecord | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);

  const platform = useMemo(() => normalizePlatform(String(batch?.shopPlatform || "")), [batch?.shopPlatform]);
  const platformLabel = useMemo(() => getPlatformLabel(String(batch?.shopPlatform || "")), [batch?.shopPlatform]);

  const loadBatchShares = async () => {
    if (!batch?.id) {
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

  useEffect(() => {
    if (!open || !batch?.id) {
      setRecords([]);
      setSelectedRecord(null);
      setSharedUsers([]);
      return;
    }
    setRecordsLoading(true);
    void fetchCollectBatchRecords(batch.id, {
      pageIndex: recordPage,
      pageSize,
      publishStatus: publishStatusFilter === "ALL" ? undefined : publishStatusFilter,
    })
      .then((result) => {
        setRecords(result.data);
        setRecordTotal(result.total);
        setSelectedRecordIds([]);
        setShareDrafts({});
        setSelectedRecord((current) => {
          if (current && result.data.some((item) => item.id === current.id)) return current;
          return result.data[0] ?? null;
        });
      })
      .catch((error) => message.error(error instanceof Error ? error.message : "加载采集明细失败"))
      .finally(() => setRecordsLoading(false));
  }, [open, batch?.id, recordPage, publishStatusFilter]);

  useEffect(() => {
    if (!open || !batch?.id) {
      setSharedUsers([]);
      return;
    }
    void loadBatchShares();
  }, [open, batch?.id]);

  useEffect(() => {
    if (!open || !batch?.id || !selectedRecord?.id) {
      setProductData(null);
      setProductError("");
      return;
    }
    setProductLoading(true);
    setProductError("");
    void fetchCollectRecordRawData(selectedRecord.id, batch.id)
      .then((result) => {
        const raw = result.rawData;
        if (raw && typeof raw === "object") {
          const sourceType = normalizePlatform(result.sourcePlatform || platform) as Parameters<typeof convertSourceProductRawDataToTargetData>[0];
          setProductData(convertSourceProductRawDataToTargetData(sourceType, raw as Record<string, unknown>, {
            productName: selectedRecord.productName,
            sourceProductId: selectedRecord.sourceProductId,
            sourceUrl: selectedRecord.sourceSnapshotUrl,
          }));
        } else {
          setProductData(buildFallbackProduct(selectedRecord));
          setProductError("原始数据为空，已展示采集记录摘要。");
        }
      })
      .catch(() => {
        setProductData(buildFallbackProduct(selectedRecord));
        setProductError("原始商品详情暂不可读取，已展示采集记录摘要。");
      })
      .finally(() => setProductLoading(false));
  }, [open, batch?.id, selectedRecord?.id, platform]);

  useEffect(() => {
    if (!open || !batch?.id || !selectedRecord?.sourceProductId) {
      setTasks([]);
      setTaskTotal(0);
      setTaskDrawerOpen(false);
      setSelectedTask(null);
      setTaskDetail(null);
      return;
    }
    setTasksLoading(true);
    void fetchPublishTasks({
      pageIndex: taskPage,
      pageSize: taskPageSize,
      collectBatchId: batch.id,
      sourceProductId: selectedRecord.sourceProductId,
    })
      .then((result) => {
        setTasks(result.data);
        setTaskTotal(result.total);
      })
      .catch((error) => message.error(error instanceof Error ? error.message : "加载发布历史失败"))
      .finally(() => setTasksLoading(false));
  }, [open, batch?.id, selectedRecord?.sourceProductId, taskPage]);

  useEffect(() => {
    if (open) {
      setRecordPage(1);
      setTaskPage(1);
      setPublishStatusFilter("ALL");
      setSelectedRecordIds([]);
      setShareDrafts({});
    }
  }, [open, batch?.id]);

  useEffect(() => {
    setTaskPage(1);
  }, [selectedRecord?.id]);

  const openTaskDetail = (record: PublishTaskRecord) => {
    setSelectedTask(record);
    setTaskDrawerOpen(true);
    setTaskDetail(null);
    setTaskDetailLoading(true);
    void fetchPublishTaskDetail(record.id)
      .then((result) => setTaskDetail(result))
      .catch((error) => message.error(error instanceof Error ? error.message : "加载发布任务详情失败"))
      .finally(() => setTaskDetailLoading(false));
  };

  const loadAppUsers = async (keyword: string) => {
    const search = keyword.trim();
    setUserSearching(true);
    try {
      const result = await fetchAppUsers({ pageIndex: 1, pageSize: 20, status: "active", search });
      setAppUserOptions(
        result.data.map((user) => ({
          label: user.name ? `${user.name} · ${user.username}` : user.username || `App用户 #${user.id}`,
          value: user.username,
          record: user,
        })),
      );
    } catch {
      setAppUserOptions([]);
    } finally {
      setUserSearching(false);
    }
  };

  const getRecordShareValue = (record: CollectRecordRecord) => {
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
      message.success("分享设置已保存");
      setShareDrafts({});
      setSelectedRecordIds([]);
      setRecords((current) =>
        current.map((record) => {
          const changed = entries.find((item) => item.recordId === record.id);
          return changed ? { ...record, isShared: changed.isShared } : record;
        }),
      );
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
      await shareCollectBatch(batch.id, { username: values.username });
      message.success("分享成功");
      setShareOpen(false);
      shareForm.resetFields();
      await loadBatchShares();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分享失败");
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

  const recordColumns: ColumnsType<CollectRecordRecord> = [
    {
      title: "商品",
      dataIndex: "sourceProductId",
      ellipsis: true,
      render: (_, record) => (
        <div className="collect-record-product-cell">
          <div className="collect-record-product-meta">
            <Tag>{record.source || "-"}</Tag>
            {statusTag(record.status)}
            {publishStatusTag(record.publishStatus)}
          </div>
          <Text copyable={{ text: record.sourceProductId || "" }} className="collect-record-product-id">
            {record.sourceProductId || "-"}
          </Text>
          <Text className="collect-record-product-title">
            {record.productName || "未命名商品"}
          </Text>
        </div>
      ),
    },
    {
      title: "分享",
      dataIndex: "isShared",
      width: 82,
      render: (_, record) => (
        <Switch
          size="small"
          checked={getRecordShareValue(record)}
          checkedChildren="开"
          unCheckedChildren="关"
          onClick={(_, event) => event.stopPropagation()}
          onChange={(checked) => setRecordsShareDraft([record.id], checked)}
        />
      ),
    },
  ];

  const taskColumns: ColumnsType<PublishTaskRecord> = [
    { title: "Task", dataIndex: "id", width: 72, render: (value) => `#${value}` },
    { title: "来源商品ID", dataIndex: "sourceProductId", width: 132, ellipsis: true },
    { title: "状态", dataIndex: "status", width: 88, render: (value) => statusTag(String(value || "")) },
    { title: "步骤", dataIndex: "currentStepCode", width: 116, ellipsis: true },
    { title: "更新时间", dataIndex: "updatedTime", width: 154 },
  ];

  return (
    <Modal
      className="collect-batch-detail-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      width="96vw"
      style={{ top: 16 }}
      title={
        <Space style={{ width: "100%", justifyContent: "space-between", paddingRight: 28 }}>
          <span>{batch ? `选品批次详情 · ${batch.name}` : "选品批次详情"}</span>
          <Button
            type="primary"
            size="small"
            icon={<ShareAltOutlined />}
            disabled={!batch}
            onClick={() => {
              shareForm.resetFields();
              setAppUserOptions([]);
              setShareOpen(true);
            }}
          >
            分享批次
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <div className="collect-batch-detail-layout">
        <aside className="collect-batch-detail-left">
          <div className="collect-detail-panel-head">
            <div className="collect-detail-panel-title">采集明细</div>
            <Tag color={platform === "tb" ? "blue" : platform === "pxx" ? "orange" : "default"}>
              所属平台：{platformLabel}
            </Tag>
          </div>
          <div className="collect-publish-rate-box">
            <div>
              <Text type="secondary">发布成功率</Text>
              <strong>{batch?.publishSuccessRate || "0%"}</strong>
            </div>
            <Space size={6}>
              <Tag color="green">成功 {batch?.publishSuccessCount ?? 0}</Tag>
              <Tag color="red">失败 {batch?.publishFailedCount ?? 0}</Tag>
            </Space>
          </div>
          <Segmented
            block
            size="small"
            value={publishStatusFilter}
            options={publishStatusOptions}
            onChange={(value) => {
              setPublishStatusFilter(value as PublishStatusFilter);
              setRecordPage(1);
            }}
          />
          <Space size={6} wrap className="collect-share-toolbar">
            <Button
              size="small"
              onClick={() => setRecordsShareDraft(selectedRecordIds.map(Number), true)}
              disabled={selectedRecordIds.length === 0}
            >
              批量分享
            </Button>
            <Button
              size="small"
              onClick={() => setRecordsShareDraft(selectedRecordIds.map(Number), false)}
              disabled={selectedRecordIds.length === 0}
            >
              批量关闭
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
          <div className="collect-detail-table-scroll">
            <Table
              size="small"
              rowKey="id"
              loading={recordsLoading}
              columns={recordColumns}
              dataSource={records}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedRecordIds,
                onChange: setSelectedRecordIds,
              }}
              onRow={(record) => ({
                onClick: () => setSelectedRecord(record),
                className: selectedRecord?.id === record.id ? "collect-record-row-selected" : "",
              })}
            />
          </div>
          <Pagination
            size="small"
            current={recordPage}
            pageSize={pageSize}
            total={recordTotal}
            showSizeChanger={false}
            onChange={setRecordPage}
          />
        </aside>

        <main className="collect-batch-detail-center">
          {productError ? <Alert type="warning" showIcon message={productError} style={{ marginBottom: 10 }} /> : null}
          <ProductDetailPreview data={productData} loading={productLoading} />
        </main>

        <aside className="collect-batch-detail-right">
          <div className="collect-shared-users-card">
            <div className="collect-detail-panel-head">
              <div className="collect-detail-panel-title">已分享用户</div>
              <Tag>{sharedUsers.length}</Tag>
            </div>
            {sharedUsersLoading ? (
              <div className="collect-shared-users-empty"><Spin size="small" /></div>
            ) : sharedUsers.length === 0 ? (
              <div className="collect-shared-users-empty">暂未分享给其他用户</div>
            ) : (
              <div className="collect-shared-users-list">
                {sharedUsers.map((item) => (
                  <div key={item.id} className="collect-shared-user-item">
                    <div>
                      <strong>{item.shareUsername || `用户 #${item.shareUserId}`}</strong>
                      <Text type="secondary">ID: {item.shareUserId}</Text>
                    </div>
                    <Popconfirm
                      title="确认取消该用户的分享吗？"
                      okText="取消分享"
                      cancelText="保留"
                      onConfirm={() => void handleCancelShare(item)}
                    >
                      <Button danger size="small" loading={cancellingShareId === item.id}>
                        取消
                      </Button>
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="collect-detail-panel-title">发布任务历史</div>
          <Table
            size="small"
            rowKey="id"
            loading={tasksLoading}
            columns={taskColumns}
            dataSource={tasks}
            pagination={false}
            onRow={(record) => ({
              onClick: () => openTaskDetail(record),
              className: "collect-task-row-clickable",
            })}
          />
          <Pagination
            size="small"
            current={taskPage}
            pageSize={taskPageSize}
            total={taskTotal}
            showSizeChanger={false}
            onChange={setTaskPage}
          />
        </aside>
      </div>
      <PublishTaskDetailDrawer
        open={taskDrawerOpen}
        loading={taskDetailLoading}
        task={selectedTask}
        detail={taskDetail}
        onClose={() => {
          setTaskDrawerOpen(false);
          setSelectedTask(null);
          setTaskDetail(null);
        }}
      />
      <Modal
        className="manager-form-skin"
        title="分享选品批次"
        open={shareOpen}
        okText="分享"
        cancelText="取消"
        confirmLoading={shareSubmitting}
        destroyOnClose
        width={560}
        onCancel={() => {
          setShareOpen(false);
          shareForm.resetFields();
        }}
        onOk={() => void handleShareSubmit()}
      >
        <Form form={shareForm} layout="vertical" preserve={false} style={{ marginTop: 16 }}>
          <Form.Item label="批次" style={{ marginBottom: 12 }}>
            <Typography.Text strong>{batch?.name || (batch ? `选品批次 #${batch.id}` : "-")}</Typography.Text>
          </Form.Item>
          <Form.Item
            name="username"
            label="分享给"
            rules={[{ required: true, message: "请搜索并选择分享用户" }]}
          >
            <Select
              showSearch
              filterOption={false}
              placeholder="输入用户名、姓名、邮箱或手机号搜索"
              loading={userSearching}
              onSearch={(value) => void loadAppUsers(value)}
              onFocus={() => void loadAppUsers("")}
              options={appUserOptions.map((option) => ({
                label: option.label,
                value: option.value,
                disabled: option.record.id === batch?.appUserId,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <style jsx global>{`
        .collect-batch-detail-modal .ant-modal-content {
          height: calc(100vh - 32px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .collect-batch-detail-modal .ant-modal-body {
          flex: 1;
          min-height: 0;
          padding: 0;
        }
        .collect-batch-detail-layout {
          display: grid;
          grid-template-columns: 360px minmax(420px, 1fr) 420px;
          height: 100%;
          min-height: 0;
          background: #f5f7fb;
        }
        .collect-batch-detail-left,
        .collect-batch-detail-right {
          min-width: 0;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          border-right: 1px solid #e5e9f0;
          background: #fff;
        }
        .collect-batch-detail-right {
          border-right: none;
          border-left: 1px solid #e5e9f0;
        }
        .collect-batch-detail-center {
          min-width: 0;
          overflow: auto;
          padding: 14px;
        }
        .collect-detail-panel-title {
          font-size: 13px;
          font-weight: 700;
          color: #1f2937;
        }
        .collect-detail-panel-head {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .collect-detail-panel-head .ant-tag {
          margin-inline-end: 0;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .collect-detail-table-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          scrollbar-gutter: stable;
        }
        .collect-share-toolbar {
          flex: 0 0 auto;
        }
        .collect-publish-rate-box {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid #e6ebf2;
          border-radius: 8px;
          background: #f8fbff;
        }
        .collect-publish-rate-box > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .collect-publish-rate-box strong {
          color: #1f2937;
          font-size: 20px;
          line-height: 1.1;
        }
        .collect-record-row-selected > td {
          background: #eaf2ff !important;
        }
        .collect-record-product-cell {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .collect-record-product-meta {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        .collect-record-product-meta .ant-tag {
          margin-inline-end: 0;
          font-size: 11px;
          line-height: 18px;
        }
        .collect-record-product-id {
          color: #1f2937;
          font-size: 12px;
          line-height: 1.35;
        }
        .collect-record-product-title {
          color: #6b7280;
          font-size: 12px;
          line-height: 1.35;
        }
        .collect-record-product-id,
        .collect-record-product-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .collect-task-row-clickable {
          cursor: pointer;
        }
        .collect-task-row-clickable:hover > td {
          background: #f3f7ff !important;
        }
        .collect-product-detail {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .collect-product-title,
        .collect-product-detail section {
          background: #fff;
          border: 1px solid #e6ebf2;
          border-radius: 8px;
          padding: 14px;
        }
        .collect-product-title h3 {
          margin: 6px 0;
          font-size: 18px;
          line-height: 1.45;
        }
        .collect-product-detail h4 {
          margin: 0 0 10px;
          font-size: 14px;
        }
        .collect-image-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .collect-attribute-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 8px;
        }
        .collect-attribute-item {
          min-width: 0;
          border: 1px solid #edf1f6;
          border-radius: 6px;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .collect-attribute-item span {
          overflow-wrap: anywhere;
        }
        .collect-detail-images {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }
        .collect-detail-center-state {
          min-height: 360px;
          display: grid;
          place-items: center;
        }
        .collect-shared-users-card {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px;
          border: 1px solid #e6ebf2;
          border-radius: 8px;
          background: #f8fbff;
        }
        .collect-shared-users-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 168px;
          overflow: auto;
          scrollbar-gutter: stable;
        }
        .collect-shared-user-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px;
          border: 1px solid #edf1f6;
          border-radius: 6px;
          background: #fff;
        }
        .collect-shared-user-item > div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .collect-shared-user-item strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #1f2937;
        }
        .collect-shared-users-empty {
          min-height: 44px;
          display: grid;
          place-items: center;
          color: #8b95a5;
          font-size: 12px;
        }
        @media (max-width: 1200px) {
          .collect-batch-detail-layout {
            grid-template-columns: 320px minmax(360px, 1fr) 360px;
          }
        }
      `}</style>
    </Modal>
  );
}
