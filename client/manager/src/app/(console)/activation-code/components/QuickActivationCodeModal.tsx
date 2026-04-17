"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyOutlined, DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Form, InputNumber, Modal, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import * as XLSX from "xlsx";
import {
  fetchActivationCodeDetails,
  type ActivationCodeDetailRecord,
  type ActivationCodeTypeRecord,
} from "../api/activation-code.api";

const { Text } = Typography;

interface QuickActivationCodeModalProps {
  open: boolean;
  record: ActivationCodeTypeRecord | null;
  onCancel: () => void;
}

interface QuickActivationCodeFormValues {
  count: number;
}

const defaultCount = 1;
const maxCount = 100;

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function buildExportRows(details: ActivationCodeDetailRecord[]) {
  return details.map((item, index) => ({
    序号: index + 1,
    激活码: item.activationCode,
    类别ID: item.typeId,
    批次ID: item.batchId,
    有效天数: item.durationDays,
    价格: item.price || "0.00",
    状态: item.status,
    创建时间: formatDateTime(item.createdTime),
  }));
}

export function QuickActivationCodeModal({
  open,
  record,
  onCancel,
}: QuickActivationCodeModalProps) {
  const [form] = Form.useForm<QuickActivationCodeFormValues>();
  const [details, setDetails] = useState<ActivationCodeDetailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const codeText = useMemo(
    () => details.map((item) => item.activationCode).filter(Boolean).join("\n"),
    [details],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({ count: defaultCount });
    setDetails([]);
    setTotal(0);
  }, [form, open, record?.id]);

  const handleFetch = async () => {
    if (!record) {
      return;
    }
    const values = await form.validateFields();
    const count = Math.min(Math.max(Number(values.count || defaultCount), defaultCount), maxCount);
    setLoading(true);
    try {
      const result = await fetchActivationCodeDetails({
        pageIndex: 1,
        pageSize: count,
        typeId: record.id,
        status: "UNUSED",
      });
      setDetails(result.data);
      setTotal(result.total);
      message.success(`已获取 ${result.data.length} 条未使用激活码`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取未使用激活码失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!codeText) {
      message.warning("暂无可复制的激活码");
      return;
    }
    try {
      await navigator.clipboard.writeText(codeText);
      message.success("激活码已复制");
    } catch {
      message.error("复制失败，请检查浏览器剪贴板权限");
    }
  };

  const handleExport = () => {
    if (details.length === 0) {
      message.warning("暂无可导出的激活码");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(buildExportRows(details));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "未使用激活码");
    const fileName = `${record?.name || "激活码类别"}-未使用激活码.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const columns: ColumnsType<ActivationCodeDetailRecord> = [
    {
      title: "激活码",
      dataIndex: "activationCode",
      width: 280,
      render: (value: string) => (
        <Text copyable style={{ color: "var(--manager-text)", fontFamily: "monospace" }}>
          {value || "-"}
        </Text>
      ),
    },
    {
      title: "批次",
      dataIndex: "batchId",
      width: 100,
      render: (value: number) => <span className="manager-value">#{value}</span>,
    },
    {
      title: "有效天数",
      dataIndex: "durationDays",
      width: 110,
      render: (value: number) => <Tag color="blue">{value} 天</Tag>,
    },
    {
      title: "创建时间",
      dataIndex: "createdTime",
      width: 180,
      render: (value: string) => (
        <Text style={{ color: "var(--manager-text-soft)" }}>{formatDateTime(value)}</Text>
      ),
    },
  ];

  return (
    <Modal
      destroyOnClose
      title={`${record?.name ?? "激活码类别"} · 快速获取未使用激活码`}
      open={open}
      width={780}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          关闭
        </Button>,
      ]}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space wrap size={12} align="start">
          <Form<QuickActivationCodeFormValues>
            form={form}
            layout="inline"
            initialValues={{ count: defaultCount }}
          >
            <Form.Item
              label="获取数量"
              name="count"
              rules={[
                { required: true, message: "请输入获取数量" },
                { type: "number", min: defaultCount, max: maxCount, message: "数量范围为 1-100" },
              ]}
            >
              <InputNumber min={defaultCount} max={maxCount} precision={0} style={{ width: 140 }} />
            </Form.Item>
          </Form>
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={handleFetch}>
            获取
          </Button>
          <Button icon={<CopyOutlined />} disabled={details.length === 0} onClick={handleCopy}>
            复制
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={details.length === 0}
            onClick={handleExport}
          >
            导出 Excel
          </Button>
        </Space>

        <Tag
          style={{
            color: "var(--manager-text-soft)",
            background: "rgba(170,192,238,0.16)",
            border: "none",
            width: "fit-content",
          }}
        >
          当前类别未使用激活码共 {total} 条，本次展示 {details.length} 条
        </Tag>

        <div className="manager-table">
          <Table<ActivationCodeDetailRecord>
            rowKey="id"
            loading={loading}
            dataSource={details}
            columns={columns}
            scroll={{ x: 720 }}
            pagination={false}
          />
        </div>
      </Space>
    </Modal>
  );
}
