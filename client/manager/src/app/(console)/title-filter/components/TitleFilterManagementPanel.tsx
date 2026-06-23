"use client";

import { useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { type TitleFilterPayload, type TitleFilterRecord } from "../api/title-filter.api";
import { TitleFilterFormModal } from "./TitleFilterFormModal";
import { useTitleFilterManagement } from "../hooks/useTitleFilterManagement";

const { Text } = Typography;

export function TitleFilterManagementPanel() {
  const { filters, total, query, loading, submitting, refresh, saveFilter, removeFilter } =
    useTitleFilterManagement();
  const [keyword, setKeyword] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<TitleFilterRecord | null>(null);

  const columns: ColumnsType<TitleFilterRecord> = [
    {
      title: "关键词",
      dataIndex: "keyword",
      width: 240,
      render: (value: string) => (
        <Text style={{ color: "var(--manager-text)", fontWeight: 600 }}>{value || "-"}</Text>
      ),
    },
    {
      title: "替换为",
      dataIndex: "replacement",
      render: (value: string) =>
        value ? (
          <span className="manager-value">{value}</span>
        ) : (
          <Tag color="orange">删除（替换为空）</Tag>
        ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedTime",
      width: 200,
      render: (value?: string) => (
        <Text style={{ color: "var(--manager-text-faint)" }}>{value || "-"}</Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="修改">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingFilter(record);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除这个关键词吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeFilter(record.id);
                message.success("关键词已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除失败");
              }
            }}
          >
            <Tooltip title="删除">
              <Button danger type="text" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async (payload: TitleFilterPayload) => {
    try {
      await saveFilter(editingFilter?.id ?? null, payload);
      message.success(editingFilter ? "修改成功" : "添加成功");
      setFormOpen(false);
      setEditingFilter(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              prefix={<SearchOutlined style={{ color: "var(--manager-text-faint)" }} />}
              placeholder="关键词"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => void refresh({ pageIndex: 1, keyword })}
              style={{ width: 260, maxWidth: "100%" }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => void refresh({ pageIndex: 1, keyword })}
            >
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setKeyword("");
                void refresh({ pageIndex: 1, keyword: "" });
              }}
            >
              刷新
            </Button>
          </Space>

          <Space wrap>
            <Tag
              style={{
                color: "var(--manager-text-soft)",
                background: "rgba(170,192,238,0.16)",
                border: "none",
              }}
            >
              共 {total} 条
            </Tag>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingFilter(null);
                setFormOpen(true);
              }}
              style={{
                color: "#ffffff",
                border: "none",
                background: "linear-gradient(135deg, #5d7df6 0%, #6d8cff 100%)",
              }}
            >
              新增关键词
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<TitleFilterRecord>
          rowKey="id"
          loading={loading}
          dataSource={filters}
          columns={columns}
          scroll={{ x: 720 }}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: false,
            onChange: (page) => void refresh({ pageIndex: page, keyword }),
          }}
        />
      </section>

      <TitleFilterFormModal
        open={formOpen}
        submitting={submitting}
        filter={editingFilter}
        onCancel={() => {
          setFormOpen(false);
          setEditingFilter(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
