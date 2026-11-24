import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Alert, Typography } from 'antd';
import type { RegisteredBusinessDetails, UpdateRegisteredBusinessInput } from '../types';

const { Text } = Typography;

interface BusinessEditModalProps {
  open: boolean;
  business: RegisteredBusinessDetails | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: UpdateRegisteredBusinessInput) => Promise<void>;
}

export const BusinessEditModal: React.FC<BusinessEditModalProps> = ({
  open,
  business,
  busy,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (business && open) {
      form.setFieldsValue({
        businessName: business.businessName,
        address: business.address,
        mobileNumber: business.mobileNumber,
        username: business.username,
        password: '',
      });
      setError('');
    }
  }, [business, open, form]);

  const handleOk = async () => {
    try {
      if (!business) return;
      const values = await form.validateFields();
      setError('');
      await onSubmit({
        businessName: values.businessName.trim(),
        address: values.address.trim(),
        mobileNumber: values.mobileNumber.trim(),
        appVersion: business.appVersion,
        username: values.username.trim(),
        password: values.password || undefined,
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      setError(err instanceof Error ? err.message : 'Failed to update business.');
    }
  };

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Business Management
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
            Edit Business: {business?.businessName}
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
      width={560}
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

      <Form form={form} layout="vertical" disabled={busy} style={{ marginTop: 12 }}>
        <Form.Item
          name="businessName"
          label="Business Name"
          rules={[{ required: true, message: 'Please enter business name' }]}
        >
          <Input placeholder="Business Name" maxLength={120} />
        </Form.Item>

        <Form.Item
          name="address"
          label="Physical Address"
          rules={[{ required: true, message: 'Please enter business address' }]}
        >
          <Input.TextArea rows={2} placeholder="Street, City, Country" maxLength={500} />
        </Form.Item>

        <Form.Item
          name="mobileNumber"
          label="Mobile Phone Number"
          rules={[{ required: true, message: 'Please enter mobile number' }]}
        >
          <Input placeholder="+1 234 567 8900" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item
            name="username"
            label="Primary POS Username"
            rules={[{ required: true, message: 'Please enter POS username' }]}
          >
            <Input placeholder="Username" maxLength={32} />
          </Form.Item>

          <Form.Item
            name="password"
            label="New Password"
            extra="Leave blank to keep existing password"
          >
            <Input.Password placeholder="••••••••" maxLength={128} />
          </Form.Item>
        </div>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 8,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            License Key (Immutable)
          </Text>
          <code style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600, letterSpacing: '0.05em' }}>
            {business?.licenseKey || 'Not available for legacy registration'}
          </code>
        </div>
      </Form>
    </Modal>
  );
};
