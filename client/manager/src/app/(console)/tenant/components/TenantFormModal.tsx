"use client";

import { Form, Input, Modal } from "antd";
import type { TenantPayload, TenantRecord } from "../api/tenant.api";

interface TenantFormModalProps {
  open: boolean;
  submitting: boolean;
  tenant: TenantRecord | null;
  onCancel: () => void;
  onSubmit: (payload: TenantPayload) => Promise<void>;
}

interface TenantFormValues {
  name: string;
  code: string;
}

export function TenantFormModal({
  open,
  submitting,
  tenant,
  onCancel,
  onSubmit,
}: TenantFormModalProps) {
  const [form] = Form.useForm<TenantFormValues>();
  const isEdit = Boolean(tenant);

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      title={isEdit ? "修改租户" : "添加租户"}
      okText="确定"
      cancelText="取消"
      confirmLoading={submitting}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={async () => {
        const values = await form.validateFields();
        await onSubmit({
          name: values.name.trim(),
          code: values.code.trim(),
        });
        form.resetFields();
      }}
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields();
          return;
        }
        form.setFieldsValue({
          name: tenant?.name ?? "",
          code: tenant?.code ?? "",
        });
      }}
    >
      <Form<TenantFormValues> form={form} layout="vertical">
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: "请输入租户名称" }]}
        >
          <Input placeholder="请输入租户名称" />
        </Form.Item>
        <Form.Item
          label="编码"
          name="code"
          rules={[{ required: true, message: "请输入租户编码" }]}
        >
          <Input placeholder="请输入租户编码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
