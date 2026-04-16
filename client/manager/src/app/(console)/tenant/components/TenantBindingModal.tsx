"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Select, Space, Tag, Typography, message } from "antd";
import {
  fetchShopCategoryOptions,
  fetchTenantCategoryBindings,
  saveTenantCategoryBindings,
  type ShopCategoryOption,
  type TenantRecord,
} from "../api/tenant.api";

const { Text } = Typography;

interface TenantBindingModalProps {
  open: boolean;
  tenant: TenantRecord | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

export function TenantBindingModal({
  open,
  tenant,
  onCancel,
  onSaved,
}: TenantBindingModalProps) {
  const [options, setOptions] = useState<ShopCategoryOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !tenant) {
      setSelectedIds([]);
      return;
    }
    const loadData = async () => {
      setLoading(true);
      try {
        const [categoryResult, bindingResult] = await Promise.all([
          fetchShopCategoryOptions(),
          fetchTenantCategoryBindings(tenant.id),
        ]);
        setOptions(categoryResult.data);
        setSelectedIds(bindingResult.map((item) => item.shopCategoryId));
      } catch (error) {
        setOptions([]);
        setSelectedIds([]);
        message.error(error instanceof Error ? error.message : "加载租户绑定失败");
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [open, tenant]);

  const selectOptions = useMemo(
    () =>
      options.map((item) => ({
        label: `${item.name || `类目#${item.id}`} · ID ${item.id}`,
        value: item.id,
      })),
    [options],
  );

  const selectedTags = useMemo(() => {
    const optionMap = new Map(options.map((item) => [item.id, item]));
    return selectedIds
      .map((id) => optionMap.get(id))
      .filter((item): item is ShopCategoryOption => Boolean(item));
  }, [options, selectedIds]);

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      title={tenant ? `${tenant.name} · 租户绑定` : "租户绑定"}
      okText="确定"
      cancelText="取消"
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={async () => {
        if (!tenant) {
          return;
        }
        setSubmitting(true);
        try {
          await saveTenantCategoryBindings(tenant.id, { shopCategoryIds: selectedIds });
          await onSaved();
          message.success("租户类目绑定已更新");
          onCancel();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "保存租户绑定失败");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Text style={{ color: "var(--manager-text-soft)" }}>
          选择当前租户可用的商品类目，可多选；保存时会以本次选择结果为准覆盖旧绑定。
        </Text>
        <Select<number[]>
          mode="multiple"
          allowClear
          loading={loading}
          placeholder="请选择类目"
          value={selectedIds}
          onChange={(value) => setSelectedIds(value)}
          options={selectOptions}
          style={{ width: "100%" }}
          optionFilterProp="label"
        />
        <Space wrap>
          {selectedTags.length > 0 ? (
            selectedTags.map((item) => (
              <Tag key={item.id} color="blue">
                {item.name || `类目#${item.id}`}
              </Tag>
            ))
          ) : (
            <Text style={{ color: "var(--manager-text-faint)" }}>当前未绑定任何类目</Text>
          )}
        </Space>
      </Space>
    </Modal>
  );
}
