import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Switch, Alert } from 'antd';
import type { AppUser, UpdateUserInput, UserRole, UserType } from '../types';

interface UserEditorModalProps {
  open: boolean;
  user: AppUser | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: UpdateUserInput) => Promise<void>;
}

export const UserEditorModal: React.FC<UserEditorModalProps> = ({
  open,
  user,
  busy,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [error, setError] = React.useState<string>('');

  useEffect(() => {
    if (user && open) {
      form.setFieldsValue({
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        userType: user.userType,
        disabled: user.disabled,
        password: '',
      });
      setError('');
    }
  }, [user, open, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setError('');
      await onSubmit({
        username: values.username.trim(),
        email: values.email.trim(),
        displayName: values.displayName.trim(),
        role: values.role as UserRole,
        userType: values.userType as UserType,
        disabled: Boolean(values.disabled),
        password: values.password ? values.password : undefined,
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // Ant Form validation error
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    }
  };

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Account Details
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
            Edit App User: {user?.username}
          </div>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={busy}
      okText="Save Changes"
      cancelText="Cancel"
      destroyOnClose
      width={520}
    >
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError('')}
        />
      )}

      <Form form={form} layout="vertical" disabled={busy} style={{ marginTop: 16 }}>
        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: 'Please enter a username' }]}
        >
          <Input placeholder="Username" />
        </Form.Item>

        <Form.Item
          name="displayName"
          label="Display Name"
          rules={[{ required: true, message: 'Please enter a display name' }]}
        >
          <Input placeholder="Display name" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email Address"
          rules={[
            { required: true, message: 'Please enter an email' },
            { type: 'email', message: 'Please enter a valid email' },
          ]}
        >
          <Input placeholder="user@domain.com" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="userType" label="Account Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="current">Current User</Select.Option>
              <Select.Option value="demo">Demo User</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="cashier">Cashier</Select.Option>
              <Select.Option value="custom">Custom</Select.Option>
            </Select>
          </Form.Item>
        </div>

        <Form.Item
          name="password"
          label="New Password"
          extra="Leave empty to keep current password unchanged"
          rules={[{ min: 8, message: 'Password must be at least 8 characters' }]}
        >
          <Input.Password placeholder="••••••••" />
        </Form.Item>

        <Form.Item
          name="disabled"
          valuePropName="checked"
          style={{ marginBottom: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checkedChildren="Disabled" unCheckedChildren="Active" />
            <span style={{ fontSize: 13, color: '#475569' }}>Disable sign-in access for this user</span>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};
