"use client";

import { useEffect, useMemo, useState } from "react";
import { CrudManagementPanel } from "../../../components/CrudManagementPanel";
import type { CrudField, CrudOption, CrudTableColumn } from "../../../components/CrudManagementPanel";
import { fetchShops, type ShopRecord } from "../../../shop/list/api/shop.api";
import {
  createCollectBatch,
  deleteCollectBatch,
  fetchCollectBatches,
  updateCollectBatch,
  type CollectBatchPayload,
  type CollectBatchRecord,
} from "../api/collect-batch.api";

const statusOptions: CrudOption[] = [
  { label: "待采集", value: "PENDING" },
  { label: "采集中", value: "RUNNING" },
  { label: "成功", value: "SUCCESS" },
  { label: "失败", value: "FAILED" },
];

function buildCollectAccountLabel(shop: ShopRecord) {
  const displayName = shop.name || shop.nickname || shop.remark || shop.code || `账号 #${shop.id}`;
  const platform = shop.platform ? ` · ${shop.platform}` : "";
  return `${displayName}${platform} · ID ${shop.id}`;
}

export function CollectBatchManagementPanel() {
  const [collectAccountOptions, setCollectAccountOptions] = useState<CrudOption[]>([]);

  useEffect(() => {
    let ignore = false;

    void fetchShops({ pageIndex: 1, pageSize: 200, shopUsage: "COLLECT" })
      .then((result) => {
        if (ignore) {
          return;
        }
        setCollectAccountOptions(
          result.data.map((shop) => ({
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
        label: "采集账号",
        type: "select",
        required: true,
        placeholder: "请选择采集账号",
        options: collectAccountOptions,
      },
      { name: "name", label: "批次名称", required: true },
      { name: "status", label: "状态", type: "select", options: statusOptions },
      { name: "ossUrl", label: "OSS地址" },
      { name: "collectedCount", label: "采集数量", type: "number", min: 0, precision: 0 },
    ],
    [collectAccountOptions],
  );

  const columns = useMemo<CrudTableColumn<CollectBatchRecord>[]>(
    () => [
      { name: "name", label: "批次名称", width: 220 },
      { name: "appUserId", label: "App用户ID", width: 120 },
      {
        name: "shopId",
        label: "采集账号",
        width: 220,
        render: (value) => collectAccountLabelMap.get(Number(value)) ?? `账号 #${Number(value) || "-"}`,
      },
      { name: "status", label: "状态", width: 120 },
      { name: "collectedCount", label: "采集数量", width: 120 },
      { name: "ossUrl", label: "OSS地址", width: 280, copyable: true },
      { name: "createdTime", label: "创建时间", width: 190 },
    ],
    [collectAccountLabelMap],
  );

  return (
    <CrudManagementPanel<CollectBatchRecord, CollectBatchPayload>
      title="采集批次"
      createText="新增采集批次"
      searchPlaceholder="批次名称"
      searchParam="name"
      fields={fields}
      columns={columns}
      statusField="status"
      statusOptions={statusOptions}
      api={{
        list: fetchCollectBatches,
        create: createCollectBatch,
        update: updateCollectBatch,
        remove: deleteCollectBatch,
      }}
    />
  );
}
