"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Select, Space, Tag, Typography, message } from "antd";
import {
  fetchActivationCodeTypeOptions,
  fetchTenantActivationCodeTypeBindings,
  saveTenantActivationCodeTypeBindings,
  type ActivationCodeTypeOption,
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
  const [options, setOptions] = useState<ActivationCodeTypeOption[]>([]);
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
        const [typeResult, bindingResult] = await Promise.all([
          fetchActivationCodeTypeOptions(),
          fetchTenantActivationCodeTypeBindings(tenant.id),
        ]);
        setOptions(typeResult.data);
        setSelectedIds(bindingResult.map((item) => item.activationCodeTypeId));
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
        label: `${item.name || `类别#${item.id}`} · ${item.durationDays} 天 · ￥${item.price}`,
        value: item.id,
      })),
    [options],
  );

  const selectedTags = useMemo(() => {
    const optionMap = new Map(options.map((item) => [item.id, item]));
    return selectedIds
      .map((id) => optionMap.get(id))
      .filter((item): item is ActivationCodeTypeOption => Boolean(item));
  }, [options, selectedIds]);

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      title={tenant ? `${tenant.name} · 分配激活码类别` : "分配激活码类别"}
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
          await saveTenantActivationCodeTypeBindings(tenant.id, {
            activationCodeTypeIds: selectedIds,
          });
          await onSaved();
          message.success("租户激活码类别已更新");
          onCancel();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "保存激活码类别分配失败");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Text style={{ color: "var(--manager-text-soft)" }}>
          选择当前租户可用的激活码类别，可多选；保存时会以本次选择结果为准覆盖旧绑定。
        </Text>
        <Select<number[]>
          mode="multiple"
          allowClear
          loading={loading}
          placeholder="请选择激活码类别"
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
                {item.name || `类别#${item.id}`}
              </Tag>
            ))
          ) : (
            <Text style={{ color: "var(--manager-text-faint)" }}>当前未分配任何激活码类别</Text>
          )}
        </Space>
      </Space>
    </Modal>
  );
}
