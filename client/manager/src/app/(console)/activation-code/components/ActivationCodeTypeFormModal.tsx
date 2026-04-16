"use client";

import { Form, Input, InputNumber, Modal } from "antd";
import type {
  ActivationCodeTypePayload,
  ActivationCodeTypeRecord,
} from "../api/activation-code.api";

interface ActivationCodeTypeFormModalProps {
  open: boolean;
  submitting: boolean;
  record: ActivationCodeTypeRecord | null;
  onCancel: () => void;
  onSubmit: (payload: ActivationCodeTypePayload) => Promise<void>;
}

interface ActivationCodeTypeFormValues {
  name: string;
  durationDays: number;
  price: string;
}

export function ActivationCodeTypeFormModal({
  open,
  submitting,
  record,
  onCancel,
  onSubmit,
}: ActivationCodeTypeFormModalProps) {
  const [form] = Form.useForm<ActivationCodeTypeFormValues>();
  const isEdit = Boolean(record);

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      title={isEdit ? "修改激活码类别" : "添加激活码类别"}
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
          durationDays: values.durationDays,
          price: String(values.price).trim(),
        });
        form.resetFields();
      }}
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields();
          return;
        }
        form.setFieldsValue({
          name: record?.name ?? "",
          durationDays: record?.durationDays ?? 30,
          price: record?.price ?? "0.00",
        });
      }}
    >
      <Form<ActivationCodeTypeFormValues> form={form} layout="vertical">
        <Form.Item
          label="类别名称"
          name="name"
          rules={[{ required: true, message: "请输入类别名称" }]}
        >
          <Input placeholder="请输入类别名称" />
        </Form.Item>
        <Form.Item
          label="有效天数"
          name="durationDays"
          rules={[{ required: true, message: "请输入有效天数" }]}
        >
          <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="请输入有效天数" />
        </Form.Item>
        <Form.Item label="价格" name="price" rules={[{ required: true, message: "请输入价格" }]}>
          <Input placeholder="请输入价格" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
