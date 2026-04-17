"use client";

import { CrudManagementPanel } from "../../../components/CrudManagementPanel";
import type { CrudField, CrudOption, CrudTableColumn } from "../../../components/CrudManagementPanel";
import {
  createShop,
  deleteShop,
  fetchShops,
  updateShop,
  type ShopPayload,
  type ShopRecord,
} from "../api/shop.api";

const loginStatusOptions: CrudOption[] = [
  { label: "待登录", value: "PENDING" },
  { label: "已登录", value: "LOGGED_IN" },
  { label: "登录失效", value: "EXPIRED" },
];

const fields: CrudField<ShopRecord>[] = [
  { name: "appUserId", label: "App用户ID", type: "number", required: true, min: 1, precision: 0 },
  { name: "platform", label: "平台", required: true, placeholder: "taobao / tmall / pdd" },
  { name: "loginStatus", label: "登录状态", type: "select", options: loginStatusOptions },
  { name: "remark", label: "备注", type: "textarea" },
];

const columns: CrudTableColumn<ShopRecord>[] = [
  { name: "name", label: "店铺名称", width: 180 },
  { name: "code", label: "店铺编码", width: 180 },
  { name: "appUserId", label: "App用户ID", width: 120 },
  { name: "platform", label: "平台", width: 120 },
  { name: "platformShopId", label: "平台店铺ID", width: 180, copyable: true },
  { name: "businessId", label: "业务ID", width: 180, copyable: true },
  { name: "loginStatus", label: "登录状态", width: 130 },
  { name: "authorizationStatus", label: "授权状态", width: 130 },
  { name: "authorizationExpiresAt", label: "授权到期", width: 180 },
];

export function ShopManagementPanel() {
  return (
    <CrudManagementPanel<ShopRecord, ShopPayload>
      title="店铺"
      createText="新增店铺"
      searchPlaceholder="店铺名称"
      searchParam="name"
      fields={fields}
      columns={columns}
      statusField="loginStatus"
      statusOptions={loginStatusOptions}
      api={{
        list: fetchShops,
        create: createShop,
        update: updateShop,
        remove: deleteShop,
      }}
    />
  );
}
