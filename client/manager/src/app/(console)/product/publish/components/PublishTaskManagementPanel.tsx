"use client";

import { CrudManagementPanel } from "../../../components/CrudManagementPanel";
import type { CrudField, CrudOption, CrudTableColumn } from "../../../components/CrudManagementPanel";
import {
  createPublishTask,
  deletePublishTask,
  fetchPublishTasks,
  updatePublishTask,
  type PublishTaskPayload,
  type PublishTaskRecord,
} from "../api/publish-task.api";

const statusOptions: CrudOption[] = [
  { label: "待发布", value: "PENDING" },
  { label: "发布中", value: "RUNNING" },
  { label: "成功", value: "SUCCESS" },
  { label: "失败", value: "FAILED" },
  { label: "取消", value: "CANCELED" },
];

const sourceOptions: CrudOption[] = [
  { label: "采集商品", value: "collect" },
  { label: "手工创建", value: "manual" },
];

const fields: CrudField<PublishTaskRecord>[] = [
  { name: "appUserId", label: "App用户ID", type: "number", required: true, min: 1, precision: 0 },
  { name: "shopId", label: "店铺ID", type: "number", required: true, min: 1, precision: 0 },
  { name: "collectBatchId", label: "采集批次ID", type: "number", min: 0, precision: 0 },
  { name: "productId", label: "商品ID", type: "number", min: 0, precision: 0 },
  { name: "sourceType", label: "来源类型", type: "select", required: true, options: sourceOptions },
  { name: "sourceProductId", label: "来源商品ID", required: true },
  { name: "sourceRecordId", label: "来源记录ID", type: "number", required: true, min: 1, precision: 0 },
  { name: "status", label: "状态", type: "select", options: statusOptions, hiddenOnCreate: true },
  { name: "currentStepCode", label: "当前步骤", hiddenOnCreate: true },
  { name: "outerItemId", label: "外部商品ID", hiddenOnCreate: true },
  { name: "errorMessage", label: "错误信息", type: "textarea", hiddenOnCreate: true },
  { name: "remark", label: "备注", type: "textarea" },
];

const columns: CrudTableColumn<PublishTaskRecord>[] = [
  { name: "sourceProductId", label: "来源商品ID", width: 180, copyable: true },
  { name: "appUserId", label: "App用户ID", width: 120 },
  { name: "shopId", label: "店铺ID", width: 100 },
  { name: "collectBatchId", label: "采集批次ID", width: 130 },
  { name: "productId", label: "商品ID", width: 100 },
  { name: "sourceType", label: "来源", width: 110 },
  { name: "status", label: "状态", width: 120 },
  { name: "currentStepCode", label: "当前步骤", width: 150 },
  { name: "outerItemId", label: "外部商品ID", width: 180, copyable: true },
  { name: "errorMessage", label: "错误信息", width: 240 },
];

export function PublishTaskManagementPanel() {
  return (
    <CrudManagementPanel<PublishTaskRecord, PublishTaskPayload>
      title="商品发布"
      createText="新增发布任务"
      searchPlaceholder="来源商品ID"
      searchParam="sourceProductId"
      fields={fields}
      columns={columns}
      statusField="status"
      statusOptions={statusOptions}
      api={{
        list: fetchPublishTasks,
        create: createPublishTask,
        update: updatePublishTask,
        remove: deletePublishTask,
      }}
    />
  );
}
