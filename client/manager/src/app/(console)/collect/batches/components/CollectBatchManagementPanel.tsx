"use client";

import { useEffect, useMemo, useState } from "react";
import { EyeOutlined } from "@ant-design/icons";
import { Button, Progress, Space, Tooltip, Typography } from "antd";
import { CrudManagementPanel } from "../../../components/CrudManagementPanel";
import type { CrudField, CrudOption, CrudTableColumn } from "../../../components/CrudManagementPanel";
import { fetchShops, type ShopRecord } from "../../../shop/list/api/shop.api";
import { CollectBatchDetailModal } from "./CollectBatchDetailModal";
import {
  createCollectBatch,
  deleteCollectBatch,
  fetchCollectBatches,
  updateCollectBatch,
  type CollectBatchPayload,
  type CollectBatchRecord,
} from "../api/collect-batch.api";

const { Text } = Typography;

function buildCollectAccountLabel(shop: ShopRecord) {
  const displayName = shop.name || shop.nickname || shop.remark || shop.code || `账号 #${shop.id}`;
  const platform = shop.platform ? ` · ${shop.platform}` : "";
  return `${displayName}${platform}`;
}

function renderCollectCount(value: unknown) {
  const count = Number(value || 0);
  const percent = Math.max(0, Math.min(100, Math.round((count / 200) * 100)));

  return (
    <div className="collect-batch-count">
      <strong>{count.toLocaleString("zh-CN")}</strong>
      <Progress percent={percent} showInfo={false} size="small" strokeColor="var(--manager-primary)" />
    </div>
  );
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");
}

export function CollectBatchManagementPanel() {
  const [collectAccountOptions, setCollectAccountOptions] = useState<CrudOption[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBatch, setDetailBatch] = useState<CollectBatchRecord | null>(null);

  useEffect(() => {
    let ignore = false;

    void fetchShops({ pageIndex: 1, pageSize: 200, shopUsage: "COLLECT" })
      .then((shopResult) => {
        if (ignore) {
          return;
        }
        setCollectAccountOptions(
          shopResult.data.map((shop) => ({
            label: buildCollectAccountLabel(shop),
            value: shop.id,
          })),
        );
      })
      .catch(() => {
        if (!ignore) {
          setCollectAccountOptions([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const collectAccountLabelMap = useMemo(
    () =>
      new Map(
        collectAccountOptions.map((option) => [
          Number(option.value),
          String(option.label),
        ]),
      ),
    [collectAccountOptions],
  );

  const fields = useMemo<CrudField<CollectBatchRecord>[]>(
    () => [
      { name: "appUserId", label: "App用户ID", type: "number", required: true, min: 1, precision: 0 },
      {
        name: "shopId",
        label: "选品账号",
        type: "select",
        required: true,
        placeholder: "请选择选品账号",
        options: collectAccountOptions,
      },
      { name: "name", label: "批次名称", required: true },
      { name: "collectedCount", label: "选品数量", type: "number", min: 0, precision: 0 },
    ],
    [collectAccountOptions],
  );

  const columns = useMemo<CrudTableColumn<CollectBatchRecord>[]>(
    () => [
      {
        name: "name",
        label: "批次名称",
        width: 260,
        render: (value, record) => (
          <div className="collect-batch-title">
            <strong>{String(value || `选品批次 #${record.id}`)}</strong>
            <Text>Batch #{record.id}</Text>
          </div>
        ),
      },
      {
        name: "appUserName",
        label: "App用户",
        width: 180,
        render: (value, record) => (
          <Space direction="vertical" size={2}>
            <strong>{String(value || record.appUsername || `用户 #${record.appUserId}`)}</strong>
            {record.appUsername ? <Text>{record.appUsername}</Text> : null}
          </Space>
        ),
      },
      {
        name: "shopId",
        label: "选品账号",
        width: 280,
        render: (value, record) => {
          const label =
            record.shopNickname ||
            record.shopName ||
            collectAccountLabelMap.get(Number(value)) ||
            `账号 #${Number(value) || "-"}`;
          const [name, ...meta] = label.split(" · ");

          return (
            <Space direction="vertical" size={2} className="collect-account-cell">
              <strong>{name}</strong>
              <Text>{record.shopPlatform || meta.join(" · ") || "采集账号"}</Text>
            </Space>
          );
        },
      },
      {
        name: "collectedCount",
        label: "选品数量",
        width: 150,
        render: renderCollectCount,
      },
      {
        name: "createdTime",
        label: "创建时间",
        width: 190,
        render: (value) => <Text>{formatDateTime(value)}</Text>,
      },
    ],
    [collectAccountLabelMap],
  );

  return (
    <>
      <CrudManagementPanel<CollectBatchRecord, CollectBatchPayload>
        title="选品批次"
        createText="新增选品批次"
        description="集中管理选品来源和采集资产，面向电商运营团队的日常复盘、排期与发布前准备。"
        tableTitle="批次资产列表"
        tableSubtitle="按批次沉淀选品结果，优先关注高产出的选品集合。"
        searchPlaceholder="批次名称"
        searchParam="name"
        fields={fields}
        columns={columns}
        actionWidth={172}
        rowActions={(record) => (
          <Tooltip title="详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => {
                setDetailBatch(record);
                setDetailOpen(true);
              }}
            />
          </Tooltip>
        )}
        api={{
          list: fetchCollectBatches,
          create: createCollectBatch,
          update: updateCollectBatch,
          remove: deleteCollectBatch,
        }}
      />
      <CollectBatchDetailModal
        open={detailOpen}
        batch={detailBatch}
        onClose={() => {
          setDetailOpen(false);
          setDetailBatch(null);
        }}
      />
    </>
  );
}
