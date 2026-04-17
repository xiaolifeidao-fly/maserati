"use client";

import { CrudManagementPanel } from "../../../components/CrudManagementPanel";
import type { CrudField, CrudOption, CrudTableColumn } from "../../../components/CrudManagementPanel";
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

const fields: CrudField<CollectBatchRecord>[] = [
  { name: "appUserId", label: "App用户ID", type: "number", required: true, min: 1, precision: 0 },
  { name: "shopId", label: "店铺ID", type: "number", required: true, min: 1, precision: 0 },
  { name: "name", label: "批次名称", required: true },
  { name: "status", label: "状态", type: "select", options: statusOptions },
  { name: "ossUrl", label: "OSS地址" },
  { name: "collectedCount", label: "采集数量", type: "number", min: 0, precision: 0 },
];

const columns: CrudTableColumn<CollectBatchRecord>[] = [
  { name: "name", label: "批次名称", width: 220 },
  { name: "appUserId", label: "App用户ID", width: 120 },
  { name: "shopId", label: "店铺ID", width: 110 },
  { name: "status", label: "状态", width: 120 },
  { name: "collectedCount", label: "采集数量", width: 120 },
  { name: "ossUrl", label: "OSS地址", width: 280, copyable: true },
  { name: "createdTime", label: "创建时间", width: 190 },
];

export function CollectBatchManagementPanel() {
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
