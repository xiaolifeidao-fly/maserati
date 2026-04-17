"use client";

import { useState } from "react";
import { CheckCircleOutlined, LockOutlined, StopOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Tooltip, message } from "antd";
import { CrudManagementPanel } from "../../components/CrudManagementPanel";
import type { CrudField, CrudTableColumn, CrudOption } from "../../components/CrudManagementPanel";
import {
  createAppUser,
  deleteAppUser,
  fetchAppUsers,
  updateAppUser,
  updateAppUserPassword,
  updateAppUserStatus,
  type AppUserPayload,
  type AppUserRecord,
} from "../api/app-user.api";

const statusOptions: CrudOption[] = [
  { label: "正常", value: "active" },
  { label: "禁用", value: "inactive" },
  { label: "锁定", value: "locked" },
];

const fields: CrudField<AppUserRecord>[] = [
  { name: "name", label: "姓名", required: true },
  { name: "username", label: "用户名", required: true },
  { name: "password", label: "密码", type: "password", required: true, hiddenOnEdit: true },
  { name: "originPassword", label: "原始密码", type: "password", hiddenOnEdit: true },
  { name: "email", label: "邮箱" },
  { name: "phone", label: "手机号" },
  { name: "department", label: "部门", hiddenOnEdit: true },
  { name: "status", label: "状态", type: "select", options: statusOptions },
  { name: "secretKey", label: "密钥", hiddenOnEdit: true },
  { name: "pubToken", label: "发布 Token", hiddenOnEdit: true },
  { name: "banCount", label: "封禁次数", type: "number", min: 0, precision: 0, hiddenOnEdit: true },
  { name: "remark", label: "备注", type: "textarea" },
];

const columns: CrudTableColumn<AppUserRecord>[] = [
  { name: "username", label: "用户名", width: 150 },
  { name: "name", label: "姓名", width: 140 },
  { name: "phone", label: "手机号", width: 150 },
  { name: "email", label: "邮箱", width: 220 },
  { name: "status", label: "状态", width: 110 },
  { name: "banCount", label: "封禁次数", width: 110 },
  {
    name: "createdTime",
    label: "注册时间",
    width: 190,
    render: (value) => formatDateTime(value),
  },
];

function formatDateTime(value: unknown) {
  if (!value) {
    return "-";
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 19).replace("T", " ");
  }
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function AppUserManagementPanel() {
  const [passwordForm] = Form.useForm<{ password: string; confirmPassword: string }>();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordRecord, setPasswordRecord] = useState<AppUserRecord | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  return (
    <>
      <CrudManagementPanel<AppUserRecord, AppUserPayload>
        title="App用户"
        createText="新增App用户"
        searchPlaceholder="用户名/姓名"
        searchParam="search"
        fields={fields}
        columns={columns}
        statusField="status"
        statusOptions={statusOptions}
        actionWidth={240}
        rowActions={(record, context) => {
          const isActive = record.status === "active";
          const nextStatus = isActive ? "inactive" : "active";
          const actionText = isActive ? "禁用" : "启用";

          return (
            <>
              <Tooltip title="修改密码">
                <Button
                  type="text"
                  icon={<LockOutlined />}
                  onClick={() => {
                    setPasswordRecord(record);
                    passwordForm.resetFields();
                    setPasswordModalOpen(true);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title={`确认${actionText}用户「${record.username}」吗？`}
                okText={actionText}
                cancelText="取消"
                onConfirm={async () => {
                  try {
                    context.setSubmitting(true);
                    await updateAppUserStatus(record.id, nextStatus);
                    message.success(`${actionText}成功`);
                    await context.reload();
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : `${actionText}失败`);
                  } finally {
                    context.setSubmitting(false);
                  }
                }}
              >
                <Tooltip title={actionText}>
                  <Button
                    type="text"
                    danger={isActive}
                    disabled={context.submitting}
                    icon={isActive ? <StopOutlined /> : <CheckCircleOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            </>
          );
        }}
        api={{
          list: fetchAppUsers,
          create: createAppUser,
          update: updateAppUser,
          remove: deleteAppUser,
        }}
      />

      <Modal
        title={passwordRecord ? `修改密码：${passwordRecord.username}` : "修改密码"}
        open={passwordModalOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={passwordSubmitting}
        destroyOnClose
        onCancel={() => {
          setPasswordModalOpen(false);
          setPasswordRecord(null);
          passwordForm.resetFields();
        }}
        onOk={() => {
          void passwordForm.validateFields().then(async (values) => {
            if (!passwordRecord) {
              return;
            }
            setPasswordSubmitting(true);
            try {
              await updateAppUserPassword(passwordRecord.id, values.password);
              message.success("密码修改成功");
              setPasswordModalOpen(false);
              setPasswordRecord(null);
              passwordForm.resetFields();
            } catch (error) {
              message.error(error instanceof Error ? error.message : "密码修改失败");
            } finally {
              setPasswordSubmitting(false);
            }
          });
        }}
      >
        <Form form={passwordForm} layout="vertical" preserve={false} style={{ marginTop: 16 }}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
