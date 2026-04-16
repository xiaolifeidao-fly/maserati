"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Progress,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  fetchActivationCodeBatch,
  generateActivationCodeBatch,
  type ActivationCodeBatchRecord,
  type ActivationCodeTypeRecord,
} from "../api/activation-code.api";

const { Text } = Typography;

interface GenerateActivationCodeBatchModalProps {
  open: boolean;
  record: ActivationCodeTypeRecord | null;
  onCancel: () => void;
}

interface GenerateActivationCodeBatchFormValues {
  count: number;
}

function getBatchStatusColor(status: string) {
  switch (status) {
    case "COMPLETED":
      return "green";
    case "FAILED":
      return "red";
    case "PROCESSING":
      return "blue";
    default:
      return "default";
  }
}

function getBatchStatusText(status: string) {
  switch (status) {
    case "PENDING":
      return "等待生成";
    case "PROCESSING":
      return "生成中";
    case "COMPLETED":
      return "已完成";
    case "FAILED":
      return "失败";
    default:
      return "未开始";
  }
}

function formatMoney(value?: string) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return value || "0.00";
  }
  return numeric.toFixed(2);
}

export function GenerateActivationCodeBatchModal({
  open,
  record,
  onCancel,
}: GenerateActivationCodeBatchModalProps) {
  const [form] = Form.useForm<GenerateActivationCodeBatchFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [batch, setBatch] = useState<ActivationCodeBatchRecord | null>(null);

  const percent = useMemo(() => {
    if (!batch || batch.totalCount <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((batch.generatedCount / batch.totalCount) * 100));
  }, [batch]);

  useEffect(() => {
    if (!open || !batch || batch.status === "COMPLETED" || batch.status === "FAILED") {
      return undefined;
    }
    const timer = window.setInterval(async () => {
      try {
        const latest = await fetchActivationCodeBatch(batch.id);
        setBatch(latest);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "获取批次进度失败");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [batch, open]);

  const handleGenerate = async () => {
    if (!record) {
      return;
    }
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const result = await generateActivationCodeBatch(record.id, { count: values.count });
      setBatch(result);
      message.success("生成任务已提交");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交生成任务失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      wrapClassName="manager-form-skin"
      destroyOnClose
      open={open}
      title={record ? `${record.name} · 生成新批次` : "生成新批次"}
      okText={batch ? "再次生成" : "开始生成"}
      cancelText="关闭"
      confirmLoading={submitting}
      onOk={handleGenerate}
      onCancel={() => {
        form.resetFields();
        setBatch(null);
        onCancel();
      }}
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields();
          setBatch(null);
          return;
        }
        form.setFieldsValue({ count: 100 });
      }}
    >
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <Form<GenerateActivationCodeBatchFormValues> form={form} layout="vertical">
          <Form.Item
            label="生成数量"
            name="count"
            rules={[{ required: true, message: "请输入生成数量" }]}
          >
            <InputNumber min={1} max={100000} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const count = form.getFieldValue("count") ?? 0;
              const price = Number(record?.price ?? 0);
              const total = Number.isFinite(count) && Number.isFinite(price) ? count * price : 0;
              return (
                <Alert
                  type="info"
                  showIcon
                  message={`预计消费 ${total.toFixed(2)}`}
                  description={`单价 ${formatMoney(record?.price)}，提交前会检查所属账户余额是否足够。`}
                />
              );
            }}
          </Form.Item>
        </Form>

        {batch ? (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid rgba(145,171,212,0.22)",
              background: "rgba(248,250,255,0.74)",
            }}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap>
                <Tag color={getBatchStatusColor(batch.status)}>
                  {getBatchStatusText(batch.status)}
                </Tag>
                <Text style={{ color: "var(--manager-text-soft)" }}>批次 #{batch.id}</Text>
              </Space>
              <Progress
                percent={percent}
                status={batch.status === "FAILED" ? "exception" : undefined}
              />
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="总价">{formatMoney(batch.totalPrice)}</Descriptions.Item>
                <Descriptions.Item label="实际消费">
                  {formatMoney(batch.actualConsume)}
                </Descriptions.Item>
              </Descriptions>
              <Text style={{ color: "var(--manager-text-soft)" }}>
                已生成 {batch.generatedCount} / {batch.totalCount}
                {batch.failedCount > 0 ? `，失败 ${batch.failedCount}` : ""}
              </Text>
              {batch.message ? (
                <Text style={{ color: "var(--manager-text-faint)" }}>{batch.message}</Text>
              ) : null}
            </Space>
          </div>
        ) : null}
      </Space>
    </Modal>
  );
}
