"use client";

import { Form, Input, Modal } from "antd";
import type { TitleFilterPayload, TitleFilterRecord } from "../api/title-filter.api";

interface TitleFilterFormModalProps {
  open: boolean;
  submitting: boolean;
  filter: TitleFilterRecord | null;
  onCancel: () => void;
  onSubmit: (payload: TitleFilterPayload) => Promise<void>;
}

interface TitleFilterFormValues {
  keyword: string;
  replacement: string;
}

export function TitleFilterFormModal({
  open,
  submitting,
  filter,
  onCancel,
  onSubmit,
}: TitleFilterFormModalProps) {
  const [form] = Form.useForm<TitleFilterFormValues>();
  const isEdit = Boolean(filter);

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      title={isEdit ? "修改关键词" : "添加关键词"}
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
          keyword: values.keyword.trim(),
          // 替换内容可为空，置空即表示直接删除该关键词
          replacement: (values.replacement ?? "").trim(),
        });
        form.resetFields();
      }}
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields();
          return;
        }
        form.setFieldsValue({
          keyword: filter?.keyword ?? "",
          replacement: filter?.replacement ?? "",
        });
      }}
    >
      <Form<TitleFilterFormValues> form={form} layout="vertical">
        <Form.Item
          label="关键词"
          name="keyword"
          rules={[{ required: true, message: "请输入要过滤的关键词" }]}
        >
          <Input placeholder="如：必备" />
        </Form.Item>
        <Form.Item
          label="替换为"
          name="replacement"
          extra="留空表示直接删除该关键词"
        >
          <Input placeholder="留空则删除关键词" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
